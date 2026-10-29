'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency } from '@/lib/currency'
import { getActivePolicy } from '@/utils/activePolicyHelper'
import { 
  DollarSign, 
  Percent, 
  Calendar, 
  FileText, 
  History, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Layers,
  Phone,
  Mail,
  ShieldCheck,
  RefreshCw,
  Hash,
  ChevronDown,
  Users,
  PieChart,
  ArrowDownRight,
  Sparkles,
  TrendingDown,
  Scale
} from 'lucide-react'
import PageBackButton from '@/components/ui/PageBackButton'

interface LeadAccountingClientProps {
  initialLead: any
  initialLogs: any[]
  leadId: string
}

export default function LeadAccountingClient({ 
  initialLead, 
  initialLogs, 
  leadId 
}: LeadAccountingClientProps) {
  const router = useRouter()
  const { showToast } = useToast()

  // --- State Variables ---
  const [lead, setLead] = useState(initialLead)

  // Authoritative Active Policy Term Resolution
  const activeTerm = Array.isArray(lead.policy_terms)
    ? lead.policy_terms.find((t: any) => t.id === lead.policy_term_id || t.term_status === 'Active') || lead.policy_terms[0] || null
    : (typeof lead.policy_terms === 'object' ? lead.policy_terms : null)

  const active = getActivePolicy({ ...lead, policy_terms: activeTerm || lead.policy_terms })
  const [logs, setLogs] = useState(initialLogs)
  const [refreshing, setRefreshing] = useState(false)

  // Input states (initialized from activeTerm authoritatively)
  const [expectedCommissionInput, setExpectedCommissionInput] = useState<number>(
    activeTerm?.expected_commission ?? lead.expected_commission ?? 0
  )
  const [actualCommissionInput, setActualCommissionInput] = useState<number>(
    activeTerm?.actual_commission ?? lead.actual_commission ?? 0
  )
  const [carrierPaymentDateInput, setCarrierPaymentDateInput] = useState<string>(
    activeTerm?.carrier_payment_date ?? lead.carrier_payment_date ?? ''
  )
  const [commissionReceivedDateInput, setCommissionReceivedDateInput] = useState<string>(
    activeTerm?.commission_received_date ?? lead.commission_received_date ?? ''
  )
  const [accountingStatusInput, setAccountingStatusInput] = useState<string>(
    activeTerm?.accounting_status ?? lead.accounting_status ?? 'unreconciled'
  )
  const [accountingVerifiedInput, setAccountingVerifiedInput] = useState<boolean>(
    activeTerm?.accounting_verified ?? lead.accounting_verified ?? false
  )
  const [accountingNotesInput, setAccountingNotesInput] = useState<string>(
    activeTerm?.accounting_notes ?? lead.accounting_notes ?? ''
  )

  // Loading flags
  const [isUpdatingCommission, setIsUpdatingCommission] = useState(false)
  const [isVerifyingPolicy, setIsVerifyingPolicy] = useState(false)

  // --- Financial Values from Database (Authoritative Active Term & Lead Fallback read) ---
  const getCommissionVal = (termVal: any, leadVal: any, fallbackVal: number = 0) => {
    const termNum = termVal !== null && termVal !== undefined ? Number(termVal) : null
    const leadNum = leadVal !== null && leadVal !== undefined ? Number(leadVal) : null

    if (termNum !== null && termNum > 0) return termNum
    if (leadNum !== null && leadNum > 0) return leadNum
    if (termNum !== null) return termNum
    if (leadNum !== null) return leadNum
    return fallbackVal
  }

  const boundPremium = Number(
    activeTerm?.written_premium ?? active.activePremium ?? lead.total_premium ?? 0
  )
  const carrierRate = activeTerm?.locked_carrier_percent !== null && activeTerm?.locked_carrier_percent !== undefined
    ? Number(activeTerm.locked_carrier_percent)
    : (lead.locked_carrier_percent !== null && lead.locked_carrier_percent !== undefined ? Number(lead.locked_carrier_percent) : null)

  const grossCommission = getCommissionVal(
    activeTerm?.gross_commission ?? activeTerm?.expected_commission,
    lead.gross_commission ?? lead.expected_commission
  )

  const adminCharge = getCommissionVal(
    activeTerm?.admin_charge,
    lead.admin_charge
  )

  const netCommission = getCommissionVal(
    activeTerm?.net_commission,
    lead.net_commission,
    grossCommission - adminCharge
  )

  const referralName = lead.referral ? String(lead.referral).trim() : ''
  const hasReferral = Boolean(referralName && referralName.toLowerCase() !== 'none' && referralName.toLowerCase() !== 'null')
  const referralRate = activeTerm?.locked_referral_percent !== null && activeTerm?.locked_referral_percent !== undefined
    ? Number(activeTerm.locked_referral_percent)
    : (lead.locked_referral_percent !== null && lead.locked_referral_percent !== undefined ? Number(lead.locked_referral_percent) : null)

  const referralPayout = getCommissionVal(
    activeTerm?.referral_payout,
    lead.referral_payout
  )

  const companyCommission = getCommissionVal(
    activeTerm?.company_commission,
    lead.company_commission,
    grossCommission - referralPayout
  )

  const agencyFee = Number(lead.stage_metadata?.agency_fees ?? lead.stage_metadata?.agency_fee ?? 0)

  const currentExpected = getCommissionVal(
    activeTerm?.expected_commission,
    lead.expected_commission,
    grossCommission
  )

  const currentActual = Number(
    activeTerm?.actual_commission ?? lead.actual_commission ?? 0
  )
  const variance = currentExpected - currentActual

  // --- Data Fetching ---
  const fetchLeadAndLogs = async () => {
    setRefreshing(true)
    try {
      // 1. Fetch Lead & Authoritative policy_terms
      const { data: leadData, error: leadErr } = await supabase
        .from('temp_leads_basics')
        .select(`
          id,
          policy_id,
          policy_term_id,
          client_name,
          phone,
          email,
          policy_number,
          carrier,
          new_policy_number,
          new_carrier,
          new_premium,
          policy_flow,
          insurence_category,
          effective_date,
          total_premium,
          locked_carrier_percent,
          gross_commission,
          admin_charge,
          net_commission,
          locked_referral_percent,
          referral,
          referral_id,
          referral_payout,
          company_commission,
          expected_commission,
          actual_commission,
          accounting_status,
          accounting_verified,
          accounting_notes,
          carrier_payment_date,
          commission_received_date,
          verified_by,
          verified_at,
          assigned_csr,
          stage_metadata,
          assigned_user_profile:profiles!fk_profile (
            full_name
          ),
          policy_terms:policy_terms!policy_term_id (
            id,
            policy_id,
            term_sequence,
            term_status,
            carrier,
            policy_number,
            written_premium,
            effective_date,
            expiration_date,
            gross_commission,
            expected_commission,
            actual_commission,
            admin_charge,
            net_commission,
            referral_payout,
            company_commission,
            accounting_status,
            accounting_verified,
            accounting_notes,
            carrier_payment_date,
            commission_received_date,
            verified_by,
            verified_at
          )
        `)
        .eq('id', leadId)
        .single()

      if (leadErr) {
        throw leadErr
      }

      if (leadData) {
        setLead(leadData)
        const fetchedTerm = Array.isArray(leadData.policy_terms)
          ? leadData.policy_terms.find((t: any) => t.id === leadData.policy_term_id || t.term_status === 'Active') || leadData.policy_terms[0] || null
          : (typeof leadData.policy_terms === 'object' ? leadData.policy_terms : null)

        setExpectedCommissionInput(fetchedTerm?.expected_commission ?? leadData.expected_commission ?? 0)
        setActualCommissionInput(fetchedTerm?.actual_commission ?? leadData.actual_commission ?? 0)
        setCarrierPaymentDateInput(fetchedTerm?.carrier_payment_date ?? leadData.carrier_payment_date ?? '')
        setCommissionReceivedDateInput(fetchedTerm?.commission_received_date ?? leadData.commission_received_date ?? '')
        setAccountingStatusInput(fetchedTerm?.accounting_status ?? leadData.accounting_status ?? 'unreconciled')
        setAccountingVerifiedInput(fetchedTerm?.accounting_verified ?? leadData.accounting_verified ?? false)
        setAccountingNotesInput(fetchedTerm?.accounting_notes ?? leadData.accounting_notes ?? '')
      }

      // 2. Fetch Logs
      const { data: logsData, error: logsErr } = await supabase
        .from('accounting_logs')
        .select(`
          id,
          lead_id,
          updated_by,
          old_expected_commission,
          new_expected_commission,
          old_actual_commission,
          new_actual_commission,
          old_status,
          new_status,
          notes,
          created_at,
          updater:profiles!updated_by (
            full_name
          )
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })

      if (logsErr) {
        throw logsErr
      }

      if (logsData) {
        setLogs(logsData)
      }
    } catch (error: any) {
      console.error('Failed to sync accounting details:', error)
      showToast('Error syncing details with server.', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  // --- Handlers ---
  const handleUpdateCommission = async () => {
    if (expectedCommissionInput < 0 || actualCommissionInput < 0) {
      showToast('Commission values cannot be negative.', 'error')
      return
    }

    setIsUpdatingCommission(true)
    try {
      const res = await fetch('/api/accounting/update-commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          expectedCommission: expectedCommissionInput,
          actualCommission: actualCommissionInput
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update commissions')
      }

      showToast(data.message || 'Commissions updated successfully.', 'success')
      await fetchLeadAndLogs()
      router.refresh()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setIsUpdatingCommission(false)
    }
  }

  const handleVerifyPolicy = async () => {
    if (actualCommissionInput < 0) {
      showToast('Actual commission cannot be negative.', 'error')
      return
    }

    setIsVerifyingPolicy(true)
    try {
      const res = await fetch('/api/accounting/verify-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          actualCommission: actualCommissionInput,
          accountingStatus: accountingStatusInput,
          accountingVerified: accountingVerifiedInput,
          accountingNotes: accountingNotesInput,
          carrierPaymentDate: carrierPaymentDateInput || null,
          commissionReceivedDate: commissionReceivedDateInput || null
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify policy')
      }

      showToast(data.message || 'Policy verification status updated.', 'success')
      await fetchLeadAndLogs()
      router.refresh()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setIsVerifyingPolicy(false)
    }
  }

  // Helper status badge styles
  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase()
    switch (s) {
      case 'reconciled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wide">
            <CheckCircle2 size={12} /> Reconciled
          </span>
        )
      case 'discrepancy':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-orange-50 text-orange-600 border border-orange-100 uppercase tracking-wide">
            <AlertCircle size={12} /> Discrepancy
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-600 border border-blue-100 uppercase tracking-wide">
            <Info size={12} /> Pending / Unreconciled
          </span>
        )
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <PageBackButton fallbackUrl="/accounting/all-leads" className="mb-0" />
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-800 tracking-tight leading-tight break-words">
              {lead.client_name}
            </h1>
            {getStatusBadge(lead.accounting_status)}
            {lead.accounting_verified && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-black rounded-full bg-purple-50 text-purple-600 border border-purple-100 uppercase tracking-wider">
                <ShieldCheck size={10} /> Verified
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm">
            Policy Flow: <span className="font-bold text-gray-700 capitalize">{lead.policy_flow || 'New'}</span> &bull; Category: <span className="font-bold text-gray-700 capitalize">{lead.insurence_category || 'Personal'}</span> &bull; ID: <span className="font-mono text-xs break-all text-gray-400">{lead.id}</span>
          </p>
        </div>

        <button 
          onClick={fetchLeadAndLogs}
          disabled={refreshing}
          className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 border border-gray-200 rounded-xl font-bold text-xs shadow-sm transition disabled:opacity-50 shrink-0 self-start"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Syncing...' : 'Sync Database'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ── LEFT COLUMN (POLICY INFO, REFERRAL, COMMISSION BREAKDOWN, AUDIT TRAIL) ── */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          
          {/* Section 1: Client & Policy Info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6 min-w-0">
            <div className="flex items-center gap-2.5 pb-4 border-b border-gray-50">
              <div className="p-2 bg-blue-50 text-[#2E5C85] rounded-xl shrink-0">
                <Layers size={18} />
              </div>
              <h2 className="text-lg font-black text-gray-800">Client & Policy Information</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Client Name</p>
                <p className="text-sm font-black text-gray-700 break-words">{lead.client_name || 'N/A'}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Assigned CSR</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-gray-100 text-[10px] font-black text-gray-500 flex items-center justify-center">
                    {lead.assigned_user_profile?.full_name?.[0] || 'U'}
                  </div>
                  <p className="text-sm font-bold text-gray-700">
                    {lead.assigned_user_profile?.full_name || 'Unassigned'}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Phone Number</p>
                <a href={lead.phone ? `tel:${lead.phone}` : '#'} className="text-sm font-bold text-[#2E5C85] hover:underline flex items-center gap-1">
                  <Phone size={12} /> {lead.phone || 'N/A'}
                </a>
              </div>

              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Email Address</p>
                <a href={lead.email ? `mailto:${lead.email}` : '#'} className="text-sm font-bold text-[#2E5C85] hover:underline flex items-start gap-1.5 break-all">
                  <Mail size={12} className="shrink-0 mt-1" /> {lead.email || 'N/A'}
                </a>
              </div>

              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Carrier</p>
                <p className="text-sm font-bold text-gray-700 break-words">
                  {active.activeCarrier || 'N/A'}
                  {active.isSwitched && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold inline-block">Switched</span>}
                </p>
              </div>

              <div className="space-y-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Policy Number</p>
                <p className="text-sm font-bold text-gray-700 font-mono flex items-start gap-1.5 break-all">
                  <Hash size={12} className="shrink-0 mt-1" /> {active.activePolicyNumber || 'N/A'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Insurance Category</p>
                <span className="inline-flex px-2 py-0.5 text-xs font-bold rounded bg-gray-100 text-gray-600 capitalize">
                  {lead.insurence_category || 'N/A'}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Policy Flow</p>
                <span className="inline-flex px-2 py-0.5 text-xs font-bold rounded bg-gray-100 text-gray-600 capitalize">
                  {lead.policy_flow || 'N/A'}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Effective Date</p>
                <p className="text-sm font-bold text-gray-700 flex items-center gap-1">
                  <Calendar size={12} /> {lead.effective_date || 'N/A'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Bound Premium</p>
                <p className="text-sm font-black text-gray-900">
                  {formatCurrency(boundPremium)}
                </p>
              </div>

              {(agencyFee > 0 || lead.insurence_category === 'commercial') && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Agency Fee (Client Paid)</p>
                  <p className="text-sm font-black text-amber-700">
                    {formatCurrency(agencyFee)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Referral Information */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-50 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl shrink-0 ${hasReferral ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  <Users size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-800">Referral Information</h2>
                  <p className="text-xs text-gray-400">Referral partner tracking and commission split</p>
                </div>
              </div>
              <div>
                {hasReferral ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    <CheckCircle2 size={12} /> Referral Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                    No Referral
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Referral Partner</p>
                <p className="text-sm font-black text-gray-800 mt-1 capitalize">
                  {hasReferral ? referralName : 'None / Direct Client'}
                </p>
              </div>

              <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Referral Rate</p>
                <p className="text-sm font-black text-gray-800 mt-1">
                  {hasReferral && referralRate !== null ? `${referralRate.toFixed(2)}%` : '0.00% / N/A'}
                </p>
              </div>

              <div className={`rounded-xl p-4 border ${hasReferral ? 'bg-blue-50/60 border-blue-100' : 'bg-gray-50/80 border-gray-100'}`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Referral Payout</p>
                <p className={`text-base font-black mt-1 ${hasReferral ? 'text-blue-700' : 'text-gray-700'}`}>
                  {formatCurrency(referralPayout)}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: 5-Way Commission Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-50 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <PieChart size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-800">5-Way Commission Breakdown</h2>
                  <p className="text-xs text-gray-400">Authoritative contract splits from commission engine</p>
                </div>
              </div>
              <div className="text-xs font-bold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-lg">
                Carrier Rate: {carrierRate !== null ? `${carrierRate.toFixed(2)}%` : '—'}
              </div>
            </div>

            {/* Financial Waterfall Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Bound Premium</p>
                <p className="text-sm font-black text-gray-900 mt-1">{formatCurrency(boundPremium)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Written Policy Value</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Gross Commission</p>
                <p className="text-sm font-black text-gray-900 mt-1">{formatCurrency(grossCommission)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Premium &times; Carrier %</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Admin Charge (10%)</p>
                <p className="text-sm font-black text-gray-700 mt-1">{formatCurrency(adminCharge)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{hasReferral ? '10% of Gross' : 'No Referral ($0.00)'}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Net Commission</p>
                <p className="text-sm font-black text-gray-900 mt-1">{formatCurrency(netCommission)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Gross &minus; Admin Charge</p>
              </div>

              <div className="bg-blue-50/60 rounded-xl p-3.5 border border-blue-100">
                <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">Referral Payout</p>
                <p className="text-sm font-black text-blue-700 mt-1">{formatCurrency(referralPayout)}</p>
                <p className="text-[10px] text-blue-600 mt-0.5">{hasReferral ? `Net &times; ${referralRate ?? 0}%` : '$0.00 (No Referral)'}</p>
              </div>

              <div className="bg-emerald-50/70 rounded-xl p-3.5 border border-emerald-200 shadow-sm">
                <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide">Company Commission</p>
                <p className="text-base font-black text-emerald-700 mt-0.5">{formatCurrency(companyCommission)}</p>
                <p className="text-[10px] text-emerald-600 mt-0.5 font-bold">Gross &minus; Referral Payout</p>
              </div>

              {(agencyFee > 0 || lead.insurence_category === 'commercial') && (
                <div className="bg-amber-50/70 rounded-xl p-3.5 border border-amber-200 shadow-sm col-span-2 sm:col-span-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">Agency Fee (Separate Client Payment)</p>
                    <p className="text-[10px] text-amber-600 font-medium">Direct client fee &bull; Excluded from carrier commission & referral splits</p>
                  </div>
                  <p className="text-base font-black text-amber-700">{formatCurrency(agencyFee)}</p>
                </div>
              )}
            </div>

            {/* Visual Financial Flow Summary */}
            <div className="bg-gradient-to-r from-gray-50 to-blue-50/30 rounded-xl p-3.5 border border-gray-100 text-xs text-gray-600">
              <div className="flex items-center gap-2 font-bold text-gray-700 mb-1">
                <Sparkles size={14} className="text-[#2E5C85]" />
                <span>Financial Distribution Path</span>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-500">
                Gross Commission <span className="font-bold text-gray-700">{formatCurrency(grossCommission)}</span>
                {hasReferral ? (
                  <>
                    {' '} &rarr; Admin Fee deducted <span className="font-bold text-gray-700">{formatCurrency(adminCharge)}</span>
                    {' '} &rarr; Net Base <span className="font-bold text-gray-700">{formatCurrency(netCommission)}</span>
                    {' '} &rarr; Referral Payout to <strong>{referralName}</strong> ({referralRate}%) = <span className="font-bold text-blue-700">{formatCurrency(referralPayout)}</span>
                    {' '} &rarr; Retained Company Revenue = <span className="font-bold text-emerald-700">{formatCurrency(companyCommission)}</span>.
                  </>
                ) : (
                  <>
                    {' '} &rarr; No Referral Partner attached ($0.00 deduction) &rarr; Full 100% Retained Company Revenue = <span className="font-bold text-emerald-700">{formatCurrency(companyCommission)}</span>.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Section 4: Audit Logs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-gray-50">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <History size={18} />
              </div>
              <h2 className="text-lg font-black text-gray-800">Reconciliation Audit Trail</h2>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No reconciliation audits logged for this policy.
              </div>
            ) : (
              <div className="relative border-l-2 border-gray-100 ml-3 pl-6 space-y-6">
                {logs.map((log) => (
                  <div key={log.id} className="relative space-y-2">
                    {/* Circle marker */}
                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-white border-2 border-purple-400 flex items-center justify-center" />

                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs text-gray-500 gap-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <User size={12} />
                        <span>{log.updater?.full_name || 'System Operator'}</span>
                      </div>
                      <span className="font-medium text-gray-400">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-3.5 space-y-2.5 text-xs text-gray-600">
                      {/* Commission Diff */}
                      {(log.old_expected_commission !== log.new_expected_commission || 
                        log.old_actual_commission !== log.new_actual_commission) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {log.old_expected_commission !== log.new_expected_commission && (
                            <div>
                              <span className="font-bold">Expected Commission:</span>{' '}
                              <span className="text-red-500">{formatCurrency(log.old_expected_commission)}</span>{' '}
                              &rarr;{' '}
                              <span className="text-emerald-600 font-bold">{formatCurrency(log.new_expected_commission)}</span>
                            </div>
                          )}
                          {log.old_actual_commission !== log.new_actual_commission && (
                            <div>
                              <span className="font-bold">Actual Commission:</span>{' '}
                              <span className="text-red-500">{formatCurrency(log.old_actual_commission)}</span>{' '}
                              &rarr;{' '}
                              <span className="text-emerald-600 font-bold">{formatCurrency(log.new_actual_commission)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status Diff */}
                      {log.old_status !== log.new_status && (
                        <div>
                          <span className="font-bold">Status:</span>{' '}
                          <span className="line-through text-gray-400">{log.old_status || 'N/A'}</span>{' '}
                          &rarr;{' '}
                          <span className="text-[#2E5C85] font-bold uppercase text-[10px] tracking-wide bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                            {log.new_status}
                          </span>
                        </div>
                      )}

                      {/* Log Notes */}
                      {log.notes && (
                        <div className="border-t border-gray-100 pt-2 mt-1">
                          <p className="font-bold text-gray-400 text-[10px] uppercase">Internal Note</p>
                          <p className="text-gray-700 italic mt-0.5">{log.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN (RECONCILIATION, VARIANCE, ACTION CONTROLS, VERIFICATION) ── */}
        <div className="space-y-6">
          
          {/* Section 5: Reconciliation & Variance Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-gray-50">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Scale size={18} />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-800">Commission Variance</h2>
                <p className="text-xs text-gray-400">Statement matching & collection status</p>
              </div>
            </div>

            {/* Variance Highlight Card */}
            <div className={`p-4 rounded-xl border ${
              variance === 0 && currentActual > 0
                ? 'bg-emerald-50 border-emerald-200' 
                : currentActual === 0 
                ? 'bg-blue-50/60 border-blue-100' 
                : 'bg-orange-50 border-orange-200'
            }`}>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Reconciliation Variance</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  variance === 0 && currentActual > 0
                    ? 'bg-emerald-100 text-emerald-800' 
                    : currentActual === 0 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {variance === 0 && currentActual > 0 ? 'Fully Reconciled' : currentActual === 0 ? 'Uncollected' : 'Discrepancy'}
                </span>
              </div>
              <p className={`text-2xl font-black mt-2 ${
                variance === 0 && currentActual > 0 ? 'text-emerald-700' : currentActual === 0 ? 'text-blue-800' : 'text-orange-700'
              }`}>
                {formatCurrency(variance)}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Expected ({formatCurrency(currentExpected)}) &minus; Actual Received ({formatCurrency(currentActual)})
              </p>
            </div>

            {/* Read-only KPI aggregates */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Expected Comm</p>
                <p className="text-xs font-black text-emerald-600 mt-1">
                  {formatCurrency(currentExpected)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Actual Received</p>
                <p className="text-xs font-black text-purple-600 mt-1">
                  {formatCurrency(currentActual)}
                </p>
              </div>
            </div>

            {/* Inputs */}
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  Expected Commission ($)
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <DollarSign size={14} />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={expectedCommissionInput}
                    onChange={(e) => setExpectedCommissionInput(parseFloat(e.target.value) || 0)}
                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-gray-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  Actual Commission ($)
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <DollarSign size={14} />
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={actualCommissionInput}
                    onChange={(e) => setActualCommissionInput(parseFloat(e.target.value) || 0)}
                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-gray-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  Carrier Payment Date
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Calendar size={14} />
                  </div>
                  <input
                    type="date"
                    value={carrierPaymentDateInput}
                    onChange={(e) => setCarrierPaymentDateInput(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium text-gray-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  Commission Received Date
                </label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Calendar size={14} />
                  </div>
                  <input
                    type="date"
                    value={commissionReceivedDateInput}
                    onChange={(e) => setCommissionReceivedDateInput(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium text-gray-700"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Verification, Checkbox, Notes & Action buttons */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-gray-50">
              <div className="p-2 bg-orange-50 text-[#E07A5F] rounded-xl">
                <ShieldCheck size={18} />
              </div>
              <h2 className="text-lg font-black text-gray-800">Verification & Controls</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  Accounting Status
                </label>
                <div className="relative">
                  <select
                    value={accountingStatusInput}
                    onChange={(e) => setAccountingStatusInput(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-gray-700 bg-white appearance-none"
                  >
                    <option value="unreconciled">Unreconciled</option>
                    <option value="reconciled">Reconciled</option>
                    <option value="discrepancy">Discrepancy</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

              {/* Checkbox */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <input
                  type="checkbox"
                  id="accounting_verified"
                  checked={accountingVerifiedInput}
                  onChange={(e) => setAccountingVerifiedInput(e.target.checked)}
                  className="w-4.5 h-4.5 rounded border-gray-300 text-[#2E5C85] focus:ring-[#2E5C85] cursor-pointer"
                />
                <label 
                  htmlFor="accounting_verified" 
                  className="text-xs font-bold text-gray-600 cursor-pointer select-none"
                >
                  Confirm Policy Verified
                </label>
              </div>

              {/* Notes Textarea */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide block">
                  Reconciliation Notes
                </label>
                <textarea
                  rows={4}
                  placeholder="Enter details on payment match, commission rate mismatch, carrier details, or discrepancy resolutions..."
                  value={accountingNotesInput}
                  onChange={(e) => setAccountingNotesInput(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium text-gray-700 placeholder-gray-400 resize-none"
                />
              </div>

              {/* Actions Grid */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={handleVerifyPolicy}
                  disabled={isVerifyingPolicy}
                  className="w-full bg-[#2E5C85] border border-[#2E5C85] text-white hover:bg-[#2E5C85]/90 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isVerifyingPolicy ? 'Verifying Policy...' : 'Verify Policy Status'}
                </button>
                
                <button
                  onClick={handleUpdateCommission}
                  disabled={isUpdatingCommission}
                  className="w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isUpdatingCommission ? 'Updating Commissions...' : 'Update Commissions Only'}
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
