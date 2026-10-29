import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { sendGraphEmail } from '@/lib/microsoftGraph'

export async function GET(req: Request) {
    return handleProcessOutbox(req)
}

export async function POST(req: Request) {
    return handleProcessOutbox(req)
}

async function handleProcessOutbox(req: Request) {
    try {
        // 1. Authorization check
        const authHeader = req.headers.get('authorization')
        const cronSecret = process.env.CRON_SECRET

        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Claim batch of outbox items
        const workerId = `worker_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        const { data: items, error: claimError } = await supabaseServer.rpc('claim_outbox_batch', {
            p_worker_id: workerId,
            p_batch_size: 10
        })

        if (claimError) {
            console.error('Failed to claim outbox batch:', claimError)
            return NextResponse.json({ error: claimError.message }, { status: 500 })
        }

        if (!items || items.length === 0) {
            return NextResponse.json({ processed: 0, message: 'No pending items' })
        }

        let processedCount = 0
        let failureCount = 0

        // 3. Process each claimed item
        for (const item of items) {
            try {
                if (item.event_type === 'lead_assigned') {
                    await processLeadAssignedEvent(item)
                } else if (item.event_type === 'form_submitted') {
                    await processFormSubmittedEvent(item)
                } else if (item.event_type === 'lead_completed') {
                    await processLeadCompletedEvent(item)
                } else {
                    console.warn(`Unknown outbox event type: ${item.event_type}`)
                }

                // Mark as sent
                await supabaseServer
                    .from('notification_outbox')
                    .update({
                        status: 'sent',
                        processed_at: new Date().toISOString(),
                        error_message: null
                    })
                    .eq('id', item.id)

                processedCount++
            } catch (err: any) {
                console.error(`Failed processing outbox item ${item.id}:`, err)
                failureCount++

                const backoffMinutes = [1, 2, 4, 8, 16]
                const minutes = backoffMinutes[Math.min(item.retry_count || 0, backoffMinutes.length - 1)]
                const nextRetryAt = new Date(Date.now() + minutes * 60 * 1000).toISOString()
                const newRetryCount = (item.retry_count || 0) + 1

                await supabaseServer
                    .from('notification_outbox')
                    .update({
                        status: 'failed',
                        retry_count: newRetryCount,
                        next_retry_at: nextRetryAt,
                        error_message: err.message || String(err)
                    })
                    .eq('id', item.id)
            }
        }

        return NextResponse.json({
            processed: processedCount,
            failures: failureCount,
            totalClaimed: items.length
        })
    } catch (error: any) {
        console.error('Outbox worker error:', error)
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
    }
}

async function processLeadAssignedEvent(item: any) {
    const payload = item.payload || {}
    const { targetUserId, leadId, clientName, policyFlow, insuranceCategory, policyType, targetUserRole } = payload

    if (!targetUserId || !leadId) {
        return
    }

    const clientDisplayName = clientName || 'Client'
    const link = targetUserRole === 'csr' ? `/csr/leads/${leadId}` : '/admin/assignments'
    const title = 'New Lead Assigned'
    const message = `${clientDisplayName} assigned to you (${policyFlow || 'new'} - ${insuranceCategory || 'personal'} - ${policyType || ''})`

    const { error: insertError } = await supabaseServer
        .from('user_notifications')
        .insert({
            user_id: targetUserId,
            title: title,
            message: message,
            lead_id: leadId,
            link: link,
            client_name: clientDisplayName,
            outbox_id: item.id
        })

    if (insertError && insertError.code !== '23505') {
        throw new Error(`Failed to insert lead assignment notification: ${insertError.message}`)
    }

    // Resolve assigned CSR email
    const { data: userData } = await supabaseServer.auth.admin.getUserById(targetUserId)
    const targetEmail = userData?.user?.email

    if (targetEmail) {
        // Idempotency check: verify if email already sent for this outbox_id and recipient
        const { data: sentLogs } = await supabaseServer
            .from('email_logs')
            .select('recipient')
            .eq('outbox_id', item.id)
            .eq('status', 'sent')

        const sentRecipients = new Set((sentLogs || []).map(l => l.recipient))

        if (!sentRecipients.has(targetEmail)) {
            const subject = 'New Lead Assigned'
            const body = `<p>You have been assigned a new lead: <strong>${clientDisplayName}</strong>.</p><p>Flow: ${policyFlow || 'new'}<br>Category: ${insuranceCategory || 'personal'}<br>Type: ${policyType || 'N/A'}</p>`

            await sendGraphEmail(
                [targetEmail],
                subject,
                body,
                leadId,
                'lead_assigned',
                undefined,
                item.id
            )
        }
    }
}

async function processFormSubmittedEvent(item: any) {
    const payload = item.payload || {}
    const { leadId, formType } = payload

    if (!leadId) {
        return
    }

    // Fetch lead details
    const { data: lead, error: leadError } = await supabaseServer
        .from('temp_leads_basics')
        .select('assigned_csr, client_name')
        .eq('id', leadId)
        .single()

    if (leadError && leadError.code !== 'PGRST116') {
        console.warn('Error fetching lead details in outbox worker:', leadError)
    }

    const clientName = lead?.client_name || 'Client'

    // Determine email recipients
    let assignedCsrEmail: string | null = null
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.MICROSOFT_SENDER_EMAIL

    if (lead?.assigned_csr) {
        const { data: userData } = await supabaseServer.auth.admin.getUserById(lead.assigned_csr)
        if (userData?.user?.email) {
            assignedCsrEmail = userData.user.email
        }
    }

    const candidateEmails = Array.from(new Set([assignedCsrEmail, adminEmail].filter(Boolean) as string[]))

    // Check which recipients have already received the email for this outbox event
    const { data: sentLogs } = await supabaseServer
        .from('email_logs')
        .select('recipient')
        .eq('outbox_id', item.id)
        .eq('status', 'sent')

    const sentRecipients = new Set((sentLogs || []).map(l => l.recipient))
    const pendingRecipients = candidateEmails.filter(email => !sentRecipients.has(email))

    if (pendingRecipients.length > 0) {
        await sendGraphEmail(
            pendingRecipients,
            'New Form Submitted',
            `<p>Client has submitted the form (${formType || 'Intake Form'}).</p>`,
            leadId,
            'intake_notification',
            undefined,
            item.id
        )
    }

    // Insert in-app notifications for assigned CSR and Admins
    const notificationTargets = new Set<string>()
    if (lead?.assigned_csr) {
        notificationTargets.add(lead.assigned_csr)
    }

    const { data: admins } = await supabaseServer
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'superadmin'])

    if (admins) {
        admins.forEach(admin => notificationTargets.add(admin.id))
    }

    if (notificationTargets.size > 0) {
        const notificationsToInsert = Array.from(notificationTargets).map(userId => ({
            user_id: userId,
            title: 'Form Submitted',
            message: `${clientName} has submitted intake form`,
            lead_id: leadId,
            link: `/csr/leads/${leadId}`,
            client_name: clientName,
            outbox_id: item.id
        }))

        for (const notif of notificationsToInsert) {
            const { error: notifErr } = await supabaseServer
                .from('user_notifications')
                .insert(notif)

            if (notifErr && notifErr.code !== '23505') {
                console.error('Failed to insert UI notification in outbox worker:', notifErr)
            }
        }
    }
}

async function processLeadCompletedEvent(item: any) {
    const payload = item.payload || {}
    const leadId = payload.lead_id || payload.leadId
    const stageName = payload.stage_name || payload.stageName || 'Completed'

    if (!leadId) {
        return
    }

    // Fetch lead details
    const { data: lead, error: leadError } = await supabaseServer
        .from('temp_leads_basics')
        .select('assigned_csr, client_name, policy_flow, carrier, policy_number, total_premium, new_carrier, new_policy_number, new_premium')
        .eq('id', leadId)
        .single()

    if (leadError && leadError.code !== 'PGRST116') {
        console.warn('Error fetching lead details in outbox worker for lead_completed:', leadError)
    }

    const clientName = lead?.client_name || 'Client'
    const isRenewal = (lead?.policy_flow || '').toLowerCase() === 'renewal' || stageName.includes('Same') || stageName.includes('Switch')

    // Determine Stage-Specific Wording, Title, and Details
    let title = 'Policy Bound'
    let carrierStr = lead?.carrier || 'N/A'
    let policyNumStr = lead?.policy_number || 'N/A'
    let premiumVal = lead?.total_premium !== null && lead?.total_premium !== undefined ? `$${lead.total_premium}` : 'N/A'
    let message = ''

    if (stageName === 'Completed (Same)') {
        title = 'Policy Renewed (Same Carrier)'
        carrierStr = lead?.carrier || 'N/A'
        policyNumStr = lead?.policy_number || 'N/A'
        premiumVal = lead?.total_premium !== null && lead?.total_premium !== undefined ? `$${lead.total_premium}` : 'N/A'
        message = `${clientName} renewed with ${carrierStr} (Policy #: ${policyNumStr}, Premium: ${premiumVal})`
    } else if (stageName === 'Completed (Switch)') {
        title = 'Policy Renewed (Switched Carrier)'
        carrierStr = lead?.new_carrier || lead?.carrier || 'N/A'
        policyNumStr = lead?.new_policy_number || lead?.policy_number || 'N/A'
        premiumVal = lead?.new_premium !== null && lead?.new_premium !== undefined ? `$${lead.new_premium}` : (lead?.total_premium !== null && lead?.total_premium !== undefined ? `$${lead.total_premium}` : 'N/A')
        message = `${clientName} switched to ${carrierStr} (Policy #: ${policyNumStr}, Premium: ${premiumVal})`
    } else {
        // Default: 'Completed' / 'Policy Bound'
        title = 'Policy Bound'
        carrierStr = lead?.carrier || 'N/A'
        policyNumStr = lead?.policy_number || 'N/A'
        premiumVal = lead?.total_premium !== null && lead?.total_premium !== undefined ? `$${lead.total_premium}` : 'N/A'
        message = `${clientName} policy bound with ${carrierStr} (Policy #: ${policyNumStr}, Premium: ${premiumVal})`
    }

    // Determine Email Recipients (Assigned CSR + Admin)
    let assignedCsrEmail: string | null = null
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.MICROSOFT_SENDER_EMAIL

    if (lead?.assigned_csr) {
        const { data: userData } = await supabaseServer.auth.admin.getUserById(lead.assigned_csr)
        if (userData?.user?.email) {
            assignedCsrEmail = userData.user.email
        }
    }

    const candidateEmails = Array.from(new Set([assignedCsrEmail, adminEmail].filter(Boolean) as string[]))

    // Idempotency check for email send
    const { data: sentLogs } = await supabaseServer
        .from('email_logs')
        .select('recipient')
        .eq('outbox_id', item.id)
        .eq('status', 'sent')

    const sentRecipients = new Set((sentLogs || []).map(l => l.recipient))
    const pendingRecipients = candidateEmails.filter(email => !sentRecipients.has(email))

    if (pendingRecipients.length > 0) {
        const emailBody = `<p><strong>${title}</strong></p><p>${message}</p>`
        await sendGraphEmail(
            pendingRecipients,
            title,
            emailBody,
            leadId,
            'lead_completed',
            undefined,
            item.id
        )
    }

    // In-App Notifications for Assigned CSR & Management Roles (Admins/Superadmins)
    const csrTarget = lead?.assigned_csr
    const { data: adminProfiles } = await supabaseServer
        .from('profiles')
        .select('id, role')
        .in('role', ['admin', 'superadmin'])

    const adminIds = new Set((adminProfiles || []).map(p => p.id))

    const notificationsToInsert: any[] = []

    if (csrTarget) {
        const csrLink = isRenewal ? `/csr/renewals/${leadId}?view=focused` : `/csr/leads/${leadId}?view=focused`
        notificationsToInsert.push({
            user_id: csrTarget,
            title: title,
            message: message,
            lead_id: leadId,
            link: csrLink,
            client_name: clientName,
            outbox_id: item.id
        })
    }

    adminIds.forEach(adminId => {
        if (adminId !== csrTarget) {
            const adminLink = isRenewal ? `/admin/leads/renewals/${leadId}?view=focused` : `/csr/leads/${leadId}?view=focused`
            notificationsToInsert.push({
                user_id: adminId,
                title: title,
                message: message,
                lead_id: leadId,
                link: adminLink,
                client_name: clientName,
                outbox_id: item.id
            })
        }
    })

    for (const notif of notificationsToInsert) {
        const { error: notifErr } = await supabaseServer
            .from('user_notifications')
            .insert(notif)

        if (notifErr && notifErr.code !== '23505') {
            console.error('Failed to insert UI notification in processLeadCompletedEvent:', notifErr)
            throw new Error(`Failed to insert UI notification: ${notifErr.message}`)
        }
    }
}
