const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error(
        'ERROR: Missing Supabase configuration. ' +
        'Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        'in your local environment variables.'
    );

    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    try {
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
            console.error('ERROR fetching lead:', error.message);
            process.exitCode = 1;
            return;
        }

        console.log(
            'FIRST LEAD FULL OBJECT:',
            JSON.stringify(leads?.[0] ?? null, null, 2)
        );
    } catch (error) {
        console.error('Unexpected error:', error.message);
        process.exitCode = 1;
    }
}

main();