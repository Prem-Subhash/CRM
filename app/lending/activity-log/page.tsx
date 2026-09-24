'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  Search,
  Filter,
  Clock,
  Calendar,
  User,
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  Edit3,
  Check,
  X,
  ChevronDown,
  LayoutGrid,
  List,
  Building2,
  FileText,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  Eye
} from 'lucide-react'
import { toast } from '@/lib/toast'
import Loading, { Spinner } from '@/components/ui/Loading'
import { LENDING_STAGES } from '@/app/lending/lib/constants'

interface ActivityItem {
  id: string
  loan_id: string
  previous_stage: string
  current_stage: string
  updated_by?: string
  remarks?: string
  stage_data?: Record<string, any>
  changed_at: string
  resolved_event_type: 'STAGE_CHANGED' | 'STATUS_CHANGED' | 'STAGE_DATE_UPDATED' | 'STATUS_DATE_UPDATED' | string
  is_manual_date: boolean
  system_timestamp: string
  manual_progression_date?: string | null
  manual_reason?: string | null
  updater_display: string
  updater?: {
    id: string
    full_name?: string
    email?: string
    role?: string
  } | null
  loan?: {
    id: string
    borrower_name?: string
    loan_type?: string
    current_stage?: string
    status?: string
  } | null
}

interface DealOption {
  id: string
  borrower_name: string
  current_stage?: string
  status?: string
}

function ActivityLogContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialDealParam = searchParams.get('deal') || 'ALL'

  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [deals, setDeals] = useState<DealOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDeal, setSelectedDeal] = useState(initialDealParam)
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL')
  const [stageFilter, setStageFilter] = useState<string>('ALL')
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('ALL')
  const [viewMode, setViewMode] = useState<'TABLE' | 'TIMELINE'>('TABLE')

  // Manual Date Modal state
  const [editingItem, setEditingItem] = useState<ActivityItem | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editReason, setEditReason] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  // Detail Drawer state
  const [detailsItem, setDetailsItem] = useState<ActivityItem | null>(null)

  const fetchActivities = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setRefreshing(true)
      else setLoading(true)

      const url = new URL('/api/lending/activity-log', window.location.origin)
      if (selectedDeal !== 'ALL') url.searchParams.set('loanId', selectedDeal)
      if (eventTypeFilter !== 'ALL') url.searchParams.set('eventType', eventTypeFilter)
      if (stageFilter !== 'ALL') url.searchParams.set('stage', stageFilter)

      const res = await fetch(url.toString())
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load activity logs')
      }

      setActivities(data.activities || [])
      if (data.deals && data.deals.length > 0) {
        setDeals(data.deals)
      }
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchActivities()
  }, [selectedDeal, eventTypeFilter, stageFilter])

  // Filter client-side by search term and date range
  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      // 1. Free-text search
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const borrower = (item.loan?.borrower_name || '').toLowerCase()
        const loanIdShort = (item.loan_id || '').toLowerCase()
        const prev = (item.previous_stage || '').toLowerCase()
        const curr = (item.current_stage || '').toLowerCase()
        const updater = (item.updater_display || '').toLowerCase()
        const remarks = (item.remarks || '').toLowerCase()
        const reason = (item.manual_reason || '').toLowerCase()

        const matches =
          borrower.includes(term) ||
          loanIdShort.includes(term) ||
          prev.includes(term) ||
          curr.includes(term) ||
          updater.includes(term) ||
          remarks.includes(term) ||
          reason.includes(term)

        if (!matches) return false
      }

      // 2. Date Range Filter
      if (dateRangeFilter !== 'ALL') {
        const itemDate = new Date(item.changed_at).getTime()
        const now = Date.now()
        const oneDay = 24 * 60 * 60 * 1000

        if (dateRangeFilter === 'TODAY') {
          const startOfToday = new Date().setHours(0, 0, 0, 0)
          if (itemDate < startOfToday) return false
        } else if (dateRangeFilter === '7DAYS') {
          if (itemDate < now - 7 * oneDay) return false
        } else if (dateRangeFilter === '30DAYS') {
          if (itemDate < now - 30 * oneDay) return false
        }
      }

      return true
    })
  }, [activities, searchTerm, dateRangeFilter])

  const openDateEditor = (item: ActivityItem) => {
    setEditingItem(item)
    const d = new Date(item.changed_at)
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setEditDate(localIso)
    setEditReason(item.manual_reason || item.stage_data?.manual_adjustment_reason || '')
  }

  const handleSaveManualDate = async () => {
    if (!editingItem || !editDate) {
      toast('Please select a valid date & time', 'error')
      return
    }

    try {
      setSavingDate(true)
      const res = await fetch('/api/lending/activity-log/manual-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: editingItem.id,
          newProgressionDate: new Date(editDate).toISOString(),
          reason: editReason.trim() || 'Manual progression date adjustment'
        })
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update progression date')
      }

      toast('Progression date updated successfully with audit trail', 'success')
      setEditingItem(null)
      await fetchActivities(true)
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSavingDate(false)
    }
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case 'STATUS_CHANGED':
        return (
          <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-extrabold uppercase tracking-wider rounded-md border border-blue-200 whitespace-nowrap">
            Status Changed
          </span>
        )
      case 'STAGE_DATE_UPDATED':
      case 'STATUS_DATE_UPDATED':
        return (
          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-extrabold uppercase tracking-wider rounded-md border border-amber-200 whitespace-nowrap">
            Date Updated
          </span>
        )
      case 'STAGE_CHANGED':
      default:
        return (
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase tracking-wider rounded-md border border-emerald-200 whitespace-nowrap">
            Stage Changed
          </span>
        )
    }
  }

  return (
    <div className="w-full space-y-8 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white p-6 sm:p-8 rounded-2xl shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-100 mb-1.5">
            <Activity size={15} />
            <span>Accurate Lending • Audit Trail</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Stage Progression Activity Log
          </h1>
          <p className="text-white/85 text-xs sm:text-sm mt-1 max-w-2xl">
            Automated date and timestamp logging of all loan stage progressions and status updates. Real-time chronological audit trail.
          </p>
        </div>

        <div className="flex items-center gap-3 z-10 w-full sm:w-auto">
          <div className="bg-white/15 backdrop-blur-md text-white font-mono font-bold text-xs px-3.5 py-2 rounded-xl border border-white/20">
            {filteredActivities.length} {filteredActivities.length === 1 ? 'Event' : 'Events'} Recorded
          </div>

          <button
            type="button"
            onClick={() => fetchActivities(true)}
            disabled={refreshing || loading}
            className="bg-white hover:bg-slate-50 text-slate-800 font-bold py-2 px-3.5 rounded-xl shadow-sm transition flex items-center gap-1.5 text-xs uppercase tracking-wider disabled:opacity-60"
            title="Refresh logs from Supabase"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#10B889]' : 'text-slate-600'} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by deal borrower, stage, updater, remarks, or loan ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 hover:bg-white border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#10B889]/30 focus:border-[#10B889] transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Deal Selector Dropdown */}
          <div className="w-full sm:w-64">
            <div className="relative">
              <select
                value={selectedDeal}
                onChange={(e) => setSelectedDeal(e.target.value)}
                className="appearance-none w-full pl-3 pr-8 py-2.5 bg-gray-50 hover:bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#10B889]/30 focus:border-[#10B889]"
              >
                <option value="ALL">All Deals &amp; Loans</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.borrower_name} ({d.id.split('-').pop()})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl shrink-0 self-end lg:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'TABLE' ? 'bg-white text-[#10B889] shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <List size={14} />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TIMELINE')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'TIMELINE' ? 'bg-white text-[#10B889] shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <LayoutGrid size={14} />
              <span>Timeline</span>
            </button>
          </div>
        </div>

        {/* Secondary Filter Badges */}
        <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-400 font-bold uppercase text-[10px] flex items-center gap-1 mr-1">
            <Filter size={12} />
            Filters:
          </span>

          {/* Event Type Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'ALL', label: 'All Events' },
              { id: 'STAGE_CHANGED', label: 'Stage Changed' },
              { id: 'STATUS_CHANGED', label: 'Status Changed' },
              { id: 'STAGE_DATE_UPDATED', label: 'Date Updated' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setEventTypeFilter(tab.id)}
                className={`px-3 py-1 rounded-lg font-bold text-[11px] transition ${
                  eventTypeFilter === tab.id
                    ? 'bg-[#2E5C85] text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block h-4 w-px bg-gray-200 mx-1" />

          {/* Date Range Quick Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'ALL', label: 'All Time' },
              { id: 'TODAY', label: 'Today' },
              { id: '7DAYS', label: 'Last 7 Days' },
              { id: '30DAYS', label: 'Last 30 Days' }
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDateRangeFilter(d.id)}
                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition ${
                  dateRangeFilter === d.id
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Stage Dropdown if needed */}
          <div className="ml-auto">
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-semibold text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#10B889]"
            >
              <option value="ALL">All Stages</option>
              {LENDING_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/^\d+\.\s*/, '')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-gray-200/80 shadow-sm flex flex-col items-center justify-center gap-3">
          <Loading message="Fetching stage progression audit logs from Supabase..." />
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-16 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-3 text-gray-400">
            <Activity size={28} />
          </div>
          <h3 className="text-base font-bold text-gray-800">No Activity Logs Found</h3>
          <p className="text-xs text-gray-500 max-w-sm mt-1">
            No stage progression or status change audit events match your selected filters.
          </p>
          {(searchTerm || selectedDeal !== 'ALL' || eventTypeFilter !== 'ALL' || dateRangeFilter !== 'ALL' || stageFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setSelectedDeal('ALL')
                setEventTypeFilter('ALL')
                setStageFilter('ALL')
                setDateRangeFilter('ALL')
              }}
              className="mt-4 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'TABLE' ? (
        /* ==============================================================
           TABLE VIEW — Required Structured Columns
           | Date & Time | Deal | Event | Previous Value | New Value | Updated By |
           ============================================================== */
        <div className="bg-white border border-gray-200/80 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white uppercase text-[11px] tracking-wider">
                  <th className="py-4 px-5 sm:px-6 font-bold whitespace-nowrap min-w-[170px]">Date &amp; Time</th>
                  <th className="py-4 px-5 sm:px-6 font-bold min-w-[180px]">Deal</th>
                  <th className="py-4 px-5 sm:px-6 font-bold whitespace-nowrap min-w-[130px]">Event</th>
                  <th className="py-4 px-5 sm:px-6 font-bold min-w-[160px]">Previous Value</th>
                  <th className="py-4 px-5 sm:px-6 font-bold min-w-[160px]">New Value</th>
                  <th className="py-4 px-5 sm:px-6 font-bold min-w-[160px]">Updated By</th>
                  <th className="py-4 px-5 sm:px-6 font-bold text-center whitespace-nowrap min-w-[90px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredActivities.map((item) => {
                  const borrower = item.loan?.borrower_name || 'Commercial Deal'
                  const loanIdShort = (item.loan_id || '').split('-').pop()?.toUpperCase() || '—'
                  const origTime = item.system_timestamp || item.changed_at

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* 1. Date & Time */}
                      <td className="py-4 px-5 sm:px-6 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                            <Clock size={13} className="text-[#10B889] shrink-0" />
                            <span>{formatDateTime(item.changed_at)}</span>
                          </div>

                          {item.is_manual_date ? (
                            <div className="flex flex-col gap-0.5">
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded border border-amber-200 w-max"
                                title={`Original server timestamp: ${formatDateTime(origTime)}`}
                              >
                                <span>Manual Adjusted</span>
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono" title="Original system timestamp">
                                Sys: {formatDateTime(origTime)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-mono">
                              Auto Logged
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Deal */}
                      <td className="py-4 px-5 sm:px-6 align-top">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => router.push(`/lending/loans/${item.loan_id}`)}
                            className="font-bold text-slate-900 hover:text-[#10B889] transition text-left flex items-center gap-1 group/deal break-words"
                            title="Open loan details"
                          >
                            <span>{borrower}</span>
                            <ArrowUpRight size={12} className="opacity-0 group-hover/deal:opacity-100 text-[#10B889] transition" />
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                              #{loanIdShort}
                            </span>
                            {item.loan?.loan_type && (
                              <span className="text-[10px] text-gray-500 uppercase">
                                {item.loan.loan_type}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. Event */}
                      <td className="py-4 px-5 sm:px-6 align-top">
                        {getEventBadge(item.resolved_event_type)}
                      </td>

                      {/* 4. Previous Value */}
                      <td className="py-4 px-5 sm:px-6 align-top">
                        <div className="text-xs text-slate-600 font-medium bg-slate-50 p-2 rounded-lg border border-slate-200 break-words">
                          {item.previous_stage || '—'}
                        </div>
                      </td>

                      {/* 5. New Value */}
                      <td className="py-4 px-5 sm:px-6 align-top">
                        <div className="text-xs text-slate-800 font-bold bg-emerald-50/70 text-emerald-900 p-2 rounded-lg border border-emerald-200 break-words">
                          {item.current_stage || '—'}
                        </div>
                        {item.remarks && (
                          <p className="text-[11px] text-gray-500 italic mt-1 line-clamp-1" title={item.remarks}>
                            {item.remarks}
                          </p>
                        )}
                      </td>

                      {/* 6. Updated By */}
                      <td className="py-4 px-5 sm:px-6 align-top">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <User size={13} className="text-slate-400" />
                            <span>{item.updater_display}</span>
                          </div>
                          {item.updater?.email && (
                            <span className="text-[10px] text-gray-400 break-all">
                              {item.updater.email}
                            </span>
                          )}
                          {item.updater?.role && (
                            <span className="text-[9px] uppercase font-bold text-[#2E5C85] bg-blue-50 px-1.5 py-0.2 rounded w-max mt-0.5">
                              {item.updater.role}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 7. Actions */}
                      <td className="py-4 px-5 sm:px-6 align-top text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDateEditor(item)}
                            className="p-1.5 text-slate-500 hover:text-[#10B889] hover:bg-emerald-50 rounded-lg border border-gray-200 shadow-2xs transition"
                            title="Edit / adjust progression date"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailsItem(item)}
                            className="p-1.5 text-slate-500 hover:text-[#2E5C85] hover:bg-blue-50 rounded-lg border border-gray-200 shadow-2xs transition"
                            title="View event details & metadata"
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ==============================================================
           TIMELINE VIEW — Chronological Progression Nodes
           ============================================================== */
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="relative pl-6 sm:pl-8 border-l-2 border-emerald-300 space-y-8">
            {filteredActivities.map((item) => {
              const borrower = item.loan?.borrower_name || 'Commercial Deal'
              const loanIdShort = (item.loan_id || '').split('-').pop()?.toUpperCase() || '—'
              const origTime = item.system_timestamp || item.changed_at

              return (
                <div key={item.id} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[31px] sm:-left-[39px] top-1 w-4 h-4 rounded-full bg-white border-4 border-[#10B889] group-hover:scale-125 transition-transform shadow-xs" />

                  <div className="bg-slate-50/70 hover:bg-white border border-gray-200/80 hover:border-emerald-300 rounded-xl p-4 sm:p-5 shadow-2xs transition-all space-y-3">
                    {/* Header: Date + Event Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200/60 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                          <Clock size={14} className="text-[#10B889]" />
                          <span>{formatDateTime(item.changed_at)}</span>
                        </span>

                        {item.is_manual_date && (
                          <span
                            className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full border border-amber-200"
                            title={`System timestamp: ${formatDateTime(origTime)}`}
                          >
                            Manual Date
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {getEventBadge(item.resolved_event_type)}
                        <button
                          type="button"
                          onClick={() => openDateEditor(item)}
                          className="text-xs text-slate-400 hover:text-[#10B889] p-1 transition"
                          title="Edit progression date"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Transition details */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 bg-white p-3 rounded-lg border border-gray-200">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                          Previous Stage
                        </span>
                        <span className="font-semibold text-slate-700 text-xs sm:text-sm">
                          {item.previous_stage || '—'}
                        </span>
                      </div>

                      <div className="hidden sm:flex items-center justify-center text-emerald-600">
                        <ArrowRight size={18} />
                      </div>

                      <div className="flex-1 bg-emerald-50/60 p-3 rounded-lg border border-emerald-200">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
                          New Stage
                        </span>
                        <span className="font-extrabold text-emerald-900 text-xs sm:text-sm">
                          {item.current_stage || '—'}
                        </span>
                      </div>
                    </div>

                    {/* Footer: Deal & Updater */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-gray-500">
                      <div className="flex items-center gap-2">
                        <Building2 size={13} className="text-[#10B889]" />
                        <span className="font-bold text-slate-800">{borrower}</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-gray-200 px-1.5 py-0.2 rounded">
                          #{loanIdShort}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <User size={13} className="text-gray-400" />
                        <span>Updated by: <strong className="text-slate-700">{item.updater_display}</strong></span>
                      </div>
                    </div>

                    {/* Remarks if any */}
                    {item.remarks && (
                      <div className="bg-white p-2.5 rounded-lg border border-gray-100 text-xs text-gray-600">
                        <span className="font-bold text-slate-700 mr-1">Remarks:</span>
                        {item.remarks}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ==============================================================
         MANUAL PROGRESSION DATE MODAL
         ============================================================== */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-gray-200 animate-scale-up space-y-5">
            <div className="flex items-center justify-between border-b pb-3.5">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Manually Set Progression Date</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Deal: <strong className="text-slate-800">{editingItem.loan?.borrower_name || 'Commercial Deal'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Stage info */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Stage Milestone:</span>
                <span className="font-bold text-slate-900">{editingItem.current_stage}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Event Type:</span>
                <span className="font-mono text-emerald-700 font-bold">{editingItem.resolved_event_type}</span>
              </div>
            </div>

            {/* System Timestamp Preservation Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldCheck size={16} className="text-blue-600" />
                <span>Original System Recorded Timestamp:</span>
              </div>
              <p className="font-mono text-[11px] text-blue-800 pl-5">
                {formatDateTime(editingItem.system_timestamp || editingItem.changed_at)}
              </p>
              <p className="text-[10px] text-blue-700/80 pt-1 pl-5">
                The original automatic system timestamp will remain permanently recorded in the database audit log.
              </p>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Actual Progression Date &amp; Time *</span>
                  <span className="text-[10px] font-normal text-gray-400">Select date &amp; time</span>
                </label>
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B889] text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
                  Reason for Manual Entry / Modification
                </label>
                <textarea
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Borrower signed commitment letter on 09/20, recorded retroactive milestone..."
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#10B889] resize-none"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2.5 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="w-full sm:w-auto px-5 py-2.5 border-2 border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 transition text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDate}
                onClick={handleSaveManualDate}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#10B889] hover:bg-[#0c966f] text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingDate ? (
                  <>
                    <Spinner size={14} />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save Progression Date</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
         EVENT DETAILS MODAL
         ============================================================== */}
      {detailsItem && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Audit Event Details</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {detailsItem.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsItem(null)}
                className="text-gray-400 hover:text-gray-700 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 p-2.5 rounded-lg border">
                <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Deal Borrower</span>
                <span className="font-bold text-slate-900">{detailsItem.loan?.borrower_name || '—'}</span>
              </div>
              <div className="bg-gray-50 p-2.5 rounded-lg border">
                <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Event Type</span>
                <span className="font-bold text-emerald-700">{detailsItem.resolved_event_type}</span>
              </div>
              <div className="bg-gray-50 p-2.5 rounded-lg border">
                <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Recorded Timestamp</span>
                <span className="font-semibold text-slate-800">{formatDateTime(detailsItem.changed_at)}</span>
              </div>
              <div className="bg-gray-50 p-2.5 rounded-lg border">
                <span className="text-[10px] text-gray-400 uppercase font-bold block mb-0.5">Updated By</span>
                <span className="font-semibold text-slate-800">{detailsItem.updater_display}</span>
              </div>
            </div>

            {/* Metadata Preview */}
            {detailsItem.stage_data && Object.keys(detailsItem.stage_data).length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
                  Raw Audit Payload &amp; Stage Metadata
                </span>
                <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(detailsItem.stage_data, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                onClick={() => setDetailsItem(null)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LendingActivityLogPage() {
  return (
    <Suspense fallback={<Loading message="Loading stage progression activity log..." />}>
      <ActivityLogContent />
    </Suspense>
  )
}

