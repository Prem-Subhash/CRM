'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Eye, Search } from 'lucide-react'
import { extractDigits, normalizePhoneSearch, formatDatabasePhone } from '@/utils/phoneFormatter'
import { formatPolicies } from '@/utils/formatPolicies'

/* ================= TYPES ================= */

type Lead = {
    id: string
    client_name: string
    phone: string
    email: string
    policy_type: string
    lead_policies?: { policy_type: string }[]
    insurence_category: string
    policy_flow: string
    pipeline_id: string
    current_stage_id: string
    created_at: string
    current_stage: {
        stage_name: string
    } | null
    assigned_csr_profile: {
        full_name: string
    } | null
}

export default function PipelineClient({ pipelines, stages, stageCounts, targetPipelines, initialLeads }: any) {
    const validTargetPipelines = targetPipelines
        .map((name: string) => pipelines?.find((p: any) => p.name === name))
        .filter(Boolean)

    const otherPipelines =
        pipelines?.filter((p: any) => !targetPipelines.includes(p.name)) || []

    const displayPipelines = [...validTargetPipelines, ...otherPipelines]

    const [selectedPipeline, setSelectedPipeline] = useState(displayPipelines[0]?.id || '')
    const [stageFilter, setStageFilter] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')

    const currentPipeline = displayPipelines.find((p: any) => p.id === selectedPipeline)
    const currentStages = stages?.filter((s: any) => s.pipeline_id === selectedPipeline) || []

    useEffect(() => {
        setStageFilter(null)
    }, [selectedPipeline])

    console.log("INITIAL LEADS RECEIVED:", initialLeads?.length || 0)
    console.log("SELECTED PIPELINE:", selectedPipeline)

    const pipelineLeads = (initialLeads || []).filter((lead: any) => lead.pipeline_id === selectedPipeline)

    const normalizedLeads = pipelineLeads.map((row: any) => ({
        ...row,
        current_stage: row.current_stage ?? null,
        assigned_csr_profile: row.assigned_csr_profile ?? null,
    }))

    const stagedLeads = stageFilter
        ? normalizedLeads.filter((lead: any) => lead.current_stage?.stage_name === stageFilter)
        : normalizedLeads;

    const filteredLeads = stagedLeads.filter((lead: any) => {
        const term = searchTerm.toLowerCase()
        const termDigits = extractDigits(searchTerm)
        const dbPhoneStr = lead.phone || ''

        return (
            lead.client_name?.toLowerCase().includes(term) ||
            lead.email?.toLowerCase().includes(term) ||
            dbPhoneStr.includes(term) ||
            (termDigits.length > 0 && extractDigits(dbPhoneStr).includes(termDigits)) ||
            lead.assigned_csr_profile?.full_name?.toLowerCase().includes(term)
        )
    })

    return (
        <div className="w-full">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Pipeline Monitoring</h1>
                    <p className="text-gray-600 text-sm mt-1">Overview of pipeline stages and current lead distribution separated by pipeline.</p>
                </div>
                <Link href="/admin" className="w-full sm:w-auto">
                    <button className="w-full sm:w-auto px-4 py-2 bg-[#E07A5F] text-white rounded-lg hover:bg-[#E07A5F]/80 transition font-medium whitespace-nowrap">
                        Back to Dashboard
                    </button>
                </Link>
            </div>

            {/* STEP 1: Pipeline Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
                {displayPipelines.map((p: any) => {
                    const pStages = stages?.filter((s: any) => s.pipeline_id === p.id) || []
                    const totalLeads = pStages.reduce(
                        (sum: number, stage: any) => sum + (stageCounts[stage.id] || 0),
                        0
                    )
                    const isSelected = p.id === selectedPipeline

                    return (
                        <div
                            key={p.id}
                            onClick={() => setSelectedPipeline(p.id)}
                            className={`cursor-pointer rounded-xl p-4 sm:p-6 flex flex-col justify-between transition shadow-sm border touch-manipulation
                                ${isSelected
                                    ? 'border-brand bg-[#10B889]/5 ring-1 ring-brand shadow-md'
                                    : 'bg-white hover:border-brand/40 hover:shadow-md'
                                }`}
                        >
                            <h3 className={`text-base sm:text-lg font-bold break-words ${isSelected ? 'text-brand-dark' : 'text-gray-800'}`}>
                                {p.name}
                            </h3>
                            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-500">Total Leads</span>
                                <span className={`text-xl font-bold ${isSelected ? 'text-brand-dark' : 'text-gray-700'}`}>
                                    {totalLeads}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* STEP 2: Selected Pipeline Dashboard */}
            {currentPipeline && (
                <div className="mt-6">
                    {/* FILTER TABS */}
                    <div className="flex gap-2 mb-5 flex-wrap">
                        {[{ label: 'All', value: null }, ...currentStages.map((s: any) => ({ label: s.stage_name, value: s.stage_name }))].map((filter: any) => {
                            const isActive = filter.value === stageFilter

                            return (
                                <button
                                    key={filter.label}
                                    onClick={() => setStageFilter(filter.value)}
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

                        {filteredLeads.length === 0 ? (
                            <div className="p-12 text-center text-gray-500">
                                No leads found in this stage.
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
                                            <th className="px-4 sm:px-6 py-4 font-semibold">Assigned CSR</th>
                                            <th className="px-4 sm:px-6 py-4 font-semibold">Created</th>
                                            <th className="px-4 sm:px-6 py-4 font-semibold text-center">View</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {filteredLeads.map((lead: Lead) => {
                                            const stage = lead.current_stage?.stage_name ?? '—'

                                            return (
                                                <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors group">
                                                    <td className="px-4 sm:px-6 py-4 font-medium text-gray-900 break-words align-top">{lead.client_name}</td>
                                                    <td className="px-4 sm:px-6 py-4 text-gray-600 align-top">{formatDatabasePhone(lead.phone)}</td>
                                                    <td className="px-4 sm:px-6 py-4 text-gray-600 break-all align-top">{lead.email}</td>
                                                    <td className="px-4 sm:px-6 py-4 text-gray-700 font-semibold break-words align-top">
                                                        {formatPolicies(lead.lead_policies && lead.lead_policies.length > 0 ? lead.lead_policies.map(p => p.policy_type) : lead.policy_type)}
                                                    </td>
                                                    <td className="px-4 sm:px-6 py-4 capitalize text-gray-700 break-words align-top">{lead.insurence_category}</td>
                                                    <td className="px-4 sm:px-6 py-4 capitalize text-gray-700 break-words align-top">{lead.policy_flow}</td>
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
                    </div>
                </div>
            )}

            {!currentPipeline && displayPipelines.length === 0 && (
                <div className="text-center py-20 text-gray-500">
                    No pipelines available in the system.
                </div>
            )}
        </div>
    )
}

/* ================= STAGE BADGE ================= */

function StageBadge({ stage }: { stage: string }) {
    const color =
        stage === 'Quoting in Progress'
            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            : stage === 'Quote Has Been Emailed' || stage === 'Quote has been emailed'
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