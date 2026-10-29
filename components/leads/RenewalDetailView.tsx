'use client'

import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Send, Briefcase, Shield, Calendar, DollarSign, Edit2, ArrowLeft, PiggyBank, Paperclip, Trash2 } from 'lucide-react'
import Loading, { Spinner } from '@/components/ui/Loading'
import UpdateStageModal from '@/components/pipeline/UpdateStageModal'
import EditClientModal from '@/components/leads/EditClientModal'
import EditHistoryModal from '@/components/pipeline/EditHistoryModal'
import PageBackButton from '@/components/ui/PageBackButton'
import { FIELD_LABELS } from '@/lib/fieldLabels'
import { resolveStageHistoryFields } from '@/utils/stageFieldsConfig'
import { toast } from '@/lib/toast'
import { formatCurrency } from '@/lib/currency'
import { formatDateOnly } from '@/utils/dateHelper'
import { useSearchParams } from 'next/navigation'

interface RenewalDetailViewProps {
  initialLead: any;
  onBack: () => void;
  refreshLead: () => Promise<void>;
}

/* ── display helpers ─────────────────────────────────────── */
function formatPolicyType(raw?: string | null) {
  if (!raw) return '—'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function StageBadge({ stage }: { stage?: string | null }) {
  if (!stage) return <span className="text-gray-400 text-sm">—</span>
  const map: Record<string, string> = {
    'New Lead':               'bg-emerald-50 text-emerald-700 border border-emerald-200',
    'Quoting in Progress':    'bg-yellow-50  text-yellow-700  border border-yellow-200',
    'Quote Has Been Emailed': 'bg-blue-50    text-blue-700    border border-blue-200',
    'Consent Letter Sent':    'bg-purple-50  text-purple-700  border border-purple-200',
    'Completed':              'bg-blue-100   text-blue-800    border border-blue-300',
    'Did Not Bind':           'bg-red-50     text-red-700     border border-red-200',
  }
  const cls = map[stage] ?? 'bg-gray-100 text-gray-600 border border-gray-200'
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${cls}`}>
      {stage}
    </span>
  )
}

function KpiCard({ 
  icon, 
  label, 
  children,
  accent = 'from-gray-200 to-gray-300',
  glow = 'shadow-gray-200/50',
  iconBg = 'bg-gray-50 text-gray-400',
  hoverIconBg = 'group-hover:bg-gray-100 group-hover:text-gray-600'
}: { 
  icon: React.ReactNode; 
  label: string; 
  children: React.ReactNode;
  accent?: string;
  glow?: string;
  iconBg?: string;
  hoverIconBg?: string;
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

const IUser = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IMail = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
const IFile = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
const IZap = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>

export default function RenewalDetailView({ initialLead, onBack, refreshLead }: RenewalDetailViewProps) {
  const [lead, setLead] = useState<any>(initialLead)
  
  useEffect(() => {
    setLead(initialLead)
    setTempPremium(initialLead?.renewal_premium?.toString() || '')
  }, [initialLead])

  const searchParams = useSearchParams()
  const viewFocus = searchParams?.get('view')
  const actionSectionRef = useRef<HTMLDivElement>(null)

  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [isEditingPremium, setIsEditingPremium] = useState(false)
  const [tempPremium, setTempPremium] = useState(initialLead?.renewal_premium?.toString() || '')
  const [savingPremium, setSavingPremium] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [insuranceCompaniesMap, setInsuranceCompaniesMap] = useState<Record<string, string>>({})
  const [editingHistoryItem, setEditingHistoryItem] = useState<any>(null)
  
  const isCommercial = lead?.insurence_category?.toLowerCase() === 'commercial'

  /* ================= AUTO FOCUS ================= */
  useEffect(() => {
    if (viewFocus === 'focused' && actionSectionRef.current) {
      setIsFocused(true)
      setTimeout(() => {
        actionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
      
      const timer = setTimeout(() => setIsFocused(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [viewFocus])

  const savePremium = async () => {
    if (!lead) return
    setSavingPremium(true)
    const val = tempPremium === '' ? null : Number(tempPremium)
    
    const { error } = await supabase
      .from('temp_leads_basics')
      .update({ renewal_premium: val })
      .eq('id', lead.id)

    if (error) {
      alert('Failed to save premium: ' + error.message)
    } else {
      setLead({ ...lead, renewal_premium: val ?? undefined })
      setIsEditingPremium(false)
    }
    setSavingPremium(false)
  }

  /* ================= FETCH HISTORY ================= */
  const openHistoryModal = async () => {
    setHistoryLoading(true)
    setShowHistory(true)
    const [historyRes, icRes] = await Promise.all([
      supabase
        .from('lead_stage_history')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('insurance_companies')
        .select('id, name')
    ])

    if (!historyRes.error && historyRes.data) {
      setHistory(historyRes.data)
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
    if (!lead.id) return
    const [historyRes, icRes] = await Promise.all([
      supabase
        .from('lead_stage_history')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('insurance_companies')
        .select('id, name')
    ])

    if (!historyRes.error && historyRes.data) {
      setHistory(historyRes.data)
    }
    if (!icRes.error && icRes.data) {
      const map: Record<string, string> = {}
      icRes.data.forEach((ic: any) => {
        map[ic.id] = ic.name
      })
      setInsuranceCompaniesMap(map)
    }
  }

  /* ================= EMAIL MODAL STATE ================= */
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [customSubject, setCustomSubject] = useState('')
  const [customBody, setCustomBody] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [sendingEmail, setSendingEmail] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    const newAttachments = [...attachments]
    let hasError = false

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast(`File "${file.name}" exceeds 10MB limit.`, 'error')
        hasError = true
        return
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        toast(`Invalid file type for "${file.name}". Allowed: PDF, JPG, PNG, DOC, DOCX`, 'error')
        hasError = true
        return
      }
      newAttachments.push(file)
    })

    if (!hasError && files.length > 0) {
      toast(`Added ${files.length} attachment(s)`, 'success')
    }
    setAttachments(newAttachments)
    if (e.target) e.target.value = ''
  }

  const handleRemoveAttachment = (indexToRemove: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== indexToRemove))
  }

  const handleSendEmail = async () => {
    if (!lead?.email) return toast('Client email is missing', 'error')
    if (!customSubject.trim()) return toast('Please enter an email subject', 'warning')
    if (!customBody.trim()) return toast('Please enter an email body', 'warning')

    setSendingEmail(true)

    const formData = new FormData()
    formData.append('leadId', lead.id)
    formData.append('customSubject', customSubject.trim())
    formData.append('customBody', customBody.trim().replace(/\n/g, '<br>'))
    formData.append('formType', 'renewal')
    attachments.forEach((file) => {
      formData.append('attachments', file)
    })

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()
      setSendingEmail(false)

      if (!res.ok || !result.success) {
        toast(result?.error || result?.message || 'Email failed to send.', 'error')
        return
      }

      toast('Email sent successfully', 'success')
      setShowEmailModal(false)
      setCustomSubject('')
      setCustomBody('')
      setAttachments([])
      refreshLead()
    } catch (err: any) {
      setSendingEmail(false)
      toast(err.message || 'An error occurred while sending email', 'error')
    }
  }

  if (!lead) return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-700">Renewal Not Found</h2>
      <p className="text-gray-500 mt-2">This renewal does not exist or you do not have permission to view it.</p>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
      <div className="max-w-5xl mx-auto">
      <div className="flex flex-col gap-4">
        <PageBackButton onBack={onBack} className="mb-0" />
        {/* TOP CARD: Client Info (Styled like Lead Details) */}
        <div className="bg-white rounded-2xl shadow-xl border overflow-hidden">
          {/* HEADER */}
          <div className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {lead.client_name || 'Renewal Details'}
              </h1>
              <p className="text-white/80 text-sm mt-1">
                {lead.business_name ? `${lead.business_name} • ` : ''}{formatPolicyType(lead.policy_type)} Renewal
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
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${lead.insurence_category === 'commercial' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 mb-6`}>
              <KpiCard 
                icon={<IUser />} 
                label="Client Name"
                accent="from-[#10B889] to-[#0d9470]"
                glow="shadow-emerald-200/60"
                iconBg="bg-emerald-50 text-emerald-600"
                hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800 break-words">{lead.client_name || '—'}</p>
              </KpiCard>
              {lead.insurence_category === 'commercial' && (
                <KpiCard 
                  icon={<IUser />} 
                  label="Business Name"
                  accent="from-[#10B889] to-[#0d9470]"
                  glow="shadow-emerald-200/60"
                  iconBg="bg-emerald-50 text-emerald-600"
                  hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
                >
                  <p className={`text-base font-bold break-words ${lead.business_name ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                    {lead.business_name || 'Not Provided'}
                  </p>
                </KpiCard>
              )}
              <KpiCard 
                icon={<IMail />} 
                label="Email Address"
                accent="from-[#2E5C85] to-[#1e3f5e]"
                glow="shadow-blue-200/60"
                iconBg="bg-blue-50 text-blue-600"
                hoverIconBg="group-hover/card:bg-[#2E5C85] group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800 break-all">{lead.email || '—'}</p>
              </KpiCard>
              <KpiCard 
                icon={<IFile />} 
                label="Policy Type"
                accent="from-amber-500 to-orange-500"
                glow="shadow-amber-200/60"
                iconBg="bg-amber-50 text-amber-600"
                hoverIconBg="group-hover/card:bg-amber-500 group-hover/card:text-white"
              >
                <p className="text-base font-bold text-gray-800">{formatPolicyType(lead.policy_type)}</p>
              </KpiCard>
              <KpiCard 
                icon={<IZap />} 
                label="Current Status"
                accent="from-purple-600 to-indigo-600"
                glow="shadow-purple-200/60"
                iconBg="bg-purple-50 text-purple-600"
                hoverIconBg="group-hover/card:bg-purple-600 group-hover/card:text-white"
              >
                <StageBadge stage={lead.pipeline_stage?.stage_name} />
              </KpiCard>
            </div>

            {/* Renewal Policy Details */}
            {(lead.pipeline_stage?.stage_name === 'Completed (Switch)' || lead.new_carrier) ? (
              <div className="space-y-6 mb-8">
                {/* 1. Original / Expiring Policy Group (Historical) */}
                <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                    <span>Expiring Policy Details (Historical)</span>
                    <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">Previous Term</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard 
                      icon={<Briefcase size={14} />} 
                      label="Expiring Carrier"
                      accent="from-gray-500 to-gray-600"
                      glow="shadow-gray-100"
                      iconBg="bg-gray-100 text-gray-600"
                      hoverIconBg="group-hover/card:bg-gray-600 group-hover/card:text-white"
                    >
                      <p className="text-sm font-bold text-gray-700">{lead.carrier || '—'}</p>
                    </KpiCard>
                    <KpiCard 
                      icon={<Shield size={14} />} 
                      label="Expiring Policy Number"
                      accent="from-gray-500 to-gray-600"
                      glow="shadow-gray-100"
                      iconBg="bg-gray-100 text-gray-600"
                      hoverIconBg="group-hover/card:bg-gray-600 group-hover/card:text-white"
                    >
                      <p className="text-sm font-bold text-gray-700 font-mono">{lead.policy_number || '—'}</p>
                    </KpiCard>
                    <KpiCard 
                      icon={<Calendar size={14} />} 
                      label="Renewal Date"
                      accent="from-amber-500 to-orange-500"
                      glow="shadow-amber-200/60"
                      iconBg="bg-amber-50 text-amber-600"
                      hoverIconBg="group-hover/card:bg-amber-500 group-hover/card:text-white"
                    >
                      <p className="text-sm font-bold text-gray-700">{formatDateOnly(lead.renewal_date)}</p>
                    </KpiCard>
                    <KpiCard 
                      icon={<DollarSign size={14} />} 
                      label="Expiring Premium"
                      accent="from-gray-500 to-gray-600"
                      glow="shadow-gray-100"
                      iconBg="bg-gray-100 text-gray-600"
                      hoverIconBg="group-hover/card:bg-gray-600 group-hover/card:text-white"
                    >
                      <p className="text-sm font-bold text-gray-700">
                        {lead.current_premium ? formatCurrency(lead.current_premium) : '—'}
                      </p>
                    </KpiCard>
                  </div>
                </div>

                {/* 2. New Switched Policy Card Group (Active) */}
                <div className="p-5 rounded-2xl bg-emerald-50/70 border-2 border-emerald-300 shadow-md">
                  <h3 className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      New Bound Policy Details (Switched Carrier)
                    </span>
                    <span className="bg-emerald-600 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold shadow-sm">ACTIVE POLICY</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard 
                      icon={<Briefcase size={14} />} 
                      label="Active Carrier"
                      accent="from-[#10B889] to-[#0d9470]"
                      glow="shadow-emerald-200"
                      iconBg="bg-emerald-100 text-emerald-700"
                      hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
                    >
                      <p className="text-base font-black text-emerald-950">{lead.new_carrier || '—'}</p>
                    </KpiCard>
                    <KpiCard 
                      icon={<Shield size={14} />} 
                      label="Active Policy Number"
                      accent="from-[#2E5C85] to-[#1e3f5e]"
                      glow="shadow-blue-200"
                      iconBg="bg-blue-100 text-blue-700"
                      hoverIconBg="group-hover/card:bg-[#2E5C85] group-hover/card:text-white"
                    >
                      <p className="text-base font-black text-emerald-950 font-mono">{lead.new_policy_number || '—'}</p>
                    </KpiCard>
                    <KpiCard 
                      icon={<DollarSign size={14} />} 
                      label="Active Bound Premium"
                      accent="from-purple-600 to-indigo-600"
                      glow="shadow-purple-200"
                      iconBg="bg-purple-100 text-purple-700"
                      hoverIconBg="group-hover/card:bg-purple-600 group-hover/card:text-white"
                    >
                      <p className="text-base font-black text-emerald-950">
                        {lead.new_premium ? formatCurrency(lead.new_premium) : '—'}
                      </p>
                    </KpiCard>
                    <KpiCard 
                      icon={<PiggyBank size={14} />} 
                      label="Savings"
                      accent="from-[#10B889] to-[#0d9470]"
                      glow="shadow-emerald-200"
                      iconBg="bg-emerald-100 text-emerald-700"
                      hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
                    >
                      <p className="text-base font-black text-emerald-950">
                        {lead.savings !== null && lead.savings !== undefined ? formatCurrency(lead.savings) : '—'}
                      </p>
                    </KpiCard>
                  </div>
                </div>
              </div>
            ) : (
              /* Scenario A: Single Row for Same Carrier / In-Progress Renewals */
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 ${isCommercial ? 'lg:grid-cols-4' : 'lg:grid-cols-5'}`}>
                <KpiCard 
                  icon={<Briefcase size={14} />} 
                  label="Carrier"
                  accent="from-[#10B889] to-[#0d9470]"
                  glow="shadow-emerald-200/60"
                  iconBg="bg-emerald-50 text-emerald-600"
                  hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
                >
                  <p className="text-sm font-bold text-gray-700">{lead.carrier || '—'}</p>
                </KpiCard>
                <KpiCard 
                  icon={<Shield size={14} />} 
                  label="Policy Number"
                  accent="from-[#2E5C85] to-[#1e3f5e]"
                  glow="shadow-blue-200/60"
                  iconBg="bg-blue-50 text-blue-600"
                  hoverIconBg="group-hover/card:bg-[#2E5C85] group-hover/card:text-white"
                >
                  <p className="text-sm font-bold text-gray-700 font-mono">{lead.policy_number || '—'}</p>
                </KpiCard>
                <KpiCard 
                  icon={<Calendar size={14} />} 
                  label="Renewal Date"
                  accent="from-amber-500 to-orange-500"
                  glow="shadow-amber-200/60"
                  iconBg="bg-amber-50 text-amber-600"
                  hoverIconBg="group-hover/card:bg-amber-500 group-hover/card:text-white"
                >
                  <p className="text-sm font-bold text-gray-700">{formatDateOnly(lead.renewal_date)}</p>
                </KpiCard>
                <KpiCard 
                  icon={<DollarSign size={14} />} 
                  label="Premium"
                  accent="from-purple-600 to-indigo-600"
                  glow="shadow-purple-200/60"
                  iconBg="bg-purple-50 text-purple-600"
                  hoverIconBg="group-hover/card:bg-purple-600 group-hover/card:text-white"
                >
                  <p className="text-sm font-bold text-gray-700">
                    {lead.current_premium ? formatCurrency(lead.current_premium) : '—'}
                  </p>
                </KpiCard>

                <KpiCard 
                  icon={<PiggyBank size={14} />} 
                  label="Savings"
                  accent="from-[#10B889] to-[#0d9470]"
                  glow="shadow-emerald-200/60"
                  iconBg="bg-emerald-50 text-emerald-600"
                  hoverIconBg="group-hover/card:bg-[#10B889] group-hover/card:text-white"
                >
                  <p className="text-sm font-bold text-gray-700">
                    {lead.savings !== null && lead.savings !== undefined ? formatCurrency(lead.savings) : '—'}
                  </p>
                </KpiCard>
              </div>
            )}

            <div className={`mb-8 p-6 rounded-2xl border ${!lead.renewal_premium ? 'bg-cyan-50 border-cyan-100' : 'bg-gray-50 border-gray-100'}`}>
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                Renewal Premium Setup
                {!lead.renewal_premium && <span className="text-[10px] bg-cyan-600 text-white px-2 py-0.5 rounded-full">Required</span>}
              </h3>
              
              <div className="max-w-xs">
                {isEditingPremium ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input
                        type="number"
                        autoFocus
                        value={tempPremium}
                        onChange={(e) => setTempPremium(e.target.value)}
                        className="w-full pl-7 pr-4 py-2 bg-white border-2 border-emerald-500 rounded-lg outline-none transition-all font-bold"
                        placeholder="0.00"
                      />
                    </div>
                    <button
                      onClick={savePremium}
                      disabled={savingPremium}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 min-w-[70px] flex items-center justify-center"
                    >
                      {savingPremium ? <Spinner size={16} /> : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingPremium(false)
                        setTempPremium(lead.renewal_premium?.toString() || '')
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingPremium(true)}
                    className="group flex flex-col items-start"
                  >
                    <span className={`text-3xl font-black ${lead.renewal_premium ? 'text-gray-900' : 'text-cyan-600 underline decoration-dotted'}`}>
                      {lead.renewal_premium ? formatCurrency(lead.renewal_premium) : 'Enter Renewal Premium'}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 mt-1 group-hover:text-emerald-600 transition-colors uppercase tracking-widest">
                      {lead.renewal_premium ? 'Click to change amount' : 'Manually entered required'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* ACTION BAR */}
            <div 
              ref={actionSectionRef}
              className={`flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-t pt-8 transition-all duration-700 ${isFocused ? 'bg-blue-50/50 p-6 rounded-2xl border-2 border-blue-400 ring-4 ring-blue-400/20 shadow-xl scale-[1.02] z-10 mx-[-8px]' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={() => setShowEmailModal(true)}
                  className={`w-full sm:w-auto px-6 py-3 rounded-xl shadow-lg transition-all font-bold flex items-center justify-center gap-2 active:scale-95 ${isFocused ? 'bg-blue-600 text-white hover:bg-blue-700 ring-4 ring-blue-600/30' : 'bg-[#10B889] hover:bg-[#0e9e75] text-white'}`}
                >
                  <Send size={18} />
                  Send Email
                </button>
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="w-full sm:w-auto px-6 py-3 bg-[#2E5C85] hover:bg-[#234b6e] text-white rounded-xl shadow-lg transition-all font-bold active:scale-95 whitespace-nowrap"
                >
                  Update Status
                </button>

              </div>

              <div className="flex items-center justify-between lg:justify-end w-full lg:w-auto bg-blue-50/50 lg:bg-transparent p-3 lg:p-0 rounded-xl border border-blue-100 lg:border-none">
                <div className="flex items-center gap-3">
                  <div className="flex items-center">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-3 hidden sm:inline">Current Status</span>
                    <StageBadge stage={lead.pipeline_stage?.stage_name} />
                  </div>
                  <div className="w-px h-8 bg-gray-200 hidden sm:block mx-1"></div>
                  <button 
                    onClick={openHistoryModal}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl shadow-sm border border-emerald-200 transition-all font-bold text-sm"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    View History
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>

      {showUpdateModal && lead && (
        <UpdateStageModal
          leadId={lead.id}
          pipelineId={lead.pipeline_id}
          onClose={() => setShowUpdateModal(false)}
          onSuccess={() => {
            refreshLead() // Reload data to show new stage
          }}
        />
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
                <h2 className="text-xl font-bold text-white" id="modal-title">Stage History</h2>
                <p className="text-sm text-white">Previous updates for this renewal</p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-full transition-all duration-200 shadow-sm"
                title="Close"
                aria-label="Close stage history modal"
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
                  No stage history found for this renewal.
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
                          aria-label={`Edit history entry for ${item.stage_name}`}
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
                            lead?.insurence_category?.toLowerCase().includes('commercial') ? 'CommercialRenewal' : 'PersonalRenewal',
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
          pipelineType={lead?.insurence_category?.toLowerCase().includes('commercial') ? 'CommercialRenewal' : 'PersonalRenewal'}
          onClose={() => {
            setEditingHistoryItem(null)
            setShowHistory(true)
          }}
          onSuccess={() => {
            setEditingHistoryItem(null)
            refreshHistory().then(() => setShowHistory(true))
          }}
        />
      )}

      {/* EDIT CLIENT MODAL */}
      {showEditModal && lead && (
        <EditClientModal
          lead={lead}
          onClose={() => setShowEditModal(false)}
          onSuccess={(updated) => {
            if (updated) {
              setLead((prev: any) => ({
                ...prev,
                client_name: updated.client_name,
                email: updated.email,
                phone: updated.phone,
                business_name: updated.business_name,
              }))
            }
            refreshLead()
          }}
        />
      )}

      {/* EMAIL MODAL OVERLAY */}
      {showEmailModal && lead && (
        <div className="relative z-[100]" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" />
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-start justify-center p-4 sm:p-6">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl opacity-100 max-h-[90dvh] overflow-hidden flex flex-col pointer-events-auto my-auto relative border border-gray-100">
                {/* MODAL HEADER */}
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-[#10B889] to-[#2E5C85] sticky top-0 z-10">
                  <div>
                    <h2 className="text-xl font-bold text-white">Send Renewal Email</h2>
                    <p className="text-sm text-white/80 mt-0.5">Send a direct email to {lead.client_name}</p>
                  </div>
                  <button
                    onClick={() => setShowEmailModal(false)}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-all text-lg font-bold leading-none"
                    aria-label="Close modal"
                  >
                    ✕
                  </button>
                </div>

                {/* MODAL BODY */}
                <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-5">
                  {/* RECIPIENT */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                      To
                    </label>
                    <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 select-all flex items-center justify-between">
                      <span>{lead.email || 'No email address on file'}</span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Client Recipient
                      </span>
                    </div>
                  </div>

                  {/* SUBJECT */}
                  <div>
                    <label htmlFor="renewal-email-subject" className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-1.5">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="renewal-email-subject"
                      type="text"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="Enter email subject..."
                      className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-gray-400 placeholder:font-normal"
                    />
                  </div>

                  {/* BODY */}
                  <div>
                    <label htmlFor="renewal-email-body" className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-1.5">
                      Body <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="renewal-email-body"
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      placeholder="Write your email message here..."
                      rows={8}
                      className="w-full bg-white border border-gray-300 rounded-xl p-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-gray-400 leading-relaxed resize-y min-h-[180px]"
                    />
                  </div>

                  {/* ATTACHMENTS */}
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-2">
                          <Paperclip size={14} className="text-emerald-600" />
                          Attachments
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">Attach documents or quotes (PDF, DOC, DOCX, JPG, PNG - Max 10MB total)</p>
                      </div>
                      <div>
                        <input
                          type="file"
                          multiple
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-300 shadow-sm shrink-0"
                        >
                          <Paperclip size={14} />
                          Attach Files
                        </button>
                      </div>
                    </div>

                    {attachments.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {attachments.map((file, idx) => (
                          <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                                <Paperclip size={14} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-800 truncate" title={file.name}>{file.name}</p>
                                <p className="text-[10px] text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2 shrink-0"
                              title="Remove attachment"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* MODAL FOOTER */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-6 mt-6 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(false)}
                      className="w-full sm:w-1/3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold py-3.5 rounded-xl shadow-sm transition-all flex items-center justify-center text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSendEmail}
                      disabled={sendingEmail}
                      className="w-full sm:w-2/3 bg-gradient-to-r from-[#2E5C85] to-[#10B889] hover:opacity-95 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-sm shadow-emerald-900/10"
                    >
                      {sendingEmail ? <Spinner size={18} /> : (
                        <>
                          <Send size={16} />
                          <span>Send Email</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
