'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Send, ExternalLink, ArrowLeft, Edit2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import UpdateStageModal from '@/components/pipeline/UpdateStageModal'
import EditClientModal from '@/components/leads/EditClientModal'
import EditHistoryModal from '@/components/pipeline/EditHistoryModal'
import DocumentViewer from '@/components/leads/DocumentViewer'
import EmailModal from '@/components/email/EmailModal'
import PageBackButton from '@/components/ui/PageBackButton'
import { FIELD_LABELS } from '@/lib/fieldLabels'
import { resolveStageHistoryFields } from '@/utils/stageFieldsConfig'
import { toast } from '@/lib/toast'
import Loading, { Spinner } from '@/components/ui/Loading'
import { formatCurrency } from '@/lib/currency'
import { formatPolicies } from '@/utils/formatPolicies'
import { canAccessInsuranceCategory } from '@/utils/authClient'

/* ── helpers ──────────────────────────────────────────────── */

/** "commercial_package" → "Commercial Package" */
function formatPolicyType(raw?: string | null) {
  if (!raw) return '—'
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Colour-coded badge for pipeline stage names or custom statuses */
function StageBadge({ stage, variant }: { stage?: string | null, variant?: string }) {
  if (!stage && !variant) return <span className="text-gray-400 text-sm">—</span>

  const map: Record<string, string> = {
    'New Lead': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    'Quoting in Progress': 'bg-yellow-50  text-yellow-700  border border-yellow-200',
    'Quote Has Been Emailed': 'bg-blue-50    text-blue-700    border border-blue-200',
    'Consent Letter Sent': 'bg-purple-50  text-purple-700  border border-purple-200',
    'Completed': 'bg-blue-100   text-blue-800    border border-blue-300',
    'Did Not Bind': 'bg-red-50     text-red-700     border border-red-200',
    // Custom variants for Leads Detail Page
    'COMPLETED': 'bg-blue-100 text-blue-800 border border-blue-300',
    'QUOTE_EMAILED': 'bg-blue-50 text-blue-700 border border-blue-200',
    'WAITING_FOR_DOCUMENTS': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    'ACCEPTED': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    'SUBMITTED': 'bg-blue-50 text-blue-700 border border-blue-200',
    'WAITING_FOR_SUBMISSION': 'bg-yellow-50 text-yellow-700 border border-yellow-200',
    'NOT_SENT': 'bg-red-50 text-red-700 border border-red-200',
  }

  const label = stage || variant || '—'
  const cls = map[variant || stage || ''] ?? 'bg-gray-100 text-gray-600 border border-gray-200'

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      {label}
    </span>
  )
}

/** Reusable KPI card – light border + teal left accent */
function KpiCard({
  icon,
  label,
  children,
  accent = 'from-gray-200 to-gray-300',
  glow = 'shadow-gray-200/50',
  iconBg = 'bg-gray-50 text-gray-400',
  hoverIconBg = 'group-hover/card:bg-gray-100 group-hover/card:text-gray-600'
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  accent?: string
  glow?: string
  iconBg?: string
  hoverIconBg?: string
}) {
  return (
    <div className={`
      relative bg-white rounded-2xl border border-gray-100 p-5
      shadow-sm hover:shadow-lg active:shadow-lg ${glow}
      hover:-translate-y-1 active:-translate-y-1
      hover:border-transparent active:border-transparent
      transition-all duration-300 overflow-hidden h-full flex flex-col gap-1.5 group/card
    `}>
      {/* Top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accent}
          transform scale-x-0 group-hover/card:scale-x-100 group-active/card:scale-x-100
          transition-transform duration-300 origin-left rounded-t-2xl`}
      />

      <div className="flex items-center gap-2">
        <div className={`
            p-2 rounded-lg ${iconBg} ${hoverIconBg}
            transition-all duration-300 inline-flex
            group-hover/card:scale-110 group-active/card:scale-110
        `}>
          {icon}
        </div>
        <p className="text-xs font-semibold text-gray-500 uppercase transition-colors">
          {label}
        </p>
      </div>
      <div className="pl-0.5 pt-1">{children}</div>
    </div>
  )
}

/* ── icons (inline SVG to keep zero extra deps) ─────────── */
const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)
const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
  </svg>
)
const IconFile = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
)
const IconZap = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)
const IconShield = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)
const IconDollar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

