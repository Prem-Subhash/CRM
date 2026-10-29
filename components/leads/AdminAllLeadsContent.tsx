'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Eye, Search } from 'lucide-react'
import { formatPolicies } from '@/utils/formatPolicies'
import { extractDigits, normalizePhoneSearch, formatDatabasePhone, formatPhoneInput } from '@/utils/phoneFormatter'
import Loading from '@/components/ui/Loading'

type Lead = {
    id: string
    client_name: string
    phone: string
    email: string
    policy_type: string
    lead_policies?: { policy_type: string }[]
    insurence_category: string
    policy_flow: string
    created_at: string
    current_stage: {
        stage_name: string
    } | null
    assigned_csr_profile: {
        full_name: string
    } | null
}

const STAGE_FILTERS = [
    { label: 'All', value: null },
    { label: 'New Lead', value: 'New Lead' },
    { label: 'Quoting in Progress', value: 'Quoting in Progress' },
    { label: 'Quote has been Emailed', value: 'Quote Has Been Emailed' },
    { label: 'Consent Letter Sent', value: 'Consent Letter Sent' },
    { label: 'Completed', value: 'Completed' },
    { label: 'Did not bind', value: 'Did Not Bind' },
]

const RENEWAL_STAGE_FILTERS = [
    { label: 'All', value: null },
    { label: 'Quoting in Progress', value: 'Quoting in Progress' },
    { label: 'Same Declaration Emailed', value: 'Same Declaration Emailed' },
    { label: 'Completed (Same)', value: 'Completed (Same)' },
    { label: 'Quote Has Been Emailed', value: 'Quote Has Been Emailed' },
    { label: 'Consent Letter Sent', value: 'Consent Letter Sent' },
    { label: 'Completed (Switch)', value: 'Completed (Switch)' },
    { label: 'Cancelled', value: 'Cancelled' },
]

export function AdminAllLeadsContent({ categoryProp, flowProp }: { categoryProp?: string, flowProp?: string } = {}) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const stageFilter = searchParams.get('stage')
    const categoryFilter = categoryProp ?? searchParams.get('category')
    const flowFilter = flowProp ?? searchParams.get('flow')

    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [page, setPage] = useState(0)

    useEffect(() => {
        setPage(0)
    }, [stageFilter, categoryFilter, flowFilter, searchTerm])

    useEffect(() => {
        const loadLeads = async () => {
            setLoading(true)

            let query = supabase
                .from('temp_leads_basics')
                .select(`
          id,
          client_name,
          phone,
          email,
          policy_type,
          lead_policies(policy_type),
          insurence_category,
          policy_flow,
          created_at,
          current_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk${stageFilter ? '!inner' : ''} (
            stage_name
          ),
          assigned_csr_profile:profiles!fk_profile (
            full_name
          )
        `)
                .not('assigned_csr', 'is', null)

            if (categoryFilter) {
                query = query.eq('insurence_category', categoryFilter)
            }
            if (flowFilter) {
                query = query.eq('policy_flow', flowFilter)
            }

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
                const formatted = (data as any[]).map(row => ({
                    ...row,
                    current_stage: Array.isArray(row.current_stage)
                        ? row.current_stage[0] ?? null
                        : row.current_stage ?? null,
                    assigned_csr_profile: Array.isArray(row.assigned_csr_profile)
                        ? row.assigned_csr_profile[0] ?? null
                        : row.assigned_csr_profile ?? null,
                }))

                setLeads(formatted)
            }

            setLoading(false)
        }

        loadLeads()
    }, [stageFilter, page, categoryFilter, flowFilter, searchTerm])

    const applyFilter = (stage: string | null) => {
        const params = new URLSearchParams()
        if (categoryFilter && !categoryProp) params.set('category', categoryFilter)
        if (flowFilter && !flowProp) params.set('flow', flowFilter)
        if (stage) params.set('stage', stage)
        const queryString = params.toString()
        router.push(`/admin/leads${queryString ? `?${queryString}` : ''}`)
    }

    const filteredLeads = leads

    return (
        <div className="w-full">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">All Leads</h1>
                    <p className="text-gray-600 mt-1 text-sm">View and monitor all leads across the CRM.</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <Link
                        href="/admin/leads/new"
                        className="bg-[#10B889] hover:bg-[#10B889]/80 text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all flex items-center justify-center whitespace-nowrap"
                    >
                        + New Lead
                    </Link>
                </div>
            </div>

            {/* FILTER TABS */}
            <div className="flex gap-2 mb-5 flex-wrap">
                {(flowProp === 'renewal' ? RENEWAL_STAGE_FILTERS : STAGE_FILTERS).map(filter => {
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
                            placeholder="Search client, email, phone, or CSR..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-shadow"
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
                    <div className="p-12 text-center text-gray-500 text-sm">
                        No leads found matching your criteria.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left table-fixed min-w-[1550px]">
                            <colgroup>
                                <col className="w-[240px]" />
                                <col className="w-[140px]" />
                                <col className="w-[220px]" />
                                <col className="w-[180px]" />
                                <col className="w-[150px]" />
                                <col className="w-[140px]" />
                                <col className="w-[160px]" />
                                <col className="w-[160px]" />
                                <col className="w-[110px]" />
                                <col className="w-[80px]" />
                            </colgroup>
                            <thead className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white uppercase text-xs border-b border-gray-100 tracking-wider">
                                <tr>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Client Name</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Phone</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Email</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Policy Type</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Category</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Flow</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Stage</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Assigned To</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Created</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold text-center">View</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-100">
                                {filteredLeads.map(lead => {
                                    const stage = lead.current_stage?.stage_name ?? '—'

                                    return (
                                        <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="px-4 sm:px-6 py-4 font-medium text-gray-900 break-words align-top">
                                                {lead.client_name}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-600 align-top">{formatDatabasePhone(lead.phone)}</td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-600 break-all align-top">{lead.email}</td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-700 font-semibold break-words align-top">
                                                {formatPolicies(lead.lead_policies && lead.lead_policies.length > 0 ? lead.lead_policies.map(p => p.policy_type) : lead.policy_type)}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 capitalize text-gray-700 break-words align-top">
                                                {lead.insurence_category}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 capitalize text-gray-700 break-words align-top">
                                                {lead.policy_flow}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 align-top">
                                                <StageBadge stage={stage} />
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 align-top">
                                                {lead.assigned_csr_profile?.full_name ? (
                                                    <span className="font-semibold text-gray-700 text-sm break-words">
                                                        {lead.assigned_csr_profile.full_name}
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-600 font-semibold text-sm">Unassigned</span>
                                                )}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-500 whitespace-nowrap align-top">
                                                {new Date(lead.created_at).toLocaleDateString()}
                                            </td>

                                            <td className="px-4 sm:px-6 py-4 text-center align-top">
                                                <Link
                                                    href={lead.policy_flow === 'renewal' ? `/admin/leads/renewals/${lead.id}` : `/csr/leads/${lead.id}`}
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
