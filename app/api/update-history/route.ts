import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { authenticateApiRequest, authorizeLeadAccess } from '@/utils/auth'

export async function PATCH(req: Request) {
  try {
    const auth = await authenticateApiRequest(req, ['csr', 'admin', 'superadmin'])
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { historyId, stageMetadata } = await req.json()

    if (!historyId) {
      return NextResponse.json({ error: 'historyId is required' }, { status: 400 })
    }

    if (!stageMetadata || typeof stageMetadata !== 'object') {
      return NextResponse.json({ error: 'Invalid stageMetadata' }, { status: 400 })
    }

    // Fetch current history record to get lead_id and stage_name before modifying
    const { data: currentHistory, error: fetchError } = await supabaseServer
      .from('lead_stage_history')
      .select('lead_id, stage_name')
      .eq('id', historyId)
      .single()

    if (fetchError || !currentHistory) {
      return NextResponse.json({ error: 'History record not found' }, { status: 404 })
    }

    const leadId = currentHistory.lead_id
    const stageName = currentHistory.stage_name

    const authLead = await authorizeLeadAccess(auth.profile, leadId)
    if (!authLead.authorized) {
      return NextResponse.json({ error: authLead.error }, { status: authLead.status })
    }

    const isUuid = (str: any) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

    let syncPayload: any = {}
    const completionStages = ['Completed', 'Policy Bound', 'Completed (Same)', 'Completed (Switch)']
    if (completionStages.includes(stageName)) {
      // 1. Insurance Company & Carrier Synchronization
      const rawCompanyId = stageMetadata.insurance_company_id
      let carrierPercent: number | null = null

      if (isUuid(rawCompanyId)) {
        const { data: icData } = await supabaseServer
          .from('insurance_companies')
          .select('id, name, commission_percent, is_active')
          .eq('id', rawCompanyId)
          .single()

        if (icData) {
          carrierPercent = icData.commission_percent
          syncPayload.insurance_company_id = icData.id
          syncPayload.carrier = icData.name
          syncPayload.locked_carrier_percent = carrierPercent
          stageMetadata.carrier = icData.name
          stageMetadata.insurance_company_id = icData.id
          if (stageMetadata.expected_commission_percentage === undefined || stageMetadata.expected_commission_percentage === null || stageMetadata.expected_commission_type === 'PERCENTAGE') {
            stageMetadata.expected_commission_percentage = carrierPercent
          }
        }
      } else {
        syncPayload.insurance_company_id = null
        stageMetadata.insurance_company_id = null
        if (stageMetadata.new_carrier) {
          syncPayload.new_carrier = String(stageMetadata.new_carrier).trim()
        } else if (stageMetadata.carrier) {
          syncPayload.carrier = String(stageMetadata.carrier).trim()
        }
      }

      // 2. Authoritative Premium & Commission
      const authoritativePremium = stageName === 'Completed (Switch)' ? stageMetadata.new_premium : stageMetadata.bound_premium
      
      if (authoritativePremium !== undefined && authoritativePremium !== null && Number(authoritativePremium) > 0) {
        const parsedPremium = Number(authoritativePremium)
        if (stageName === 'Completed (Switch)') {
          syncPayload.new_premium = parsedPremium
        } else {
          syncPayload.total_premium = parsedPremium
        }

        // Fetch lead's referral info
        const { data: leadData } = await supabaseServer
          .from('temp_leads_basics')
          .select('locked_carrier_percent, locked_referral_percent')
          .eq('id', leadId)
          .single()

        if (carrierPercent === null && leadData?.locked_carrier_percent !== null && leadData?.locked_carrier_percent !== undefined) {
          carrierPercent = Number(leadData.locked_carrier_percent)
        }

        let finalExpectedCommission: number
        if (stageMetadata.expected_commission_type === 'PERCENTAGE') {
          const pct = Number(stageMetadata.expected_commission_percentage || carrierPercent || 0)
          finalExpectedCommission = Number(((parsedPremium * pct) / 100).toFixed(2))
        } else if (stageMetadata.expected_commission !== undefined && stageMetadata.expected_commission !== null && stageMetadata.expected_commission !== '') {
          finalExpectedCommission = Number(stageMetadata.expected_commission)
        } else if (carrierPercent !== null && carrierPercent !== undefined) {
          finalExpectedCommission = Number(((parsedPremium * carrierPercent) / 100).toFixed(2))
        } else {
          finalExpectedCommission = 0
        }

        stageMetadata.expected_commission = finalExpectedCommission
        syncPayload.expected_commission = finalExpectedCommission

        // Phase 2C Commission Split Calculation
        if (carrierPercent !== null && carrierPercent !== undefined) {
          const referralPercent = leadData?.locked_referral_percent !== null && leadData?.locked_referral_percent !== undefined ? Number(leadData.locked_referral_percent) : null

          let financialSplit
          if (stageMetadata.expected_commission_type === 'PERCENTAGE') {
            const { calculateCommissionSplit } = await import('@/utils/commissionEngine')
            financialSplit = calculateCommissionSplit({
              premium: parsedPremium,
              carrier_percent: Number(stageMetadata.expected_commission_percentage || carrierPercent),
              referral_percent: referralPercent
            })
          } else {
            const Decimal = (await import('decimal.js')).default
            const gross = new Decimal(finalExpectedCommission)
            let admin = new Decimal(0)
            let net = gross
            let referralPayout = new Decimal(0)
            let companyCommission = gross

            if (referralPercent !== null && referralPercent !== undefined) {
              const rPct = new Decimal(referralPercent).div(100)
              admin = gross.mul(new Decimal(0.1)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
              net = gross.minus(admin)
              referralPayout = net.mul(rPct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
              companyCommission = gross.minus(referralPayout)
            }

            financialSplit = {
              gross_commission: gross.toNumber(),
              admin_charge: admin.toNumber(),
              net_commission: net.toNumber(),
              referral_payout: referralPayout.toNumber(),
              company_commission: companyCommission.toNumber()
            }
          }

          syncPayload.gross_commission = financialSplit.gross_commission
          syncPayload.admin_charge = financialSplit.admin_charge
          syncPayload.net_commission = financialSplit.net_commission
          syncPayload.referral_payout = financialSplit.referral_payout
          syncPayload.company_commission = financialSplit.company_commission
          stageMetadata.gross_commission = financialSplit.gross_commission
        }
      }
    }

    // Bypass RLS using supabaseServer
    const { data, error } = await supabaseServer
      .from('lead_stage_history')
      .update({ stage_metadata: stageMetadata })
      .eq('id', historyId)
      .select()
      .single()

    if (error) {
      console.error('Error updating history:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Sync metadata changes to temp_leads_basics
    if (data?.lead_id) {
      if (stageMetadata.insurance_company_id && !syncPayload.insurance_company_id) {
        syncPayload.insurance_company_id = stageMetadata.insurance_company_id
      }
      if (stageMetadata.new_carrier && !syncPayload.new_carrier) {
        syncPayload.new_carrier = stageMetadata.new_carrier
      } else if (stageMetadata.carrier && !syncPayload.carrier) {
        syncPayload.carrier = stageMetadata.carrier
      }

      if (Object.keys(syncPayload).length > 0) {
        await supabaseServer
          .from('temp_leads_basics')
          .update(syncPayload)
          .eq('id', data.lead_id)
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('Update History Exception:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
