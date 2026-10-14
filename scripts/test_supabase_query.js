const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

async function main() {
    const { data: leads, error } = await supabase
        .from('temp_leads_basics')
        .select(`
            id,
            client_name,
            phone,
            email,
            insurence_category,
            policy_flow,
            pipeline_id,
            current_stage_id,
            created_at,
            assigned_csr,
            current_stage:pipeline_stages (
                stage_name
            ),
            csr:csrs!temp_leads_assigned_csr_fkey (
                name
            )
        `)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error("ERROR:", error);
    } else {
        console.log("FIRST LEAD FULL OBJECT:", JSON.stringify(leads?.[0], null, 2));
    }
}

main();
