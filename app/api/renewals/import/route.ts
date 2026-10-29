import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest, canAccessInsuranceCategory } from '@/utils/auth'
import {
  resolveRenewalPipelineAndStage,
  saveRenewalRecords,
  buildRenewalPayload,
  validateRenewalRecord,
} from '@/utils/renewalHelper'

export async function POST(request: Request) {
  // 1. Authenticate user session on the server
  const auth = await authenticateApiRequest(request, ['csr', 'admin', 'superadmin'])
  if (auth.error || !auth.user || !auth.profile) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.status || 401 })
  }

  try {
    const body = await request.json()
    const { category, rawRows, payload: inputPayload } = body

    if (!category || !['personal', 'commercial'].includes(category)) {
      return NextResponse.json({ error: 'Invalid or missing insurance category.' }, { status: 400 })
    }

    // 2. Enforce category access for CSR
    if (auth.profile.role === 'csr' && !canAccessInsuranceCategory(auth.profile, category)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient insurance category access.' }, { status: 403 })
    }

    // 3. Resolve target pipeline and initial stage
    const { pipelineId, stageId } = await resolveRenewalPipelineAndStage(supabaseServer, category)

    let finalPayload: any[] = []
    const skippedRows: string[] = []

    if (Array.isArray(inputPayload) && inputPayload.length > 0) {
      // Input is pre-built payload objects from client or form
      finalPayload = inputPayload.map((item: any) => ({
        ...item,
        pipeline_id: pipelineId,
        current_stage_id: stageId,
        // Enforce CSR assignment rule: CSR must only assign to themselves
        assigned_csr: auth.profile?.role === 'csr' ? auth.user.id : (item.assigned_csr !== undefined ? item.assigned_csr : null),
      }))
    } else if (Array.isArray(rawRows) && rawRows.length > 0) {
      // Input is raw Excel/CSV rows
      rawRows.forEach((r: any, index: number) => {
        const validation = validateRenewalRecord(r, category, true)
        if (!validation.isValid) {
          skippedRows.push(`Row ${index + 1}: ${validation.errors.join(', ')}`)
          return
        }

        const csrId = auth.profile?.role === 'csr' ? auth.user.id : null
        finalPayload.push(buildRenewalPayload(r, category, pipelineId, stageId, csrId, true))
      })
    } else {
      return NextResponse.json({ error: 'No renewal records provided for import.' }, { status: 400 })
    }

    if (finalPayload.length === 0) {
      return NextResponse.json({
        error: skippedRows.length > 0
          ? `Validation failed: all rows skipped due to errors.\n${skippedRows.slice(0, 5).join('\n')}`
          : 'No valid records to import.'
      }, { status: 400 })
    }

    // 4. Save renewal records using server-side service_role client
    const { error: saveError } = await saveRenewalRecords(supabaseServer, finalPayload)
    if (saveError) {
      return NextResponse.json({ error: `Import failed: ${saveError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: finalPayload.length,
      skippedRowsCount: skippedRows.length,
      skippedRows,
    })
  } catch (err: any) {
    console.error('Error in /api/renewals/import:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
