import { NextResponse } from 'next/server'
import { createServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'
import { resolvePolicyState } from '@/utils/policyStateHelper'

export async function GET(req: Request) {
  try {
    const auth = await authenticateApiRequest(req, ['accounting', 'admin', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = await createServer()

    let allLeads: any[] = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabase
        .from('temp_leads_basics')
        .select(`
          carrier, new_carrier, policy_flow, stage_metadata,
          intake_forms:temp_intake_forms ( form_data, submitted_at )
        `)
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) {
        console.error('Error fetching filter options in route:', error)
        return NextResponse.json({ error: 'Failed to fetch filter options' }, { status: 500 })
      }

      if (data && data.length > 0) {
        allLeads.push(...data)
        if (data.length < pageSize) {
          hasMore = false
        } else {
          page++
        }
      } else {
        hasMore = false
      }
    }

    const carriers = Array.from(
      new Set(allLeads.flatMap(d => [d.carrier, d.new_carrier]).filter(Boolean))
    ) as string[]

    const flows = Array.from(
      new Set(allLeads.map(d => d.policy_flow).filter(Boolean))
    ) as string[]

    const states = Array.from(
      new Set(allLeads.map(d => resolvePolicyState(d)).filter(s => s && s !== '—'))
    ) as string[]

    return NextResponse.json({
      carriers: carriers.sort(),
      flows: flows.sort(),
      states: states.sort()
    })
  } catch (error: any) {
    console.error('Filter options API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
