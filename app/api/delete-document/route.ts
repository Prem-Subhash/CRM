import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest, authorizeLeadAccess } from '@/utils/auth'

export async function POST(req: Request) {
    try {
        const { documentId, filePath, intakeFormId } = await req.json()

        if (!documentId || !filePath) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Validate Authentication / Authorization
        const auth = await authenticateApiRequest(req, undefined, false)
        const user = auth.user

        // Allowed: User is signed in OR they have the matching intakeFormId
        if (!user && !intakeFormId) {
             return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 0.5 Authorize Lead Access (if CSR is deleting) or verify intakeFormId ownership (if unauthenticated public client)
        if (user) {
            let authLeadId = null
            
            // First we need the intake_form_id of the document if not provided directly
            let targetIntakeId = intakeFormId
            if (!targetIntakeId) {
                const { data: doc } = await supabaseServer.from('uploaded_documents').select('intake_form_id').eq('id', documentId).single()
                targetIntakeId = doc?.intake_form_id
            }

            if (targetIntakeId) {
                const { data: intake } = await supabaseServer.from('temp_intake_forms').select('lead_id').eq('id', targetIntakeId).single()
                authLeadId = intake?.lead_id
            }

            if (authLeadId) {
                const authLead = await authorizeLeadAccess(auth.profile, authLeadId)
                if (!authLead.authorized) {
                    return NextResponse.json({ error: authLead.error }, { status: authLead.status })
                }
            }
        } else {
            if (!intakeFormId) {
                return NextResponse.json({ error: 'Unauthorized: Missing intakeFormId' }, { status: 401 })
            }

            const { data: doc, error: docErr } = await supabaseServer
                .from('uploaded_documents')
                .select('intake_form_id')
                .eq('id', documentId)
                .maybeSingle()

            if (docErr || !doc || doc.intake_form_id !== intakeFormId) {
                return NextResponse.json({ error: 'Forbidden: Document does not belong to specified intake form' }, { status: 403 })
            }
        }

        // 1. Delete from Supabase Storage
        const { error: storageError } = await supabaseServer.storage
            .from('documents')
            .remove([filePath])

        if (storageError) {
            console.error('Storage Delete Error:', storageError)
            // Even if storage delete fails (maybe file already gone), we might want to proceed with DB delete
        }

        // 2. Delete from Database
        const { error: dbError } = await supabaseServer
            .from('uploaded_documents')
            .delete()
            .eq('id', documentId)

        if (dbError) {
            console.error('Database Delete Error:', dbError)
            return NextResponse.json({ error: 'Failed to delete document from database' }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (err: any) {
        console.error('Delete Document API Error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
