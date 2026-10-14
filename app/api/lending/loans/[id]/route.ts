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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateApiRequest(request, ['lending', 'accurate_lending', 'admin', 'superadmin']);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const { id } = await params;

    const { data, error } = await supabaseServer
      .from('accurate_lending_loans')
      .select('*, partners:accurate_lending_partners(*), banks:accurate_lending_loan_banks(*, bank:accurate_lending_banks(bank_name))')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Role check if needed
    if (auth.profile?.role !== 'superadmin' && auth.profile?.role !== 'admin') {
      if (data.assigned_user && data.assigned_user !== auth.user.id) {
         return NextResponse.json({ error: 'Access Denied' }, { status: 403 });
      }
    }

    // If broker_commission is not directly populated, retrieve from stage_data history fallback
    if (data.broker_commission === undefined || data.broker_commission === null) {
      const { data: history } = await supabaseServer
        .from('accurate_lending_stage_history')
        .select('stage_data')
        .eq('loan_id', id)
        .not('stage_data->broker_commission', 'is', null)
        .order('changed_at', { ascending: false })
        .limit(1);

      if (history && history.length > 0 && history[0].stage_data?.broker_commission !== undefined) {
        data.broker_commission = Number(history[0].stage_data.broker_commission);
      }
    }

    return NextResponse.json({ success: true, loan: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateApiRequest(request, ['lending', 'accurate_lending', 'admin', 'superadmin']);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify existing record
    const { data: existing, error: fetchErr } = await supabaseServer
      .from('accurate_lending_loans')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }

    // Role-based access: regular lending officers may only update loans assigned to them
    if (auth.profile?.role !== 'superadmin' && auth.profile?.role !== 'admin') {
      if (existing.assigned_user && existing.assigned_user !== auth.user.id) {
        return NextResponse.json({ error: 'Access Denied' }, { status: 403 });
      }
    }

    const { partners, banks, _stage_remarks, _changed_at_override, _stage_data, ...loanData } = body;
    delete loanData.assigned_user; // do not update officer unless explicitly handled
    delete loanData.id;
    delete loanData.created_at;

    const rawPayload = {
      ...existing,
      ...loanData,
      updated_at: new Date().toISOString()
    };
    
    // Convert old payload names to real schema names if they accidentally passed them
    if (rawPayload.property_address !== undefined) {
      rawPayload.business_address = rawPayload.property_address;
      delete rawPayload.property_address;
    }
    if (rawPayload.down_payment_percentage !== undefined) {
      rawPayload.down_payment_percent = rawPayload.down_payment_percentage;
      delete rawPayload.down_payment_percentage;
    }
    if (rawPayload.referral_lo_name !== undefined) {
      rawPayload.referral_name = rawPayload.referral_lo_name;
      delete rawPayload.referral_lo_name;
    }
    
    // Drop fields that don't exist in the DB at all to prevent 400 errors
    delete rawPayload.estimated_credit_score;
    delete rawPayload.stage;
    delete rawPayload.stage_name;

    const sanitizedPayload = sanitizePayloadForPostgres(rawPayload);

    // Update Loan
    let finalLoan: any;
    const { data: updatedLoan, error: updateErr } = await supabaseServer
      .from('accurate_lending_loans')
      .update(sanitizedPayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.code === '42703' || updateErr.message?.includes('broker_commission')) {
        const fallbackPayload = { ...sanitizedPayload };
        delete fallbackPayload.broker_commission;
        const { data: retryLoan, error: retryErr } = await supabaseServer
          .from('accurate_lending_loans')
          .update(fallbackPayload)
          .eq('id', id)
          .select()
          .single();

        if (retryErr) {
          return NextResponse.json({ error: retryErr.message }, { status: 400 });
        }
        finalLoan = { ...retryLoan, broker_commission: sanitizedPayload.broker_commission };
      } else {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
      }
    } else {
      finalLoan = updatedLoan;
    }

    // Persist broker_commission in stage_data if modified or provided
    if (sanitizedPayload.broker_commission !== undefined && sanitizedPayload.broker_commission !== null) {
      try {
        await supabaseServer.from('accurate_lending_stage_history').insert({
          loan_id: id,
          previous_stage: existing.current_stage,
          current_stage: finalLoan.current_stage || existing.current_stage,
          updated_by: auth.user.id,
          remarks: 'Broker Commission Updated',
          changed_at: new Date().toISOString(),
          stage_data: {
            broker_commission: sanitizedPayload.broker_commission,
            _updated_by: auth.user.email,
          }
        });
      } catch (e) {
        console.error('Failed to log broker_commission update to stage history:', e);
      }
    }

    // Handle Partners update (basic approach: delete and re-insert)
    if (partners && Array.isArray(partners)) {
      const totalOwnership = partners.reduce((sum: number, p: any) => sum + (Number(p.ownership_percent) || 0), 0);
      if (totalOwnership !== 100 && partners.length > 0) {
        return NextResponse.json({ error: 'Total partner ownership must exactly equal 100%.' }, { status: 400 });
      }

      await supabaseServer.from('accurate_lending_partners').delete().eq('loan_id', id);
      if (partners.length > 0) {
        const mappedPartners = partners.map((p: any) => ({
          loan_id: id,
          full_name: p.full_name,
          mobile: p.mobile || null,
          email: p.email || null,
          ownership_percent: Number(p.ownership_percent) || 0,
          citizenship_status: p.citizenship_status || null,
        }));
        await supabaseServer.from('accurate_lending_partners').insert(mappedPartners);
      }
    }

    // Handle Banks update
    if (banks && Array.isArray(banks)) {
      await supabaseServer.from('accurate_lending_loan_banks').delete().eq('loan_id', id);
      if (banks.length > 0) {
        const mappedBanks = [];
        for (const b of banks) {
          let bankId = b.bank_id;
          
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
              loan_id: id,
              bank_id: bankId,
              bank_officer_name: b.bank_officer_name || null,
              bank_underwriter_name: b.bank_underwriter_name || null,
              title_agency_name: b.title_agency_name || null,
              bank_closing_agent_name: b.bank_closing_agent_name || null,
              contact_email: b.contact_email || null,
              contact_phone: b.contact_phone || null,
              bank_amount_requested: b.bank_amount_req ? Number(b.bank_amount_req) : (b.bank_amount_requested ? Number(b.bank_amount_requested) : null),
              bank_amount_received: b.bank_amount_rec ? Number(b.bank_amount_rec) : (b.bank_amount_received ? Number(b.bank_amount_received) : null),
            });
          }
        }
        
        if (mappedBanks.length > 0) {
          await supabaseServer.from('accurate_lending_loan_banks').insert(mappedBanks);
        }
      }
    }

    // Handle Stage History if stage changed
    if (existing.current_stage !== updatedLoan.current_stage) {
      try {
        const systemNow = new Date().toISOString();
        const progressionTimestamp = _changed_at_override ? new Date(_changed_at_override).toISOString() : systemNow;
        await supabaseServer.from('accurate_lending_stage_history').insert({
          loan_id: id,
          previous_stage: existing.current_stage,
          current_stage: updatedLoan.current_stage,
          updated_by: auth.user.id,
          remarks: _stage_remarks || null,
          changed_at: progressionTimestamp,
          stage_data: {
            ...(_stage_data || {}),
            event_type: 'STAGE_CHANGED',
            system_timestamp: systemNow,
            is_manual_date: Boolean(_changed_at_override),
            manual_progression_date: _changed_at_override ? progressionTimestamp : null,
            manual_reason: _changed_at_override ? (_stage_remarks || 'Manual progression date override') : null,
            _updated_by: auth.user.email,
          }
        });
      } catch (historyErr) {
        console.error('Failed to insert stage history:', historyErr);
      }
    }

    // Handle Status History if status changed
    if (existing.status && updatedLoan.status && existing.status !== updatedLoan.status) {
      try {
        const systemNow = new Date().toISOString();
        const progressionTimestamp = _changed_at_override ? new Date(_changed_at_override).toISOString() : systemNow;
        await supabaseServer.from('accurate_lending_stage_history').insert({
          loan_id: id,
          previous_stage: existing.status,
          current_stage: updatedLoan.status,
          updated_by: auth.user.id,
          remarks: `Status changed from ${existing.status} to ${updatedLoan.status}`,
          changed_at: progressionTimestamp,
          stage_data: {
            event_type: 'STATUS_CHANGED',
            previous_status: existing.status,
            new_status: updatedLoan.status,
            system_timestamp: systemNow,
            is_manual_date: Boolean(_changed_at_override),
            manual_progression_date: _changed_at_override ? progressionTimestamp : null,
            manual_reason: _changed_at_override ? (_stage_remarks || 'Manual status date override') : null,
            _updated_by: auth.user.email,
          }
        });
      } catch (statusHistoryErr) {
        console.error('Failed to insert status history:', statusHistoryErr);
      }
    }

    return NextResponse.json({ success: true, loan: finalLoan });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
