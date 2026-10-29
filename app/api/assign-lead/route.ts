import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'

export async function POST(req: Request) {
    try {
        const auth = await authenticateApiRequest(req, ['admin', 'superadmin'])
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status })
        }

        const body = await req.json()
        const { leadId, targetUserId, clientTxId, clientName, policyFlow, insuranceCategory, policyType, targetUserRole } = body

        if (!leadId) {
            return NextResponse.json(
                { error: 'Missing required parameter: leadId' },
                { status: 400 }
            )
        }

        // Validate targetUserId if provided (can be null or UUID string)
        const targetValue = (targetUserId === 'unassigned' || targetUserId === '' || targetUserId === undefined || targetUserId === null)
            ? null
            : targetUserId

        // Construct notification payload for outbox
        const finalClientName = clientName || 'Client'
        const isRenewal = (policyFlow || '').toLowerCase() === 'renewal'
        const isCommercial = (insuranceCategory || '').toLowerCase() === 'commercial'
        const isAdmin = targetUserRole === 'admin' || targetUserRole === 'superadmin'

        const categoryLabel = isCommercial ? 'Commercial' : 'Personal'
        const flowLabel = isRenewal ? 'Renewal' : 'Lead'
        const notificationTitle = `New ${categoryLabel} ${flowLabel} Assigned`
        const finalPolicyType = policyType || '—'
        const notificationMessage = `Client: ${finalClientName}\nPolicy: ${finalPolicyType}`
        const notificationLink = isRenewal
            ? (isAdmin ? `/admin/leads/renewals/${leadId}` : `/csr/renewals/${leadId}`)
            : `/csr/leads/${leadId}`

        const outboxPayload = {
            targetUserId: targetValue,
            leadId,
            title: notificationTitle,
            message: notificationMessage,
            link: notificationLink,
            clientName: finalClientName,
            policyFlow: policyFlow || 'new',
            insuranceCategory: insuranceCategory || 'personal',
            policyType: finalPolicyType
        }

        // Atomically update lead assignment and insert notification outbox entry via RPC
        const { data: rpcData, error: rpcError } = await supabaseServer.rpc('assign_lead_with_outbox', {
            p_lead_id: leadId,
            p_target_user_id: targetValue,
            p_client_tx_id: clientTxId || null,
            p_payload: outboxPayload
        })

        if (rpcError) {
            console.error('Server error in assign_lead_with_outbox RPC:', rpcError)
            return NextResponse.json({ error: rpcError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            updatedCount: rpcData?.updated_count || 1
        })
    } catch (err: any) {
        console.error('Unexpected error in assign-lead API:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
