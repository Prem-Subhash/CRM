import React from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServer } from '@/lib/supabaseServer'
import { formatCurrency } from '@/lib/currency'
import { 
  DollarSign, 
  Percent, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  ShieldCheck, 
  Activity,
  ArrowRight,
  TrendingUp,
  PieChart,
  User,
  Clock
} from 'lucide-react'

export default async function AccountingDashboard() {
  const supabase = await createServer()

  // 1. Verify User Authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 2. Enforce Role-Based Access Control (RBAC)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['accounting', 'superadmin'].includes(profile.role)) {
    redirect('/unauthorized')
  }

  // 3. Fetch Real Leads Data for Financial Metrics
  const { data: leads, error: leadsError } = await supabase
    .from('temp_leads_basics')
    .select(`
      id,
      policy_id,
      policy_term_id,
      total_premium, 
      new_premium,
      carrier,
      new_carrier,
      policy_number,
      new_policy_number,
      expected_commission, 
      actual_commission, 
      accounting_status,
      insurence_category,
      policy_flow,
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
        accounting_status
      )
    `)

  if (leadsError) {
    console.error('Fetch leads failed:', leadsError)
  }

  // Import active policy helper dynamically or compute accurately
  const { getActivePolicy } = await import('@/utils/activePolicyHelper')

  // Aggregate stats
  let totalPremium = 0
  let totalExpectedComm = 0
  let totalActualComm = 0
  let reconciledCount = 0
  let discrepancyCount = 0
  let unreconciledCount = 0

  // Line of Business & Flow breakdown
  let plNewPremium = 0
  let plNewExpected = 0
  let plRenewalPremium = 0
  let plRenewalExpected = 0
  let clNewPremium = 0
  let clNewExpected = 0
  let clRenewalPremium = 0
  let clRenewalExpected = 0

  if (leads) {
    for (const lead of leads) {
      const activeTerm = Array.isArray(lead.policy_terms)
        ? lead.policy_terms.find((t: any) => t.term_status === 'Active') || lead.policy_terms[0] || null
        : (typeof lead.policy_terms === 'object' ? lead.policy_terms : null);

      const active = getActivePolicy(lead)

      const prem = (activeTerm && activeTerm.written_premium !== null && activeTerm.written_premium !== undefined)
        ? Number(activeTerm.written_premium) || 0
        : Number(active.activePremium) || 0

      const exp = (activeTerm && activeTerm.expected_commission !== null && activeTerm.expected_commission !== undefined)
        ? Number(activeTerm.expected_commission) || 0
        : Number(lead.expected_commission) || 0

      const act = (activeTerm && activeTerm.actual_commission !== null && activeTerm.actual_commission !== undefined)
        ? Number(activeTerm.actual_commission) || 0
        : Number(lead.actual_commission) || 0

      totalPremium += prem
      totalExpectedComm += exp
      totalActualComm += act
      
      const cat = lead.insurence_category?.toLowerCase() || ''
      const flow = lead.policy_flow?.toLowerCase() || ''

      if (cat.includes('personal')) {
        if (flow.includes('renewal')) {
          plRenewalPremium += prem
          plRenewalExpected += exp
        } else {
          plNewPremium += prem
          plNewExpected += exp
        }
      } else if (cat.includes('commercial')) {
        if (flow.includes('renewal')) {
          clRenewalPremium += prem
          clRenewalExpected += exp
        } else {
          clNewPremium += prem
          clNewExpected += exp
        }
      }

      const status = activeTerm?.accounting_status || lead.accounting_status
      if (status === 'reconciled') {
        reconciledCount++
      } else if (status === 'discrepancy') {
        discrepancyCount++
      } else if (status === 'unreconciled' || !status || status === 'Pending Verification') {
        unreconciledCount++
      }
    }
  }

  // 4. Fetch Recent Audit Logs
  const { data: recentLogs, error: logsError } = await supabase
    .from('accounting_logs')
    .select(`
      id,
      created_at,
      old_expected_commission,
      new_expected_commission,
      old_actual_commission,
      new_actual_commission,
      old_status,
      new_status,
      notes,
      updater:profiles!updated_by (
        full_name
      ),
      lead:temp_leads_basics!lead_id (
        id,
        client_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  if (logsError) {
    console.error('Fetch logs failed:', logsError)
  }

  const kpis = [
    {
      label: 'Total Premium',
      value: formatCurrency(totalPremium),
      description: 'Bound premium totals',
      icon: <DollarSign size={20} />,
      accent: 'from-[#2E5C85] to-[#1e3f5e]',
      glow: 'shadow-blue-200/50',
      iconBg: 'bg-blue-50 text-[#2E5C85]',
      hoverIconBg: 'group-hover:bg-[#2E5C85] group-hover:text-white',
    },
    {
      label: 'Expected Comm',
      value: formatCurrency(totalExpectedComm),
      description: 'Projected commission values',
      icon: <Percent size={20} />,
      accent: 'from-[#10B889] to-[#0d9470]',
      glow: 'shadow-emerald-200/50',
      iconBg: 'bg-emerald-50 text-[#10B889]',
      hoverIconBg: 'group-hover:bg-[#10B889] group-hover:text-white',
    },
    {
      label: 'Actual Comm',
      value: formatCurrency(totalActualComm),
      description: 'Collected commission totals',
      icon: <DollarSign size={20} />,
      accent: 'from-purple-600 to-indigo-600',
      glow: 'shadow-purple-200/50',
      iconBg: 'bg-purple-50 text-purple-600',
      hoverIconBg: 'group-hover:bg-purple-600 group-hover:text-white',
    },
    {
      label: 'Reconciled',
      value: `${reconciledCount} Policies`,
      description: 'Verified matching policies',
      icon: <ShieldCheck size={20} />,
      accent: 'from-teal-500 to-teal-700',
      glow: 'shadow-teal-200/50',
      iconBg: 'bg-teal-50 text-teal-600',
      hoverIconBg: 'group-hover:bg-teal-500 group-hover:text-white',
    },
    {
      label: 'Discrepancies',
      value: `${discrepancyCount} Pending`,
      description: 'Mismatched payouts',
      icon: <AlertCircle size={20} />,
      accent: 'from-[#E07A5F] to-[#c9664d]',
      glow: 'shadow-orange-200/50',
      iconBg: 'bg-orange-50 text-[#E07A5F]',
      hoverIconBg: 'group-hover:bg-[#E07A5F] group-hover:text-white',
    },
    {
      label: 'Unreconciled',
      value: `${unreconciledCount} Leads`,
      description: 'Awaiting reconciliation',
      icon: <Info size={20} />,
      accent: 'from-gray-500 to-gray-700',
      glow: 'shadow-gray-200/50',
      iconBg: 'bg-gray-150 text-gray-600',
      hoverIconBg: 'group-hover:bg-gray-600 group-hover:text-white',
    }
  ]

  const lineBreakdownKpis = [
    {
      label: 'Personal · New',
      premium: formatCurrency(plNewPremium),
      expected: formatCurrency(plNewExpected),
      link: '/accounting/all-leads?category=personal&flow=new',
      badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    {
      label: 'Personal · Renewal',
      premium: formatCurrency(plRenewalPremium),
      expected: formatCurrency(plRenewalExpected),
      link: '/accounting/all-leads?category=personal&flow=renewal',
      badgeBg: 'bg-teal-50 text-teal-700 border-teal-200'
    },
    {
      label: 'Commercial · New',
      premium: formatCurrency(clNewPremium),
      expected: formatCurrency(clNewExpected),
      link: '/accounting/all-leads?category=commercial&flow=new',
      badgeBg: 'bg-blue-50 text-blue-700 border-blue-200'
    },
    {
      label: 'Commercial · Renewal',
      premium: formatCurrency(clRenewalPremium),
      expected: formatCurrency(clRenewalExpected),
      link: '/accounting/all-leads?category=commercial&flow=renewal',
      badgeBg: 'bg-purple-50 text-purple-700 border-purple-200'
    }
  ]

  // --- SVG Charts Calculations ---
  // Chart 1: Expected vs Actual Commission Height Calculation
  const maxComm = Math.max(totalExpectedComm, totalActualComm, 100)
  const barExpectedHeight = (totalExpectedComm / maxComm) * 140
  const barActualHeight = (totalActualComm / maxComm) * 140

  // Chart 2: Reconciliation Status Circular dash calculations
  const totalPolicies = reconciledCount + discrepancyCount + unreconciledCount || 1
  const reconciledPct = (reconciledCount / totalPolicies) * 100
  const discrepancyPct = (discrepancyCount / totalPolicies) * 100
  const unreconciledPct = (unreconciledCount / totalPolicies) * 100

  const circ = 251.3 // Circumference for r = 40 (2 * pi * 40)
  const reconciledDash = (reconciledPct / 100) * circ
  const discrepancyDash = (discrepancyPct / 100) * circ
  const unreconciledDash = (unreconciledPct / 100) * circ

  const discrepancyOffset = -reconciledDash
  const unreconciledOffset = -(reconciledDash + discrepancyDash)

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight leading-tight">
            Financial Dashboard
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Real-time policy auditing, premium calculations, and commission matching.
          </p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Link href="/accounting/all-leads" className="w-full md:w-auto">
            <button className="w-full bg-[#2E5C85] hover:bg-[#2E5C85]/90 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition flex items-center justify-center gap-2 whitespace-nowrap text-xs">
              Manage Reconciliations
              <ArrowRight size={14} />
            </button>
          </Link>
        </div>
      </div>

      {/* ── KPI Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((stat, i) => (
          <div key={i} className="group">
            <div className={`
              relative bg-white rounded-2xl border border-gray-100 p-5
              shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden h-full flex flex-col gap-2 ${stat.glow}
            `}>
              {/* Top Accent line on hover */}
              <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${stat.accent}
                transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left rounded-t-2xl`}
              />

              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg transition-all duration-300 inline-flex ${stat.iconBg} ${stat.hoverIconBg} group-hover:scale-110`}>
                  {React.cloneElement(stat.icon as React.ReactElement<{ size: number }>, { size: 14 })}
                </div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 group-hover:text-gray-600 transition-colors">
                  {stat.label}
                </p>
              </div>

              <div>
                <p className="text-lg font-black text-gray-900 leading-tight">
                  {stat.value}
                </p>
                <p className="text-[9px] text-gray-400 font-bold mt-0.5">
                  {stat.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Line of Business Breakdown Cards ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest">
            Line of Business & Flow Breakdown
          </h2>
          <span className="text-[11px] text-gray-400 font-medium">Click card to view filtered policies</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {lineBreakdownKpis.map((card, i) => (
            <Link key={i} href={card.link} className="group">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all duration-200 h-full flex flex-col justify-between hover:border-[#2E5C85]/30">
                <div className="flex items-center justify-between pb-2 border-b border-gray-50">
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${card.badgeBg}`}>
                    {card.label}
                  </span>
                  <ArrowRight size={14} className="text-gray-300 group-hover:text-[#2E5C85] group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="pt-3 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Bound Premium</p>
                    <p className="text-sm font-black text-gray-900 mt-0.5">{card.premium}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Expected Comm</p>
                    <p className="text-sm font-black text-emerald-600 mt-0.5">{card.expected}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Financial Charts Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Expected vs Actual Commission */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <div className="p-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 text-white rounded-lg shadow-sm">
              <TrendingUp size={18} />
            </div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Commission Comparison</h2>
          </div>

          <div className="h-[200px] flex items-end justify-around pb-6 pt-4 relative">
            {/* Grid Lines */}
            <div className="absolute left-0 right-0 top-4 border-t border-gray-100" />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-gray-100" />
            <div className="absolute left-0 right-0 bottom-6 border-b border-gray-200" />

            {/* Expected Bar */}
            <div className="flex flex-col items-center gap-2 z-10 w-24">
              <span className="text-[10px] font-black text-gray-600 bg-gray-50 border border-gray-150 px-1.5 py-0.5 rounded">
                {formatCurrency(totalExpectedComm)}
              </span>
              <div 
                style={{ height: `${barExpectedHeight}px` }} 
                className="w-10 bg-gradient-to-t from-[#10B889]/80 to-[#10B889] rounded-t-lg shadow-sm group-hover:opacity-90 transition-all duration-500" 
              />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Expected</span>
            </div>

            {/* Actual Bar */}
            <div className="flex flex-col items-center gap-2 z-10 w-24">
              <span className="text-[10px] font-black text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded">
                {formatCurrency(totalActualComm)}
              </span>
              <div 
                style={{ height: `${barActualHeight}px` }} 
                className="w-10 bg-gradient-to-t from-purple-500 to-purple-600 rounded-t-lg shadow-sm group-hover:opacity-90 transition-all duration-500" 
              />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Collected</span>
            </div>
          </div>
        </div>

        {/* Chart 2: Reconciliation Status Distribution */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <div className="p-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 text-white rounded-lg shadow-sm">
              <PieChart size={18} />
            </div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Reconciliation Distribution</h2>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
            {/* SVG Donut Chart */}
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg width="140" height="140" viewBox="0 0 100 100" className="transform -rotate-90">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#F1F5F9" strokeWidth="12" />
                {/* Reconciled (Emerald) */}
                {reconciledCount > 0 && (
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#10B889" strokeWidth="12"
                    strokeDasharray={`${reconciledDash} ${circ}`} strokeDashoffset={0} strokeLinecap="round"
                  />
                )}
                {/* Discrepancy (Coral) */}
                {discrepancyCount > 0 && (
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#E07A5F" strokeWidth="12"
                    strokeDasharray={`${discrepancyDash} ${circ}`} strokeDashoffset={discrepancyOffset} strokeLinecap="round"
                  />
                )}
                {/* Unreconciled (Blue) */}
                {unreconciledCount > 0 && (
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#2E5C85" strokeWidth="12"
                    strokeDasharray={`${unreconciledDash} ${circ}`} strokeDashoffset={unreconciledOffset} strokeLinecap="round"
                  />
                )}
              </svg>
              {/* Inner details text */}
              <div className="absolute text-center">
                <p className="text-sm font-black text-gray-800 leading-none">{totalPolicies}</p>
                <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Policies</p>
              </div>
            </div>

            {/* Donut Legend */}
            <div className="space-y-2.5 w-full sm:max-w-[200px]">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#10B889]" />
                  <span className="font-bold text-gray-600">Reconciled</span>
                </div>
                <span className="font-black text-gray-800">{reconciledCount} ({reconciledPct.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#E07A5F]" />
                  <span className="font-bold text-gray-600">Discrepancies</span>
                </div>
                <span className="font-black text-gray-800">{discrepancyCount} ({discrepancyPct.toFixed(0)}%)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#2E5C85]" />
                  <span className="font-bold text-gray-600">Unreconciled</span>
                </div>
                <span className="font-black text-gray-800">{unreconciledCount} ({unreconciledPct.toFixed(0)}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Activity Section ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-150 text-gray-500 rounded-xl">
            <Activity size={18} />
          </div>
          <h2 className="text-lg font-black text-gray-800">Recent Financial Log activity</h2>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {!recentLogs || recentLogs.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">
              No recent audit transactions or reconciliations recorded.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentLogs.map((log) => {
                const operatorName = (Array.isArray(log.updater) 
                  ? log.updater[0]?.full_name 
                  : (log.updater as any)?.full_name) || 'System Operator'
                const clientName = (Array.isArray(log.lead) 
                  ? log.lead[0]?.client_name 
                  : (log.lead as any)?.client_name) || 'Deleted Lead'
                
                // Formulate log summary
                const details: string[] = []
                if (log.old_expected_commission !== log.new_expected_commission) {
                  details.push(`expected commission adjusted to ${formatCurrency(log.new_expected_commission)}`)
                }
                if (log.old_actual_commission !== log.new_actual_commission) {
                  details.push(`collected commission updated to ${formatCurrency(log.new_actual_commission)}`)
                }
                if (log.old_status !== log.new_status) {
                  details.push(`reconciliation status set to "${log.new_status}"`)
                }

                const actionSummary = details.length > 0 
                  ? details.join(', ') 
                  : 'modified reconciliation metadata'

                return (
                  <div key={log.id} className="p-4 sm:p-5 flex justify-between items-start gap-4 hover:bg-gray-50/50 transition">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                        <User size={14} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gray-800">
                          {operatorName}
                        </p>
                        <p className="text-xs text-gray-500 font-medium">
                          Updated <span className="font-bold text-gray-700">{clientName}</span>: {actionSummary}.
                        </p>
                        {log.notes && (
                          <p className="text-[11px] text-gray-400 italic bg-gray-50 px-2 py-1 rounded border border-gray-100/60 mt-1 inline-block">
                            "{log.notes}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex items-center gap-1.5 text-gray-400 font-semibold text-[10px]">
                      <Clock size={10} />
                      {new Date(log.created_at).toLocaleDateString()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
