'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import UpdateStageModal from '@/components/pipeline/UpdateStageModal'
import { ArrowLeft } from 'lucide-react'
import { formatPolicies } from '@/utils/formatPolicies'
import PageBackButton from '@/components/ui/PageBackButton'
import { canAccessInsuranceCategory } from '@/utils/authClient'


/* ── helpers ──────────────────────────────────────────────── */

/** "commercial_package" → "Commercial Package" */
function formatPolicyType(raw?: string | null) {
  if (!raw) return '—'
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Colour-coded badge for pipeline stage names */
function StageBadge({ stage }: { stage?: string | null }) {
  if (!stage) return <span className="text-gray-400 text-sm">—</span>

  const map: Record<string, string> = {
    'New Lead':                'bg-emerald-50 text-emerald-700 border border-emerald-200',
    'Quoting in Progress':     'bg-yellow-50  text-yellow-700  border border-yellow-200',
    'Quote Has Been Emailed':  'bg-blue-50    text-blue-700    border border-blue-200',
    'Consent Letter Sent':     'bg-purple-50  text-purple-700  border border-purple-200',
    'Completed':               'bg-blue-100   text-blue-800    border border-blue-300',
    'Did Not Bind':            'bg-red-50     text-red-700     border border-red-200',
  }
  const cls = map[stage] ?? 'bg-gray-100 text-gray-600 border border-gray-200'
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      {stage}
    </span>
  )
}

/** Reusable KPI card – light border + teal left accent */
function KpiCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 p-4 bg-white border border-gray-200 border-l-4 border-l-[#10B889] rounded-xl shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center gap-1.5 text-gray-400">
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-widest leading-none">{label}</p>
      </div>
      <div className="pl-0.5">{children}</div>
    </div>
  )
}