export default function LeadReviewPage() {
  /* ================= ROUTER PARAMS ================= */
  const params = useParams<{ id: string }>()
  const leadId = params?.id
  const router = useRouter()

  const handleBackToPipeline = () => {
    const fromInternalPipeline =
      typeof window !== 'undefined' &&
      document.referrer &&
      document.referrer.includes(window.location.host) &&
      (document.referrer.includes('/csr/pipeline') ||
       document.referrer.includes('/csr/renewals') ||
       document.referrer.includes('/csr/leads') ||
       document.referrer.includes('/csr'));

    if (fromInternalPipeline && window.history.length > 1) {
      router.back();
      return;
    }

    const isCommercial = lead?.insurence_category?.toLowerCase() === 'commercial';
    const isRenewal = lead?.policy_flow?.toLowerCase() === 'renewal';

    if (isRenewal) {
      router.push(isCommercial ? '/csr/renewals/commercial' : '/csr/renewals/personal');
    } else {
      router.push(isCommercial ? '/csr/pipeline/commercial' : '/csr/pipeline/personal');
    }
  };

  const searchParams = useSearchParams()
  const viewFocus = searchParams?.get('view')
  const emailSectionRef = useRef<HTMLDivElement>(null)

  const [lead, setLead] = useState<any>(null)
  const [form, setForm] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [insuranceCompaniesMap, setInsuranceCompaniesMap] = useState<Record<string, string>>({})
  const [editingHistoryItem, setEditingHistoryItem] = useState<any>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [completedMetadata, setCompletedMetadata] = useState<any>(null)

  const [isFocused, setIsFocused] = useState(false)

  /* ================= AUTO FOCUS ================= */
  useEffect(() => {
    if (viewFocus === 'focused' && !loading && emailSectionRef.current) {
      setIsFocused(true)
      setTimeout(() => {
        emailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)

      // Remove highlight after 5 seconds
      const timer = setTimeout(() => setIsFocused(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [loading, viewFocus])


  /* ================= LOAD LEAD + FORM ================= */
  useEffect(() => {
    if (!leadId) return

    const loadData = async () => {
      setLoading(true)
      setError(null)

      const [leadRes, formRes, historyRes, icRes] = await Promise.all([
        supabase
          .from('temp_leads_basics')
          .select(`
            *,
            lead_policies(policy_type),
            pipeline_stages!temp_leads_basics_stage_pipeline_fk (
              id,
              stage_name
            )
          `)
          .eq('id', leadId)
          .single(),
        supabase
          .from('temp_intake_forms')
          .select('*')
          .eq('lead_id', leadId)
          .eq('status', 'submitted')
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('lead_stage_history')
          .select('stage_metadata')
          .eq('lead_id', leadId)
          .eq('stage_name', 'Completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('insurance_companies')
          .select('id, name')
      ])

      if (leadRes.error || !leadRes.data) {
        setError('Lead not found')
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('id, role, insurance_access').eq('id', user.id).single()
        if (!canAccessInsuranceCategory(prof, leadRes.data.insurence_category)) {
          router.replace('/unauthorized')
          return
        }
        if (prof?.role === 'csr' && leadRes.data.assigned_csr !== user.id) {
          router.replace('/unauthorized')
          return
        }
      }

      if (formRes.data) {
        const res = await fetch(`/api/documents?intakeFormId=${formRes.data.id}`)
        const docs = await res.json()
        setDocuments(Array.isArray(docs) ? docs : [])
      }

      if (icRes.data) {
        const map: Record<string, string> = {}
        icRes.data.forEach((ic: any) => {
          map[ic.id] = ic.name
        })
        setInsuranceCompaniesMap(map)
      }

      setLead(leadRes.data)
      setForm(formRes.data || null)
      setCompletedMetadata(historyRes.data?.stage_metadata || null)
      setLoading(false)
    }

    loadData()
  }, [leadId])

  /* ================= REFRESH LEAD (background sync) ================= */
  const refreshLead = async () => {
    if (!leadId) return
    const [leadRes, historyRes] = await Promise.all([
      supabase
        .from('temp_leads_basics')
        .select(`
            *,
            lead_policies(policy_type),
            pipeline_stages!temp_leads_basics_stage_pipeline_fk (
            id,
            stage_name
          )
        `)
        .eq('id', leadId)
        .single(),
      supabase
        .from('lead_stage_history')
        .select('stage_metadata')
        .eq('lead_id', leadId)
        .eq('stage_name', 'Completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])
    if (leadRes.data) setLead(leadRes.data)
    if (historyRes.data) setCompletedMetadata(historyRes.data.stage_metadata || null)
  }

  /* ================= FETCH HISTORY ================= */
  const openHistoryModal = async () => {
    setHistoryLoading(true)
    setShowHistory(true)
    const [historyRes, icRes] = await Promise.all([
      supabase
        .from('lead_stage_history')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      supabase
        .from('insurance_companies')
        .select('id, name')
    ])

    if (!historyRes.error && historyRes.data) {
      setHistory(historyRes.data)
      const latestCompleted = historyRes.data.find((h: any) => h.stage_name === 'Completed')
      if (latestCompleted) {
        setCompletedMetadata(latestCompleted.stage_metadata || null)
      }
    }
    if (!icRes.error && icRes.data) {
      const map: Record<string, string> = {}
      icRes.data.forEach((ic: any) => {
        map[ic.id] = ic.name
      })
      setInsuranceCompaniesMap(map)
    }
    setHistoryLoading(false)
  }

  const refreshHistory = async () => {
    if (!leadId) return
    const [historyRes, icRes] = await Promise.all([
      supabase
        .from('lead_stage_history')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      supabase
        .from('insurance_companies')
        .select('id, name')
    ])

    if (!historyRes.error && historyRes.data) {
      setHistory(historyRes.data)
      const latestCompleted = historyRes.data.find((h: any) => h.stage_name === 'Completed')
      if (latestCompleted) {
        setCompletedMetadata(latestCompleted.stage_metadata || null)
      }
    }
    if (!icRes.error && icRes.data) {
      const map: Record<string, string> = {}
      icRes.data.forEach((ic: any) => {
        map[ic.id] = ic.name
      })
      setInsuranceCompaniesMap(map)
    }
  }


  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading message="Loading lead details..." />
      </div>
    )
  }

  if (error) {
    return <div className="p-10 text-red-600 font-medium">{error}</div>
  }

  const stageName = lead?.pipeline_stages?.stage_name || '';
  
  const status = stageName === 'Completed' || stageName === 'Did Not Bind'
    ? 'COMPLETED'
    : stageName === 'Quote Has Been Emailed'
      ? 'QUOTE_EMAILED'
      : stageName.toLowerCase().includes('waiting')
        ? 'WAITING_FOR_DOCUMENTS'
        : form
          ? 'SUBMITTED'
          : lead?.status === 'WAITING_FOR_SUBMISSION' || lead?.intake_form_sent
            ? 'WAITING_FOR_SUBMISSION'
            : 'NOT_SENT';

  const isUuid = (str: any) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
  const completedCarrier = completedMetadata?.carrier || (completedMetadata?.insurance_company_id && (insuranceCompaniesMap[completedMetadata.insurance_company_id] || (!isUuid(completedMetadata.insurance_company_id) ? completedMetadata.insurance_company_id : '—'))) || '—'
  const completedBoundPremium = completedMetadata?.bound_premium !== undefined && completedMetadata?.bound_premium !== null && completedMetadata?.bound_premium !== ''
    ? formatCurrency(completedMetadata.bound_premium)
    : '—'

  /* ================= UNIFIED UI ================= */
  return (
    <div className="p-4 sm:p-6 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-4">
        <PageBackButton onBack={handleBackToPipeline} className="mb-0" />
        <div className="bg-white rounded-2xl shadow-xl border overflow-hidden">

          {/* HEADER */}
          <div className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {lead?.client_name || 'Lead Details'}
              </h1>
              <p className="text-white/80 text-sm mt-1">
                {lead?.business_name ? `${lead.business_name} • Review lead information and pipeline status` : 'Review lead information and pipeline status'}
              </p>
            </div>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center justify-center gap-2 bg-[#D16B4B] hover:opacity-90 text-white px-4 py-2 rounded-xl transition-all text-sm font-bold shadow-md"
            >
              <Edit2 size={16} />
              Edit Client Info
            </button>
          </div>

          {/* CONTENT */}
          <div className="p-8">
            {/* 1. INFO GRID LAYOUT */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${lead?.insurence_category === 'commercial' ? 'lg:grid-cols-4 xl:grid-cols-7' : 'lg:grid-cols-3 xl:grid-cols-6'} gap-4 mb-10`}>
              <KpiCard 
                icon={<IconUser />} 
                label="Client Name"
                accent="from-[#10B889] to-[#0d9470]"
                glow="shadow-emerald-200/60"
                iconBg="bg-emerald-50 text-emerald-600"
                hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800 break-words">{lead?.client_name || '—'}</p>
              </KpiCard>
              {lead?.insurence_category === 'commercial' && (
                <KpiCard 
                  icon={<IconUser />} 
                  label="Business Name"
                  accent="from-[#10B889] to-[#0d9470]"
                  glow="shadow-emerald-200/60"
                  iconBg="bg-emerald-50 text-emerald-600"
                  hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
                >
                  <p className={`text-base font-bold break-words ${lead?.business_name ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                    {lead?.business_name || 'Not Provided'}
                  </p>
                </KpiCard>
              )}
              <KpiCard 
                icon={<IconMail />} 
                label="Email Address"
                accent="from-[#2E5C85] to-[#1e3f5e]"
                glow="shadow-blue-200/60"
                iconBg="bg-blue-50 text-blue-600"
                hoverIconBg="group-hover/card:bg-[#2E5C85] group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800 break-all">{lead?.email || '—'}</p>
              </KpiCard>
              <KpiCard 
                icon={<IconFile />} 
                label="Policies"
                accent="from-amber-500 to-orange-500"
                glow="shadow-amber-200/60"
                iconBg="bg-amber-50 text-amber-600"
                hoverIconBg="group-hover/card:bg-amber-500 group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800">{formatPolicies(lead?.lead_policies?.length > 0 ? lead.lead_policies.map((p: any) => p.policy_type) : lead?.policy_type)}</p>
              </KpiCard>
              <KpiCard 
                icon={<IconZap />} 
                label="Current Status"
                accent="from-purple-600 to-indigo-600"
                glow="shadow-purple-200/60"
                iconBg="bg-purple-50 text-purple-600"
                hoverIconBg="group-hover/card:bg-purple-600 group-hover/card:text-white"
              >
                <StageBadge stage={lead?.pipeline_stages?.stage_name} variant={status as any} />
              </KpiCard>
              <KpiCard 
                icon={<IconShield />} 
                label="Insurance Company"
                accent="from-[#2E5C85] to-[#10B889]"
                glow="shadow-emerald-200/60"
                iconBg="bg-teal-50 text-teal-600"
                hoverIconBg="group-hover/card:bg-teal-600 group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800 break-words">{completedCarrier}</p>
              </KpiCard>
              <KpiCard 
                icon={<IconDollar />} 
                label="Bound Premium"
                accent="from-emerald-500 to-teal-600"
                glow="shadow-emerald-200/60"
                iconBg="bg-emerald-50 text-emerald-600"
                hoverIconBg="group-hover/card:bg-emerald-600 group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800">{completedBoundPremium}</p>
              </KpiCard>
            </div>

            {/* 1.5 ADDITIONAL NOTES */}
            {lead?.notes && (
              <div className="mb-10 bg-slate-100 rounded-2xl border-2 border-slate-200 p-6 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-wider text-black mb-2 flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                  Additional Notes
                </h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
              </div>
            )}

            {/* 2. BUTTON GROUP ORGANIZATION */}
            <div className="mt-8 pt-8 border-t border-gray-100 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-start gap-3 w-full">
              <button
                onClick={openHistoryModal}
                className="px-5 py-2.5 bg-brand-dark text-white hover:bg-brand-dark/90 rounded-lg shadow-sm transition flex items-center justify-center gap-2 font-bold whitespace-nowrap"
              >
                View History
              </button>
              <button
                onClick={() => {
                  if (!lead.pipeline_id) {
                    toast('Pipeline not assigned to this lead', 'warning')
                    return
                  }
                  setShowUpdateModal(true)
                }}
                className="px-5 py-2.5 bg-[#2E5C85] hover:bg-[#234b6e] text-white rounded-lg shadow-sm transition flex items-center justify-center gap-2 font-bold whitespace-nowrap"
              >
                Update Status
              </button>

              {lead.insurence_category && lead.insurence_category.toLowerCase() === 'personal' && (
                <Link
                  href={`/csr/pipeline/personal?stage=${encodeURIComponent(lead.current_stage || lead.pipeline_stages?.stage_name || 'New Lead')}`}
                  className="px-5 py-2.5 bg-rose-500 text-white hover:bg-rose-600 hover:text-white rounded-lg shadow-sm transition flex items-center justify-center gap-2 font-bold whitespace-nowrap"
                >
                  <ExternalLink size={16} />
                  View in Pipeline
                </Link>
              )}
              <button
                onClick={() => setShowEmailModal(true)}
                className={`px-5 py-2.5 font-bold rounded-lg shadow-sm transition flex items-center justify-center gap-2 whitespace-nowrap ${isFocused ? 'bg-blue-600 text-white hover:bg-blue-700 ring-4 ring-blue-600/30' : 'bg-[#10B889] hover:bg-[#0e9e75] text-white'}`}
              >
                <Send size={16} />
                Send Email
              </button>
            </div>

            {/* 3. SUCCESS MESSAGE (PHASE STATUS) */}
            <div className="mt-6">
              {(() => {
                if (status === 'COMPLETED') {
                  return (
                    <div className="flex items-center gap-3 px-5 py-4 bg-blue-100 text-blue-800 rounded-lg border border-blue-200 text-sm font-bold w-full">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Policy completed successfully
                    </div>
                  );
                } else if (status === 'QUOTE_EMAILED') {
                  return (
                    <div className="flex items-center gap-3 px-5 py-4 bg-blue-50 text-blue-700 rounded-lg border border-blue-200 text-sm font-bold w-full">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Quote has been emailed to client
                    </div>
                  );
                } else if (status === 'WAITING_FOR_DOCUMENTS') {
                  return (
                    <div className="flex items-center gap-3 px-5 py-4 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-200 text-sm font-bold w-full">
                      <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse flex-shrink-0" />
                      Waiting for client documents
                    </div>
                  );
                } else if (status === 'SUBMITTED') {
                  return (
                    <div className="flex items-center gap-3 px-5 py-4 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 text-sm font-bold w-full">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Client has submitted the intake form
                    </div>
                  );
                } else if (status === 'WAITING_FOR_SUBMISSION') {
                  return (
                    <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-sm font-bold w-full">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Intake form email sent to client
                    </div>
                  );
                } else {
                  return (
                    <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 text-slate-700 rounded-lg border border-slate-200 text-sm font-bold w-full">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Intake form not sent yet
                    </div>
                  );
                }
              })()}
            </div>

            {/* 4. "VIEW FORM" BOTTOM ACTIONS */}
            {form && (
              <div className="mt-8 pt-8 border-t border-gray-100 flex flex-col gap-4">
                <button
                  onClick={() => setShowFormModal(true)}
                  className="w-full flex items-center justify-center gap-3 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 py-4 rounded-xl font-bold transition-all shadow-sm"
                >
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  View Form
                </button>
              </div>
            )}
          </div>
        </div>

        {/* UPDATE STAGE MODAL */}
        {showUpdateModal && (
          <UpdateStageModal
            leadId={lead?.id}
            pipelineId={lead?.pipeline_id}
            currentStageId={lead?.current_stage_id}
            onClose={() => setShowUpdateModal(false)}
            onSuccess={(newStageId?: string, newStageName?: string) => {
              // 1. Optimistic update — instant UI response
              if (newStageId && newStageName) {
                setLead((prev: any) => ({
                  ...prev,
                  current_stage_id: newStageId,
                  pipeline_stages: {
                    ...(prev?.pipeline_stages ?? {}),
                    id: newStageId,
                    stage_name: newStageName,
                  },
                }))
              }
              // 2. Background sync to confirm truth from DB
              refreshLead()
            }}
          />
        )}

        {/* VIEW SUBMITTED FORM MODAL */}
        {showFormModal && (
          <div className="relative z-[100]" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-start justify-center p-4 sm:p-6">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto relative">
              <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-[#10B889] to-[#2E5C85] sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-bold text-white">Submitted Intake Form</h2>
                  <p className="text-sm text-white/80 font-medium">Submitted on {new Date(form.submitted_at).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setShowFormModal(false)}
                  className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-full transition-all duration-200 shadow-sm"
                  title="Close"
                >
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
                {/* STRUCTURED FORM DATA RENDERER */}
                {form.form_data && Object.entries(form.form_data).map(([sectionKey, sectionData]) => {
                  const formatLabel = (key: string) => FIELD_LABELS[key] || key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

                  // Skip empty sections completely
                  if (!sectionData || (typeof sectionData === 'object' && Object.keys(sectionData).length === 0)) return null;
                  if (Array.isArray(sectionData) && sectionData.length === 0) return null;

                  return (
                    <div key={sectionKey} className="mb-6 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-emerald-50/50 px-5 py-3 border-b border-emerald-100 flex items-center justify-between">
                        <h3 className="font-bold text-emerald-700">{formatLabel(sectionKey)}</h3>
                      </div>
                      <div className="p-5">
                        {Array.isArray(sectionData) ? (
                          <div className="space-y-4">
                            {sectionData.map((item, idx) => (
                              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                                  {Object.entries(item).map(([k, v]) => (
                                    <div key={k}>
                                      <span className="text-slate-500 block text-xs font-medium mb-1 uppercase tracking-wider">{formatLabel(k)}</span>
                                      <span className="font-medium text-slate-800">{v === null || v === undefined || v === '' ? '-' : String(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 text-sm">
                            {Object.entries(sectionData as object).map(([k, v]) => (
                              <div key={k}>
                                <span className="text-slate-500 block text-xs font-medium mb-1 uppercase tracking-wider">{formatLabel(k)}</span>
                                <span className="font-medium text-slate-800">{v === null || v === undefined || v === '' ? '-' : String(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* UPLOADED DOCUMENTS RENDERER */}
                <DocumentViewer documents={documents} />
              </div>
            </div>
          </div>
        </div>
        </div>
        )}
        {/* VIEW HISTORY MODAL */}
        {showHistory && (
          <div className="relative z-[100]" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-start justify-center p-4 sm:p-6">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto relative">
              <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-[#10B889] to-[#2E5C85] sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-bold text-white">Stage History</h2>
                  <p className="text-sm text-white">Previous updates for this lead</p>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-full transition-all duration-200 shadow-sm"
                  title="Close"
                >
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-4">
                {historyLoading ? (
                  <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
                    <Spinner size={32} />
                    <p className="font-medium">Loading history...</p>
                  </div>
                ) : history.length === 0 ? (
                  <div className="py-12 text-center text-emerald-500 bg-white rounded-xl border border-dashed border-slate-300">
                    No stage history found for this lead.
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="bg-emerald-50/50 px-5 py-3 border-b border-emerald-100 flex items-center justify-between">
                        <h3 className="font-bold text-emerald-700">{item.stage_name}</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm">
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                          <button
                            onClick={() => {
                              setShowHistory(false)
                              setEditingHistoryItem(item)
                            }}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-100"
                            title="Edit History"
                          >
                            <Edit2 size={16} />
                          </button>
                        </div>
                      </div>
                      {item.stage_metadata && Object.keys(item.stage_metadata).length > 0 ? (
                        <div className="p-5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                            {resolveStageHistoryFields(
                              item.stage_name,
                              item.stage_metadata,
                              lead?.pipeline_stages?.pipeline_id ? (
                                lead.insurence_category?.toLowerCase().includes('commercial') 
                                  ? (lead.policy_flow?.toLowerCase() === 'renewal' ? 'CommercialRenewal' : 'Commercial')
                                  : (lead.policy_flow?.toLowerCase() === 'renewal' ? 'PersonalRenewal' : 'PersonalNewBusiness')
                              ) : 'PersonalNewBusiness',
                              insuranceCompaniesMap
                            ).map((field) => (
                              <div key={field.key}>
                                <span className="text-slate-500 block text-xs font-medium mb-1 uppercase tracking-wider">{field.label}</span>
                                <span className="font-medium text-slate-800">{field.displayValue}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 text-sm text-slate-400 italic text-center">
                          No additional metadata recorded for this stage
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
        )}

        {/* EDIT HISTORY MODAL */}
        {editingHistoryItem && (
          <EditHistoryModal
            historyItem={editingHistoryItem}
            pipelineType={
              // Best guess for pipeline type based on current lead info
              lead?.pipeline_stages?.pipeline_id ? (
                lead.insurence_category?.toLowerCase().includes('commercial') 
                  ? (lead.policy_flow?.toLowerCase() === 'renewal' ? 'CommercialRenewal' : 'Commercial')
                  : (lead.policy_flow?.toLowerCase() === 'renewal' ? 'PersonalRenewal' : 'PersonalNewBusiness')
              ) : 'PersonalNewBusiness'
            }
            onClose={() => {
              setEditingHistoryItem(null)
              setShowHistory(true)
            }}
            onSuccess={() => {
              setEditingHistoryItem(null)
              refreshHistory().then(() => {
                refreshLead()
                setShowHistory(true)
              })
            }}
          />
        )}

        {/* EDIT CLIENT MODAL */}
        {showEditModal && (
          <EditClientModal
            lead={lead}
            onClose={() => setShowEditModal(false)}
            onSuccess={(updated) => {
              // 1. Optimistic update — KPI cards reflect new data instantly
              if (updated) {
                setLead((prev: any) => ({
                  ...prev,
                  client_name: updated.client_name,
                  email: updated.email,
                  phone: updated.phone,
                  business_name: updated.business_name,
                  ...(updated.selectedPolicies ? {
                    policy_type: updated.selectedPolicies[0],
                    lead_policies: updated.selectedPolicies.map((p: string) => ({ policy_type: p }))
                  } : {})
                }))
              }
              // 2. Background sync to confirm DB truth
              refreshLead()
            }}
          />
        )}

        {/* EMAIL MODAL */}
        <EmailModal
          leadId={lead?.id}
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
        />
      </div>
    </div>
  )
}
