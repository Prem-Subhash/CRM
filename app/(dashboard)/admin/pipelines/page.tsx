import { supabaseServer as supabase, createServer } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import PipelineClient from './PipelineClient'

export default async function AdminPipelinesPage() {
    const userClient = await createServer()
    const { data: { user }, error: authError } = await userClient.auth.getUser()

    if (authError || !user) {
        redirect('/login')
    }

    // 1. Fetch Pipelines
    const { data: pipelines } = await supabase
        .from('pipelines')
        .select('id, name')
        .order('id', { ascending: true })

    // 2. Fetch Stages
    const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, pipeline_id, stage_name, stage_order')
        .order('stage_order', { ascending: true })

    // 3. Fetch ALL Leads (SERVER SIDE ✅)
    const { data: leads, error: leadsError } = await supabase
        .from('temp_leads_basics')
        .select(`
        id,
        client_name,
        phone,
        email,
        policy_type,
        lead_policies(policy_type),
        insurence_category,
        policy_flow,
        pipeline_id,
        current_stage_id,
        created_at,
        current_stage:pipeline_stages (
            stage_name
        ),
        assigned_csr_profile:profiles!fk_profile (
            full_name
        )
    `)
        .order('created_at', { ascending: false })

    if (leadsError) {
        console.error("ERROR fetching leads:", leadsError)
    }

    // 4. Count leads per stage
    const stageCounts: Record<string, number> = {}
    if (leads) {
        leads.forEach((lead: any) => {
            if (lead.current_stage_id) {
                stageCounts[lead.current_stage_id] =
                    (stageCounts[lead.current_stage_id] || 0) + 1
            }
        })
    }

    // 5. Custom display order
    const targetPipelines = [
        'Personal Lines Pipeline',
        'Personal Lines Renewal Pipeline',
        'Commercial Lines Pipeline',
        'Commercial Lines Renewal Pipeline'
    ]

    return (
        <PipelineClient
            pipelines={pipelines}
            stages={stages}
            stageCounts={stageCounts}
            targetPipelines={targetPipelines}
            initialLeads={leads || []}   // ✅ IMPORTANT
        />
    )
}