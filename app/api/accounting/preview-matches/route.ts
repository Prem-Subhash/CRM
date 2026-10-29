import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'
import { StatementRow, CandidateRecord, evaluateMatch } from '@/utils/statementMatcher'

export async function POST(req: Request) {
  try {
    const auth = await authenticateApiRequest(req, ['accounting', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json()
    const { rows } = body

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'Missing or invalid rows array' }, { status: 400 })
    }

    // Read-only candidate lookup
    // To support normalized matching across spaces/hyphens without mutating the database,
    // we fetch the necessary fields for all active/recent leads and perform the match in memory.
    const { data: leads, error: fetchError } = await supabaseServer
      .from('temp_leads_basics')
      .select(`
        id,
        policy_id,
        policy_term_id,
        client_name,
        carrier,
        new_carrier,
        policy_number,
        new_policy_number,
        current_premium,
        renewal_premium,
        total_premium,
        new_premium,
        expected_commission,
        actual_commission,
        accounting_status,
        accounting_verified,
        policy_terms:policy_terms!policy_term_id (
          id,
          policy_id,
          term_sequence,
          term_status,
          policy_number,
          carrier,
          written_premium,
          expected_commission,
          actual_commission,
          accounting_status
        )
      `)

    if (fetchError) {
      console.error('Fetch leads failed during preview:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch candidate leads for matching' }, { status: 500 })
    }

    const candidates: CandidateRecord[] = leads || []

    const previewResults = rows.map((row: StatementRow) => {
      // Evaluate match using the in-memory logic
      return evaluateMatch(row, candidates)
    })

    return NextResponse.json({ success: true, results: previewResults })
  } catch (error: any) {
    console.error('Fatal preview-matches API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
