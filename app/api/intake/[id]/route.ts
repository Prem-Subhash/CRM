import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const intakeId = params?.id

    if (!intakeId || !UUID_REGEX.test(intakeId)) {
      return NextResponse.json({ error: 'Invalid intake ID format' }, { status: 400 })
    }

    const { data: intake, error } = await supabaseServer
      .from('temp_intake_forms')
      .select('*')
      .eq('id', intakeId)
      .maybeSingle()

    if (error || !intake) {
      return NextResponse.json({ error: 'Intake form not found' }, { status: 404 })
    }

    // Block public reading if already submitted
    if (intake.status === 'submitted') {
      return NextResponse.json(
        { error: 'This intake form has already been submitted and locked.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: intake }, { status: 200 })
  } catch (err: any) {
    console.error('GET /api/intake/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    const intakeId = params?.id

    if (!intakeId || !UUID_REGEX.test(intakeId)) {
      return NextResponse.json({ error: 'Invalid intake ID format' }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const { action, form_data } = body

    if (!action || !['draft', 'submit'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be "draft" or "submit"' }, { status: 400 })
    }

    // Fetch existing intake form to check status and current state
    const { data: existing, error: fetchErr } = await supabaseServer
      .from('temp_intake_forms')
      .select('*')
      .eq('id', intakeId)
      .maybeSingle()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Intake form not found' }, { status: 404 })
    }

    // Block modifications if form is already submitted
    if (existing.status === 'submitted') {
      return NextResponse.json(
        { error: 'This intake form has already been submitted and cannot be modified.' },
        { status: 403 }
      )
    }

    // Enforce valid state transitions (sent -> draft, sent -> submitted, draft -> draft, draft -> submitted)
    if (!['sent', 'draft'].includes(existing.status)) {
      return NextResponse.json(
        { error: `Cannot transition intake form from status "${existing.status}"` },
        { status: 400 }
      )
    }

    // STRICT FIELD ALLOWLISTING: Only form_data is modifiable by public client.
    // Internal/protected fields (id, lead_id, form_type, reviewed_by, reviewed_at, active_policies) ARE NOT UPDATED.
    const updatePayload: Record<string, any> = {
      form_data: form_data !== undefined ? form_data : existing.form_data
    }

    if (action === 'draft') {
      updatePayload.status = 'draft'
    } else if (action === 'submit') {
      updatePayload.status = 'submitted'
      updatePayload.submitted_at = new Date().toISOString()
    }

    const { data: updated, error: updateErr } = await supabaseServer
      .from('temp_intake_forms')
      .update(updatePayload)
      .eq('id', intakeId)
      .select('*')
      .single()

    if (updateErr) {
      console.error('Error updating intake form:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: updated }, { status: 200 })
  } catch (err: any) {
    console.error('POST /api/intake/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
