'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency } from '@/lib/currency'
import { getActivePolicy } from '@/utils/activePolicyHelper'
import { resolvePolicyState } from '@/utils/policyStateHelper'
import {
  DollarSign, Percent, Calendar, Download, Printer, Search,
  BarChart2, User, Clock, ShieldCheck, AlertCircle, Info,
  TrendingUp, Layers, CheckCircle2, SlidersHorizontal,
  Activity, ChevronDown
} from 'lucide-react'
import Loading from '@/components/ui/Loading'

interface ReportsClientProps {
  csrs: any[]
}

export default function ReportsClient({ csrs }: ReportsClientProps) {
  const { showToast } = useToast()

  const defaultStartDate = () => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
  }
  const defaultEndDate = () => new Date().toISOString().split('T')[0]

  const [startDate, setStartDate] = useState<string>(defaultStartDate())
  const [endDate, setEndDate] = useState<string>(defaultEndDate())
  const [accountingStatus, setAccountingStatus] = useState<string>('all')
  const [accountingVerified, setAccountingVerified] = useState<string>('all')
  const [policyFlow, setPolicyFlow] = useState<string>('all')
  const [carrier, setCarrier] = useState<string>('all')
  const [assignedCsr, setAssignedCsr] = useState<string>('all')

  const [periodPreset, setPeriodPreset] = useState<string>('last30')
  const [category, setCategory] = useState<string>('all')
  const [state, setState] = useState<string>('all')
  const [availableStates, setAvailableStates] = useState<string[]>([])

  const setPreset = (preset: string) => {
    setPeriodPreset(preset)
    const now = new Date()
    const year = now.getFullYear()

    if (preset === 'thisMonth') {
      const start = new Date(year, now.getMonth(), 1).toISOString().split('T')[0]
      const end = new Date(year, now.getMonth() + 1, 0).toISOString().split('T')[0]
      setStartDate(start); setEndDate(end)
    } else if (preset === 'lastMonth') {
      const start = new Date(year, now.getMonth() - 1, 1).toISOString().split('T')[0]
      const end = new Date(year, now.getMonth(), 0).toISOString().split('T')[0]
      setStartDate(start); setEndDate(end)
    } else if (preset === 'q1') {
      setStartDate(`${year}-01-01`); setEndDate(`${year}-03-31`)
    } else if (preset === 'q2') {
      setStartDate(`${year}-04-01`); setEndDate(`${year}-06-30`)
    } else if (preset === 'q3') {
      setStartDate(`${year}-07-01`); setEndDate(`${year}-09-30`)
    } else if (preset === 'q4') {
      setStartDate(`${year}-10-01`); setEndDate(`${year}-12-31`)
    } else if (preset === 'ytd') {
      setStartDate(`${year}-01-01`); setEndDate(now.toISOString().split('T')[0])
    } else if (preset === 'last30') {
      setStartDate(defaultStartDate()); setEndDate(defaultEndDate())
    }
  }

  const resetFilters = () => {
    setPreset('last30')
    setAccountingStatus('all')
    setAccountingVerified('all')
    setCategory('all')
    setPolicyFlow('all')
    setCarrier('all')
    setState('all')
    setAssignedCsr('all')
    showToast('Filters have been cleared.', 'success')
  }

  const [availableCarriers, setAvailableCarriers] = useState<string[]>([])
  const [availableFlows, setAvailableFlows] = useState<string[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const res = await fetch('/api/accounting/filter-options')
        if (res.ok) {
          const json = await res.json()
          if (json.carriers) setAvailableCarriers(json.carriers)
          if (json.flows) setAvailableFlows(json.flows)
          if (json.states) setAvailableStates(json.states)
        }
      } catch (err) {
        console.error('Failed to load filter options:', err)
      }
    }
    fetchDropdowns()
  }, [])

  const fetchReportData = async () => {
    setLoading(true)
    try {
      let query = supabase.from('temp_leads_basics').select(`
        id, policy_id, policy_term_id, client_name, policy_number, carrier, policy_flow, insurence_category,
        effective_date, total_premium, expected_commission, actual_commission,
        accounting_status, accounting_verified, created_at, assigned_csr,
        new_carrier, new_policy_number, new_premium,
        assigned_user_profile:profiles!fk_profile (full_name),
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
          expected_commission,
          actual_commission,
          accounting_status,
          accounting_verified
        ),
        intake_forms:temp_intake_forms ( form_data, submitted_at )
      `)

      if (startDate) query = query.gte('created_at', new Date(startDate).toISOString())
      if (endDate) {
        const end = new Date(endDate); end.setHours(23, 59, 59, 999)
        query = query.lte('created_at', end.toISOString())
      }
      if (accountingStatus !== 'all') {
        if (accountingStatus === 'unreconciled') query = query.or('accounting_status.eq.unreconciled,accounting_status.is.null')
        else query = query.eq('accounting_status', accountingStatus)
      }
      if (accountingVerified !== 'all') query = query.eq('accounting_verified', accountingVerified === 'verified')
      if (category !== 'all') query = query.ilike('insurence_category', `%${category}%`)
      if (policyFlow !== 'all') query = query.eq('policy_flow', policyFlow)
      if (carrier !== 'all') query = query.or(`carrier.eq.${carrier},new_carrier.eq.${carrier}`)
      if (assignedCsr !== 'all') query = query.eq('assigned_csr', assignedCsr)

      const { data, error } = await query
      if (error) throw error
      
      let finalLeads = data || []
      if (state !== 'all') {
        finalLeads = finalLeads.filter(l => resolvePolicyState(l) === state)
      }
      setLeads(finalLeads)

      const { data: logsData } = await supabase
        .from('accounting_logs')
        .select(`
          id, created_at, old_expected_commission, new_expected_commission,
          old_actual_commission, new_actual_commission, old_status, new_status, notes,
          updater:profiles!updated_by (full_name),
          lead:temp_leads_basics!lead_id (client_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10)
      setLogs(logsData || [])
    } catch (e: any) {
      console.error(e)
      showToast('Error generating report: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { 
    fetchReportData() 
  }, [startDate, endDate, accountingStatus, accountingVerified, category, policyFlow, carrier, state, assignedCsr])

  /* ── Authoritative Term Helper ── */
  const getAuthoritativeTerm = (r: any) => {
    if (Array.isArray(r.policy_terms)) {
      return r.policy_terms.find((t: any) => t.term_status === 'Active') || r.policy_terms[0] || null
    }
    return typeof r.policy_terms === 'object' ? r.policy_terms : null
  }

  /* ── Aggregates ── */
  const totalPremiums = leads.reduce((s, r) => {
    const activeTerm = getAuthoritativeTerm(r)
    const prem = (activeTerm && activeTerm.written_premium !== null && activeTerm.written_premium !== undefined)
      ? Number(activeTerm.written_premium) || 0
      : Number(getActivePolicy(r).activePremium) || 0
    return s + prem
  }, 0)

  const averagePremium = leads.length > 0 ? totalPremiums / leads.length : 0

  const expectedCommissions = leads.reduce((s, r) => {
    const activeTerm = getAuthoritativeTerm(r)
    const exp = (activeTerm && activeTerm.expected_commission !== null && activeTerm.expected_commission !== undefined)
      ? Number(activeTerm.expected_commission) || 0
      : Number(r.expected_commission) || 0
    return s + exp
  }, 0)

  const actualCommissions = leads.reduce((s, r) => {
    const activeTerm = getAuthoritativeTerm(r)
    const act = (activeTerm && activeTerm.actual_commission !== null && activeTerm.actual_commission !== undefined)
      ? Number(activeTerm.actual_commission) || 0
      : Number(r.actual_commission) || 0
    return s + act
  }, 0)

  const commissionDiscrepancies = expectedCommissions - actualCommissions
  const collectionPct = expectedCommissions > 0 ? (actualCommissions / expectedCommissions) * 100 : 0

  const premiumsByFlow = leads.reduce((acc: Record<string, number>, l) => {
    const activeTerm = getAuthoritativeTerm(l)
    const prem = (activeTerm && activeTerm.written_premium !== null && activeTerm.written_premium !== undefined)
      ? Number(activeTerm.written_premium) || 0
      : Number(getActivePolicy(l).activePremium) || 0
    const k = l.policy_flow || 'Unspecified'; acc[k] = (acc[k] || 0) + prem; return acc
  }, {})

  const premiumsByCarrier = leads.reduce((acc: Record<string, number>, l) => {
    const activeTerm = getAuthoritativeTerm(l)
    const active = getActivePolicy({ ...l, policy_terms: activeTerm || l.policy_terms })
    const prem = (activeTerm && activeTerm.written_premium !== null && activeTerm.written_premium !== undefined)
      ? Number(activeTerm.written_premium) || 0
      : Number(active.activePremium) || 0
    const k = active.activeCarrier || 'Unspecified'; acc[k] = (acc[k] || 0) + prem; return acc
  }, {})

  let reconciledCount = 0, discrepancyCount = 0, unreconciledCount = 0, pendingCount = 0
  leads.forEach(l => {
    const activeTerm = getAuthoritativeTerm(l)
    const s = (activeTerm?.accounting_status || l.accounting_status)?.toLowerCase()
    if (s === 'reconciled') reconciledCount++
    else if (s === 'discrepancy') discrepancyCount++
    else if (s === 'unreconciled') unreconciledCount++
    else pendingCount++
  })

  /* ── Exports ── */
  const handleExportCSV = () => {
    if (leads.length === 0) { showToast('No data to export.', 'error'); return }
    const headers = ['Client Name', 'Policy Number', 'Carrier', 'Policy Flow', 'Insurance Category', 'State', 'Effective Date', 'Total Premium', 'Expected Commission', 'Actual Commission', 'Accounting Status', 'Accounting Verified', 'Created Date']
    const rows = leads.map(lead => {
      const activeTerm = getAuthoritativeTerm(lead)
      const active = getActivePolicy({ ...lead, policy_terms: activeTerm || lead.policy_terms })
      const resolvedState = resolvePolicyState(lead)
      const prem = (activeTerm && activeTerm.written_premium !== null && activeTerm.written_premium !== undefined)
        ? Number(activeTerm.written_premium) || 0
        : active.activePremium ?? 0
      const exp = (activeTerm && activeTerm.expected_commission !== null && activeTerm.expected_commission !== undefined)
        ? Number(activeTerm.expected_commission) || 0
        : lead.expected_commission ?? 0
      const act = (activeTerm && activeTerm.actual_commission !== null && activeTerm.actual_commission !== undefined)
        ? Number(activeTerm.actual_commission) || 0
        : lead.actual_commission ?? 0
      const status = activeTerm?.accounting_status || lead.accounting_status || 'unreconciled'
      const verified = activeTerm?.accounting_verified !== undefined && activeTerm?.accounting_verified !== null
        ? Boolean(activeTerm.accounting_verified)
        : Boolean(lead.accounting_verified)

      return [
        `"${(lead.client_name || '').replace(/"/g, '""')}"`,
        `"${(active.activePolicyNumber || '').replace(/"/g, '""')}"`,
        `"${(active.activeCarrier || '').replace(/"/g, '""')}"`,
        `"${(lead.policy_flow || '').replace(/"/g, '""')}"`,
        `"${(lead.insurence_category || '').replace(/"/g, '""')}"`,
        `"${resolvedState}"`,
        activeTerm?.effective_date || lead.effective_date || 'N/A',
        prem,
        exp,
        act,
        status,
        verified ? 'YES' : 'NO',
        lead.created_at ? new Date(lead.created_at).toLocaleDateString() : 'N/A',
      ].join(',')
    })
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `accounting_report_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    showToast('CSV report downloaded.', 'success')
  }


  return (
    <div className="p-4 sm:p-6 lg:p-8 print-container min-h-screen max-w-[1600px] mx-auto w-full">
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          header, footer, nav, aside, .no-print, button, select, input { display: none !important; }
          .print-container { width: 100% !important; padding: 0 !important; margin: 0 !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 no-print">
        <div>
          <h1 className="text-2xl font-semibold">Financial & Accounting Reports</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Generate audit statements, track collection rates, and export data.
          </p>
        </div>

        <div className="flex flex-col xs:flex-row gap-3 shrink-0 w-full md:w-auto no-print">
          <button
            onClick={handleExportCSV}
            className="bg-brand hover:bg-brand-dark text-white px-4 py-2.5 rounded-lg font-medium shadow-sm transition-colors inline-flex justify-center items-center gap-2 w-full xs:w-auto"
          >
            <Download size={16} /> Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="bg-emerald-800 hover:bg-emerald-600 text-white border border-gray-200 px-4 py-2.5 rounded-lg font-medium shadow-sm transition-colors inline-flex justify-center items-center gap-2 w-full xs:w-auto"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-6 mb-6 space-y-5 no-print">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-brand" />
            <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">Report Filters & Periods</h2>
          </div>
          <button
            onClick={resetFilters}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition-colors border border-rose-200"
          >
            Reset Filters
          </button>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-2 flex-wrap pb-2">
          <span className="text-xs font-bold text-gray-500 mr-2 uppercase tracking-wide">Quick Periods:</span>
          {[
            { label: 'Last 30 Days', value: 'last30' },
            { label: 'This Month', value: 'thisMonth' },
            { label: 'Last Month', value: 'lastMonth' },
            { label: 'Q1', value: 'q1' },
            { label: 'Q2', value: 'q2' },
            { label: 'Q3', value: 'q3' },
            { label: 'Q4', value: 'q4' },
            { label: 'Year to Date', value: 'ytd' },
          ].map(p => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-3 py-1 text-xs font-bold rounded-lg border transition-colors ${
                periodPreset === p.value
                  ? 'bg-[#2E5C85] text-white border-[#2E5C85] shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Start Date', type: 'date', value: startDate,
              onChange: (v: string) => { setStartDate(v); setPeriodPreset('custom') }, icon: <Calendar size={16} className="text-gray-400" />
            },
            {
              label: 'End Date', type: 'date', value: endDate,
              onChange: (v: string) => { setEndDate(v); setPeriodPreset('custom') }, icon: <Calendar size={16} className="text-gray-400" />
            },
          ].map(({ label, type, value, onChange, icon }) => (
            <div key={label} className="space-y-1.5 flex flex-col">
              <label className="text-[10px] font-bold text-white uppercase tracking-wider bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-3 py-0.5 rounded-full w-fit whitespace-nowrap">
                {label}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>
                <input
                  type={type}
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                />
              </div>
            </div>
          ))}

          {[
            {
              label: 'Recon Status', value: accountingStatus, onChange: setAccountingStatus,
              options: [
                { label: 'All Statuses', value: 'all' },
                { label: 'Reconciled', value: 'reconciled' },
                { label: 'Discrepancy', value: 'discrepancy' },
                { label: 'Unreconciled', value: 'unreconciled' },
              ]
            },
            {
              label: 'Verification', value: accountingVerified, onChange: setAccountingVerified,
              options: [
                { label: 'All', value: 'all' },
                { label: 'Verified', value: 'verified' },
                { label: 'Unverified', value: 'unverified' },
              ]
            },
            {
              label: 'Category', value: category, onChange: setCategory,
              options: [
                { label: 'All Categories', value: 'all' },
                { label: 'Personal', value: 'personal' },
                { label: 'Commercial', value: 'commercial' },
              ]
            },
            {
              label: 'Policy Flow', value: policyFlow, onChange: setPolicyFlow,
              options: [
                { label: 'All Flows', value: 'all' },
                { label: 'New Business', value: 'new' },
                { label: 'Renewal', value: 'renewal' },
                ...availableFlows.filter(f => f.toLowerCase() !== 'new' && f.toLowerCase() !== 'renewal').map(f => ({ label: f, value: f }))
              ]
            },
            {
              label: 'Carrier', value: carrier, onChange: setCarrier,
              options: [{ label: 'All Carriers', value: 'all' }, ...availableCarriers.map(c => ({ label: c, value: c }))]
            },
            {
              label: 'State', value: state, onChange: setState,
              options: [{ label: 'All States', value: 'all' }, ...availableStates.map(s => ({ label: s, value: s }))]
            },
            {
              label: 'Assigned CSR', value: assignedCsr, onChange: setAssignedCsr,
              options: [{ label: 'All CSRs', value: 'all' }, ...csrs.map(c => ({ label: `${c.full_name} (${c.role})`, value: c.id }))]
            },
          ].map(({ label, value, onChange, options }) => (
            <div key={label} className="space-y-1.5 flex flex-col">
              <label className="text-[10px] font-bold text-white uppercase tracking-wider bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-3 py-0.5 rounded-full w-fit whitespace-nowrap">
                {label}
              </label>
              <div className="relative">
                <select
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 appearance-none border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                >
                  {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Loading / Empty ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-xl shadow-sm gap-4">
          <Loading message="Generating report..." />
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-xl shadow-sm gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center">
            <BarChart2 size={24} className="text-gray-400" />
          </div>
          <div className="text-center">
            <p className="text-base font-medium text-gray-900">No records matched the selected filters</p>
            <p className="text-sm text-gray-500 mt-1">Adjust your date range or filter criteria to find results.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Summary Cards Row ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Premium Breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <Layers size={18} className="text-brand" />
                <h3 className="text-sm font-semibold text-gray-900">Premium Breakdown</h3>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</p>
                    <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrency(totalPremiums)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Average</p>
                    <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrency(averagePremium)}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">By Flow</p>
                  {Object.entries(premiumsByFlow).map(([flow, value]) => (
                    <div key={flow} className="flex justify-between items-center py-1">
                      <span className="text-sm text-gray-600 capitalize">{flow}</span>
                      <span className="text-sm font-medium text-gray-900">{formatCurrency(value as number)}</span>
                    </div>
                  ))}
                </div>

                {Object.keys(premiumsByCarrier).length > 0 && (
                  <div className="space-y-2 pt-4 border-t border-gray-100 mt-auto">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">By Carrier</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {Object.entries(premiumsByCarrier).map(([name, value]) => (
                        <div key={name} className="flex justify-between items-start gap-2 py-1">
                          <span className="text-sm text-gray-600 break-words">{name}</span>
                          <span className="text-sm font-medium text-gray-900 shrink-0">{formatCurrency(value as number)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Commission Summary */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-600" />
                <h3 className="text-sm font-semibold text-gray-900">Commission Summary</h3>
              </div>
              <div className="p-5 flex-1 flex flex-col space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Expected</p>
                    <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrency(expectedCommissions)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-brand uppercase tracking-wider">Collected</p>
                    <p className="text-base font-semibold text-gray-900 mt-1">{formatCurrency(actualCommissions)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Collection Rate</span>
                    <span className="font-medium text-gray-900">{collectionPct.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.min(collectionPct, 100)}%` }}
                      className="h-full bg-brand rounded-full transition-all duration-500"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-100 text-sm mt-auto">
                  <span className="text-gray-600">Discrepancy Gap</span>
                  <span className={`font-medium ${commissionDiscrepancies > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {commissionDiscrepancies > 0 ? '-' : '+'}{formatCurrency(Math.abs(commissionDiscrepancies))}
                  </span>
                </div>
              </div>
            </div>

            {/* Reconciliation Status */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <ShieldCheck size={18} className="text-brand" />
                <h3 className="text-sm font-semibold text-gray-900">Reconciliation Status</h3>
              </div>
              <div className="p-5 flex-1 flex flex-col space-y-4">
                {[
                  { label: 'Reconciled', count: reconciledCount, cls: 'bg-emerald-500' },
                  { label: 'Discrepancy', count: discrepancyCount, cls: 'bg-orange-500' },
                  { label: 'Unreconciled', count: unreconciledCount, cls: 'bg-blue-500' },
                  { label: 'Pending', count: pendingCount, cls: 'bg-amber-400' },
                ].map(({ label, count, cls }) => {
                  const total = reconciledCount + discrepancyCount + unreconciledCount + pendingCount || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={label} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${cls}`} />
                          <span className="text-gray-600">{label}</span>
                        </div>
                        <span className="font-medium text-gray-900">{count}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%` }} className={`h-full ${cls} rounded-full`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Activity Log ── */}
          {logs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
                </div>
                <span className="text-xs font-medium text-gray-500">Last {logs.length} changes</span>
              </div>
              <div className="divide-y divide-gray-100">
                {logs.slice(0, 6).map(log => {
                  const operator = log.updater?.full_name || 'System Operator'
                  const client = log.lead?.client_name || 'Deleted Lead'
                  const parts: string[] = []
                  if (log.old_status !== log.new_status) parts.push(`Status: ${log.old_status || 'N/A'} → ${log.new_status}`)
                  if (log.old_actual_commission !== log.new_actual_commission) parts.push(`Commission updated to ${formatCurrency(log.new_actual_commission)}`)
                  const summary = parts.join(' · ') || 'Metadata updated'

                  return (
                    <div key={log.id} className="px-5 py-4 flex justify-between items-start gap-4 hover:bg-gray-50/80 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0 mt-0.5">
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{operator}</p>
                          <p className="text-sm text-gray-500 mt-0.5">
                            <span className="font-medium text-gray-700">{client}</span> — {summary}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-400 whitespace-nowrap flex items-center gap-1 shrink-0 mt-1">
                        <Clock size={12} /> {new Date(log.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Data Table ── */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-900">Statement Detail</h3>
              <span className="text-xs font-medium text-gray-500">
                {leads.length} Record{leads.length !== 1 && 's'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left table-fixed" style={{ minWidth: '1300px' }}>
                <colgroup>
                  <col className="w-[230px]" />
                  <col className="w-[180px]" />
                  <col className="w-[80px]" />
                  <col className="w-[130px]" />
                  <col className="w-[130px]" />
                  <col className="w-[130px]" />
                  <col className="w-[120px]" />
                  <col className="w-[110px]" />
                  <col className="w-[110px]" />
                </colgroup>
                <thead className="text-white uppercase text-xs border-b border-gray-100 tracking-wider">
                  <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85]">
                    <th className="px-4 py-4 font-semibold">Client</th>
                    <th className="px-4 py-4 font-semibold">Carrier / Flow</th>
                    <th className="px-4 py-4 font-semibold text-center">State</th>
                    <th className="px-4 py-4 font-semibold text-right">Premium</th>
                    <th className="px-4 py-4 font-semibold text-right">Expected Comm</th>
                    <th className="px-4 py-4 font-semibold text-right">Actual Comm</th>
                    <th className="px-4 py-4 font-semibold text-center">Status</th>
                    <th className="px-4 py-4 font-semibold text-center">Verified</th>
                    <th className="px-4 py-4 font-semibold text-center">Effective</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {leads.map(lead => {
                    const active = getActivePolicy(lead)
                    const resolvedState = resolvePolicyState(lead)
                    const s = lead.accounting_status?.toLowerCase()
                    const sColor =
                      s === 'reconciled' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      s === 'discrepancy' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                      s === 'unreconciled' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-gray-50 text-gray-700 border border-gray-200'

                    return (
                      <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors group">
                        <td className="px-4 py-4 align-top">
                          <p className="font-medium text-gray-900 break-words">{lead.client_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5 font-mono break-all">{active.activePolicyNumber || '—'}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="font-medium text-gray-900 break-words">{active.activeCarrier || '—'}</p>
                          <p className="text-xs text-gray-500 mt-0.5 break-words">{lead.policy_flow}</p>
                        </td>
                        <td className="px-4 py-4 text-center text-xs font-semibold text-gray-600 align-top uppercase">
                          {resolvedState}
                        </td>
                        <td className="px-4 py-4 text-right text-gray-900 align-top">
                          {formatCurrency(active.activePremium)}
                        </td>
                        <td className="px-4 py-4 text-right text-gray-900 align-top">
                          {formatCurrency(lead.expected_commission)}
                        </td>
                        <td className="px-4 py-4 text-right text-gray-900 font-medium align-top">
                          {formatCurrency(lead.actual_commission)}
                        </td>
                        <td className="px-4 py-4 text-center align-top">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${sColor}`}>
                            {lead.accounting_status || 'unreconciled'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center align-top">
                          {lead.accounting_verified ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                              <CheckCircle2 size={12} /> Yes
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-50 text-gray-700 border border-gray-200">No</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-gray-500 text-center align-top break-words">
                          {lead.effective_date || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
