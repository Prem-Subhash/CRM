'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Eye, Search, AlertCircle, FileText, CheckCircle2, Clock } from 'lucide-react'
import { extractDigits, normalizePhoneSearch, formatDatabasePhone, formatPhoneInput } from '@/utils/phoneFormatter'
import { formatPolicies } from '@/utils/formatPolicies'
import Loading, { Spinner } from '@/components/ui/Loading'

type Lead = {
  id: string
  client_name: string
  phone: string
  email: string
  insurence_category: string
  policy_type: string
  lead_policies?: { policy_type: string }[]
  policy_flow: string
  created_at: string
  current_stage: {
    stage_name: string
  } | null
}

const STAGE_FILTERS = [
  { label: 'All', value: null },
  { label: 'New Lead', value: 'New Lead' },
  { label: 'Quoting in Progress', value: 'Quoting in Progress' },
  { label: 'Quote Has Been Emailed', value: 'Quote Has Been Emailed' },
  { label: 'Consent Letter Sent', value: 'Consent Letter Sent' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Did Not Bind', value: 'Did Not Bind' },
]

export default function PersonalLinesPage({ createRoute }: { createRoute?: string }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const stageFilter = searchParams.get('stage')
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [stageFilter, searchTerm])

  useEffect(() => {
    const loadLeads = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const isGlobalView = prof?.role === 'superadmin' || prof?.role === 'admin'

      let query = supabase
        .from('temp_leads_basics')
        .select(`
          id,
          client_name,
          phone,
          email,
          insurence_category,
          policy_type,
          lead_policies(policy_type),
          policy_flow,
          created_at,
          current_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk!inner (
            stage_name
          )
        `, { count: 'exact' })

      if (!isGlobalView) {
        query = query.eq('assigned_csr', user.id)
      }

      query = query
        .eq('insurence_category', 'personal')
        .eq('policy_flow', 'new')

      if (stageFilter) {
        query = query.eq('current_stage.stage_name', stageFilter)
      }

      const trimmedSearch = searchTerm.trim()
      if (trimmedSearch) {
        const digits = extractDigits(trimmedSearch)
        const formatted = digits ? formatPhoneInput(digits) : ''

        const searchOrs: string[] = [
          `client_name.ilike.%${trimmedSearch}%`,
          `email.ilike.%${trimmedSearch}%`,
          `phone.ilike.%${trimmedSearch}%`
        ]
        if (digits && digits !== trimmedSearch) {
          searchOrs.push(`phone.ilike.%${digits}%`)
        }
        if (formatted && formatted !== trimmedSearch && formatted !== digits) {
          searchOrs.push(`phone.ilike.%${formatted}%`)
        }
        query = query.or(searchOrs.join(','))
      }

      query = query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1)

      const { data, error, count } = await query

      if (error) {
        console.error(error)
        setLeads([])
        setTotalCount(0)
      } else {
        const formatted = (data as any[]).map(row => ({
          ...row,
          current_stage: Array.isArray(row.current_stage)
            ? row.current_stage[0] ?? null
            : row.current_stage ?? null,
        }))

        setLeads(formatted)
        setTotalCount(count ?? formatted.length)
      }

      setLoading(false)
    }

    loadLeads()
  }, [stageFilter, page, searchTerm])

  const applyFilter = (stage: string | null) => {
    setPage(0)
    if (!stage) {
      router.push('/csr/pipeline/personal')
    } else {
      router.push(`/csr/pipeline/personal?stage=${encodeURIComponent(stage)}`)
    }
  }

  const filteredLeads = leads

  return (
    <div className="w-full">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Personal Lines Pipeline</h1>
          <p className="text-gray-500 text-sm mt-1">Manage new personal business leads</p>
        </div>

        <div className="flex gap-3 w-full sm:w-auto">
          <Link
            href={createRoute || "/csr/leads/new?category=personal"}
            className="w-full sm:w-auto text-center bg-brand hover:bg-brand-dark text-white px-4 py-2.5 rounded-lg font-medium shadow-sm transition-colors whitespace-nowrap"
          >
            + New Lead
          </Link>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {STAGE_FILTERS.map(filter => {
          const isActive =
            (!filter.value && !stageFilter) ||
            filter.value === stageFilter

          return (
            <button
              key={filter.label}
              onClick={() => applyFilter(filter.value)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors touch-manipulation
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

      {/* TABLE SECTION */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* TOOLBAR */}
        <div className="p-3 sm:p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search client, email, or phone..."
              className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-shadow"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500 font-medium whitespace-nowrap">
            {totalCount} Lead{totalCount !== 1 && 's'} Found
          </div>
        </div>

        {loading ? (
          <Loading message="Loading leads..." />
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">
            No leads found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left table-fixed" style={{ minWidth: '1360px' }}>
              <colgroup>
                <col style={{ width: '220px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '250px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '70px' }} />
              </colgroup>
              <thead className="text-white uppercase text-xs border-b border-gray-100 tracking-wider">
                <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85]">
                  <th className="px-4 py-4 font-semibold">Client Name</th>
                  <th className="px-4 py-4 font-semibold">Phone</th>
                  <th className="px-4 py-4 font-semibold">Email</th>
                  <th className="px-4 py-4 font-semibold">Policy Type</th>
                  <th className="px-4 py-4 font-semibold">Flow</th>
                  <th className="px-4 py-4 font-semibold">Stage</th>
                  <th className="px-4 py-4 font-semibold text-center">Created</th>
                  <th className="px-4 py-4 font-semibold text-center">View</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredLeads.map(lead => {
                  const stage = lead.current_stage?.stage_name ?? '—'

                  return (
                    <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors group">
                      <td className="px-4 py-4 font-medium text-gray-900 break-words align-top">
                        {lead.client_name}
                      </td>
                      <td className="px-4 py-4 text-gray-600 whitespace-nowrap align-top">{formatDatabasePhone(lead.phone)}</td>
                      <td className="px-4 py-4 text-gray-600 break-all align-top">
                        {lead.email}
                      </td>
                      <td className="px-4 py-4 capitalize text-gray-700 break-words align-top">
                        {formatPolicies(lead.lead_policies?.length > 0 ? lead.lead_policies.map((p: any) => p.policy_type) : lead.policy_type)}
                      </td>
                      <td className="px-4 py-4 capitalize text-gray-700 whitespace-nowrap align-top">
                        {lead.policy_flow}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <StageBadge stage={stage} />
                      </td>
                      <td className="px-4 py-4 text-gray-500 whitespace-nowrap text-center align-top">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-4 text-center align-top">
                        <Link
                          href={`/csr/leads/${lead.id}`}
                          className="text-brand-dark hover:text-[#B55D44] transition-colors p-1 rounded-md hover:bg-gray-100 inline-flex items-center justify-center"
                          title="View Lead Details"
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

        {/* PAGINATION CONTROLS */}
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

function StageBadge({ stage }: { stage: string }) {
  const color =
    stage === 'Quoting in Progress'
      ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
      : stage === 'Quote Has Been Emailed'
        ? 'bg-blue-50 text-blue-700 border border-blue-200'
        : stage === 'Consent Letter Sent'
          ? 'bg-purple-50 text-purple-700 border border-purple-200'
          : stage === 'Completed'
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
