'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  Eye, Search, AlertCircle, CheckCircle2, Info,
  ChevronLeft, ChevronRight, ShieldCheck, Filter, SlidersHorizontal,
  Edit2, Check, X, Loader2
} from 'lucide-react'
import Loading from '@/components/ui/Loading'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency } from '@/lib/currency'
import { getActivePolicy } from '@/utils/activePolicyHelper'
import { resolvePolicyState } from '@/utils/policyStateHelper'

type Lead = {
  id: string
  client_name: string
  phone: string
  email: string
  insurence_category: string
  policy_flow: string
  created_at: string
  total_premium: number
  expected_commission: number
  actual_commission: number
  accounting_status: string
  accounting_verified: boolean
  carrier: string
  policy_number?: string
  new_carrier?: string
  new_policy_number?: string
  new_premium?: number
  stage_metadata?: any
  intake_forms?: any[]
  current_stage: { stage_name: string } | null
  assigned_csr_profile: { full_name: string } | null
  policy_terms?: any
}

const STAGE_FILTERS = [
  { label: 'All Stages', value: 'all' },
  { label: 'New Lead', value: 'New Lead' },
  { label: 'Quoting', value: 'Quoting in Progress' },
  { label: 'Quote Sent', value: 'Quote Has Been Emailed' },
  { label: 'Consent Sent', value: 'Consent Letter Sent' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Did Not Bind', value: 'Did Not Bind' },
]

export default function AccountingAllLeadsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { showToast } = useToast()

  // URL Params initialization
  const stageFilter = searchParams.get('stage') || 'Completed'
  const urlCategory = searchParams.get('category')
  const urlFlow = searchParams.get('flow')
  const urlStatus = searchParams.get('status')

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [showFilters, setShowFilters] = useState(Boolean(urlCategory || urlFlow || urlStatus))

  // Inline Edit State
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const [inlineError, setInlineError] = useState<string | null>(null)

  const [accountingStatusFilter, setAccountingStatusFilter] = useState<string>(urlStatus || 'all')
  const [accountingVerifiedFilter, setAccountingVerifiedFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>(urlCategory || 'all')
  const [policyFlowFilter, setPolicyFlowFilter] = useState<string>(urlFlow || 'all')
  const [carrierFilter, setCarrierFilter] = useState<string>('all')
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [assignedCsrFilter, setAssignedCsrFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('created_desc')

  const [availableCarriers, setAvailableCarriers] = useState<string[]>([])
  const [availableFlows, setAvailableFlows] = useState<string[]>([])
  const [availableStates, setAvailableStates] = useState<string[]>([])
  const [availableCsrs, setAvailableCsrs] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    setPage(0)
  }, [
    searchTerm,
    stageFilter,
    accountingStatusFilter,
    accountingVerifiedFilter,
    categoryFilter,
    policyFlowFilter,
    carrierFilter,
    stateFilter,
    assignedCsrFilter,
    startDate,
    endDate,
    sortBy
  ])

  const handleInlineStart = (lead: Lead) => {
    setEditingRowId(lead.id)
    setEditingValue(lead.actual_commission !== undefined && lead.actual_commission !== null ? String(lead.actual_commission) : '0')
    setInlineError(null)
  }

  const handleInlineCancel = () => {
    setEditingRowId(null)
    setEditingValue('')
    setInlineError(null)
  }

  const handleInlineSave = async (lead: Lead) => {
    const numVal = parseFloat(editingValue)
    if (isNaN(numVal) || numVal < 0) {
      showToast('Actual Commission must be a valid non-negative number.', 'error')
      setInlineError('Must be >= 0')
      return
    }

    setSavingRowId(lead.id)
    setInlineError(null)

    try {
      const res = await fetch('/api/accounting/update-commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          expectedCommission: Number(lead.expected_commission) || 0,
          actualCommission: numVal
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update commission')
      }

      setLeads(prevLeads =>
        prevLeads.map(item =>
          item.id === lead.id
            ? { ...item, actual_commission: numVal }
            : item
        )
      )

      showToast(data.message || 'Actual commission updated successfully.', 'success')
      setEditingRowId(null)
      setEditingValue('')
    } catch (err: any) {
      console.error('Failed to update inline actual commission:', err)
      showToast(err.message || 'Error updating commission.', 'error')
      setInlineError(err.message || 'Failed')
    } finally {
      setSavingRowId(null)
    }
  }

  useEffect(() => {
    if (urlCategory) setCategoryFilter(urlCategory)
    if (urlFlow) setPolicyFlowFilter(urlFlow)
    if (urlStatus) setAccountingStatusFilter(urlStatus)
  }, [urlCategory, urlFlow, urlStatus])

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

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .order('full_name')

        if (profilesData) {
          setAvailableCsrs(profilesData.map(p => ({ id: p.id, name: p.full_name })))
        }
      } catch (err) {
        console.error('Failed to load filter options:', err)
      }
    }
    fetchDropdowns()
  }, [])

  useEffect(() => {
    const loadLeads = async () => {
      setLoading(true)

      let query = supabase
        .from('temp_leads_basics')
        .select(`
          id, policy_id, policy_term_id, client_name, phone, email, insurence_category, policy_flow, created_at,
          total_premium, expected_commission, actual_commission,
          accounting_status, accounting_verified, carrier, policy_number,
          new_carrier, new_policy_number, new_premium, stage_metadata,
          current_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk${stageFilter ? '!inner' : ''} (stage_name),
          assigned_csr_profile:profiles!fk_profile (full_name),
          policy_terms:policy_terms!policy_term_id (
            id,
            policy_id,
            term_sequence,
            term_status,
            carrier,
            policy_number,
            written_premium,
            expected_commission,
            actual_commission,
            accounting_status,
            accounting_verified
          ),
          intake_forms:temp_intake_forms (
            form_data,
            submitted_at
          )
        `, { count: 'exact' })

      // Sorting
      if (sortBy === 'created_desc') query = query.order('created_at', { ascending: false }).order('id', { ascending: false })
      else if (sortBy === 'created_asc') query = query.order('created_at', { ascending: true }).order('id', { ascending: true })
      else if (sortBy === 'name_asc') query = query.order('client_name', { ascending: true }).order('id', { ascending: true })
      else if (sortBy === 'premium_desc') query = query.order('total_premium', { ascending: false }).order('id', { ascending: false })
      else if (sortBy === 'comm_desc') query = query.order('expected_commission', { ascending: false }).order('id', { ascending: false })

      if (stageFilter && stageFilter !== 'all') {
        if (stageFilter === 'Completed') {
          query = query.in('current_stage.stage_name', ['Completed', 'Completed (Same)', 'Completed (Switch)'])
        } else {
          query = query.eq('current_stage.stage_name', stageFilter)
        }
      }

      if (accountingStatusFilter !== 'all') {
        if (accountingStatusFilter === 'unreconciled') {
          query = query.or('accounting_status.eq.unreconciled,accounting_status.is.null')
        } else {
          query = query.eq('accounting_status', accountingStatusFilter)
        }
      }

      if (accountingVerifiedFilter !== 'all') {
        query = query.eq('accounting_verified', accountingVerifiedFilter === 'verified')
      }

      if (categoryFilter !== 'all') {
        query = query.ilike('insurence_category', `%${categoryFilter}%`)
      }

      if (policyFlowFilter !== 'all') {
        query = query.eq('policy_flow', policyFlowFilter)
      }

      if (carrierFilter !== 'all') {
        query = query.or(`carrier.eq.${carrierFilter},new_carrier.eq.${carrierFilter}`)
      }

      if (assignedCsrFilter !== 'all') {
        query = query.eq('assigned_csr', assignedCsrFilter)
      }

      if (startDate) {
        query = query.gte('created_at', new Date(startDate).toISOString())
      }
      if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        query = query.lte('created_at', end.toISOString())
      }

      const trimmedSearch = searchTerm.trim()
      if (trimmedSearch) {
        const searchOrs: string[] = [
          `client_name.ilike.%${trimmedSearch}%`,
          `email.ilike.%${trimmedSearch}%`,
          `phone.ilike.%${trimmedSearch}%`,
          `policy_number.ilike.%${trimmedSearch}%`,
          `new_policy_number.ilike.%${trimmedSearch}%`
        ]

        const matchingCsrs = availableCsrs.filter(c => c.name.toLowerCase().includes(trimmedSearch.toLowerCase())).map(c => c.id)
        if (matchingCsrs.length > 0) {
          searchOrs.push(`assigned_csr.in.(${matchingCsrs.join(',')})`)
        }

        query = query.or(searchOrs.join(','))
      }

      if (stateFilter === 'all') {
        query = query.range(page * 10, (page + 1) * 10 - 1)
        const { data, error, count } = await query

        if (error) {
          console.error(error)
          setLeads([])
          setTotalCount(0)
        } else {
          const formatted = (data as any[]).map(row => ({
            ...row,
            current_stage: Array.isArray(row.current_stage) ? row.current_stage[0] ?? null : row.current_stage ?? null,
            assigned_csr_profile: Array.isArray(row.assigned_csr_profile) ? row.assigned_csr_profile[0] ?? null : row.assigned_csr_profile ?? null,
          }))
          setLeads(formatted)
          setTotalCount(count ?? formatted.length)
        }
      } else {
        // Evaluate resolvePolicyState for candidates matching DB query
        const { data, error } = await query

        if (error) {
          console.error(error)
          setLeads([])
          setTotalCount(0)
        } else {
          const formatted = (data as any[]).map(row => ({
            ...row,
            current_stage: Array.isArray(row.current_stage) ? row.current_stage[0] ?? null : row.current_stage ?? null,
            assigned_csr_profile: Array.isArray(row.assigned_csr_profile) ? row.assigned_csr_profile[0] ?? null : row.assigned_csr_profile ?? null,
          }))

          const stateFiltered = formatted.filter(lead => resolvePolicyState(lead) === stateFilter)
          setTotalCount(stateFiltered.length)
          setLeads(stateFiltered.slice(page * 10, (page + 1) * 10))
        }
      }

      setLoading(false)
    }

    loadLeads()
  }, [
    stageFilter,
    page,
    searchTerm,
    accountingStatusFilter,
    accountingVerifiedFilter,
    categoryFilter,
    policyFlowFilter,
    carrierFilter,
    stateFilter,
    assignedCsrFilter,
    startDate,
    endDate,
    sortBy,
    availableCsrs
  ])

  const applyFilter = (stage: string | null) => {
    setPage(0)
    if (!stage || stage === 'all') router.push('/accounting/all-leads?stage=all')
    else router.push(`/accounting/all-leads?stage=${encodeURIComponent(stage)}`)
  }

  const resetAllFilters = () => {
    setAccountingStatusFilter('all')
    setAccountingVerifiedFilter('all')
    setCategoryFilter('all')
    setPolicyFlowFilter('all')
    setCarrierFilter('all')
    setStateFilter('all')
    setAssignedCsrFilter('all')
    setStartDate('')
    setEndDate('')
    setSortBy('created_desc')
    setSearchTerm('')
    setPage(0)
    router.push('/accounting/all-leads')
  }

  const filteredLeads = leads

  const activeFilterCount = [
    accountingStatusFilter !== 'all',
    accountingVerifiedFilter !== 'all',
    categoryFilter !== 'all',
    policyFlowFilter !== 'all',
    carrierFilter !== 'all',
    stateFilter !== 'all',
    assignedCsrFilter !== 'all',
    startDate !== '',
    endDate !== '',
  ].filter(Boolean).length

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">All Accounting Leads</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Audit policy premiums, commissions, and reconciliation status across all bound policies.
          </p>
        </div>



      </div>

      {/* ── Stage Filter Tabs ── */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {STAGE_FILTERS.map(filter => {
          const isActive = (!filter.value && !stageFilter) || filter.value === stageFilter
          return (
            <button
              key={filter.label}
              onClick={() => applyFilter(filter.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors
                ${isActive
                  ? 'bg-brand text-white border-brand shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'
                }
              `}
            >
              {filter.label}
            </button>
          )
        })}
      </div>

      {/* ── Main Table Card ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search client, email, phone…"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-shadow"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="text-sm text-gray-500 font-medium whitespace-nowrap">
              {totalCount} result{totalCount !== 1 && 's'}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-2
                ${showFilters || activeFilterCount > 0
                  ? 'bg-brand text-white border-brand shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'
                }
              `}
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-md">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="p-4 border-b border-gray-100 bg-gray-50 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Multi-Criteria Filter Engine</span>
              <button
                onClick={resetAllFilters}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 underline"
              >
                Reset All Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                {
                  label: 'Recon Status', value: accountingStatusFilter,
                  onChange: (v: string) => { setAccountingStatusFilter(v); setPage(0) },
                  options: [
                    { label: 'All Statuses', value: 'all' },
                    { label: 'Reconciled', value: 'reconciled' },
                    { label: 'Discrepancy', value: 'discrepancy' },
                    { label: 'Unreconciled', value: 'unreconciled' },
                  ]
                },
                {
                  label: 'Verification', value: accountingVerifiedFilter,
                  onChange: (v: string) => { setAccountingVerifiedFilter(v); setPage(0) },
                  options: [
                    { label: 'All', value: 'all' },
                    { label: 'Verified', value: 'verified' },
                    { label: 'Unverified', value: 'unverified' },
                  ]
                },
                {
                  label: 'Category', value: categoryFilter,
                  onChange: (v: string) => { setCategoryFilter(v); setPage(0) },
                  options: [
                    { label: 'All Categories', value: 'all' },
                    { label: 'Personal', value: 'personal' },
                    { label: 'Commercial', value: 'commercial' },
                  ]
                },
                {
                  label: 'Policy Flow', value: policyFlowFilter,
                  onChange: (v: string) => { setPolicyFlowFilter(v); setPage(0) },
                  options: [
                    { label: 'All Flows', value: 'all' },
                    { label: 'New Business', value: 'new' },
                    { label: 'Renewal', value: 'renewal' },
                    ...availableFlows.filter(f => f.toLowerCase() !== 'new' && f.toLowerCase() !== 'renewal').map(f => ({ label: f, value: f }))
                  ]
                },
                {
                  label: 'Carrier', value: carrierFilter,
                  onChange: (v: string) => { setCarrierFilter(v); setPage(0) },
                  options: [{ label: 'All Carriers', value: 'all' }, ...availableCarriers.map(c => ({ label: c, value: c }))]
                },
                {
                  label: 'State', value: stateFilter,
                  onChange: (v: string) => { setStateFilter(v); setPage(0) },
                  options: [{ label: 'All States', value: 'all' }, ...availableStates.map(s => ({ label: s, value: s }))]
                },
                {
                  label: 'Assigned CSR', value: assignedCsrFilter,
                  onChange: (v: string) => { setAssignedCsrFilter(v); setPage(0) },
                  options: [{ label: 'All CSRs', value: 'all' }, ...availableCsrs.map(c => ({ label: c.name, value: c.id }))]
                },
                {
                  label: 'Sort By', value: sortBy,
                  onChange: (v: string) => { setSortBy(v); setPage(0) },
                  options: [
                    { label: 'Newest First', value: 'created_desc' },
                    { label: 'Oldest First', value: 'created_asc' },
                    { label: 'Client Name (A-Z)', value: 'name_asc' },
                    { label: 'Premium (High-Low)', value: 'premium_desc' },
                    { label: 'Expected Comm (High-Low)', value: 'comm_desc' },
                  ]
                },
              ].map(({ label, value, onChange, options }) => (
                <div key={label} className="space-y-1 flex flex-col">
                  <label className="text-[9px] font-bold text-white uppercase tracking-wider bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-2 py-0.5 rounded-full w-fit whitespace-nowrap">
                    {label}
                  </label>
                  <div className="relative">
                    <select
                      value={value}
                      onChange={e => onChange(e.target.value)}
                      className="w-full pl-2.5 pr-7 py-1.5 appearance-none border border-gray-200 rounded-lg text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                    >
                      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </div>
                  </div>
                </div>
              ))}

              <div className="space-y-1 flex flex-col">
                <label className="text-[9px] font-bold text-white uppercase tracking-wider bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-2 py-0.5 rounded-full w-fit whitespace-nowrap">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setPage(0) }}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                />
              </div>

              <div className="space-y-1 flex flex-col">
                <label className="text-[9px] font-bold text-white uppercase tracking-wider bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-2 py-0.5 rounded-full w-fit whitespace-nowrap">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setPage(0) }}
                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-shadow"
                />
              </div>
            </div>
          </div>
        )}

        {/* Table or Empty State */}
        {loading ? (
          <Loading message="Loading accounting leads…" />
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No leads found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left table-fixed" style={{ minWidth: '1500px' }}>
              <colgroup>
                <col className="w-[240px]" />
                <col className="w-[180px]" />
                <col className="w-[150px]" />
                <col className="w-[130px]" />
                <col className="w-[80px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[130px]" />
                <col className="w-[120px]" />
                <col className="w-[100px]" />
                <col className="w-[110px]" />
                <col className="w-[70px]" />
              </colgroup>
              <thead className="text-white uppercase text-xs border-b border-gray-100 tracking-wider">
                <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85]">
                  <th className="px-3 py-3.5 font-semibold">Client</th>
                  <th className="px-3 py-3.5 font-semibold">Policy / Carrier</th>
                  <th className="px-3 py-3.5 font-semibold">Category / Flow</th>
                  <th className="px-3 py-3.5 font-semibold">Stage</th>
                  <th className="px-3 py-3.5 font-semibold text-center">State</th>
                  <th className="px-3 py-3.5 font-semibold text-right">Premium</th>
                  <th className="px-3 py-3.5 font-semibold text-right">Expected Comm</th>
                  <th className="px-3 py-3.5 font-semibold text-right">Actual Comm</th>
                  <th className="px-3 py-3.5 font-semibold text-center">Recon Status</th>
                  <th className="px-3 py-3.5 font-semibold text-center">Verified</th>
                  <th className="px-3 py-3.5 font-semibold text-center">Created</th>
                  <th className="px-3 py-3.5 font-semibold text-center">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredLeads.map(lead => {
                  const stage = lead.current_stage?.stage_name ?? '—'
                  const createdDate = lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'
                  const activeTerm = Array.isArray(lead.policy_terms)
                    ? lead.policy_terms.find((t: any) => t.term_status === 'Active') || lead.policy_terms[0] || null
                    : (typeof lead.policy_terms === 'object' ? lead.policy_terms : null)
                  const active = getActivePolicy({ ...lead, policy_terms: activeTerm || lead.policy_terms })
                  const resolvedState = resolvePolicyState(lead)

                  const displayPremium = (activeTerm && activeTerm.written_premium !== null && activeTerm.written_premium !== undefined)
                    ? Number(activeTerm.written_premium) || 0
                    : Number(active.activePremium) || 0

                  const displayExpectedComm = (activeTerm && activeTerm.expected_commission !== null && activeTerm.expected_commission !== undefined)
                    ? Number(activeTerm.expected_commission) || 0
                    : Number(lead.expected_commission) || 0

                  const displayActualComm = (activeTerm && activeTerm.actual_commission !== null && activeTerm.actual_commission !== undefined)
                    ? Number(activeTerm.actual_commission) || 0
                    : Number(lead.actual_commission) || 0

                  const displayStatus = activeTerm?.accounting_status || lead.accounting_status
                  const displayVerified = activeTerm?.accounting_verified !== undefined && activeTerm?.accounting_verified !== null
                    ? Boolean(activeTerm.accounting_verified)
                    : Boolean(lead.accounting_verified)

                  return (
                    <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-3 py-3.5 align-top">
                        <p className="font-medium text-gray-900 break-words">{lead.client_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5 break-all">{lead.email}</p>
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <p className="font-mono text-xs text-gray-800 break-all font-semibold">
                          {active.activePolicyNumber || '—'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 break-words">
                          {active.activeCarrier || '—'}
                          {active.isSwitched && <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-bold">Switched</span>}
                        </p>
                      </td>
                      <td className="px-3 py-3.5 capitalize text-gray-700 align-top">
                        <p className="font-medium break-words text-xs">{lead.insurence_category}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 break-words">{lead.policy_flow}</p>
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <StageBadge stage={stage} />
                      </td>
                      <td className="px-3 py-3.5 text-center text-xs font-semibold text-gray-600 align-top uppercase">
                        {resolvedState}
                      </td>
                      <td className="px-3 py-3.5 text-right text-gray-900 font-semibold text-xs align-top">
                        {formatCurrency(displayPremium)}
                      </td>
                      <td className="px-3 py-3.5 text-right text-gray-900 text-xs align-top">
                        {formatCurrency(displayExpectedComm)}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-900 font-medium text-xs align-top">
                        {editingRowId === lead.id ? (
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleInlineSave(lead)
                                  if (e.key === 'Escape') handleInlineCancel()
                                }}
                                disabled={savingRowId === lead.id}
                                autoFocus
                                className="w-20 px-2 py-1 text-xs font-bold border border-emerald-500 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-right text-gray-900 shadow-sm"
                              />
                              {savingRowId === lead.id ? (
                                <Loader2 size={14} className="animate-spin text-emerald-600 shrink-0" />
                              ) : (
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleInlineSave(lead)}
                                    className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors"
                                    title="Save Actual Commission"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleInlineCancel}
                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                                    title="Cancel"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                            {inlineError && (
                              <span className="text-[10px] text-red-500 font-semibold">{inlineError}</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1 group/cell">
                            <span>{formatCurrency(displayActualComm)}</span>
                            <button
                              type="button"
                              onClick={() => handleInlineStart(lead)}
                              className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors opacity-70 group-hover/cell:opacity-100"
                              title="Edit Actual Commission"
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3.5 text-center align-top">
                        <StatusBadge status={displayStatus} />
                      </td>
                      <td className="px-3 py-3.5 text-center align-top">
                        <VerificationBadge verified={displayVerified} />
                      </td>
                      <td className="px-3 py-3.5 text-center text-gray-500 whitespace-nowrap text-xs align-top">
                        {createdDate}
                      </td>
                      <td className="px-3 py-3.5 text-center align-top">
                        <Link
                          href={`/accounting/leads/${lead.id}`}
                          className="text-brand-dark hover:text-[#B55D44] transition-colors p-1 rounded-md hover:bg-gray-100 inline-flex items-center justify-center"
                          title="Open Accounting Console"
                        >
                          <Eye size={18} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page + 1}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * 10 >= totalCount || loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-Components ── */

function StageBadge({ stage }: { stage: string }) {
  const color =
    stage === 'Quoting in Progress'
      ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      : stage === 'Quote Has Been Emailed'
        ? 'bg-blue-50 text-blue-700 border border-blue-200'
        : stage === 'Consent Letter Sent'
          ? 'bg-purple-50 text-purple-700 border border-purple-200'
          : stage === 'Completed' || stage === 'Completed (Same)' || stage === 'Completed (Switch)'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : stage === 'Did Not Bind'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-gray-50 text-gray-700 border border-gray-200'

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${color}`}>
      {stage}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase()
  const map: Record<string, string> = {
    reconciled: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    discrepancy: 'bg-orange-50 text-orange-700 border border-orange-200',
    unreconciled: 'bg-blue-50 text-blue-700 border border-blue-200',
  }
  const cls = map[s] ?? 'bg-gray-50 text-gray-700 border border-gray-200'
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls} inline-flex items-center gap-1.5`}>
      {s === 'reconciled' && <CheckCircle2 size={12} />}
      {s === 'discrepancy' && <AlertCircle size={12} />}
      {s === 'unreconciled' && <Info size={12} />}
      {status || 'Unreconciled'}
    </span>
  )
}

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
      <CheckCircle2 size={12} /> Verified
    </span>
  ) : (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
      Pending
    </span>
  )
}