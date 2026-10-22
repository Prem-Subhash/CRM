'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Calendar, Download, Search, Eye } from 'lucide-react'
import { formatPolicies } from '@/utils/formatPolicies'
import Loading from '@/components/ui/Loading'
import { formatCurrency } from '@/lib/currency'
import { getActivePolicy } from '@/utils/activePolicyHelper'
import { formatDateOnly } from '@/utils/dateHelper'
import { extractDigits, formatPhoneInput } from '@/utils/phoneFormatter'

type Renewal = {
    id: string
    client_name: string
    policy_type: string
    renewal_date: string
    carrier?: string
    current_premium?: number
    renewal_premium?: number
    new_carrier?: string
    new_policy_number?: string
    new_premium?: number
    assigned_csr?: string
    policy_number?: string
    referral?: string
    notes?: string
    business_name?: string
    pipeline_stage: {
        stage_name: string
    } | null
}

export default function PersonalRenewalPage({ createRoute }: { createRoute?: string }) {
    return (
        <Suspense fallback={<Loading message="Loading renewals..." />}>
            <PersonalRenewalContent createRoute={createRoute} />
        </Suspense>
    )
}

function PersonalRenewalContent({ createRoute }: { createRoute?: string }) {
    const [renewals, setRenewals] = useState<Renewal[]>([])
    const [loading, setLoading] = useState(true)
    const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7))
    const [searchTerm, setSearchTerm] = useState('')
    const [page, setPage] = useState(0)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')

    useEffect(() => {
        setPage(0)
    }, [monthFilter, searchTerm])

    const load = async () => {
        setLoading(true)
        setErrorMsg(null)
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
      policy_type,
          lead_policies(policy_type),
      renewal_date,
      carrier,
      current_premium,
      renewal_premium,
      new_carrier,
      new_policy_number,
      new_premium,
      assigned_csr,
      policy_number,
      referral,
      notes,
      insurence_category,
      business_name,
      pipeline_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk (
        stage_name,
        pipeline_id
      )
    `)
            .eq('policy_flow', 'renewal')
            .eq('insurence_category', 'personal')

        if (!isGlobalView) {
            query = query.eq('assigned_csr', user.id)
        }

        if (monthFilter) {
            const startOfMonth = `${monthFilter}-01`
            const [year, month] = monthFilter.split('-')
            const nextMonth = month === '12' ? 1 : parseInt(month) + 1
            const nextYear = month === '12' ? parseInt(year) + 1 : parseInt(year)
            const nextDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

            query = query.gte('renewal_date', startOfMonth).lt('renewal_date', nextDate)
        }

        const trimmedSearch = searchTerm.trim()
        if (trimmedSearch) {
            const digits = extractDigits(trimmedSearch)
            const formatted = digits ? formatPhoneInput(digits) : ''

            const searchOrs: string[] = [
                `client_name.ilike.%${trimmedSearch}%`,
                `business_name.ilike.%${trimmedSearch}%`,
                `policy_number.ilike.%${trimmedSearch}%`,
                `new_policy_number.ilike.%${trimmedSearch}%`,
                `carrier.ilike.%${trimmedSearch}%`,
                `new_carrier.ilike.%${trimmedSearch}%`,
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
            .order('renewal_date', { ascending: true })
            .range(page * 10, (page + 1) * 10 - 1)

        const { data, error } = await query

        if (error) {
            console.error(error)
            setErrorMsg(error.message)
            setRenewals([])
        } else {
            const formatted = (data || []).map((row: any) => ({
                ...row,
                pipeline_stage: Array.isArray(row.pipeline_stage)
                    ? row.pipeline_stage[0] ?? null
                    : row.pipeline_stage,
            }))

            setRenewals(formatted)
        }

        setLoading(false)
    }

    useEffect(() => {
        load()
    }, [monthFilter, page, searchTerm])

    const handleQuickSave = async (id: string) => {
        const val = editValue === '' ? null : Number(editValue)
        const { error } = await supabase
            .from('temp_leads_basics')
            .update({ renewal_premium: val })
            .eq('id', id)
        
        if (!error) {
            setRenewals(prev => prev.map(r => r.id === id ? { ...r, renewal_premium: val ?? undefined } : r))
            setEditingId(null)
        }
    }

    const filteredRenewals = renewals

    return (
        <div className="w-full max-w-[1600px] mx-auto min-h-screen">
            {errorMsg && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                    <strong>Error Loading Renewals:</strong> {errorMsg}
                    <br />
                    <span>Check console for details.</span>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">
                        Personal Lines Renewals
                    </h1>
                   
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    {/* Month Picker */}
                    <div className="relative group flex items-center w-full sm:w-auto">
                        <Calendar className="absolute left-3 z-10 text-gray-400 group-focus-within:text-emerald-600 transition-colors" size={16} />
                        <input
                            type="month"
                            value={monthFilter}
                            onChange={(e) => setMonthFilter(e.target.value)}
                            aria-label="Filter renewals by month"
                            className="w-full pl-10 pr-8 py-2.5 border border-emerald-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-emerald-500 shadow-sm text-gray-700 text-sm cursor-pointer"
                        />
                        {monthFilter && (
                            <button
                                onClick={() => setMonthFilter('')}
                                className="absolute right-3 text-gray-400 hover:text-gray-600 p-0.5 text-lg leading-none"
                                title="Clear filter"
                                aria-label="Clear month filter"
                            >
                                ×
                            </button>
                        )}
                    </div>

                    <Link
                        href={createRoute || "/csr/renewals/personal/new"}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all text-center flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                    >
                        + Add Client
                    </Link>

                    <Link
                        href="/csr/renewals/personal/import"
                        className="bg-brand hover:bg-brand-dark text-white px-5 py-2.5 rounded-lg font-bold shadow-sm transition-all text-center flex items-center justify-center gap-2 whitespace-nowrap text-sm"
                    >
                        <Download size={16} />
                        Import File
                    </Link>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Toolbar */}
                <div className="p-3 sm:p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search client, policy ID, or carrier..."
                            aria-label="Search renewals by client, policy ID, or carrier"
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="text-sm text-gray-500 font-medium whitespace-nowrap">
                        {filteredRenewals.length} Renewal{filteredRenewals.length !== 1 && 's'} Found
                    </div>
                </div>

                {loading ? (
                    <Loading message="Fetching renewals..." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left table-fixed" style={{ minWidth: '1830px' }}>
                            <colgroup>
                                <col style={{ width: '230px' }} />
                                <col style={{ width: '200px' }} />
                                <col style={{ width: '160px' }} />
                                <col style={{ width: '130px' }} />
                                <col style={{ width: '200px' }} />
                                <col style={{ width: '110px' }} />
                                <col style={{ width: '180px' }} />
                                <col style={{ width: '160px' }} />
                                <col style={{ width: '220px' }} />
                                <col style={{ width: '160px' }} />
                                <col style={{ width: '80px' }} />
                            </colgroup>
                            <thead className="text-white uppercase text-xs border-b border-gray-100 tracking-wider">
                                <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85]">
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Client</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Policy Type</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Policy ID</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold text-center">Renewal Date</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Carrier</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Premium</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold bg-white/10">Renewal Premium</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Referral</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Notes</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold">Stage</th>
                                    <th className="px-4 sm:px-6 py-4 font-semibold text-center">VIEW</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-100 bg-white">
                                {filteredRenewals.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="px-6 py-12 text-center text-gray-500 text-sm">
                                            No renewals found for the selected month or search criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRenewals.map(r => {
                                        const active = getActivePolicy(r)
                                        return (
                                        <tr key={r.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="px-4 sm:px-6 py-4 font-bold text-gray-900 break-words align-top">
                                                {r['business_name'] || r.client_name}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 capitalize text-gray-700 break-words align-top">
                                                {r.policy_type}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-500 font-mono break-all align-top">
                                                {active.activePolicyNumber || '—'}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-700 font-semibold whitespace-nowrap text-center align-top">
                                                {formatDateOnly(r.renewal_date)}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-700 break-words align-top">
                                                {active.activeCarrier || '—'}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-900 font-bold whitespace-nowrap align-top">
                                                {r.current_premium ? formatCurrency(r.current_premium) : '—'}
                                            </td>
                                            <td className={`px-4 sm:px-6 py-4 align-top ${!active.activePremium && !r.renewal_premium ? 'bg-cyan-50/50' : ''}`}>
                                                {editingId === r.id && !active.isSwitched ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            autoFocus
                                                            aria-label={`Renewal premium for ${r['business_name'] || r.client_name || 'client'}`}
                                                            className="w-full px-2 py-1 border-2 border-cyan-400 rounded-md outline-none text-sm font-bold"
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onBlur={() => handleQuickSave(r.id)}
                                                            onKeyDown={e => e.key === 'Enter' && handleQuickSave(r.id)}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-black tracking-tight whitespace-nowrap ${active.activePremium || r.renewal_premium ? 'text-gray-900' : 'text-cyan-600'}`}>
                                                            {active.isSwitched ? formatCurrency(active.activePremium) : (r.renewal_premium ? formatCurrency(r.renewal_premium) : 'MISSING')}
                                                        </span>
                                                        {active.isSwitched && (
                                                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">Switched</span>
                                                        )}
                                                        {!active.isSwitched && (
                                                            <button
                                                                onClick={() => {
                                                                    setEditingId(r.id)
                                                                    setEditValue(r.renewal_premium?.toString() || '')
                                                                }}
                                                                className="text-[10px] text-cyan-600 hover:text-cyan-800 font-bold underline whitespace-nowrap"
                                                            >
                                                                {r.renewal_premium ? 'Edit' : 'Enter'}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-600 break-words align-top">
                                                {r.referral || '—'}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-gray-500 break-words align-top">
                                                {r.notes || '—'}
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 align-top">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border whitespace-nowrap
                                                    ${!r.pipeline_stage ? 'bg-gray-100 text-gray-600 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`
                                                }>
                                                    {r.pipeline_stage?.stage_name || 'New'}
                                                </span>
                                            </td>
                                            <td className="px-4 sm:px-6 py-4 text-center align-top">
                                                <Link
                                                    href={`/csr/renewals/${r.id}`}
                                                    className="text-[#E07A5F] hover:text-[#E07A5F]/80 transition-colors p-1 rounded-md hover:bg-gray-100 inline-flex items-center justify-center"
                                                    title="View Renewal Details"
                                                    aria-label={`View renewal details for ${r['business_name'] || r.client_name || 'client'}`}
                                                >
                                                    <Eye size={18} />
                                                </Link>
                                            </td>
                                        </tr>
                                    )})
                                )}
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
                    <span className="text-sm text-gray-500 font-medium">
                        Page {page + 1}
                    </span>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={renewals.length < 10 || loading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    )
}
