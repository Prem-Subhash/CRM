import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { authenticateApiRequest } from '@/utils/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateApiRequest(request, ['lending', 'accurate_lending', 'admin', 'superadmin']);
    if (auth.error || !auth.user) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 });
    }

    const { id } = await params;

    // Verify loan existence and ownership
    const { data: loan, error: loanErr } = await supabaseServer
      .from('accurate_lending_loans')
      .select('id, assigned_user')
      .eq('id', id)
      .single();

    if (loanErr || !loan) {
      return NextResponse.json({ success: false, error: 'Loan not found' }, { status: 404 });
    }

    // Role-based access: regular lending officers may only view history for loans assigned to them
    if (auth.profile?.role !== 'superadmin' && auth.profile?.role !== 'admin') {
      if (loan.assigned_user && loan.assigned_user !== auth.user.id) {
        return NextResponse.json({ success: false, error: 'Access Denied' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseServer
      .from('accurate_lending_stage_history')
      .select('*, updater:profiles(id, full_name, email, role)')
      .eq('loan_id', id)
      .order('changed_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, history: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 });
  }
}