/* ── icons (inline SVG to keep zero extra deps) ─────────── */
const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const IconMail = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
)
const IconFile = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>
)
const IconZap = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
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

  /* ================= STATE ================= */
  const [lead, setLead] = useState<any>(null)
  const [form, setForm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  /* ================= LOAD LEAD + FORM ================= */
  useEffect(() => {
    if (!leadId) return

    const loadData = async () => {
      setLoading(true)
      setError(null)

      const { data: leadData, error: leadError } = await supabase
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
        .single()

      if (leadError || !leadData) {
        setError('Lead not found')
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prof } = await supabase.from('profiles').select('id, role, insurance_access').eq('id', user.id).single()
        if (!canAccessInsuranceCategory(prof, leadData.insurence_category)) {
          router.replace('/unauthorized')
          return
        }
        if (prof?.role === 'csr' && leadData.assigned_csr !== user.id) {
          router.replace('/unauthorized')
          return
        }
      }

      const { data: formData } = await supabase
        .from('temp_intake_forms')
        .select('*')
        .eq('lead_id', leadId)
        .eq('status', 'completed')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setLead(leadData)
      setForm(formData || null)
      setLoading(false)
    }

    loadData()
  }, [leadId])

  /* ================= ACCEPT LEAD ================= */
  const handleAccept = async () => {
    if (!lead || !form) return

    setAccepting(true)
    setError(null)

    try {
      const { data: existingClient } = await supabase
        .from('clients')
        .select('id')
        .eq('email', lead.email)
        .maybeSingle()

      let clientId = existingClient?.id

      if (!clientId) {
        const { data: client, error: clientError } = await supabase
          .from('clients')
          .insert({
            phone: lead.phone,
            email: lead.email,
            assigned_csr: lead.assigned_csr,
          })
          .select()
          .single()

        if (clientError || !client) {
          throw new Error('Failed to create client')
        }

        clientId = client.id
      }

      await supabase.from('client_insurance_details').insert({
        client_id: clientId,
        insurance_category: lead.insurence_category,
        policy_type: lead.policy_type,
        full_data: form.form_data,
        verified_by: lead.assigned_csr,
      })

      await supabase
        .from('temp_intake_forms')
        .update({
          status: 'reviewed',
          reviewed_by: lead.assigned_csr,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', form.id)

      router.push('/csr')
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setAccepting(false)
    }
  }

  /* ================= UI STATES ================= */
  if (loading) {
    return <div className="p-10 text-center text-gray-500">Loading lead details...</div>
  }

  if (error) {
    return <div className="p-10 text-red-600 font-medium">{error}</div>
  }

  /* ================= NO FORM SUBMITTED ================= */
  if (!form) {
    return (
      <div className="max-w-4xl mx-auto p-10 space-y-4">
        <PageBackButton onBack={handleBackToPipeline} className="mb-0" />
        <div className="bg-white rounded-2xl shadow-xl border overflow-hidden">

          {/* HEADER */}
          <div className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-8 py-6">
            <h1 className="text-2xl font-bold text-white">Lead Details</h1>
            <p className="text-white/80 text-sm mt-1">
              Review lead information and pipeline status
            </p>
          </div>

          {/* CONTENT */}
          <div className="p-8 space-y-8">

            {/* DETAILS */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${lead.insurence_category === 'commercial' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
              <KpiCard icon={<IconUser />} label="Client Name">
                <p className="text-base font-bold text-gray-800 break-words">{lead.client_name || '—'}</p>
              </KpiCard>
              {lead.insurence_category === 'commercial' && (
                <KpiCard icon={<IconUser />} label="Business Name">
                  <p className={`text-base font-bold break-words ${lead.business_name ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                    {lead.business_name || 'Not Provided'}
                  </p>
                </KpiCard>
              )}
              <KpiCard icon={<IconMail />} label="Email Address">
                <p className="text-base font-bold text-gray-800 break-all">{lead.email || '—'}</p>
              </KpiCard>
              <KpiCard icon={<IconFile />} label="Policies">
                <p className="text-base font-bold text-gray-800">{formatPolicyType(lead.policy_type)}</p>
              </KpiCard>
              <KpiCard icon={<IconZap />} label="Current Status">
                <StageBadge stage={lead.pipeline_stages?.stage_name} />
              </KpiCard>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    if (!lead.pipeline_id) {
                      alert('Pipeline not assigned to this lead')
                      return
                    }
                    setShowUpdateModal(true)
                  }}
                  className="px-6 py-2.5 bg-[#2E5C85] hover:bg-[#234b6e] text-white rounded-lg shadow transition font-medium whitespace-nowrap"
                >
                  Update Status
                </button>

              </div>
            </div>

          </div>
        </div>

        {showUpdateModal && (
          <UpdateStageModal
            leadId={lead.id}
            pipelineId={lead.pipeline_id}
            onClose={() => setShowUpdateModal(false)}
            onSuccess={() => router.refresh()}
          />
        )}
      </div>
    )
  }

  /* ================= FORM SUBMITTED ================= */
  return (
    <div className="max-w-4xl mx-auto p-10 space-y-4">
      <PageBackButton onBack={handleBackToPipeline} className="mb-0" />

      <div className="bg-white rounded-2xl shadow-xl border overflow-hidden">
        <div className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-8 py-6">
          <h1 className="text-2xl font-bold text-white">Review Client Intake</h1>
          <p className="text-white/80 text-sm mt-1">
            Verify submitted information before accepting the lead
          </p>
        </div>

        <div className="p-8 space-y-6">

          <div className={`grid grid-cols-1 ${lead.insurence_category === 'commercial' ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
            <KpiCard icon={<IconUser />} label="Client Name">
              <p className="text-base font-bold text-gray-800 break-words">{lead.client_name || '—'}</p>
            </KpiCard>
            {lead.insurence_category === 'commercial' && (
              <KpiCard icon={<IconUser />} label="Business Name">
                <p className={`text-base font-bold break-words ${lead.business_name ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                  {lead.business_name || 'Not Provided'}
                </p>
              </KpiCard>
            )}
            <KpiCard icon={<IconMail />} label="Email Address">
              <p className="text-base font-bold text-gray-800 break-all">{lead.email || '—'}</p>
            </KpiCard>
            <KpiCard icon={<IconFile />} label="Policies">
              <p className="text-base font-bold text-gray-800">{formatPolicyType(lead.policy_type)}</p>
            </KpiCard>
            <KpiCard icon={<IconZap />} label="Current Status">
              <StageBadge stage={lead.pipeline_stages?.stage_name} />
            </KpiCard>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                if (!lead.pipeline_id) {
                  alert('Pipeline not assigned to this lead')
                  return
                }
                setShowUpdateModal(true)
              }}
              className="px-5 py-2 bg-[#2E5C85] hover:bg-[#234b6e] text-white rounded-lg shadow font-medium whitespace-nowrap"
            >
              Update Status
            </button>

          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Submitted Form Data</h2>
            <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto max-h-96">
              {JSON.stringify(form.form_data, null, 2)}
            </pre>
          </div>

          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-medium disabled:opacity-60"
          >
            {accepting ? 'Accepting Lead...' : 'Accept Lead'}
          </button>

        </div>
      </div>

      {showUpdateModal && (
        <UpdateStageModal
          leadId={lead.id}
          pipelineId={lead.pipeline_id}
          onClose={() => setShowUpdateModal(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  )
}

