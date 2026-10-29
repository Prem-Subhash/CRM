import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest } from '@/utils/auth'

export async function GET(req: Request) {
  try {
    const auth = await authenticateApiRequest(req, ['accounting', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    // 3. Fetch active term statistics authoritatively from policy_terms
    const { data: terms, error: fetchError } = await supabaseServer
      .from('policy_terms')
      .select('accounting_status, commission_amount, actual_commission')
      .eq('term_status', 'Active')

    let reconciledCount = 0
    let discrepancyCount = 0
    let unreconciledCount = 0
    let totalExpectedComm = 0
    let totalActualComm = 0

    if (!fetchError && terms && terms.length > 0) {
      for (const term of terms) {
        const status = term.accounting_status
        if (status === 'reconciled') {
          reconciledCount++
        } else if (status === 'discrepancy') {
          discrepancyCount++
        } else if (status === 'unreconciled' || !status || status === 'Pending Verification' || status === 'Unreconciled') {
          unreconciledCount++
        }

        totalExpectedComm += Number(term.commission_amount) || 0
        totalActualComm += Number(term.actual_commission) || 0
      }
    } else {
      // Fallback to temp_leads_basics if policy_terms is not populated
      const { data: leads } = await supabaseServer
        .from('temp_leads_basics')
        .select('accounting_status, expected_commission, actual_commission')

      if (leads) {
        for (const lead of leads) {
          const status = lead.accounting_status
          if (status === 'reconciled') {
            reconciledCount++
          } else if (status === 'discrepancy') {
            discrepancyCount++
          } else if (status === 'unreconciled' || !status || status === 'Pending Verification') {
            unreconciledCount++
          }

          totalExpectedComm += Number(lead.expected_commission) || 0
          totalActualComm += Number(lead.actual_commission) || 0
        }
      }
    }

    // 4. Return structured JSON response
    return NextResponse.json({
      reconciledCount,
      discrepancyCount,
      unreconciledCount,
      totalExpectedComm,
      totalActualComm
    })
  } catch (error: any) {
    console.error('Fatal reconciliation statistics API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
