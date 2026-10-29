import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateApiRequest(req, ['lending', 'accurate_lending', 'admin', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { historyId, newProgressionDate, reason } = await req.json()

    if (!historyId || !newProgressionDate) {
      return NextResponse.json({ error: 'Missing historyId or newProgressionDate' }, { status: 400 })
    }

    const parsedDate = new Date(newProgressionDate)
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date/time format' }, { status: 400 })
    }

    const newProgressionDateIso = parsedDate.toISOString()

    // 1. Fetch existing history item
    const { data: existing, error: fetchErr } = await supabaseServer
      .from('accurate_lending_stage_history')
      .select('*')
      .eq('id', historyId)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Stage history record not found' }, { status: 404 })
    }

    const originalTimestamp = 
      existing.stage_data?.original_timestamp || 
      existing.stage_data?.system_timestamp || 
      existing.changed_at

    const userId = auth.profile?.id || auth.user?.id || null
    const userEmail = auth.profile?.email || auth.user?.email || null
    const nowIso = new Date().toISOString()

    // 2. Update the target history record with the new progression date and manual adjustment metadata
    const updatedStageData = {
      ...(existing.stage_data || {}),
      original_timestamp: originalTimestamp,
      system_timestamp: originalTimestamp,
      is_manual_date: true,
      manual_progression_date: newProgressionDateIso,
      manual_adjustment_reason: reason || 'Manual progression date adjustment',
      manual_adjusted_by: userId,
      manual_adjusted_by_email: userEmail,
      manual_adjusted_at: nowIso,
    }

    const { error: updateErr } = await supabaseServer
      .from('accurate_lending_stage_history')
      .update({
        changed_at: newProgressionDateIso,
        stage_data: updatedStageData,
      })
      .eq('id', historyId)

    if (updateErr) {
      console.error('Update History Error:', updateErr)
      return NextResponse.json({ error: 'Failed to update progression date' }, { status: 500 })
    }

    // 3. Insert an explicit audit trail event into accurate_lending_stage_history
    const { error: auditErr } = await supabaseServer
      .from('accurate_lending_stage_history')
      .insert({
        loan_id: existing.loan_id,
        previous_stage: existing.changed_at,
        current_stage: newProgressionDateIso,
        updated_by: userId,
        remarks: reason ? `Manual date adjustment: ${reason}` : `Progression date for "${existing.current_stage}" manually adjusted`,
        changed_at: nowIso,
        stage_data: {
          event_type: 'STAGE_DATE_UPDATED',
          target_history_id: historyId,
          stage_name: existing.current_stage,
          original_timestamp: originalTimestamp,
          previous_date: existing.changed_at,
          new_progression_date: newProgressionDateIso,
          reason: reason || null,
          system_timestamp: nowIso,
          _updated_by: userEmail,
        }
      })

    if (auditErr) {
      console.error('Audit Log Insert Error:', auditErr)
    }

    // 4. Also record to central audit_logs table if accessible
    try {
      await supabaseServer.from('audit_logs').insert({
        user_id: userId,
        action: 'STAGE_DATE_UPDATED',
        entity: 'accurate_lending_stage_history',
        entity_id: historyId,
        metadata: {
          loan_id: existing.loan_id,
          stage_name: existing.current_stage,
          original_timestamp: originalTimestamp,
          new_progression_date: newProgressionDateIso,
          reason: reason || null,
          user_email: userEmail
        },
        created_at: nowIso
      })
    } catch (e) {
      // non-fatal
    }

    return NextResponse.json({
      success: true,
      historyId,
      newProgressionDate: newProgressionDateIso,
      originalTimestamp
    })
  } catch (err: any) {
    console.error('Manual Date API Error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
