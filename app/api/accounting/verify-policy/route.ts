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
    const {
      leadId,
      actualCommission,
      accountingStatus,
      accountingVerified,
      accountingNotes,
      carrierPaymentDate,
      commissionReceivedDate
    } = body

    if (!leadId) {
      return NextResponse.json({ error: 'Missing required field: leadId' }, { status: 400 })
    }

    if (actualCommission !== undefined && typeof actualCommission !== 'number') {
      return NextResponse.json({ error: 'actualCommission must be a number' }, { status: 400 })
    }

    const validStatuses = ['unreconciled', 'reconciled', 'discrepancy']
    if (accountingStatus && !validStatuses.includes(accountingStatus)) {
      return NextResponse.json({ error: 'Invalid accountingStatus value' }, { status: 400 })
    }

    if (accountingVerified !== undefined && typeof accountingVerified !== 'boolean') {
      return NextResponse.json({ error: 'accountingVerified must be a boolean' }, { status: 400 })
    }

    // 4. Fetch current lead state and active policy_term to log differences & update authoritatively
    const { data: currentLead, error: fetchError } = await supabaseServer
      .from('temp_leads_basics')
      .select(`
        id,
        policy_id,
        policy_term_id,
        expected_commission,
        actual_commission,
        accounting_status,
        accounting_verified,
        accounting_notes,
        verified_by,
        verified_at,
        carrier_payment_date,
        commission_received_date,
        policy_terms:policy_terms!policy_term_id (
          id,
          policy_id,
          term_sequence,
          term_status,
          commission_amount,
          actual_commission,
          accounting_status,
          accounting_verified,
          accounting_notes,
          carrier_payment_date,
          commission_received_date
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

    // 5. Build dynamic update payload
    const updatePayload: any = {}
    if (actualCommission !== undefined) updatePayload.actual_commission = actualCommission
    if (accountingStatus !== undefined) updatePayload.accounting_status = accountingStatus
    if (accountingVerified !== undefined) {
      updatePayload.accounting_verified = accountingVerified
      if (accountingVerified) {
        updatePayload.verified_by = user.id
        updatePayload.verified_at = new Date().toISOString()
      } else {
        updatePayload.verified_by = null
        updatePayload.verified_at = null
      }
    }
    if (accountingNotes !== undefined) updatePayload.accounting_notes = accountingNotes
    if (carrierPaymentDate !== undefined) updatePayload.carrier_payment_date = carrierPaymentDate || null
    if (commissionReceivedDate !== undefined) updatePayload.commission_received_date = commissionReceivedDate || null

    // 6. Authoritative update to policy_terms (Active term ONLY)
    if (activeTermId) {
      const termPayload = { ...updatePayload, updated_at: new Date().toISOString() }
      const { data: updatedTerms, error: termErr } = await supabaseServer
        .from('policy_terms')
        .update(termPayload)
        .eq('id', activeTermId)
        .eq('term_status', 'Active')
        .select('id')

      if (termErr) {
        console.error('Update policy_terms failed in verify-policy:', termErr)
        return NextResponse.json({ error: 'Failed to update authoritative policy term' }, { status: 500 })
      }

      if (!updatedTerms || updatedTerms.length === 0) {
        return NextResponse.json({ error: 'Target policy term is no longer active or was modified concurrently' }, { status: 409 })
      }
    }

    // Operational mirror update on temp_leads_basics
    const { error: updateError } = await supabaseServer
      .from('temp_leads_basics')
      .update(updatePayload)
      .eq('id', leadId)

    if (updateError) {
      console.error('Update lead failed:', updateError)
      return NextResponse.json({ error: 'Failed to update policy verification status' }, { status: 500 })
    }

    // 7. Insert Audit Logs into accounting_logs (including lead_id, policy_id, policy_term_id)
    const oldExpected = Number(activeTerm?.commission_amount ?? currentLead.expected_commission) || 0
    const oldActual = Number(activeTerm?.actual_commission ?? currentLead.actual_commission) || 0
    const oldStatus = activeTerm?.accounting_status ?? currentLead.accounting_status
    const newActualCommission = updatePayload.actual_commission !== undefined ? updatePayload.actual_commission : oldActual
    const newStatus = updatePayload.accounting_status !== undefined ? updatePayload.accounting_status : oldStatus
    const logNotes = updatePayload.accounting_notes !== undefined ? updatePayload.accounting_notes : (activeTerm?.accounting_notes || currentLead.accounting_notes)

    const { error: logError } = await supabaseServer
      .from('accounting_logs')
      .insert({
        lead_id: leadId,
        policy_id: currentLead.policy_id || activeTerm?.policy_id || null,
        policy_term_id: activeTermId || null,
        updated_by: user.id,
        old_expected_commission: oldExpected,
        new_expected_commission: oldExpected,
        old_actual_commission: oldActual,
        new_actual_commission: newActualCommission,
        old_status: oldStatus,
        new_status: newStatus,
        notes: logNotes,
        created_at: new Date().toISOString()
      })

    if (logError) {
      console.error('Failed to write audit logs to accounting_logs:', logError)
    }

    return NextResponse.json({ success: true, message: 'Policy verification status updated successfully.' })
  } catch (error: any) {
    console.error('Fatal verify policy API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
