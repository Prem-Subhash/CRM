import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateApiRequest(req, ['lending', 'accurate_lending', 'admin', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(req.url)
    const loanId = searchParams.get('loanId')
    const eventType = searchParams.get('eventType')
    const stage = searchParams.get('stage')
    const search = searchParams.get('search')?.toLowerCase().trim()
    const limit = Math.min(Number(searchParams.get('limit')) || 200, 1000)

    let query = supabaseServer
      .from('accurate_lending_stage_history')
      .select(`
        id,
        loan_id,
        previous_stage,
        current_stage,
        updated_by,
        remarks,
        stage_data,
        changed_at,
        loan:accurate_lending_loans(id, borrower_name, loan_type, current_stage, status),
        updater:profiles(id, full_name, email, role)
      `)
      .order('changed_at', { ascending: false })
      .limit(limit)

    if (loanId && loanId !== 'ALL') {
      query = query.eq('loan_id', loanId)
    }

    const { data: rawActivities, error } = await query

    if (error) {
      console.error('Fetch Activity Log Error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    // Fetch minimal list of loans for the deal filter dropdown
    const { data: loansList } = await supabaseServer
      .from('accurate_lending_loans')
      .select('id, borrower_name, current_stage, status')
      .order('borrower_name', { ascending: true })

    // Normalize and filter activities
    let activities = (rawActivities || []).map((item: any) => {
      const stageData = item.stage_data || {}
      
      // Determine event type:
      // Priority 1: stageData.event_type if present
      // Priority 2: Check remarks or stage transitions
      let resolvedEventType: string = stageData.event_type || 'STAGE_CHANGED'
      if (!stageData.event_type) {
        if (stageData.new_status || item.remarks?.toLowerCase().includes('status')) {
          resolvedEventType = 'STATUS_CHANGED'
        } else if (stageData.is_manual_date || item.remarks?.toLowerCase().includes('date')) {
          resolvedEventType = 'STAGE_DATE_UPDATED'
        } else {
          resolvedEventType = 'STAGE_CHANGED'
        }
      }

      const isManual = Boolean(
        stageData.is_manual_date || 
        stageData.manual_progression_date ||
        stageData.original_timestamp
      )

      return {
        ...item,
        resolved_event_type: resolvedEventType,
        is_manual_date: isManual,
        system_timestamp: stageData.system_timestamp || stageData.original_timestamp || item.changed_at,
        manual_progression_date: stageData.manual_progression_date || (isManual ? item.changed_at : null),
        manual_reason: stageData.manual_reason || stageData.manual_adjustment_reason || null,
        updater_display: item.updater?.full_name || stageData._updated_by || 'System'
      }
    })

    // Filter by event type if specified
    if (eventType && eventType !== 'ALL') {
      activities = activities.filter((a: any) => a.resolved_event_type === eventType)
    }

    // Filter by stage if specified
    if (stage && stage !== 'ALL') {
      activities = activities.filter((a: any) => 
        a.current_stage === stage || a.previous_stage === stage
      )
    }

    // Filter by free-text search
    if (search) {
      activities = activities.filter((a: any) => {
        const borrower = a.loan?.borrower_name?.toLowerCase() || ''
        const loanIdShort = a.loan_id?.toLowerCase() || ''
        const prev = a.previous_stage?.toLowerCase() || ''
        const curr = a.current_stage?.toLowerCase() || ''
        const updater = (a.updater_display || '').toLowerCase()
        const remarks = (a.remarks || '').toLowerCase()
        const reason = (a.manual_reason || '').toLowerCase()

        return (
          borrower.includes(search) ||
          loanIdShort.includes(search) ||
          prev.includes(search) ||
          curr.includes(search) ||
          updater.includes(search) ||
          remarks.includes(search) ||
          reason.includes(search)
        )
      })
    }

    return NextResponse.json({
      success: true,
      activities,
      deals: loansList || []
    })
  } catch (err: any) {
    console.error('Activity Log Server Error:', err)
    return NextResponse.json({ success: false, error: err.message || 'Server error' }, { status: 500 })
  }
}
