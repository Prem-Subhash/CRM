'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Mail,
  FileSignature,
  FileText,
  XCircle,
  AlertCircle,
  RefreshCw,
  User,
  Calendar,
  TrendingUp,
  Phone,
  Tag,
  GitBranch,
} from 'lucide-react'
import { formatPolicies } from '@/utils/formatPolicies'
import Loading, { Spinner } from '@/components/ui/Loading'
import PageBackButton from '@/components/ui/PageBackButton'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type CSRProfile = {
  id: string
  full_name: string
  email: string
  created_at: string
  insurance_access?: string[]
}

type Lead = {
  id: string
  client_name: string
  phone: string
  email: string
  insurence_category: string
  policy_flow: string
  policy_type: string
  lead_policies?: { policy_type: string }[]
  created_at: string
  stage_name: string
}

// ─────────────────────────────────────────────
// Stage config
// ─────────────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  'Quoting in Progress': {
    label: 'Quoting in Progress',
    color: 'text-yellow-700',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: <Clock size={12} />,
  },
  'Quote Has Been Emailed': {
    label: 'Quote Has Been Emailed',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Mail size={12} />,
  },
  'Same Declaration Emailed': {
    label: 'Same Declaration Emailed',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    icon: <Mail size={12} />,
  },
  'Consent Letter Sent': {
    label: 'Consent Letter Sent',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: <FileSignature size={12} />,
  },
  'Completed': {
    label: 'Completed',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <CheckCircle2 size={12} />,
  },
  'Completed (Same)': {
    label: 'Completed (Same)',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <CheckCircle2 size={12} />,
  },
  'Completed (Switch)': {
    label: 'Completed (Switch)',
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    icon: <CheckCircle2 size={12} />,
  },
  'Did Not Bind': {
    label: 'Did Not Bind',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <XCircle size={12} />,
  },
  'Cancelled': {
    label: 'Cancelled',
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    icon: <XCircle size={12} />,
  },
}

function getStageCfg(name: string) {
  return STAGE_CONFIG[name] ?? {
    label: name,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: <AlertCircle size={12} />,
  }
}

