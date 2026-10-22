'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Eye, Send, Search } from 'lucide-react'
import { extractDigits, normalizePhoneSearch, formatDatabasePhone, formatPhoneInput } from '@/utils/phoneFormatter'
import { formatPolicies } from '@/utils/formatPolicies'
import Loading, { Spinner } from '@/components/ui/Loading'

/* ================= TYPES ================= */

type Lead = {
  id: string
  client_name: string
  phone: string
  email: string
  insurence_category: string
  policy_flow: string
  created_at: string
  current_stage: {
    stage_name: string
  } | null
}

/* ================= FILTERS ================= */

const STAGE_FILTERS = [
  { label: 'All', value: null },
  { label: 'New Lead', value: 'New Lead' },
  { label: 'Quoting in Progress', value: 'Quoting in Progress' },
  { label: 'Quote has been Emailed', value: 'Quote Has Been Emailed' },
  { label: 'Consent Letter Sent', value: 'Consent Letter Sent' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Did not bind', value: 'Did Not Bind' },
]

/* ================= PAGE ================= */

export default function MyLeadsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const stageFilter = searchParams.get('stage')

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [stageFilter, searchTerm])

  /* ================= LOAD LEADS ================= */

  useEffect(() => {
    const loadLeads = async () => {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      let query = supabase
        .from('temp_leads_basics')
        .select(`
          id,
          client_name,
          phone,
          email,
          insurence_category,
          policy_flow,
          created_at,
          current_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk!inner (
            stage_name
          )
        `)
        .eq('assigned_csr', user.id)
        .eq('insurence_category', 'personal')
        .eq('policy_flow', 'new')

      /* ✅ FIXED FILTER */
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
        .range(page * 50, (page + 1) * 50 - 1)

      const { data, error } = await query

      if (error) {
        console.error(error)
        setLeads([])
      } else {
        /* ✅ NORMALIZE JOIN RESULT */
        const formatted = (data as any[]).map(row => ({
          ...row,
          current_stage: Array.isArray(row.current_stage)
            ? row.current_stage[0] ?? null
            : row.current_stage ?? null,
        }))

        setLeads(formatted)
      }

      setLoading(false)
    }

    loadLeads()
  }, [stageFilter, page, searchTerm])

  /* ================= FILTER HANDLER ================= */

  const applyFilter = (stage: string | null) => {
    // Check if the current filter is already selected to allow toggling off if needed, 
    // or just push the new route. 
    // Logic below matches original: direct push.
    if (!stage) {
      router.push('/csr/leads')
    } else {
      router.push(`/csr/leads?stage=${encodeURIComponent(stage)}`)
    }
  }

  const filteredLeads = leads

  /* ================= UI ================= */


  return (
    <div className="p-8">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Personal Pipeline</h1>

        <div className="flex gap-3">
          <Link
            href="/csr/leads/new?category=personal"
            className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
          >
            + New Lead
          </Link>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {STAGE_FILTERS.map(filter => {
          const isActive =
            (!filter.value && !stageFilter) ||
            filter.value === stageFilter

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

      {/* TABLE SECTION */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* TOOLBAR */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search client, email, or phone..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-shadow"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm text-gray-500 font-medium whitespace-nowrap">
            {filteredLeads.length} Lead{filteredLeads.length !== 1 && 's'} Found
          </div>
        </div>

        {loading ? (
          <Loading message="Loading leads..." />
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No leads found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left table-fixed" style={{ minWidth: '1270px' }}>
              <colgroup>
                <col style={{ width: '230px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '250px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '70px' }} />
                <col style={{ width: '100px' }} />
              </colgroup>
              <thead className="text-white uppercase text-xs border-b border-gray-100 tracking-wider">
                <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85]">
                  <th className="px-4 py-4 font-semibold">Client Name</th>
                  <th className="px-4 py-4 font-semibold">Phone</th>
                  <th className="px-4 py-4 font-semibold">Email</th>
                  <th className="px-4 py-4 font-semibold">Category</th>
                  <th className="px-4 py-4 font-semibold">Flow</th>
                  <th className="px-4 py-4 font-semibold">Stage</th>
                  <th className="px-4 py-4 font-semibold text-center">Created</th>
                  <th className="px-4 py-4 font-semibold text-center">View</th>
                  <th className="px-4 py-4 font-semibold">Actions</th>
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
                        {lead.insurence_category}
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

                      {/* VIEW */}
                      <td className="px-4 py-4 text-center align-top">
                        <Link
                          href={`/csr/leads/${lead.id}`}
                          className="text-brand-dark hover:text-[#B55D44] transition-colors p-1 rounded-md hover:bg-gray-100 inline-flex items-center justify-center"
                          title="View Lead Details"
                        >
                          <Eye size={18} />
                        </Link>
                      </td>

                      {/* ACTIONS */}
                      <td className="px-4 py-4 align-top">
                        {stage === 'Quoting in Progress' && (
                          <Link
                            href={`/csr/leads/send-form?id=${lead.id}`}
                            className="text-emerald-600 hover:text-emerald-800 font-medium text-xs uppercase tracking-wide transition-colors whitespace-nowrap"
                          >
                            Email
                          </Link>
                        )}
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
            disabled={leads.length < 50 || loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= STAGE BADGE ================= */

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
