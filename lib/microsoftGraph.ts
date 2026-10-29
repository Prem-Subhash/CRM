export async function getAccessToken() {
    const tenantId = process.env.MICROSOFT_TENANT_ID
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

    const response = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                client_id: clientId!,
                scope: "https://graph.microsoft.com/.default",
                client_secret: clientSecret!,
                grant_type: "client_credentials",
            }),
        }
    )

    const data = await response.json()

    if (!response.ok) {
        throw new Error("Failed to get access token")
    }

    return data.access_token
}

import { supabaseServer } from '@/lib/supabaseServer'

export interface GraphAttachment {
    name: string;
    contentType: string;
    contentBytes: string;
    contentId?: string;
    isInline?: boolean;
}

export async function sendGraphEmail(
    to: string[],
    subject: string,
    body: string,
    leadId?: string,
    emailType?: string,
    attachments?: GraphAttachment[],
    outboxId?: string
) {
    const recipientList = to.join(', ')

    try {
        const token = await getAccessToken()

        const sender = process.env.MICROSOFT_SENDER_EMAIL

        const messagePayload: any = {
            subject,
            body: {
                contentType: "HTML",
                content: body,
            },
            toRecipients: to.map(email => ({
                emailAddress: { address: email },
            })),
        };

        if (attachments && attachments.length > 0) {
            messagePayload.attachments = attachments.map(att => {
                const item: any = {
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: att.name,
                    contentType: att.contentType,
                    contentBytes: att.contentBytes,
                };
                if (att.contentId) item.contentId = att.contentId;
                if (att.isInline !== undefined) item.isInline = att.isInline;
                return item;
            });
        }

        const response = await fetch(
            `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: messagePayload,
                    saveToSentItems: true,
                }),
            }
        )

        if (!response.ok) {
            const error = await response.text()
            throw new Error(error)
        }

        // Automatic logging capture internally triggered by server API parameters!
        if (leadId && emailType) {
            if (outboxId) {
                const logEntries = to.map(email => ({
                    lead_id: leadId,
                    email_type: emailType,
                    recipient: email,
                    status: "sent",
                    outbox_id: outboxId
                }))
                await supabaseServer.from("email_logs").insert(logEntries)
            } else {
                await supabaseServer
                    .from("email_logs")
                    .insert({
                        lead_id: leadId,
                        email_type: emailType,
                        recipient: recipientList,
                        status: "sent"
                    })
            }
        }

        return true
    } catch (error: any) {
        if (leadId && emailType) {
            if (outboxId) {
                const logEntries = to.map(email => ({
                    lead_id: leadId,
                    email_type: emailType,
                    recipient: email,
                    status: "failed",
                    error_message: error.message || String(error),
                    outbox_id: outboxId
                }))
                await supabaseServer.from("email_logs").insert(logEntries)
            } else {
                await supabaseServer
                    .from("email_logs")
                    .insert({
                        lead_id: leadId,
                        email_type: emailType,
                        recipient: recipientList,
                        status: "failed",
                        error_message: error.message || String(error)
                    })
            }
        }
        throw error
    }
}