// ─────────────────────────────────────────────
// Stat Card — fully responsive
// ─────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  accentBg,
  accentText,
  accentBorder,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  accentBg: string
  accentText: string
  accentBorder: string
}) {
  return (
    <div className={`relative bg-white rounded-xl sm:rounded-2xl border ${accentBorder} p-3 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm hover:shadow-md transition-shadow overflow-hidden`}>
      <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl ${accentBg} flex-shrink-0`}>
        <span className={accentText}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-gray-800 mt-0.5 leading-tight">{value}</p>
      </div>
      <div className={`absolute -right-4 -bottom-4 w-16 sm:w-20 h-16 sm:h-20 rounded-full opacity-5 ${accentBg}`} />
    </div>
  )
}

// ─────────────────────────────────────────────
// Mobile Lead Card
// ─────────────────────────────────────────────
function LeadCard({ lead }: { lead: Lead }) {
  const cfg = getStageCfg(lead.stage_name)
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
      {/* Top row: name + stage */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 text-sm break-words">{lead.client_name}</p>
          <p className="text-xs text-gray-400 break-all mt-0.5">{lead.email}</p>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap flex-shrink-0 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
          {cfg.icon}
          {lead.stage_name}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
        {lead.phone && (
          <span className="flex items-center gap-1">
            <Phone size={11} className="text-gray-400" />
            {lead.phone}
          </span>
        )}
        <span className="flex items-center gap-1 font-semibold text-gray-700 break-words">
          <FileText size={11} className="text-gray-400" />
          {formatPolicies(lead.lead_policies && lead.lead_policies.length > 0 ? lead.lead_policies.map(p => p.policy_type) : lead.policy_type)}
        </span>
        {lead.insurence_category && (
          <span className="flex items-center gap-1 capitalize">
            <Tag size={11} className="text-gray-400" />
            {lead.insurence_category}
          </span>
        )}
        <span className="flex items-center gap-1">
          <GitBranch size={11} className="text-gray-400" />
          <span className={`font-medium ${lead.policy_flow === 'new' ? 'text-emerald-600' : 'text-amber-600'}`}>
            {lead.policy_flow === 'new' ? 'New Business' : 'Renewal'}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={11} className="text-gray-400" />
          {new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────
export default function CSRWorkloadPage() {
  const params = useParams()
  const csrId = params?.id as string

  const [csr, setCsr] = useState<CSRProfile | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStage, setSelectedStage] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const loadData = async () => {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, created_at, insurance_access')
      .eq('id', csrId)
      .single()

    setCsr(profile)

    const { data: leadsData, error } = await supabase
      .from('temp_leads_basics')
      .select(`
        id,
        client_name,
        phone,
        email,
        insurence_category,
        policy_flow,
        policy_type,
          lead_policies(policy_type),
        created_at,
        current_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk (
          stage_name
        )
      `)
      .eq('assigned_csr', csrId)
      .order('created_at', { ascending: false })

    if (!error && leadsData) {
      const formatted: Lead[] = (leadsData as any[]).map((row) => ({
        ...row,
        stage_name:
          (Array.isArray(row.current_stage)
            ? row.current_stage[0]?.stage_name
            : row.current_stage?.stage_name) ?? 'Unknown',
      }))
      setLeads(formatted)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (csrId) loadData()
  }, [csrId])

  // ── Derived Stats ──
  const totalLeads = leads.length
  const activeLeads = leads.filter(
    (l) => !['Completed', 'Completed (Same)', 'Completed (Switch)', 'Did Not Bind', 'Cancelled'].includes(l.stage_name)
  ).length
  const completedLeads = leads.filter((l) =>
    ['Completed', 'Completed (Same)', 'Completed (Switch)'].includes(l.stage_name)
  ).length
  const didNotBind = leads.filter((l) =>
    ['Did Not Bind', 'Cancelled'].includes(l.stage_name)
  ).length
  const conversionRate = totalLeads > 0 ? Math.round((completedLeads / totalLeads) * 100) : 0

  const stageCounts = leads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.stage_name] = (acc[lead.stage_name] ?? 0) + 1
    return acc
  }, {})

  const filteredLeads = leads.filter((l) => {
    const matchesStage = selectedStage === 'all' || l.stage_name === selectedStage
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      !term ||
      l.client_name?.toLowerCase().includes(term) ||
      l.email?.toLowerCase().includes(term) ||
      l.phone?.includes(term) ||
      l.stage_name?.toLowerCase().includes(term)
    return matchesStage && matchesSearch
  })

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Loading message="Loading CSR workload..." />
      </div>
    )
  }

  // ── Not found ──
  if (!csr) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-semibold text-lg">CSR not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 min-h-screen">
      <PageBackButton fallbackUrl="/admin/csrs" className="mb-3" />

      {/* ── Header ── */}
      <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 mb-6 sm:mb-8">
        {/* Left: Avatar + info */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-lg shadow-emerald-100 flex-shrink-0">
            {csr.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-tight break-words">
              {csr.full_name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
              <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 break-all">
                <Mail size={11} className="flex-shrink-0" />
                <span className="break-all">{csr.email}</span>
              </span>
              <span className="text-gray-300 hidden xs:inline">·</span>
              <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 whitespace-nowrap">
                <Calendar size={11} className="flex-shrink-0" />
                Joined {new Date(csr.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
              {csr.insurance_access && csr.insurance_access.length > 0 && (
                <>
                  <span className="text-gray-300 hidden xs:inline">·</span>
                  <div className="flex items-center gap-1">
                    {csr.insurance_access.includes('personal') && (
                      <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-bold uppercase tracking-wider">Personal</span>
                    )}
                    {csr.insurance_access.includes('commercial') && (
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold uppercase tracking-wider">Commercial</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Refresh button */}
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm self-start xs:self-auto flex-shrink-0"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Stat Cards ──
           Mobile: 2×3 grid (2 cols, 3 rows — last card spans full width via col-span)
           Tablet: 3 cols
           Desktop: 5 cols
      */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4 mb-5 sm:mb-8">
        <StatCard
          icon={<Briefcase size={18} />}
          label="Total Leads"
          value={totalLeads}
          accentBg="bg-blue-100"
          accentText="text-blue-600"
          accentBorder="border-blue-200"
        />
        <StatCard
          icon={<Clock size={18} />}
          label="Active"
          value={activeLeads}
          accentBg="bg-yellow-100"
          accentText="text-yellow-600"
          accentBorder="border-yellow-200"
        />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Completed"
          value={completedLeads}
          accentBg="bg-emerald-100"
          accentText="text-emerald-600"
          accentBorder="border-emerald-200"
        />
        <StatCard
          icon={<XCircle size={18} />}
          label="Did Not Bind"
          value={didNotBind}
          accentBg="bg-red-100"
          accentText="text-red-500"
          accentBorder="border-red-200"
        />
        {/* On mobile: span 2 cols to fill the last row */}
        <div className="col-span-2 sm:col-span-1">
          <StatCard
            icon={<TrendingUp size={18} />}
            label="Conversion"
            value={`${conversionRate}%`}
            accentBg="bg-purple-100"
            accentText="text-purple-600"
            accentBorder="border-purple-200"
          />
        </div>
      </div>

      {/* ── Stage Breakdown Pills ── */}
      {Object.keys(stageCounts).length > 0 && (
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm">
          <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 sm:mb-3">
            Filter by Stage
          </p>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <button
              onClick={() => setSelectedStage('all')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold border transition-all touch-manipulation ${
                selectedStage === 'all'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              All ({totalLeads})
            </button>
            {Object.entries(stageCounts).map(([stage, count]) => {
              const cfg = getStageCfg(stage)
              const isActive = selectedStage === stage
              return (
                <button
                  key={stage}
                  onClick={() => setSelectedStage(stage)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-semibold border transition-all touch-manipulation ${
                    isActive
                      ? `${cfg.bg} ${cfg.color} ${cfg.border} shadow-sm`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {cfg.icon}
                  <span className="hidden xs:inline">{stage}</span>
                  <span className="xs:hidden">{stage.split(' ')[0]}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-white/60' : 'bg-gray-100 text-gray-600'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Leads Section ── */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Table toolbar */}
        <div className="p-3 sm:p-5 border-b border-gray-100 bg-gray-50/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl">
              <User size={16} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-gray-800">Assigned Leads</h2>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">{filteredLeads.length} lead{filteredLeads.length !== 1 && 's'} shown</p>
            </div>
          </div>
          <input
            type="text"
            placeholder="Search client, email, stage..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-60 px-3 sm:px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white transition-all"
          />
        </div>

        {/* Empty state */}
        {filteredLeads.length === 0 ? (
          <div className="py-14 sm:py-20 flex flex-col items-center justify-center text-gray-400 px-4">
            <Briefcase size={36} className="mb-3 opacity-30" />
            <p className="font-semibold text-gray-600 text-sm sm:text-base">No leads found</p>
            <p className="text-xs sm:text-sm mt-1 text-center">
              {searchTerm || selectedStage !== 'all'
                ? 'Try adjusting your filters.'
                : 'This CSR has no leads assigned yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Mobile card list (< md) ── */}
            <div className="md:hidden p-3 space-y-3">
              {filteredLeads.map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>

            {/* ── Desktop table (≥ md) ── */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left table-fixed min-w-[1280px]">
                <colgroup>
                  <col className="w-[260px]" />
                  <col className="w-[130px]" />
                  <col className="w-[160px]" />
                  <col className="w-[180px]" />
                  <col className="w-[150px]" />
                  <col className="w-[180px]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead>
                  <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white">
                    {['Client Name', 'Phone', 'Category', 'Policy Type', 'Flow', 'Stage', 'Date'].map((h) => (
                      <th key={h} className="px-5 py-4 font-semibold text-xs uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLeads.map((lead) => {
                    const cfg = getStageCfg(lead.stage_name)
                    return (
                      <tr key={lead.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-5 py-4 align-top">
                          <div className="font-semibold text-gray-900 break-words">{lead.client_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5 break-all">{lead.email}</div>
                        </td>
                        <td className="px-5 py-4 text-gray-600 align-top">{lead.phone || '—'}</td>
                        <td className="px-5 py-4 capitalize text-gray-700 break-words align-top">
                          {lead.insurence_category || '—'}
                        </td>
                        <td className="px-5 py-4 font-semibold text-gray-700 break-words align-top">
                          {formatPolicies(lead.lead_policies && lead.lead_policies.length > 0 ? lead.lead_policies.map(p => p.policy_type) : lead.policy_type)}
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
                            lead.policy_flow === 'new'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {lead.policy_flow === 'new' ? 'New Business' : 'Renewal'}
                          </span>
                        </td>
                        <td className="px-5 py-4 align-top">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                            {cfg.icon}
                            {lead.stage_name}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-500 whitespace-nowrap text-xs font-mono align-top">
                          {new Date(lead.created_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
