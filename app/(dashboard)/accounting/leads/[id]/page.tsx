// Lead Accounting Page Wrapper
import { createServer } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import LeadAccountingClient from '@/app/(dashboard)/accounting/leads/[id]/LeadAccountingClient'

export default async function LeadAccountingPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const supabase = await createServer()

  // 1. Verify Authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2. Enforce RBAC (only accounting and superadmin roles allowed)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['accounting', 'superadmin'].includes(profile.role)) {
    redirect('/unauthorized')
  }

  const resolvedParams = await params
  const leadId = resolvedParams.id

  // 3. Fetch lead details
  const { data: lead, error: leadError } = await supabase
    .from('temp_leads_basics')
    .select(`
      id,
      policy_id,
      policy_term_id,
      client_name,
      phone,
      email,
      policy_number,
      carrier,
      new_policy_number,
      new_carrier,
      new_premium,
      policy_flow,
      insurence_category,
      effective_date,
      total_premium,
      locked_carrier_percent,
      gross_commission,
      admin_charge,
      net_commission,
      locked_referral_percent,
      referral,
      referral_id,
      referral_payout,
      company_commission,
      expected_commission,
      actual_commission,
      accounting_status,
      accounting_verified,
      accounting_notes,
      carrier_payment_date,
      commission_received_date,
      verified_by,
      verified_at,
      assigned_csr,
      stage_metadata,
      assigned_user_profile:profiles!fk_profile (
        full_name
      ),
      policy_terms:policy_terms!policy_term_id (
        id,
        policy_id,
        term_sequence,
        term_status,
        carrier,
        policy_number,
        written_premium,
        effective_date,
        expiration_date,
        gross_commission,
        expected_commission,
        actual_commission,
        admin_charge,
        net_commission,
        referral_payout,
        company_commission,
        accounting_status,
        accounting_verified,
        accounting_notes,
        carrier_payment_date,
        commission_received_date,
        verified_by,
        verified_at
      )
    `)
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <div className="bg-white rounded-2xl border border-gray-100 p-12 shadow-sm">
          <h1 className="text-2xl font-bold text-red-500 mb-2">Lead Not Found</h1>
          <p className="text-gray-500">The requested lead ID does not exist or you do not have permissions to view it.</p>
        </div>
      </div>
    )
  }

  // 4. Fetch accounting logs for this lead
  const { data: logs } = await supabase
    .from('accounting_logs')
    .select(`
      id,
      lead_id,
      updated_by,
      old_expected_commission,
      new_expected_commission,
      old_actual_commission,
      new_actual_commission,
      old_status,
      new_status,
      notes,
      created_at,
      updater:profiles!updated_by (
        full_name
      )
    `)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  return (
    <LeadAccountingClient 
      initialLead={lead} 
      initialLogs={logs || []} 
      leadId={leadId}
    />
  )
}
