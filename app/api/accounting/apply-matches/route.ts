import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { authenticateApiRequest } from '@/utils/auth';
import { evaluateMatch, StatementRow, CandidateRecord } from '@/utils/statementMatcher';

export async function POST(req: Request) {
  try {
    const auth = await authenticateApiRequest(req, ['accounting', 'superadmin']);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user!;

    const body = await req.json();
    const { matches } = body; // Array of items to apply

    if (!Array.isArray(matches)) {
      return NextResponse.json({ error: 'Expected matches array' }, { status: 400 });
    }

    const results = [];
    const processedLeadIds = new Set<string>();

    for (let i = 0; i < matches.length; i++) {
      const item = matches[i];
      const { lead_id, statementRow } = item;

      if (!lead_id || !statementRow) {
        results.push({ index: i, lead_id: lead_id || null, status: 'ERROR', message: 'Missing lead_id or statementRow' });
        continue;
      }

      // 5. Duplicate Check
      if (processedLeadIds.has(lead_id)) {
        results.push({ index: i, lead_id, status: 'VALIDATION_FAILED', message: 'Duplicate lead_id in batch' });
        continue;
      }
      processedLeadIds.add(lead_id);

      // 2. Server-Side Authority: Re-fetch current CRM record & policy_terms
      const { data: dbLead, error: fetchError } = await supabaseServer
        .from('temp_leads_basics')
        .select(`
          id,
          policy_id,
          policy_term_id,
          client_name,
          expected_commission,
          actual_commission,
          accounting_status,
          policy_number,
          new_policy_number,
          carrier,
          new_carrier,
          policy_terms:policy_terms!policy_term_id (
            id,
            policy_id,
            term_sequence,
            term_status,
            policy_number,
            carrier,
            commission_amount,
            expected_commission,
            actual_commission,
            accounting_status
          )
        `)
        .eq('id', lead_id)
        .single();

      if (fetchError || !dbLead) {
        results.push({ index: i, lead_id, status: 'ERROR', message: 'Lead not found in database' });
        continue;
      }

      // Resolve target active term
      const activeTerm = dbLead.policy_terms?.find((t: any) => t.id === dbLead.policy_term_id || t.term_status === 'Active');
      const activeTermId = activeTerm?.id || dbLead.policy_term_id;
      const currentTermStatus = activeTerm?.accounting_status || dbLead.accounting_status;

      // 4. Already Reconciled Check
      if (currentTermStatus === 'reconciled') {
        results.push({ index: i, lead_id, status: 'ALREADY_RECONCILED', message: 'Record is already reconciled' });
        continue;
      }

      // 3 & 6. Validation using evaluateMatch (which covers Switch/Historical and Carrier Validation)
      const candidate: CandidateRecord = {
        ...dbLead,
        policy_terms: dbLead.policy_terms || []
      };
      const evaluation = evaluateMatch(statementRow as StatementRow, [candidate]);

      if (evaluation.status === 'HISTORICAL_POLICY') {
        results.push({ index: i, lead_id, status: 'HISTORICAL_POLICY_BLOCKED', message: 'Matched old policy of switched renewal' });
        continue;
      }

      if (evaluation.status !== 'EXACT_MATCH') {
        results.push({ index: i, lead_id, status: 'VALIDATION_FAILED', message: `Validation failed: ${evaluation.status}` });
        continue;
      }

      // 7 & 8. Actual Commission & Status Calculation
      const statementActualComm = Number(statementRow.actual_commission) || 0;
      const expectedComm = Number(activeTerm?.expected_commission ?? activeTerm?.commission_amount ?? dbLead.expected_commission) || 0;
      const variance = expectedComm - statementActualComm;

      let newStatus = 'unreconciled';
      if (variance === 0 && statementActualComm > 0) {
        newStatus = 'reconciled';
      } else if (variance !== 0 || statementActualComm < 0) {
        newStatus = 'discrepancy';
      }

      // Authoritative Atomic Conditional Update to policy_terms (Active term ONLY)
      if (activeTermId) {
        const { data: updatedTerms, error: termUpdateErr } = await supabaseServer
          .from('policy_terms')
          .update({
            actual_commission: statementActualComm,
            accounting_status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', activeTermId)
          .eq('term_status', 'Active')
          .neq('accounting_status', 'reconciled')
          .select('id');

        if (termUpdateErr) {
          console.error('Update policy_terms in apply-matches failed:', termUpdateErr);
          results.push({ index: i, lead_id, status: 'ERROR', message: 'Database update failed' });
          continue;
        }

        // Concurrency Guard: If zero rows were updated, a concurrent request already reconciled this term
        if (!updatedTerms || updatedTerms.length === 0) {
          results.push({ index: i, lead_id, status: 'ALREADY_RECONCILED', message: 'Record is already reconciled or modified concurrently' });
          continue;
        }
      }

      // Operational mirror write to temp_leads_basics
      const { error: updateError } = await supabaseServer
        .from('temp_leads_basics')
        .update({
          actual_commission: statementActualComm,
          accounting_status: newStatus
        })
        .eq('id', lead_id);

      if (updateError) {
        results.push({ index: i, lead_id, status: 'ERROR', message: 'Database update failed' });
        continue;
      }

      // 9. Audit Log (including lead_id, policy_id, policy_term_id)
      const { error: logError } = await supabaseServer
        .from('accounting_logs')
        .insert({
          lead_id: lead_id,
          policy_id: dbLead.policy_id || activeTerm?.policy_id || null,
          policy_term_id: activeTermId || null,
          updated_by: user.id,
          old_expected_commission: expectedComm,
          new_expected_commission: expectedComm,
          old_actual_commission: Number(activeTerm?.actual_commission ?? dbLead.actual_commission) || 0,
          new_actual_commission: statementActualComm,
          old_status: currentTermStatus,
          new_status: newStatus,
          notes: 'Applied via Carrier Statement Upload (Batch)',
          created_at: new Date().toISOString()
        });

      if (logError) {
        console.error('Audit log failed for lead', lead_id, logError);
      }

      results.push({ index: i, lead_id, status: 'APPLIED', message: 'Successfully applied' });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Apply Matches API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
