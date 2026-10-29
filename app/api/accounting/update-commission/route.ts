import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'

export async function POST(req: Request) {
  try {
    const auth = await authenticateApiRequest(req, ['accounting', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const user = auth.user!

    // 3. Parse and validate request payload
    const body = await req.json()
    const { leadId, expectedCommission, actualCommission } = body

    if (!leadId) {
      return NextResponse.json({ error: 'Missing required field: leadId' }, { status: 400 })
    }

    if (expectedCommission === undefined || typeof expectedCommission !== 'number' || isNaN(expectedCommission)) {
      return NextResponse.json({ error: 'expectedCommission is required and must be a valid number' }, { status: 400 })
    }

    if (actualCommission === undefined || typeof actualCommission !== 'number' || isNaN(actualCommission)) {
      return NextResponse.json({ error: 'actualCommission is required and must be a valid number' }, { status: 400 })
    }

    if (expectedCommission < 0 || actualCommission < 0) {
      return NextResponse.json({ error: 'Commission values cannot be negative' }, { status: 400 })
    }

    // 4. Fetch current lead state and active policy_term to log differences
    const { data: currentLead, error: fetchError } = await supabaseServer
      .from('temp_leads_basics')
      .select(`
        id,
        policy_id,
        policy_term_id,
        expected_commission,
        actual_commission,
        accounting_status,
        policy_terms:policy_terms!policy_term_id (
          id,
          policy_id,
          term_sequence,
          term_status,
          commission_amount,
          actual_commission,
          accounting_status
        )
      `)
      .eq('id', leadId)
      .single()

    if (fetchError || !currentLead) {
      console.error('Fetch lead failed:', fetchError)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const activeTerm = currentLead.policy_terms?.find((t: any) => t.id === currentLead.policy_term_id || t.term_status === 'Active')
    const activeTermId = activeTerm?.id || currentLead.policy_term_id

    // 5. Authoritative update to policy_terms (Active term ONLY)
    if (activeTermId) {
      const { data: updatedTerms, error: termErr } = await supabaseServer
        .from('policy_terms')
        .update({
          expected_commission: expectedCommission,
          actual_commission: actualCommission,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeTermId)
        .eq('term_status', 'Active')
        .select('id')

      if (termErr) {
        console.error('Update policy_terms failed in update-commission:', termErr)
        return NextResponse.json({ error: 'Failed to update commission values' }, { status: 500 })
      }

      if (!updatedTerms || updatedTerms.length === 0) {
        return NextResponse.json({ error: 'Target policy term is no longer active or was modified concurrently' }, { status: 409 })
      }
    }

    // Operational mirror update on temp_leads_basics
    const { error: updateError } = await supabaseServer
      .from('temp_leads_basics')
      .update({
        expected_commission: expectedCommission,
        actual_commission: actualCommission
      })
      .eq('id', leadId)

    if (updateError) {
      console.error('Update lead commissions failed:', updateError)
      return NextResponse.json({ error: 'Failed to update commission values' }, { status: 500 })
    }

    // 6. Insert Audit Log into accounting_logs (including lead_id, policy_id, policy_term_id)
    const oldExpected = Number(activeTerm?.commission_amount ?? currentLead.expected_commission) || 0
    const oldActual = Number(activeTerm?.actual_commission ?? currentLead.actual_commission) || 0
    const currentStatus = activeTerm?.accounting_status ?? currentLead.accounting_status

    const { error: logError } = await supabaseServer
      .from('accounting_logs')
      .insert({
        lead_id: leadId,
        policy_id: currentLead.policy_id || activeTerm?.policy_id || null,
        policy_term_id: activeTermId || null,
        updated_by: user.id,
        old_expected_commission: oldExpected,
        new_expected_commission: expectedCommission,
        old_actual_commission: oldActual,
        new_actual_commission: actualCommission,
        old_status: currentStatus,
        new_status: currentStatus,
        created_at: new Date().toISOString()
      })

    if (logError) {
      console.error('Failed to write audit logs to accounting_logs:', logError)
    }

    return NextResponse.json({ success: true, message: 'Commission values updated successfully.' })
  } catch (error: any) {
    console.error('Fatal update commission API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
