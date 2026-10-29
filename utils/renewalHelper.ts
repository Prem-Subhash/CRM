import { normalizeImportDate } from '@/utils/fileParser'
import { formatPhoneInput } from '@/utils/phoneFormatter'

export interface RenewalValidationResult {
  isValid: boolean
  errors: string[]
}

export interface RenewalPipelineResolution {
  pipelineId: string
  stageId: string
}

/**
 * Resolves the target renewal pipeline and its initial stage (stage_order = 1)
 * based on the insurance category.
 */
export async function resolveRenewalPipelineAndStage(
  supabase: any,
  category: 'personal' | 'commercial'
): Promise<RenewalPipelineResolution> {
  const pipelineName =
    category === 'personal'
      ? 'Personal Lines Renewal'
      : 'Commercial Lines Renewal Pipeline'

  const { data: pipeline, error: pipelineError } = await supabase
    .from('pipelines')
    .select('id')
    .eq('name', pipelineName)
    .single()

  if (pipelineError || !pipeline) {
    throw new Error(`${pipelineName} not found in system.`)
  }

  const { data: stage, error: stageError } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipeline.id)
    .order('stage_order', { ascending: true })
    .limit(1)
    .single()

  if (stageError || !stage) {
    throw new Error(`Initial pipeline stage not found for ${pipelineName}.`)
  }

  return {
    pipelineId: pipeline.id,
    stageId: stage.id,
  }
}

/**
 * Validates a single renewal record (either from Excel import row or manual entry form).
 */
