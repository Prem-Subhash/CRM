'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  Building2,
  UserPlus,
  Trash2,
  Save,
  FileText,
  Users,
  Landmark,
  ChevronDown,
  ShieldAlert,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Activity
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { formatUSPhone } from '@/app/lending/lib/utils'
import { LENDING_STAGES } from '@/app/lending/lib/constants'
import SectionELenderInfo, { LenderBlockData } from '@/components/lending/SectionELenderInfo'

const CITIZENSHIP_OPTIONS = [
  { label: 'US Citizen', value: 'US Citizen' },
  { label: 'Permanent Resident', value: 'Permanent Resident' },
  { label: 'Visa Holder', value: 'Visa Holder' },
  { label: 'Non-US Citizen', value: 'Non-US Citizen' },
  { label: 'Other', value: 'Other' }
]

interface Partner {
  id: string
  fullName: string
  mobile: string
  email: string
  ownership: string
  citizenshipStatus?: string
}

export default function LendingEditLoanFormPage() {
  const router = useRouter()
  const params = useParams()
  const loanId = params?.id as string

  const [activeTab, setActiveTab] = useState<'tab1' | 'tab2' | 'tab3'>('tab1')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Base data
  const [loanStage, setLoanStage] = useState(1)

  // Tab 1 State
  const [inquiryDate, setInquiryDate] = useState('')
  const [borrowerName, setBorrowerName] = useState('')
  const [clientLegalName, setClientLegalName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientCreditScore, setClientCreditScore] = useState('')
  const [loanType, setLoanType] = useState('SBA 7a')
  const [loanPurpose, setLoanPurpose] = useState('Acquisition')
  const [natureOfLoan, setNatureOfLoan] = useState('Gas Station')
  const [address, setAddress] = useState('')
  const [loanSummary, setLoanSummary] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [brokerCommission, setBrokerCommission] = useState('')

  // Tab 2 State
  const [partners, setPartners] = useState<Partner[]>([])
  
  const totalOwnership = partners.reduce((sum, p) => sum + (Number(p.ownership) || 0), 0)

  const [leadSource, setLeadSource] = useState('Loan Officer')
  const [referralName, setReferralName] = useState('')

  // Tab 3 State (Banks)
  const [banks, setBanks] = useState<LenderBlockData[]>([])

  useEffect(() => {
    if (!loanId) return
    const fetchLoan = async () => {
      try {
        const res = await fetch(`/api/lending/loans/${loanId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to fetch loan')

        const data = json.loan
        const idx = LENDING_STAGES.indexOf(data.current_stage)
        setLoanStage(idx !== -1 ? idx + 1 : 1)
        setInquiryDate(data.inquiry_date ? data.inquiry_date.split('T')[0] : '')
        setBorrowerName(data.borrower_name || '')
        setClientLegalName(data.client_legal_name || '')
        setClientPhone(data.client_phone || '')
        setClientEmail(data.client_email || '')
        setClientCreditScore(data.estimated_credit_score?.toString() || '')
        setLoanType(data.loan_type || 'SBA 7a')
        setLoanPurpose(data.loan_purpose || 'Acquisition')
        setNatureOfLoan(data.nature_of_loan || 'Gas Station')
        setAddress(data.business_address || '')
        setLoanSummary(data.loan_summary || '')
        setPurchasePrice(data.purchase_price?.toString() || '')
        setDownPayment(data.down_payment_percent?.toString() || '')
        setBrokerCommission(data.broker_commission?.toString() || '')
        setLeadSource(data.lead_source || 'Loan Officer')
        setReferralName(data.referral_name || '')

        if (data.partners && data.partners.length > 0) {
          setPartners(data.partners.map((p: any) => ({
            id: p.id || Math.random().toString(),
            fullName: p.full_name || '',
            mobile: p.mobile || '',
            email: p.email || '',
            ownership: p.ownership_percent?.toString() || '0'
          })))
        } else {
          setPartners([{ id: '1', fullName: '', mobile: '', email: '', ownership: '', citizenshipStatus: '' }])
        }

        if (data.banks && data.banks.length > 0) {
          setBanks(data.banks.map((b: any) => ({
            id: b.id || Math.random().toString(),
            lenderBank: b.lender_bank || '',
            bankOfficerName: b.bank_officer_name || '',
            bankUnderwriterName: b.bank_underwriter_name || '',
            titleAgencyName: b.title_agency_name || '',
            bankClosingAgentName: b.bank_closing_agent_name || '',
            contactEmail: b.contact_email || '',
            contactPhone: b.contact_phone || '',
            isCustomBank: b.is_custom_bank || false
          })))
        }
      } catch (err: any) {
        toast(err.message, 'error')
      } finally {
        setIsLoading(false)
      }
    }
    fetchLoan()
  }, [loanId])

  const handleAddPartner = () => {
    const newId = (Date.now()).toString()
    setPartners([...partners, { id: newId, fullName: '', mobile: '', email: '', ownership: '', citizenshipStatus: '' }])
  }

  const handleRemovePartner = (id: string) => {
    if (partners.length <= 1) {
      toast('At least one partner is required', 'error')
      return
    }
    setPartners(partners.filter(p => p.id !== id))
  }

  const handlePartnerChange = (id: string, field: keyof Partner, value: string) => {
    let finalValue = field === 'mobile' ? formatUSPhone(value) : value

    if (field === 'ownership') {
      const numValue = Number(finalValue)
      if (!isNaN(numValue) && finalValue !== '') {
        const totalOther = partners.filter(p => p.id !== id).reduce((sum, p) => sum + (Number(p.ownership) || 0), 0)
        const maxAllowed = 100 - totalOther
        if (numValue > maxAllowed) {
          finalValue = maxAllowed.toString()
        }
      }
    }

    setPartners(partners.map(p => p.id === id ? { ...p, [field]: finalValue } : p))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!borrowerName) {
      toast('Borrower name is required', 'error')
      setActiveTab('tab1')
      return
    }

    if (totalOwnership !== 100 && partners.length > 0) {
      toast(`The total ownership percentage must equal exactly 100%.`, 'error')
      setActiveTab('tab2')
      return
    }

    try {
      setIsSubmitting(true)
      const payload = {
        inquiry_date: inquiryDate,
        borrower_name: borrowerName,
        client_legal_name: clientLegalName,
        client_phone: clientPhone,
        client_email: clientEmail,
        // [Pending DB Update] estimated_credit_score: clientCreditScore,
        loan_type: loanType,
        loan_purpose: loanPurpose,
        nature_of_loan: natureOfLoan,
        business_address: address,
        loan_summary: loanSummary,
        purchase_price: purchasePrice ? Number(purchasePrice) : null,
        down_payment_percent: downPayment ? Number(downPayment) : null,
        broker_commission: brokerCommission ? Number(brokerCommission) : null,
        lead_source: leadSource,
        referral_name: referralName,
        current_stage: LENDING_STAGES[loanStage - 1],
        partners: partners.map(p => ({
          full_name: p.fullName,
          mobile: p.mobile,
          email: p.email,
          ownership_percent: p.ownership
        })),
        banks: banks.map(b => ({
          lender_bank: b.lenderBank,
          bank_officer_name: b.bankOfficerName,
          bank_underwriter_name: b.bankUnderwriterName,
          title_agency_name: b.titleAgencyName,
          bank_closing_agent_name: b.bankClosingAgentName,
          contact_email: b.contactEmail,
          contact_phone: b.contactPhone,
          is_custom_bank: b.isCustomBank
        }))
      }

      const res = await fetch(`/api/lending/loans/${loanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update loan')

      toast('Commercial Loan Application updated successfully', 'success')
      router.push('/lending/pipeline')
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading loan data...</div>
  }

  return (
    <div className="w-full space-y-6 animate-fade-in max-w-6xl mx-auto mb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#10B889] mb-1">
            <Building2 size={14} />
            <span>Commercial Loan - Edit File</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Edit Loan Application
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Update existing intake data, borrower identity, partners, and banks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/lending/activity-log?deal=${loanId}`)}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition flex items-center gap-1.5"
            title="View stage progression audit history for this loan"
          >
            <Activity size={14} className="text-[#10B889]" />
            <span>Progression Audit Log</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-2 shadow-sm flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('tab1')}
          className={`flex-1 flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'tab1'
              ? 'bg-[#10B889] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <FileText size={18} />
          <span>Tab 1: Basic &amp; Financials (Sec A–B)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tab2')}
          className={`flex-1 flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'tab2'
              ? 'bg-[#10B889] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <Users size={18} />
          <span>Tab 2: Partners &amp; Leads (Sec C–D)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tab3')}
          className={`flex-1 flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'tab3'
              ? 'bg-[#10B889] text-white shadow-md'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <Landmark size={18} />
          <span>Tab 3: Lenders (Sec E)</span>
        </button>
      </div>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* ==================== TAB 1 ==================== */}
        {activeTab === 'tab1' && (
          <div className="space-y-6 animate-fade-in">
            {/* Section A */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-extrabold">A</span>
                  <span>Section A — Basic / Loan Information</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Inquiry Date</label>
                  <input
                    type="date"
                    value={inquiryDate}
                    onChange={e => setInquiryDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Borrower / Company Name *</label>
                  <input
                    type="text"
                    required
                    value={borrowerName}
                    onChange={e => setBorrowerName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Client Full Legal Name</label>
                  <input
                    type="text"
                    value={clientLegalName}
                    onChange={e => setClientLegalName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Client Phone</label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={e => setClientPhone(formatUSPhone(e.target.value))}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Client Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={e => setClientEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Loan Type</label>
                  <div className="relative">
                    <select
                      value={loanType}
                      onChange={e => setLoanType(e.target.value)}
                      className="appearance-none w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                    >
                      <option value="SBA 7a">SBA 7a</option>
                      <option value="SBA 504">SBA 504</option>
                      <option value="Conventional">Conventional</option>
                      <option value="Bridge Loan">Bridge Loan</option>
                      <option value="Private Loan">Private Loan</option>
                      <option value="Equipment Financing">Equipment Financing</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Purpose of Loan</label>
                  <div className="relative">
                    <select
                      value={loanPurpose}
                      onChange={e => setLoanPurpose(e.target.value)}
                      className="appearance-none w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                    >
                      <option value="Acquisition">Acquisition</option>
                      <option value="Refinance">Refinance</option>
                      <option value="Start-up">Start-up</option>
                      <option value="Partner Buyout">Partner Buyout</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Nature of Loan</label>
                  <div className="relative">
                    <select
                      value={natureOfLoan}
                      onChange={e => setNatureOfLoan(e.target.value)}
                      className="appearance-none w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                    >
                      <option value="Cannabis Dispensary">Cannabis Dispensary</option>
                      <option value="Gas Station">Gas Station</option>
                      <option value="Grocery Store">Grocery Store</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Location</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Loan Summary</label>
                  <textarea
                    rows={3}
                    value={loanSummary}
                    onChange={e => setLoanSummary(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#10B889] focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>
            
            {/* Section B */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-extrabold">B</span>
                  <span>Section B — Financial Information</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Purchase Price ($)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      value={purchasePrice}
                      onChange={e => setPurchasePrice(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base font-extrabold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Down Payment (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={downPayment}
                      onChange={e => setDownPayment(e.target.value)}
                      className="w-full pl-4 pr-8 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base font-extrabold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">
                    Broker Commission ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      value={brokerCommission}
                      onChange={e => setBrokerCommission(e.target.value)}
                      placeholder="5000"
                      className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base font-extrabold text-slate-900 focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('tab2')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="bg-[#10B889] hover:bg-[#0c966f] text-white font-bold py-3 px-6 rounded-xl shadow-md transition-all flex items-center gap-2 text-sm"
              >
                <span>Continue to Tab 2</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB 2 ==================== */}
        {activeTab === 'tab2' && (
          <div className="space-y-6 animate-fade-in">
            {/* Section C */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center text-xs font-extrabold">C</span>
                    <span>Section C — Partner Information</span>
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleAddPartner}
                  className="bg-emerald-50 hover:bg-[#10B889] text-emerald-700 hover:text-white font-bold py-2 px-4 rounded-xl transition-all text-xs border border-emerald-200 shadow-2xs flex items-center gap-1.5"
                >
                  <UserPlus size={16} />
                  <span>+ Add Partner</span>
                </button>
              </div>

              <div className="space-y-4">
                {partners.map((partner, idx) => (
                  <div key={partner.id} className="p-5 bg-slate-50 border border-gray-200 rounded-2xl space-y-4 relative group">
                    <div className="flex items-center justify-between border-b border-gray-200/60 pb-2.5">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-purple-900 bg-purple-100 px-2.5 py-0.5 rounded-full">
                        Partner #{idx + 1}
                      </span>
                      {partners.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePartner(partner.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-gray-600 mb-1">First &amp; Last Name</label>
                        <input
                          type="text"
                          required
                          value={partner.fullName}
                          onChange={e => handlePartnerChange(partner.id, 'fullName', e.target.value)}
                          className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-gray-600 mb-1">Mobile</label>
                        <input
                          type="text"
                          value={partner.mobile}
                          onChange={e => handlePartnerChange(partner.id, 'mobile', e.target.value)}
                          className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-gray-600 mb-1">Email Address</label>
                        <input
                          type="email"
                          value={partner.email}
                          onChange={e => handlePartnerChange(partner.id, 'email', e.target.value)}
                          className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-gray-600 mb-1">% Ownership</label>
                        <div className="relative">
                          <input
                            type="number"
                            required
                            value={partner.ownership}
                            onChange={e => handlePartnerChange(partner.id, 'ownership', e.target.value)}
                            className={`w-full pl-3.5 pr-8 py-2 bg-white border rounded-xl text-sm font-extrabold outline-none transition-all ${totalOwnership > 100 ? 'border-rose-500 focus:ring-2 focus:ring-rose-500' : totalOwnership < 100 ? 'border-amber-400 focus:ring-2 focus:ring-amber-500' : 'border-emerald-500 focus:ring-2 focus:ring-emerald-500'}`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1 font-semibold">Remaining ownership: {100 - partners.filter(p => p.id !== partner.id).reduce((sum, p) => sum + (Number(p.ownership) || 0), 0)}%</p>
                      </div>
                    </div>
                  </div>
                ))}

                {partners.length > 0 && (
                  <div className={`mt-4 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${totalOwnership === 100 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : totalOwnership > 100 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                    <div className="flex items-center gap-2.5 font-bold">
                      {totalOwnership === 100 ? (
                        <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                      ) : totalOwnership > 100 ? (
                        <XCircle size={20} className="text-rose-600 shrink-0" />
                      ) : (
                        <AlertCircle size={20} className="text-amber-600 shrink-0" />
                      )}
                      <span>
                        {totalOwnership === 100 
                          ? '✓ Total ownership is 100%.' 
                          : totalOwnership > 100 
                          ? `⚠ Total ownership exceeds 100% by ${totalOwnership - 100}%.`
                          : `⚠ Remaining ownership: ${100 - totalOwnership}%.`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section D */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-extrabold">D</span>
                  <span>Section D — Lead Information</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Lead Source Channel</label>
                  <div className="relative">
                    <select
                      value={leadSource}
                      onChange={e => setLeadSource(e.target.value)}
                      className="appearance-none w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                    >
                      <option value="Loan Officer">Loan Officer</option>
                      <option value="Other Referral">Other Referral</option>
                    </select>
                    <ChevronDown size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Referral Officer Name</label>
                  <input
                    type="text"
                    value={referralName}
                    onChange={e => setReferralName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('tab1')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-xl transition-all text-sm"
              >
                ← Back to Tab 1
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('tab3')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="bg-[#10B889] hover:bg-[#0c966f] text-white font-bold py-3 px-6 rounded-xl shadow-md transition-all flex items-center gap-2 text-sm"
              >
                <span>Continue to Tab 3</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB 3 ==================== */}
        {activeTab === 'tab3' && (
          <div className="space-y-6 animate-fade-in">
            <SectionELenderInfo 
               initialBlocks={banks}
               onChange={(updatedBanks) => setBanks(updatedBanks)}
            />
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('tab2')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-xl transition-all text-sm"
              >
                ← Back to Tab 2
              </button>
              <button
                type="submit"
                disabled={isSubmitting || totalOwnership !== 100}
                className="bg-[#10B889] hover:bg-[#0c966f] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 text-base"
              >
                <Save size={20} />
                <span>{isSubmitting ? 'Saving...' : 'Update Loan'}</span>
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
