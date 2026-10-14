import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { authenticateApiRequest } from '@/utils/auth';

function sanitizePayloadForPostgres(payload: Record<string, any>): Record<string, any> {
  const DATE_FIELDS = ['inquiry_date'];
  const NUMERIC_FIELDS = [
    'purchase_price',
    'down_payment_percent',
    'broker_commission',
    'accutax_amount_requested',
    'accurate_lending_amount_requested',
    'internal_amount_received'
  ];

  const cleaned: Record<string, any> = { ...payload };

  for (const key of Object.keys(cleaned)) {
    const val = cleaned[key];
    if (typeof val === 'string' && val.trim() === '') {
      cleaned[key] = null;
    }
    if (DATE_FIELDS.includes(key)) {
      if (!val || (typeof val === 'string' && val.trim() === '')) {
        cleaned[key] = null;
      }
    }
    if (NUMERIC_FIELDS.includes(key)) {
      if (val === '' || val === null || val === undefined || isNaN(Number(val))) {
        cleaned[key] = null;
      } else {
        cleaned[key] = Number(val);
      }
    }
  }

  return cleaned;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, ['lending', 'accurate_lending', 'admin', 'superadmin']);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort_by') || 'updated_at';
    const sortOrder = searchParams.get('sort_order') || 'desc';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    const isGlobalView = auth.profile?.role === 'superadmin' || auth.profile?.role === 'admin';
    let query = supabaseServer
      .from('accurate_lending_loans')
      .select('*, partners:accurate_lending_partners(*), banks:accurate_lending_loan_banks(*, bank:accurate_lending_banks(bank_name))', { count: 'exact' });

    if (!isGlobalView) {
      query = query.eq('assigned_user', auth.user.id);
    }

    if (search && search.trim() !== '') {
      const q = search.trim();
      query = query.or(`borrower_name.ilike.%${q}%,client_email.ilike.%${q}%,client_phone.ilike.%${q}%`);
    }

    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map `current_stage` to a numeric stage so the frontend still works, 
    // or just let frontend handle the string. Wait, frontend relies on numeric stage!
    // The actual DB has `current_stage` (text). We will map it in types.ts.
    
    return NextResponse.json({
      success: true,
      loans: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, ['lending', 'accurate_lending', 'admin', 'superadmin']);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const body = await request.json();
    const updatedBy = auth.user.email || 'Lending Officer';
    
    // Separate relations from the main body
    const { partners = [], banks = [], ...loanData } = body;
    delete loanData.assigned_user; 

    // Validate 100% ownership
    if (partners && partners.length > 0) {
      const totalOwnership = partners.reduce((sum: number, p: any) => sum + (Number(p.ownership_percent) || 0), 0);
      if (totalOwnership !== 100) {
        return NextResponse.json({ error: 'Total partner ownership must exactly equal 100%.' }, { status: 400 });
      }
    }

    const rawPayload = {
      current_stage: loanData.current_stage || '1. New Loan',
      inquiry_date: loanData.inquiry_date || new Date().toISOString().split('T')[0],
      borrower_name: loanData.borrower_name,
      client_legal_name: loanData.client_legal_name || null,
      client_phone: loanData.client_phone || null,
      client_email: loanData.client_email || null,
      loan_type: loanData.loan_type || 'COMMERCIAL',
      loan_purpose: loanData.loan_purpose || null,
      nature_of_loan: loanData.nature_of_loan || null,
      business_address: loanData.business_address || null,
      loan_summary: loanData.loan_summary || null,
      purchase_price: loanData.purchase_price,
      down_payment_percent: loanData.down_payment_percent,
      broker_commission: loanData.broker_commission !== undefined ? loanData.broker_commission : null,
      lead_source: loanData.lead_source || null,
      referral_name: loanData.referral_name || null,
      assigned_user: auth.user.id,
      created_by: auth.user.id,
      status: 'Active',
      updated_at: new Date().toISOString(),
    };

    const sanitizedPayload = sanitizePayloadForPostgres(rawPayload);

    let loan: any;
    const { data: insertedLoan, error: insertError } = await supabaseServer
      .from('accurate_lending_loans')
      .insert([sanitizedPayload])
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '42703' || insertError.message?.includes('broker_commission')) {
        const fallbackPayload = { ...sanitizedPayload };
        delete fallbackPayload.broker_commission;
        const { data: retryLoan, error: retryError } = await supabaseServer
          .from('accurate_lending_loans')
          .insert([fallbackPayload])
          .select()
          .single();

        if (retryError) {
          return NextResponse.json({ error: retryError.message }, { status: 400 });
        }
        loan = { ...retryLoan, broker_commission: sanitizedPayload.broker_commission };
      } else {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    } else {
      loan = insertedLoan;
    }

    // Insert partners if any
    if (partners && partners.length > 0) {
      const mappedPartners = partners.map((p: any) => ({
        loan_id: loan.id,
        full_name: p.full_name,
        mobile: p.mobile || null,
        email: p.email || null,
        ownership_percent: Number(p.ownership_percent) || 0,
      }));
      const { error: partnerErr } = await supabaseServer.from('accurate_lending_partners').insert(mappedPartners);
      if (partnerErr) console.error('Failed to insert partners:', partnerErr);
    }

    // Insert banks if any
    if (banks && banks.length > 0) {
      const mappedBanks = [];
      for (const b of banks) {
        let bankId = b.bank_id;
        
        // If bank_id is not provided but lender_bank string is, we need to lookup or insert in accurate_lending_banks
        if (!bankId && b.lender_bank) {
          const { data: existingBank } = await supabaseServer
            .from('accurate_lending_banks')
            .select('id')
            .eq('bank_name', b.lender_bank)
            .single();
            
          if (existingBank) {
            bankId = existingBank.id;
          } else {
            const { data: newBank, error: createBankErr } = await supabaseServer
              .from('accurate_lending_banks')
              .insert([{ bank_name: b.lender_bank, is_active: true }])
              .select('id')
              .single();
              
            if (!createBankErr && newBank) {
              bankId = newBank.id;
            }
          }
        }
        
        if (bankId) {
          mappedBanks.push({
            loan_id: loan.id,
            bank_id: bankId,
            bank_officer_name: b.bank_officer_name || null,
            bank_underwriter_name: b.bank_underwriter_name || null,
            title_agency_name: b.title_agency_name || null,
            bank_closing_agent_name: b.bank_closing_agent_name || null,
            contact_email: b.contact_email || null,
            contact_phone: b.contact_phone || null,
            bank_amount_requested: b.bank_amount_requested ? Number(b.bank_amount_requested) : null,
            bank_amount_received: b.bank_amount_received ? Number(b.bank_amount_received) : null,
          });
        }
      }

      if (mappedBanks.length > 0) {
        const { error: bankErr } = await supabaseServer.from('accurate_lending_loan_banks').insert(mappedBanks);
        if (bankErr) console.error('Failed to insert banks:', bankErr);
      }
    }

    // Initial Stage History Log
    try {
      await supabaseServer.from('accurate_lending_stage_history').insert({
        loan_id: loan.id,
        previous_stage: loan.current_stage,
        current_stage: loan.current_stage,
        updated_by: auth.user.id,
        remarks: 'Loan Origin Created',
        changed_at: new Date().toISOString(),
        stage_data: {
          _updated_by: updatedBy,
          broker_commission: loanData.broker_commission !== undefined ? loanData.broker_commission : null,
        },
      });
    } catch (historyErr) {
      console.error('Failed to insert initial stage history:', historyErr);
    }

    return NextResponse.json({
      success: true,
      loan: loan,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
