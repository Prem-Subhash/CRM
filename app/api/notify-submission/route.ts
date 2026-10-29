import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'

export async function POST(req: Request) {
    try {
        const auth = await authenticateApiRequest(req, undefined, false)
        const user = auth.user

        const { leadId, intakeId, formType } = await req.json()

        let targetLeadId: string | null = null

        if (user) {
            // Authenticated CRM user: can supply leadId or intakeId
            targetLeadId = leadId
            if (!targetLeadId && intakeId) {
                const { data: intake } = await supabaseServer
                    .from('temp_intake_forms')
                    .select('lead_id')
                    .eq('id', intakeId)
                    .single()
                targetLeadId = intake?.lead_id || null
            }
        } else {
            // Unauthenticated public customer: MUST provide valid intakeId
            if (!intakeId) {
                return NextResponse.json(
                    { error: 'Unauthorized: Missing valid intakeId' },
                    { status: 401 }
                )
            }

            const { data: intake, error: intakeError } = await supabaseServer
                .from('temp_intake_forms')
                .select('lead_id')
                .eq('id', intakeId)
                .single()

            if (intakeError || !intake || !intake.lead_id) {
                return NextResponse.json(
                    { error: 'Invalid or non-existent intakeId' },
                    { status: 404 }
                )
            }

            targetLeadId = intake.lead_id
        }

        if (!targetLeadId) {
            return NextResponse.json(
                { error: 'Missing leadId or valid intakeId' },
                { status: 400 }
            )
        }

        const activeIntakeId = intakeId || targetLeadId
        const payload = {
            leadId: targetLeadId,
            intakeId: activeIntakeId,
            formType: formType || 'Intake Form'
        }

        /* ================= ATOMIC CONVERSION + OUTBOX ENQUEUE ================= */
        const { data: rpcResult, error: rpcError } = await supabaseServer.rpc('convert_intake_with_outbox', {
            p_lead_id: targetLeadId,
            p_intake_id: activeIntakeId,
            p_payload: payload
        })

        if (rpcError) {
            console.error('FAILED TO EXECUTE RPC convert_intake_with_outbox:', rpcError)
            return NextResponse.json(
                { error: 'Failed to process form submission: ' + rpcError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true, result: rpcResult })
    } catch (error: any) {
        console.error('Notify submission API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