export function validateRenewalRecord(
  r: any,
  category: 'personal' | 'commercial',
  isExcelImport = false
): RenewalValidationResult {
  const errors: string[] = []

  const accountName = isExcelImport
    ? r['applicant data account name']?.trim()
    : r.client_name?.trim() || r.account_name?.trim()

  const policyNumber = isExcelImport
    ? r['policy data policy number']?.trim()
    : r.policy_number?.trim()

  const expirationDateInput = isExcelImport
    ? r['policy data policy expiration date']
    : r.renewal_date

  const expirationDate = typeof expirationDateInput === 'string' ? expirationDateInput.trim() : expirationDateInput

  const premiumStr = isExcelImport
    ? r['policy data totalwrittenpremium']?.toString()?.trim()
    : r.current_premium?.toString()?.trim()

  const policyType = isExcelImport
    ? r['policy data policy type']?.trim()
    : r.policy_type?.trim()

  if (!accountName) {
    errors.push('Missing Account Name')
  }
  if (!policyNumber) {
    errors.push('Missing Policy Number')
  }

  const formattedDate = normalizeImportDate(expirationDate)
  if (!expirationDate || !formattedDate) {
    errors.push('Invalid Renewal Date')
  }

  const premiumNum = Number(premiumStr)
  if (!premiumStr || isNaN(premiumNum)) {
    errors.push('Invalid Premium')
  }

  if (isExcelImport && policyType) {
    const validTypes =
      category === 'personal'
        ? ['personal', 'personal lines']
        : ['commercial', 'commercial lines']
    if (!validTypes.includes(policyType.toLowerCase())) {
      errors.push('Invalid Policy Type')
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Builds the database payload object for temp_leads_basics from either
 * an Excel import row or a manual renewal form input.
 */
export function buildRenewalPayload(
  r: any,
  category: 'personal' | 'commercial',
  pipelineId: string,
  stageId: string,
  userId: string | null,
  isExcelImport = false
) {
  const accountName = isExcelImport
    ? r['applicant data account name']?.trim()
    : r.client_name?.trim() || r.account_name?.trim()

  const lineOfBusiness = isExcelImport
    ? r['policy data line of business']?.trim()
    : r.policy_type?.trim() || null

  const expirationDate = isExcelImport
    ? r['policy data policy expiration date']
    : r.renewal_date

  const carrier = isExcelImport
    ? r['policy data master company']?.trim()
    : r.carrier?.trim() || null

  const policyNumber = isExcelImport
    ? r['policy data policy number']?.trim()
    : r.policy_number?.trim()

  const premiumStr = isExcelImport
    ? r['policy data totalwrittenpremium']
    : r.current_premium

  const referral = isExcelImport
    ? r['applicant data lead source']?.trim() || null
    : r.referral?.trim() || null

  const notes = isExcelImport ? null : r.notes?.trim() || null
  const phone = isExcelImport ? null : (r.phone ? formatPhoneInput(r.phone.trim()) : null)
  const email = isExcelImport ? null : r.email?.trim() || null

  let businessName: string | null = null
  if (category === 'commercial') {
    if (isExcelImport) {
      businessName = accountName
    } else {
      businessName = r.business_name?.trim() || accountName
    }
  } else {
    businessName = null
  }

  return {
    client_name: accountName,
    business_name: businessName,
    phone,
    email,
    policy_type: lineOfBusiness,
    renewal_date: normalizeImportDate(expirationDate),
    carrier,
    policy_number: policyNumber,
    current_premium: Number(premiumStr),
    renewal_premium: null,
    referral,
    referral_id: r.referral_id || null,
    notes,
    policy_flow: 'renewal',
    insurence_category: category,
    pipeline_id: pipelineId,
    current_stage_id: stageId,
    assigned_csr: userId,
  }
}

/**
 * Saves one or more renewal records into temp_leads_basics using
 * server-gated policies and policy_terms creation/idempotent draft reuse strategy.
 * Concurrency-Safe: Uses atomic PostgreSQL engine-level UPSERTs on conflict targets.
 */
export async function saveRenewalRecords(supabase: any, payload: any[]) {
  if (!Array.isArray(payload) || payload.length === 0) {
    return { data: [], error: null }
  }

  for (const item of payload) {
    if (!item.policy_number) continue

    // 1. Check if lead already exists in temp_leads_basics
    let existingLead: any = null
    if (item.renewal_date) {
      const { data } = await supabase
        .from('temp_leads_basics')
        .select('id, policy_id, policy_term_id')
        .eq('policy_number', item.policy_number)
        .eq('renewal_date', item.renewal_date)
        .maybeSingle()
      existingLead = data
    }

    // 2. Resolve or create master policy in public.policies atomically using onConflict: 'policy_number'
    let policyId: string | null = existingLead?.policy_id || item.policy_id || null

    if (!policyId) {
      const { data: masterPolicy, error: polErr } = await supabase
        .from('policies')
        .upsert(
          {
            policy_number: item.policy_number,
            policy_type: item.policy_type || null,
            insurance_category: item.insurence_category || 'personal',
            status: 'Active',
          },
          { onConflict: 'policy_number' }
        )
        .select('id')
        .single()

      if (polErr || !masterPolicy) {
        throw new Error(`Failed to resolve master policy record: ${polErr?.message}`)
      }
      policyId = masterPolicy.id
    }

    // 3. Resolve or create draft term in public.policy_terms
    let termId: string | null = existingLead?.policy_term_id || item.policy_term_id || null

    if (termId) {
      // Existing lead has a linked term - check if it is a Quoted draft and update in-place
      const { data: existingTerm } = await supabase
        .from('policy_terms')
        .select('id, term_status')
        .eq('id', termId)
        .maybeSingle()

      if (existingTerm && existingTerm.term_status === 'Quoted') {
        await supabase
          .from('policy_terms')
          .update({
            carrier: item.carrier,
            policy_number: item.policy_number,
            written_premium: item.current_premium,
            expiration_date: item.renewal_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', termId)
      }
    } else {
      // Fetch latest term for this policy to determine sequence & reuse for same expiration date
      const { data: latestTerm } = await supabase
        .from('policy_terms')
        .select('id, term_sequence, term_status, expiration_date')
        .eq('policy_id', policyId)
        .order('term_sequence', { ascending: false })
        .limit(1)
        .maybeSingle()

      let targetSequence = 1
      if (latestTerm) {
        if (latestTerm.expiration_date === item.renewal_date) {
          targetSequence = latestTerm.term_sequence
        } else {
          targetSequence = latestTerm.term_sequence + 1
        }
      }

      let effectiveDate: string | null = null
      if (item.renewal_date) {
        const d = new Date(item.renewal_date)
        if (!isNaN(d.getTime())) {
          d.setFullYear(d.getFullYear() - 1)
          effectiveDate = d.toISOString().split('T')[0]
        }
      }

      const { data: draftTerm, error: termErr } = await supabase
        .from('policy_terms')
        .upsert(
          {
            policy_id: policyId,
            term_sequence: targetSequence,
            term_status: 'Quoted',
            carrier: item.carrier,
            policy_number: item.policy_number,
            written_premium: item.current_premium,
            effective_date: effectiveDate,
            expiration_date: item.renewal_date,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'policy_id,term_sequence' }
        )
        .select('id')
        .single()

      if (termErr || !draftTerm) {
        throw new Error(`Failed to resolve draft policy term: ${termErr?.message}`)
      }
      termId = draftTerm.id
    }

    item.policy_id = policyId
    item.policy_term_id = termId
  }

  return await supabase.from('temp_leads_basics').upsert(payload, {
    onConflict: 'policy_number,renewal_date',
  })
}
