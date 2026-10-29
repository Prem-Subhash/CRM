import { getActivePolicy, PolicyRecord } from './activePolicyHelper';

export type MatchStatus = 
  | 'EXACT_MATCH'
  | 'CARRIER_MISMATCH'
  | 'AMBIGUOUS'
  | 'HISTORICAL_POLICY'
  | 'NO_MATCH';

export interface StatementRow {
  row_index: number;
  policy_number: string | null;
  actual_commission: number | null;
  carrier_name: string | null;
  statement_date: string | null;
  is_valid: boolean;
  validation_errors: string[];
}

export interface CandidateRecord extends PolicyRecord {
  id: string;
  policy_id?: string | null;
  policy_term_id?: string | null;
  client_name?: string | null;
  expected_commission?: number | string | null;
  actual_commission?: number | string | null;
  accounting_status?: string | null;
  accounting_verified?: boolean | null;
  policy_terms?: Array<{
    id?: string;
    policy_id?: string;
    term_sequence?: number;
    term_status?: string;
    policy_number?: string | null;
    carrier?: string | null;
    written_premium?: number | null;
    expected_commission?: number | null;
    actual_commission?: number | null;
    accounting_status?: string | null;
  }>;
}

export interface PreviewMatchResult {
  statementRow: StatementRow;
  status: MatchStatus;
  matchedLeadId: string | null;
  clientName: string | null;
  activeDbPolicyNumber: string | null;
  activeDbCarrier: string | null;
  expectedCommission: number | null;
  variance: number | null;
  reason: string;
}

export function normalizePolicyNumber(policy: string | null | undefined): string {
  if (!policy) return '';
  return policy.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeCarrier(carrier: string | null | undefined): string {
  if (!carrier) return '';
  // Convert to lower case, remove punctuation, remove common suffixes to allow fuzzy match
  let normalized = carrier.trim().toLowerCase().replace(/[^\w\s]/g, '');
  // Remove multiple spaces
  normalized = normalized.replace(/\s+/g, ' ');
  // Remove common generic terms for conservative matching
  normalized = normalized.replace(/\b(insurance|ins|company|co|inc|llc|corp)\b/g, '').trim();
  return normalized;
}

export function isCarrierAgreement(carrierA: string | null | undefined, carrierB: string | null | undefined): boolean {
  const normA = normalizeCarrier(carrierA);
  const normB = normalizeCarrier(carrierB);
  
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  
  return false;
}

export function evaluateMatch(
  statementRow: StatementRow, 
  candidates: CandidateRecord[]
): PreviewMatchResult {
  const statementPolicyNorm = normalizePolicyNumber(statementRow.policy_number);
  const statementCarrier = statementRow.carrier_name;
  
  const actualComm = statementRow.actual_commission ?? 0;

  const result: PreviewMatchResult = {
    statementRow,
    status: 'NO_MATCH',
    matchedLeadId: null,
    clientName: null,
    activeDbPolicyNumber: null,
    activeDbCarrier: null,
    expectedCommission: null,
    variance: null,
    reason: 'No active or historical candidate matches',
  };

  if (!statementPolicyNorm) {
    result.reason = 'Statement policy number is missing';
    return result;
  }

  const activeMatches: CandidateRecord[] = [];
  let isHistoricalMatch = false;

  for (const candidate of candidates) {
    const terms = candidate.policy_terms;
    
    if (terms && terms.length > 0) {
      let candidateHasActiveMatch = false;
      for (const term of terms) {
        const termPolicyNorm = normalizePolicyNumber(term.policy_number);
        if (termPolicyNorm === statementPolicyNorm) {
          if (term.term_status === 'Active') {
            candidateHasActiveMatch = true;
          } else if (term.term_status === 'Renewed' || term.term_status === 'Expired') {
            isHistoricalMatch = true;
          }
        }
      }
      if (candidateHasActiveMatch) {
        activeMatches.push(candidate);
      }
    } else {
      // Legacy fallback via activePolicyHelper
      const activeInfo = getActivePolicy(candidate);
      const activePolicyNorm = normalizePolicyNumber(activeInfo.activePolicyNumber);
      const oldPolicyNorm = normalizePolicyNumber(candidate.policy_number);

      if (activePolicyNorm === statementPolicyNorm) {
        activeMatches.push(candidate);
      } else if (activeInfo.isSwitched && oldPolicyNorm === statementPolicyNorm) {
        isHistoricalMatch = true;
      }
    }
  }

  if (activeMatches.length === 0) {
    if (isHistoricalMatch) {
      result.status = 'HISTORICAL_POLICY';
      result.reason = 'Matches an old policy of a switched/renewed policy term (new term active)';
    }
    return result;
  }

  if (activeMatches.length > 1) {
    result.status = 'AMBIGUOUS';
    result.reason = `Multiple valid active candidates found (${activeMatches.length} matches)`;
    return result;
  }

  // Exactly one active match
  const match = activeMatches[0];
  const activeInfo = getActivePolicy(match);

  // Active term details resolution
  const activeTerm = match.policy_terms?.find(t => t.term_status === 'Active');
  const activePolicyNum = activeTerm?.policy_number || activeInfo.activePolicyNumber;
  const activeCarrierName = activeTerm?.carrier || activeInfo.activeCarrier;
  const expectedComm = Number(activeTerm?.expected_commission ?? match.expected_commission) || 0;
  
  result.matchedLeadId = match.id;
  result.clientName = match.client_name ?? null;
  result.activeDbPolicyNumber = activePolicyNum;
  result.activeDbCarrier = activeCarrierName;
  result.expectedCommission = expectedComm;
  result.variance = expectedComm - actualComm; // Expected - Actual
  
  const carrierAgrees = isCarrierAgreement(statementCarrier, activeCarrierName);

  if (carrierAgrees) {
    result.status = 'EXACT_MATCH';
    result.reason = 'Exactly one active candidate, policy and carrier agree';
  } else {
    result.status = 'CARRIER_MISMATCH';
    result.reason = 'Exactly one active candidate, policy matches but carrier does not sufficiently agree';
  }

  return result;
}
