import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateApiRequest(req, ['lending', 'accurate_lending', 'admin', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { stageName, stageMetadata, remarks, changedAtOverride, status } = await req.json()
    const { id } = await params
    const loanId = id

    if (!stageName && !status) {
      return NextResponse.json({ error: 'Missing stageName or status' }, { status: 400 })
    }

    // 1. Fetch current loan to get previous stage and status
    const { data: loan, error: loanError } = await supabaseServer
      .from('accurate_lending_loans')
      .select('id, current_stage, status')
      .eq('id', loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    const previousStage = loan.current_stage || ''
    const previousStatus = loan.status || 'Active'
    const newStage = stageName || previousStage
    const newStatus = status || previousStatus

    const stageChanged = Boolean(stageName && stageName !== previousStage)
    const statusChanged = Boolean(status && status !== previousStatus)
    const hasManualDate = Boolean(changedAtOverride)

    // Prevent duplicate logs if neither stage nor status changed, and no manual date override was provided
    if (!stageChanged && !statusChanged && !hasManualDate) {
      return NextResponse.json({ 
        success: true, 
        current_stage: previousStage, 
        status: previousStatus,
        message: 'No stage or status change detected' 
      })
    }

    // 2. Update loan current_stage and status
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    if (stageChanged) {
      updatePayload.current_stage = newStage
    }
    if (statusChanged) {
      updatePayload.status = newStatus
    }

    const { error: updateError } = await supabaseServer
      .from('accurate_lending_loans')
      .update(updatePayload)
      .eq('id', loanId)

    if (updateError) {
      console.error('Update Error:', updateError)
      return NextResponse.json({ error: 'Failed to update loan stage/status' }, { status: 500 })
    }

    const systemNow = new Date().toISOString()
    const progressionTimestamp = hasManualDate ? new Date(changedAtOverride).toISOString() : systemNow
    const userId = auth.profile?.id || auth.user?.id || null
    const userEmail = auth.profile?.email || auth.user?.email || null

    // 3. Insert Stage Progression Audit Log if stage changed
    if (stageChanged) {
      const { error: stageHistoryError } = await supabaseServer
        .from('accurate_lending_stage_history')
        .insert({
          loan_id: loanId,
          previous_stage: previousStage,
          current_stage: newStage,
          updated_by: userId,
          remarks: remarks || null,
          changed_at: progressionTimestamp,
          stage_data: {
            ...(stageMetadata || {}),
            event_type: 'STAGE_CHANGED',
            system_timestamp: systemNow,
            is_manual_date: hasManualDate,
            manual_progression_date: hasManualDate ? progressionTimestamp : null,
            manual_reason: hasManualDate ? (remarks || 'Manual progression date override') : null,
            _updated_by: userEmail
          }
        })

      if (stageHistoryError) {
        console.error('Stage History Error:', stageHistoryError)
      }
    } else if (hasManualDate && !statusChanged) {
      // Stage was not changed, but manual progression date was provided for current stage
      const { error: dateHistoryError } = await supabaseServer
        .from('accurate_lending_stage_history')
        .insert({
          loan_id: loanId,
          previous_stage: previousStage,
          current_stage: newStage,
          updated_by: userId,
          remarks: remarks || 'Stage progression date manually adjusted',
          changed_at: progressionTimestamp,
          stage_data: {
            ...(stageMetadata || {}),
            event_type: 'STAGE_DATE_UPDATED',
            system_timestamp: systemNow,
            is_manual_date: true,
            manual_progression_date: progressionTimestamp,
            manual_reason: remarks || 'Manual progression date override',
            _updated_by: userEmail
          }
        })

      if (dateHistoryError) {
        console.error('Date History Error:', dateHistoryError)
      }
    }

    // 4. Insert Status Progression Audit Log if status changed
    if (statusChanged) {
      const { error: statusHistoryError } = await supabaseServer
        .from('accurate_lending_stage_history')
        .insert({
          loan_id: loanId,
          previous_stage: previousStatus,
          current_stage: newStatus,
          updated_by: userId,
          remarks: remarks || `Status changed from ${previousStatus} to ${newStatus}`,
          changed_at: progressionTimestamp,
          stage_data: {
            event_type: 'STATUS_CHANGED',
            previous_status: previousStatus,
            new_status: newStatus,
            system_timestamp: systemNow,
            is_manual_date: hasManualDate,
            manual_progression_date: hasManualDate ? progressionTimestamp : null,
            manual_reason: hasManualDate ? (remarks || 'Manual status date override') : null,
            _updated_by: userEmail
          }
        })

      if (statusHistoryError) {
        console.error('Status History Error:', statusHistoryError)
      }
    }

    return NextResponse.json({ 
      success: true, 
      current_stage: newStage, 
      status: newStatus,
      recorded_at: progressionTimestamp,
      is_manual_date: hasManualDate
    })
  } catch (err: any) {
    console.error('Lending Update Stage Error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

