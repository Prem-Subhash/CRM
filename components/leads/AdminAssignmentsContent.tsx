'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { Filter, Users, GitBranch, RefreshCw, Briefcase, Activity } from 'lucide-react'
import Loading, { Spinner } from '@/components/ui/Loading'
import { toast } from '@/lib/toast'
import { PERSONAL_POLICY_TYPES, COMMERCIAL_POLICY_TYPES } from '@/constants/policyTypes'
import { formatPolicies } from '@/utils/formatPolicies'

// Types
type Lead = {
    id: string
    client_name: string
    policy_type: string
    lead_policies?: { policy_type: string }[]
    assigned_csr: string | null
    pipeline_id: string | null
    current_stage_id: string | null
    created_at: string
    lead_group_id?: string | null
    insurence_category?: string
    policy_flow?: string
}

type Assignee = { id: string, full_name: string, role: string }
type Pipeline = { id: string, name: string }
type Stage = { id: string, stage_name: string, pipeline_id: string }

export function AdminAssignmentsContent({ categoryProp, flowProp }: { categoryProp?: string, flowProp?: string } = {}) {
    const searchParams = useSearchParams()
    const categoryFilter = categoryProp ?? searchParams.get('category')
    const flowFilter = flowProp ?? searchParams.get('flow')

    const [leads, setLeads] = useState<Lead[]>([])
    const [assignees, setAssignees] = useState<Assignee[]>([])
    const [pipelines, setPipelines] = useState<Pipeline[]>([])
    const [stages, setStages] = useState<Stage[]>([])

    const [loading, setLoading] = useState(true)
    const [updatingParams, setUpdatingParams] = useState<Record<string, boolean>>({})

    const [filters, setFilters] = useState({
        pipeline: '',
        stage: '',
        csr: '',
        policyType: ''
    })

    useEffect(() => {
        fetchInitialData()
    }, [categoryFilter, flowFilter])

    const fetchInitialData = async () => {
        setLoading(true)

        const { data: assigneeData } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .in('role', ['csr', 'admin'])
            .eq('is_active', true)

        const { data: pipeData } = await supabase.from('pipelines').select('id, name')
        const { data: stageData } = await supabase.from('pipeline_stages').select('id, stage_name, pipeline_id')

        let query = supabase
            .from('temp_leads_basics')
            .select(`
                id,
                client_name,
                policy_type,
                lead_policies(policy_type),
                assigned_csr,
                pipeline_id,
                current_stage_id,
                created_at,
                lead_group_id,
                insurence_category,
                policy_flow
            `)
            .order('created_at', { ascending: false })

        if (categoryFilter) query = query.eq('insurence_category', categoryFilter)
        if (flowFilter) query = query.eq('policy_flow', flowFilter)

        const { data: leadData } = await query
 
        if (assigneeData) setAssignees(assigneeData)
        if (pipeData) setPipelines(pipeData)
        if (stageData) setStages(stageData)
        if (leadData) setLeads(leadData)
 
        setLoading(false)
    }

    const handleAssign = async (leadId: string, newAssigneeId: string) => {
        console.log("Assigning user", newAssigneeId, "to lead", leadId)
        setUpdatingParams(prev => ({ ...prev, [leadId]: true }))

        const leadToAssign = leads.find(l => l.id === leadId)
        const targetValue = newAssigneeId === 'unassigned' ? null : newAssigneeId
        const clientTxId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tx_${Date.now()}`
        const assignedUser = assignees.find(a => a.id === targetValue)
        const policyTypeFormatted = formatPolicies(
            leadToAssign?.lead_policies && leadToAssign.lead_policies.length > 0
                ? leadToAssign.lead_policies.map(p => p.policy_type)
                : leadToAssign?.policy_type
        )

        try {
            const res = await fetch('/api/assign-lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leadId: leadId,
                    targetUserId: targetValue,
                    clientTxId: clientTxId,
                    clientName: leadToAssign?.client_name || 'Client',
                    policyFlow: leadToAssign?.policy_flow || 'new',
                    insuranceCategory: leadToAssign?.insurence_category || 'personal',
                    policyType: policyTypeFormatted,
                    targetUserRole: assignedUser?.role || 'csr'
                })
            })

            const result = await res.json()

            if (!res.ok || result.error) {
                console.error("Assign Lead API Error:", result.error)
                toast('Failed to update assignment: ' + (result.error || 'Unknown error'), 'error')
            } else {
                const assigneeName = assignedUser?.full_name
                if (targetValue && assigneeName) {
                    toast(`Lead assigned to ${assigneeName} successfully!`, 'success')
                } else if (!targetValue) {
                    toast('Lead unassigned successfully.', 'info')
                } else {
                    toast('Lead assignment updated successfully!', 'success')
                }

                setLeads(prev => prev.map(lead => {
                    const isMatch = leadToAssign?.lead_group_id
                        ? lead.lead_group_id === leadToAssign.lead_group_id
                        : lead.id === leadId
                    return isMatch ? { ...lead, assigned_csr: targetValue } : lead
                }))
            }
        } catch (err: any) {
            console.error("Assign Lead Network Error:", err)
            toast('Failed to update assignment: ' + (err.message || 'Network error'), 'error')
        }

        setUpdatingParams(prev => ({ ...prev, [leadId]: false }))
    }

    const getFilteredLeads = (isAssigned: boolean) => {
        return leads.filter(lead => {
            const meetsCondition = isAssigned ? lead.assigned_csr !== null : lead.assigned_csr === null
            if (!meetsCondition) return false

            if (categoryFilter && lead.insurence_category !== categoryFilter) return false
            if (flowFilter && lead.policy_flow !== flowFilter) return false

            if (filters.pipeline && lead.pipeline_id !== filters.pipeline) return false
            if (filters.stage && lead.current_stage_id !== filters.stage) return false
            if (filters.csr && lead.assigned_csr !== filters.csr) return false
            if (filters.policyType) {
                const hasPolicy = lead.lead_policies && lead.lead_policies.length > 0
                    ? lead.lead_policies.some(p => p.policy_type === filters.policyType)
                    : lead.policy_type === filters.policyType
                if (!hasPolicy) return false
            }

            return true
        })
    }

    const unassignedLeads = getFilteredLeads(false)
    const assignedLeads = getFilteredLeads(true)

    const getPipelineName = (id: string | null) => pipelines.find(p => p.id === id)?.name || 'Unknown'
    const getStageName = (id: string | null) => stages.find(s => s.id === id)?.stage_name || 'Unknown'

    const availableStages = filters.pipeline ? stages.filter(s => s.pipeline_id === filters.pipeline) : stages

    return (
        <div className="w-full max-w-[1600px] mx-auto">
            {/* Page Header */}
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">Lead Assignment Console</h1>
                <p className="text-gray-500 mt-1 text-sm">Operational control panel for managing lead workloads.</p>
            </div>

            {/* Filter Hub */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6 mb-6">
                <div className="flex items-center gap-2 mb-4 sm:mb-6">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <Filter size={18} />
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-gray-800">Console Filters</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pipeline</label>
                        <select
                            value={filters.pipeline}
                            onChange={(e) => setFilters({ ...filters, pipeline: e.target.value, stage: '' })}
                            className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-2.5 outline-none transition-all"
                        >
                            <option value="">All Pipelines</option>
                            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stage</label>
                        <select
                            value={filters.stage}
                            onChange={(e) => setFilters({ ...filters, stage: e.target.value })}
                            className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-2.5 outline-none transition-all"
                        >
                            <option value="">All Stages</option>
                            {availableStages.map(s => <option key={s.id} value={s.id}>{s.stage_name}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assigned To</label>
                        <select
                            value={filters.csr}
                            onChange={(e) => setFilters({ ...filters, csr: e.target.value })}
                            className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-2.5 outline-none transition-all"
                        >
                            <option value="">All Assigned Users</option>
                            <optgroup label="CSRs">
                                {assignees.filter(a => a.role === 'csr').map(c => (
                                    <option key={c.id} value={c.id}>{c.full_name}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Admins">
                                {assignees.filter(a => a.role === 'admin').map(c => (
                                    <option key={c.id} value={c.id}>{c.full_name}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Policy Type</label>
                        <select
                            value={filters.policyType}
                            onChange={(e) => setFilters({ ...filters, policyType: e.target.value })}
                            className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block w-full p-2.5 outline-none transition-all"
                        >
                            <option value="">All Policy Types</option>
                            <optgroup label="Personal Lines">
                                {PERSONAL_POLICY_TYPES.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Commercial Lines">
                                {COMMERCIAL_POLICY_TYPES.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <Loading message="Loading routing data..." />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* SECTION 1: Unassigned Leads */}
                    <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shadow-sm">
                                    <Activity size={18} />
                                </div>
                                <h2 className="text-lg sm:text-xl font-bold text-amber-900">Unassigned Lead Queue</h2>
                            </div>
                            <span className="bg-amber-100/80 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap">
                                {unassignedLeads.length} Lead{unassignedLeads.length !== 1 && 's'} Waiting
                            </span>
                        </div>

                        {unassignedLeads.length === 0 ? (
                            <div className="p-10 text-center text-gray-500 text-sm">
                                <p>All clear! There are currently no unassigned leads matching your filters.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
                                    <colgroup>
                                        <col className="w-[240px]" />
                                        <col className="w-[160px]" />
                                        <col className="w-[180px]" />
                                        <col className="w-[180px]" />
                                        <col className="w-[140px]" />
                                        <col className="w-[180px]" />
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-gray-50/50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                                            <th className="p-3 sm:p-4 font-bold">Client Name</th>
                                            <th className="p-3 sm:p-4 font-bold">Policy Type</th>
                                            <th className="p-3 sm:p-4 font-bold">Pipeline Region</th>
                                            <th className="p-3 sm:p-4 font-bold">Current Stage</th>
                                            <th className="p-3 sm:p-4 font-bold">Date Received</th>
                                            <th className="p-3 sm:p-4 font-bold text-right">Assign Lead</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {unassignedLeads.map((lead) => (
                                            <tr key={lead.id} className="hover:bg-amber-50/30 transition-colors">
                                                <td className="p-3 sm:p-4 text-gray-900 font-bold text-sm break-words align-top">{lead.client_name}</td>
                                                <td className="p-3 sm:p-4 text-gray-600 text-xs capitalize break-words align-top">{formatPolicies(lead.lead_policies && lead.lead_policies.length > 0 ? lead.lead_policies.map(p => p.policy_type) : lead.policy_type)}</td>
                                                <td className="p-3 sm:p-4 text-gray-600 text-xs break-words align-top">{getPipelineName(lead.pipeline_id)}</td>
                                                <td className="p-3 sm:p-4 align-top">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-800 border border-gray-200 whitespace-nowrap">
                                                        {getStageName(lead.current_stage_id)}
                                                    </span>
                                                </td>
                                                <td className="p-3 sm:p-4 text-gray-500 text-xs font-mono whitespace-nowrap align-top">{new Date(lead.created_at).toLocaleDateString()}</td>
                                                <td className="p-3 sm:p-4 text-right align-top">
                                                    <TwoStepAssignSelector
                                                        leadId={lead.id}
                                                        currentAssigneeId={lead.assigned_csr}
                                                        assignees={assignees}
                                                        disabled={updatingParams[lead.id]}
                                                        onAssign={(targetValue) => handleAssign(lead.id, targetValue)}
                                                        isUnassignedSection={true}
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* SECTION 2: Assigned Leads */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 border-b border-gray-200 p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shadow-sm">
                                    <Users size={18} />
                                </div>
                                <h2 className="text-lg sm:text-xl font-bold text-gray-800">Active Assigned Leads</h2>
                            </div>
                            <span className="bg-white border border-gray-200 text-gray-500 px-3 py-1 rounded-full text-[10px] font-bold shadow-sm whitespace-nowrap">
                                {assignedLeads.length} Lead{assignedLeads.length !== 1 && 's'} Found
                            </span>
                        </div>

                        {assignedLeads.length === 0 ? (
                            <div className="p-10 text-center text-gray-500 text-sm">
                                <p>No assigned leads match your current filters.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse table-fixed min-w-[1100px]">
                                    <colgroup>
                                        <col className="w-[240px]" />
                                        <col className="w-[150px]" />
                                        <col className="w-[160px]" />
                                        <col className="w-[160px]" />
                                        <col className="w-[180px]" />
                                        <col className="w-[210px]" />
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white uppercase text-xs border-b border-gray-100 tracking-wider">
                                            <th className="p-3 sm:p-4 font-bold">Client Name</th>
                                            <th className="p-3 sm:p-4 font-bold">Policy Type</th>
                                            <th className="p-3 sm:p-4 font-bold">Pipeline Region</th>
                                            <th className="p-3 sm:p-4 font-bold">Current Stage</th>
                                            <th className="p-3 sm:p-4 font-bold">Assigned To</th>
                                            <th className="p-3 sm:p-4 font-bold text-right">Reassign</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {assignedLeads.map((lead) => {
                                            const assignedUser = assignees.find(c => c.id === lead.assigned_csr)
                                            const isAdmin = assignedUser?.role === 'admin'
                                            return (
                                                <tr key={lead.id} className="hover:bg-blue-50/20 transition-colors group">
                                                    <td className="p-3 sm:p-4 text-gray-900 font-bold text-sm break-words align-top">{lead.client_name}</td>
                                                    <td className="p-3 sm:p-4 text-gray-600 text-xs capitalize break-words align-top">{formatPolicies(lead.lead_policies && lead.lead_policies.length > 0 ? lead.lead_policies.map(p => p.policy_type) : lead.policy_type)}</td>
                                                    <td className="p-3 sm:p-4 text-gray-600 text-xs break-words align-top">{getPipelineName(lead.pipeline_id)}</td>
                                                    <td className="p-3 sm:p-4 align-top">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-800 border border-gray-200 whitespace-nowrap">
                                                            {getStageName(lead.current_stage_id)}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 sm:p-4 align-top">
                                                        <div className="flex items-start gap-2">
                                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 flex-shrink-0 mt-0.5 ${
                                                                isAdmin 
                                                                    ? 'bg-blue-100 text-blue-700 ring-blue-50' 
                                                                    : 'bg-emerald-100 text-emerald-700 ring-emerald-50'
                                                            }`}>
                                                                {assignedUser?.full_name?.[0] || 'U'}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-700 text-xs break-words">
                                                                    {assignedUser?.full_name || 'Unknown'}
                                                                </span>
                                                                {isAdmin && (
                                                                    <span className="text-[10px] text-blue-600 font-semibold">Admin</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 sm:p-4 text-right align-top">
                                                        <TwoStepAssignSelector
                                                            leadId={lead.id}
                                                            currentAssigneeId={lead.assigned_csr}
                                                            assignees={assignees}
                                                            disabled={updatingParams[lead.id]}
                                                            onAssign={(targetValue) => handleAssign(lead.id, targetValue)}
                                                            isUnassignedSection={false}
                                                        />
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
        </div>
    )
}

function TwoStepAssignSelector({
    leadId,
    currentAssigneeId,
    assignees,
    disabled,
    onAssign,
    isUnassignedSection
}: {
    leadId: string
    currentAssigneeId: string | null
    assignees: Assignee[]
    disabled?: boolean
    onAssign: (targetValue: string) => void
    isUnassignedSection: boolean
}) {
    const assignedUser = assignees.find(a => a.id === currentAssigneeId)
    const initialType = assignedUser?.role === 'admin' ? 'admin' : (assignedUser?.role === 'csr' ? 'csr' : 'csr')
    const [assignType, setAssignType] = useState<'csr' | 'admin'>(initialType)

    useEffect(() => {
        if (assignedUser?.role === 'admin') {
            setAssignType('admin')
        } else if (assignedUser?.role === 'csr') {
            setAssignType('csr')
        }
    }, [currentAssigneeId, assignedUser?.role])

    const filteredUsers = assignees.filter(a => a.role === assignType)
    const isCurrentMatch = assignedUser?.role === assignType

    return (
        <div className="flex flex-col gap-1.5 items-end">
            <div className="flex items-center gap-1.5 w-full justify-end">
                <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Type:</span>
                <select
                    className="border border-gray-300 rounded-md text-[11px] py-1 px-2 outline-none cursor-pointer bg-white text-gray-700 font-medium focus:ring-1 focus:ring-emerald-500 shadow-sm"
                    value={assignType}
                    disabled={disabled}
                    onChange={(e) => setAssignType(e.target.value as 'csr' | 'admin')}
                >
                    <option value="csr">CSR</option>
                    <option value="admin">Admin</option>
                </select>
            </div>

            <div className="flex items-center gap-1.5 w-full justify-end">
                <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Assign:</span>
                <select
                    className={`border rounded-md text-[11px] py-1 px-2 outline-none cursor-pointer transition-all shadow-sm min-w-[130px] font-medium
                        ${disabled ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white border-gray-300 hover:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-gray-800'}
                    `}
                    value={isCurrentMatch && currentAssigneeId ? currentAssigneeId : ""}
                    disabled={disabled}
                    onChange={(e) => onAssign(e.target.value)}
                >
                    {isUnassignedSection ? (
                        <option value="" disabled>
                            {assignType === 'csr' ? 'Select CSR...' : 'Select Admin...'}
                        </option>
                    ) : (
                        <>
                            <option value="unassigned">-- Unassign --</option>
                            {!isCurrentMatch && (
                                <option value="" disabled>
                                    {assignType === 'csr' ? 'Select CSR...' : 'Select Admin...'}
                                </option>
                            )}
                        </>
                    )}
                    {filteredUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                </select>
            </div>
        </div>
    )
}
