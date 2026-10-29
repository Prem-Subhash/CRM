import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { sendGraphEmail } from '@/lib/microsoftGraph'

export const dynamic = 'force-dynamic' // Ensure route is not cached

export async function GET(req: Request) {
    try {
        /* ================= AUTHENTICATION CHECK (CRON / BACKGROUND TASK) ================= */
        const authHeader = req.headers.get('authorization')
        const cronSecretHeader = req.headers.get('x-cron-secret')
        const cronSecret = process.env.CRON_SECRET

        const isCronAuthorized =
            (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
            (cronSecret && cronSecretHeader === cronSecret) ||
            (process.env.NODE_ENV === 'development' && !cronSecret)

        if (!isCronAuthorized) {
            return NextResponse.json({ error: 'Unauthorized: Invalid or missing CRON_SECRET' }, { status: 401 })
        }

        const now = new Date().toISOString()

        /* ================= FETCH LEADS NEEDING REMINDER ================= */
        const { data: leads, error: fetchError } = await supabaseServer
            .from('temp_leads_basics')
            .select('id, client_name, email, assigned_csr, stage_metadata')
            .lte('follow_up_date', now)
            .eq('reminder_sent', false)
            .is('form_submitted_at', null)
            .contains('stage_metadata', { email_sent: true })

        if (fetchError) {
            console.error('REMINDER CHECK: Failed to fetch leads', fetchError)
            return NextResponse.json({ error: fetchError.message }, { status: 500 })
        }

        if (!leads || leads.length === 0) {
            return NextResponse.json({ message: 'No reminders to send', count: 0 })
        }

        console.log(`REMINDER CHECK: Found ${leads.length} leads needing reminders`)

        let sentCount = 0
        let errorCount = 0

        /* ================= PROCESS EACH LEAD ================= */
        for (const lead of leads) {
            try {
                if (!lead.email) {
                    console.warn(`REMINDER SKIP: Lead ${lead.id} has no email`)
                    continue
                }

                /* ================= RESOLVE RECIPIENTS ================= */
                let assignedCsrEmail = process.env.MICROSOFT_SENDER_EMAIL // Default to sender
                const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL

                // 1. Get Assigned CSR Email
                if (lead.assigned_csr) {
                    try {
                        const { data: userData, error: userError } = await supabaseServer.auth.admin.getUserById(
                            lead.assigned_csr
                        )
                        if (!userError && userData?.user?.email) {
                            assignedCsrEmail = userData.user.email
                        }
                    } catch (err) {
                        console.warn(`REMINDER: Could not fetch CSR for lead ${lead.id}`, err)
                    }
                }

                // 2. Build Recipients List (CSR + Admin) - Deduplicate
                const recipientList = [assignedCsrEmail, adminEmail].filter(Boolean) as string[]
                const recipients = Array.from(new Set(recipientList))

                if (recipients.length === 0) {
                    console.warn(`REMINDER SKIP: No valid recipients for lead ${lead.id}`)
                    continue
                }

                /* ================= GENERATE LINK ================= */
                // Try to find an intake form for this lead to send them the direct link
                let targetLink = `${process.env.NEXT_PUBLIC_SITE_URL}/csr/leads/${lead.id}` // Default fallback

                const { data: intake } = await supabaseServer
                    .from('temp_intake_forms')
                    .select('id')
                    .eq('lead_id', lead.id)
                    .maybeSingle()

                if (intake && intake.id) {
                    targetLink = `${process.env.NEXT_PUBLIC_SITE_URL}/intake/${intake.id}`
                }

                /* ================= PREPARE EMAIL ================= */
                const subject = `Action Required: Follow-up Reminder for ${lead.client_name || 'Lead'}`
                const body = `
          <p>This is an automated reminder.</p>
          <p>The lead <strong>${lead.client_name || 'Unknown'}</strong> was sent an intake form over 48 hours ago and requires follow-up.</p>
          <p>Please check the dashboard and contact the client if necessary.</p>
          <p><a href="${targetLink}">View Lead / Form</a></p>
        `

                /* ================= SEND EMAIL ================= */
                await sendGraphEmail(recipients, subject, body, lead.id, 'reminder_email')

                /* ================= UPDATE LEAD (Race Condition Safe) ================= */
                // Only update if it is still false.
                const { error: updateError, count } = await supabaseServer
                    .from('temp_leads_basics')
                    .update({ reminder_sent: true })
                    .eq('id', lead.id)
                    .eq('reminder_sent', false) // Prevent double counting/race condition
                    .select() // Need select to see if row was actually updated

                // Note: supabase-js update returns count only if count option is set or select is used. 
                // But regardless, if no error, we assume success. 
                // If race condition hit, count would be 0, effectively doing nothing, which is safe.

                if (updateError) {
                    console.error(`REMINDER ERROR: Failed to update reminder_sent for lead ${lead.id}`, updateError)
                    errorCount++
                    continue
                }

                sentCount++

            } catch (err: any) {
                console.error(`REMINDER FAILURE for lead ${lead.id}:`, err)
                errorCount++
            }
        }

        return NextResponse.json({
            success: true,
            processed: leads.length,
            sent: sentCount,
            errors: errorCount
        })

    } catch (error: any) {
        console.error('REMINDER CHECK FATAL ERROR:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
