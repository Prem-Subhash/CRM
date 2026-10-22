import React from "react";
import { createServer } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Users,
  FileText,
  BarChart2,
  Briefcase,
  DollarSign,
  Activity,
  Settings,
  ListTodo,
  ArrowRight,
  Shield,
  Building2,
  TrendingUp,
  Clock,
  CheckCircle2,
  Home,
  AlertCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { getActivePolicy } from "@/utils/activePolicyHelper";

export default async function SuperAdminDashboard() {
  const supabase = await createServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // 1. Fetch profiles for headcount breakdown
  const { data: profilesList } = await supabase
    .from("profiles")
    .select("id, role, portal_access");

  // 2. Fetch active pipelines count
  const { count: activePipelines } = await supabase
    .from("pipelines")
    .select("*", { count: "exact", head: true });

  // 3. Fetch Insurance leads metrics and recent activity
  const { data: leads } = await supabase
    .from("temp_leads_basics")
    .select(
      `
            id,
            client_name,
            created_at,
            total_premium,
            new_premium,
            stage_metadata,
            current_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk (
                stage_name
            )
        `,
    )
    .order("created_at", { ascending: false });

  // 4. Fetch Mortgage loans metrics and recent activity
  const { data: mortgageLoans } = await supabase
    .from("mortgage_loans")
    .select(
      "id, client_name, stage, loan_amount, expected_commission, created_at, pipeline_type",
    )
    .order("created_at", { ascending: false });

  // Compute Headcounts
  const totalUsers = profilesList?.length || 0;
  const insuranceUsersCount =
    profilesList?.filter(
      (p) =>
        p.role === "csr" ||
        p.role === "admin" ||
        p.role === "accounting" ||
        p.portal_access?.includes("insurance"),
    ).length || 0;
  const mortgageUsersCount =
    profilesList?.filter(
      (p) => p.role === "mortgage" || p.portal_access?.includes("mortgage"),
    ).length || 0;
  const lendingUsersCount =
    profilesList?.filter(
      (p) =>
        p.role === "lending" ||
        p.role === "accurate_lending" ||
        p.portal_access?.includes("lending") ||
        p.portal_access?.includes("accurate_lending"),
    ).length || 0;

  // Compute Insurance Totals
  let totalBoundPremium = 0;
  let totalQuotesSent = 0;
  leads?.forEach((lead) => {
    const active = getActivePolicy(lead);
    // @ts-ignore
    const stageName = lead.current_stage?.stage_name || "";
    if (stageName.includes("Completed") || stageName.includes("Bound")) {
      const meta = lead.stage_metadata as any;
      if (active.activePremium) {
        totalBoundPremium += Number(active.activePremium) || 0;
      } else if (meta?.bound_premium) {
        totalBoundPremium += Number(meta.bound_premium) || 0;
      } else if (lead.total_premium) {
        totalBoundPremium += Number(lead.total_premium) || 0;
      }
    }
    if (stageName.includes("Quote") || stageName.includes("Quoted")) {
      totalQuotesSent++;
    }
  });

  // Compute Mortgage Totals
  const totalMortgageLoans = mortgageLoans?.length || 0;
  const totalMortgageCommission =
    mortgageLoans?.reduce(
      (sum, l) => sum + (Number(l.expected_commission) || 0),
      0,
    ) || 0;
  const totalMortgageVolume =
    mortgageLoans?.reduce((sum, l) => sum + (Number(l.loan_amount) || 0), 0) ||
    0;

  // Combined Enterprise Revenue
  const combinedRevenue = totalBoundPremium + totalMortgageCommission;

  // Global KPI Cards
  const stats = [
    {
      label: "Total users",
      value: totalUsers,
      icon: <Users size={22} />,
      href: "/superadmin/users",
      description: `${insuranceUsersCount} Ins · ${mortgageUsersCount} Mtg · ${lendingUsersCount} Lend`,
      accent: "from-[#10B889] to-[#0d9470]",
      glow: "shadow-emerald-200/60",
      iconBg: "bg-emerald-50 text-emerald-600",
      hoverIconBg: "group-hover:bg-[#10B889] group-hover:text-white",
    },
    {
      label: "Insurance Leads",
      value: leads?.length || 0,
      icon: <FileText size={22} />,
      href: "/admin/leads",
      description: `${totalQuotesSent} active quotes in progress`,
      accent: "from-[#2E5C85] to-[#1e3f5e]",
      glow: "shadow-blue-200/60",
      iconBg: "bg-blue-50 text-blue-600",
      hoverIconBg: "group-hover:bg-[#2E5C85] group-hover:text-white",
    },
    {
      label: "Mortgage Loans",
      value: totalMortgageLoans,
      icon: <Home size={22} />,
      href: "/mortgage",
      description: `${formatCurrency(totalMortgageVolume)} total loan volume`,
      accent: "from-amber-500 to-orange-500",
      glow: "shadow-amber-200/60",
      iconBg: "bg-amber-50 text-amber-600",
      hoverIconBg: "group-hover:bg-amber-500 group-hover:text-white",
    },
    {
      label: "Combined Revenue",
      value: formatCurrency(combinedRevenue),
      icon: <DollarSign size={22} />,
      href: "/accounting",
      description: `Ins Premium + Mtg Commission`,
      accent: "from-purple-600 to-indigo-600",
      glow: "shadow-purple-200/60",
      iconBg: "bg-purple-50 text-purple-600",
      hoverIconBg: "group-hover:bg-purple-600 group-hover:text-white",
    },
    {
      label: "Active Pipelines",
      value: activePipelines || 0,
      icon: <Briefcase size={22} />,
      href: "/superadmin/pipelines",
      description: "Configured enterprise stages",
      accent: "from-rose-500 to-pink-600",
      glow: "shadow-rose-200/60",
      iconBg: "bg-rose-50 text-rose-500",
      hoverIconBg: "group-hover:bg-rose-500 group-hover:text-white",
    },
  ];

  // Combined Chronological Recent Activity
  const combinedActivity = [
    ...(leads?.slice(0, 15).map((l) => ({
      id: `ins-${l.id}`,
      type: "INSURANCE" as const,
      name: l.client_name || "Unnamed Lead",
      // @ts-ignore
      stage: l.current_stage?.stage_name || "New Lead",
      amount:
        l.total_premium || l.new_premium
          ? formatCurrency(Number(l.total_premium || l.new_premium))
          : "Pending Quote",
      created_at: l.created_at,
      href: `/admin/leads`,
    })) || []),
    ...(mortgageLoans?.slice(0, 15).map((m) => ({
      id: `mtg-${m.id}`,
      type: "MORTGAGE" as const,
      name: m.client_name || "Unnamed Borrower",
      stage: m.stage || m.pipeline_type || "NEW_LOAN",
      amount: m.loan_amount
        ? formatCurrency(Number(m.loan_amount))
        : m.expected_commission
          ? formatCurrency(Number(m.expected_commission))
          : "Pending Review",
      created_at: m.created_at,
      href: `/mortgage/pipeline/${m.pipeline_type === "PRE_APPROVAL" || m.stage === "PREAPPROVAL_LOAN" ? "pre-approval" : "new-loan"}`,
    })) || []),
  ]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, 12);

  const quickLinks = [
    {
      label: "Commissions",
      href: "/superadmin/commissions",
      icon: <DollarSign size={18} />,
      description: "Manage splits & carriers",
      accent: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-50 text-blue-600",
      hoverIcon: "group-hover:bg-blue-500 group-hover:text-white",
    },
    {
      label: "System Settings",
      href: "/superadmin/system-settings",
      icon: <Settings size={18} />,
      description: "Global config & defaults",
      accent: "from-[#10B889] to-[#0d9470]",
      iconBg: "bg-emerald-50 text-emerald-600",
      hoverIcon: "group-hover:bg-[#10B889] group-hover:text-white",
    },
    {
      label: "Audit Logs",
      href: "/superadmin/audit-logs",
      icon: <Activity size={18} />,
      description: "System activity history",
      accent: "from-[#2E5C85] to-[#1e3f5e]",
      iconBg: "bg-blue-50 text-blue-600",
      hoverIcon: "group-hover:bg-[#2E5C85] group-hover:text-white",
    },
    {
      label: "Email Templates",
      href: "/superadmin/email-templates",
      icon: <FileText size={18} />,
      description: "Manage outbound emails",
      accent: "from-amber-500 to-orange-500",
      iconBg: "bg-amber-50 text-amber-600",
      hoverIcon: "group-hover:bg-amber-500 group-hover:text-white",
    },
    {
      label: "Form Builder",
      href: "/superadmin/forms",
      icon: <ListTodo size={18} />,
      description: "Build client intake forms",
      accent: "from-purple-600 to-indigo-600",
      iconBg: "bg-purple-50 text-purple-600",
      hoverIcon: "group-hover:bg-purple-600 group-hover:text-white",
    },
    {
      label: "User Management",
      href: "/superadmin/users",
      icon: <Shield size={18} />,
      description: "Enterprise roles & access",
      accent: "from-rose-500 to-pink-600",
      iconBg: "bg-rose-50 text-rose-500",
      hoverIcon: "group-hover:bg-rose-500 group-hover:text-white",
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-10 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-emerald-500/5 via-blue-500/5 to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#10B889] mb-1">
            <Building2 size={14} />
            <span>Executive Command Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Unified Super Admin Dashboard
          </h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1 max-w-3xl">
            Comprehensive real-time oversight across Innovative Insurance,
            Moonstar Mortgage, and Accurate Lending.
          </p>
        </div>
      </div>

      {/* ── Global KPI Cards ── */}
      <div>
        <h2 className="text-base font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-[#10B889]" />
          <span>Global Enterprise Performance</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {stats.map((stat, i) => (
            <Link key={i} href={stat.href} className="group">
              <div
                className={`
                                relative bg-white rounded-2xl border border-gray-100 p-5
                                shadow-sm hover:shadow-lg active:shadow-lg ${stat.glow}
                                hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer h-full flex flex-col gap-1.5
                            `}
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${stat.accent}
                                    transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left rounded-t-2xl`}
                />
                <div className="flex items-center gap-2">
                  <div
                    className={`p-2 rounded-lg ${stat.iconBg} ${stat.hoverIconBg} transition-all duration-300 inline-flex group-hover:scale-110`}
                  >
                    {React.cloneElement(
                      stat.icon as React.ReactElement<{ size: number }>,
                      { size: 14 },
                    )}
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-wider leading-none text-gray-500 group-hover:text-gray-700 transition-colors">
                    {stat.label}
                  </p>
                </div>
                <p className="text-[22px] font-black text-gray-900 leading-tight mt-1">
                  {stat.value}
                </p>
                <p className="text-[10px] text-gray-400 font-bold leading-tight">
                  {stat.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Company Comparison Section ── */}
      <div>
        <h2 className="text-base font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Building2 size={18} className="text-blue-600" />
          <span>Company Comparison Summary</span>
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Innovative Insurance */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between hover:border-emerald-500/50 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  Innovative Insurance
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {insuranceUsersCount} Staff
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">
                Property & Casualty CRM
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-slate-500">Total Active Leads</span>
                  <span className="font-bold text-slate-800">
                    {leads?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-slate-500">Quotes in Progress</span>
                  <span className="font-bold text-slate-800">
                    {totalQuotesSent}
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-500">Bound Premium Volume</span>
                  <span className="font-bold text-emerald-600">
                    {formatCurrency(totalBoundPremium)}
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/superadmin/insurance/leads"
              className="mt-6 w-full py-2.5 px-4 bg-emerald-600 text-white font-bold rounded-xl text-center text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            >
              <span>Open Insurance Portal</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Moonstar Mortgage */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between hover:border-[#2651CB] transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-100 text-[#2651CB]">
                  Moonstar Mortgage
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {mortgageUsersCount} Staff
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">
                Residential Lending Portal
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-slate-500">Total Applications</span>
                  <span className="font-bold text-slate-800">
                    {totalMortgageLoans}
                  </span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-slate-500">Total Loan Volume</span>
                  <span className="font-bold text-slate-800">
                    {formatCurrency(totalMortgageVolume)}
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-500">Projected Commission</span>
                  <span className="font-bold text-amber-600">
                    {formatCurrency(totalMortgageCommission)}
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/superadmin/mortgage/applications"
              className="mt-6 w-full py-2.5 px-4 bg-[#2651CB] hover:bg-[#2651CB] hover:text-white text-white font-bold rounded-xl text-center text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            >
              <span>Open Mortgage Portal</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {/* Accurate Lending (Placeholder) */}
          <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm flex flex-col justify-between hover:border-[#791D1E] transition-all relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#791D1E] text-white flex items-center gap-1">
                  <span>Accurate Lending</span>
                </span>
                <span className="text-xs font-bold text-[#791D1E] uppercase"></span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">
                Commercial Finance Portal
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-slate-500">
                    Commercial Pipeline (Preview)
                  </span>
                  <span className="font-bold text-slate-800">14 Inquiries</span>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <span className="text-slate-500">Term Sheets Received</span>
                  <span className="font-bold text-slate-800">
                    5 ($6.4M Vol)
                  </span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-slate-500">Closing in Process</span>
                  <span className="font-bold text-purple-600">3 Deals</span>
                </div>
              </div>
            </div>
            <Link
              href="/lending"
              className="mt-6 w-full py-2.5 px-4 bg-[#791D1E] text-white font-bold rounded-xl text-center text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            >
              <span>Open Accurate Lending</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Recent Activity Feed (Insurance + Mortgage) ── */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-slate-50/70 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Clock size={18} className="text-blue-600" />
              <span>Unified Enterprise Recent Activity</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological feed combining latest Insurance leads and Mortgage
              loan updates
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-slate-500 text-xs uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Company</th>
                <th className="px-6 py-3.5 font-semibold">Client / Borrower</th>
                <th className="px-6 py-3.5 font-semibold">Current Stage</th>
                <th className="px-6 py-3.5 font-semibold">Amount / Premium</th>
                <th className="px-6 py-3.5 font-semibold">Created Date</th>
                <th className="px-6 py-3.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {combinedActivity.length > 0 ? (
                combinedActivity.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      {item.type === "INSURANCE" ? (
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 inline-block">
                          Insurance
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 inline-block">
                          Mortgage
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {item.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-600 font-medium">
                        {item.stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {item.amount}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(item.created_at).toLocaleDateString()}{" "}
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={item.href}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wide"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-8 text-center text-slate-400 italic"
                  >
                    No recent enterprise activity recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gray-100 text-gray-500 rounded-lg">
            <Activity size={16} />
          </div>
          <h2 className="text-lg font-bold text-gray-800">
            Executive Quick Actions
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {quickLinks.map((link, i) => (
            <Link key={i} href={link.href} className="group">
              <div
                className={`
                                relative bg-white rounded-2xl border border-gray-100 p-5
                                shadow-sm hover:shadow-md active:shadow-md
                                hover:-translate-y-0.5 transition-all duration-300 overflow-hidden cursor-pointer h-full
                            `}
              >
                <div
                  className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${link.accent}
                                    transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left rounded-t-2xl`}
                />
                <div
                  className={`p-2.5 rounded-xl ${link.iconBg} ${link.hoverIcon} transition-all duration-300 inline-flex mb-3 group-hover:scale-110`}
                >
                  {link.icon}
                </div>
                <p className="text-sm font-bold text-gray-800 group-hover:text-gray-900 transition-colors">
                  {link.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">
                  {link.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
