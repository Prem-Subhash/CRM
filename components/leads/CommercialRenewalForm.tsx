'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { toast } from '@/lib/toast'
import {
  resolveRenewalPipelineAndStage,
  validateRenewalRecord,
  buildRenewalPayload,
  saveRenewalRecords,
} from '@/utils/renewalHelper'
import { formatPhoneInput } from '@/utils/phoneFormatter'
import { COMMERCIAL_POLICY_TYPES } from '@/constants/policyTypes'
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  Shield,
  FileText,
  DollarSign,
  Calendar,
  Building,
  Save,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  ChevronDown,
} from 'lucide-react'
import { ReferralSelect } from '@/components/ui/ReferralSelect'

interface CommercialRenewalFormProps {
  assignedCsrId: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CommercialRenewalForm({ assignedCsrId, onSuccess, onCancel }: CommercialRenewalFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const [form, setForm] = useState({
    business_name: '',
    client_name: '',
    phone: '',
    email: '',
    policy_number: '',
    renewal_date: '',
    current_premium: '',
    carrier: '',
    policy_type: COMMERCIAL_POLICY_TYPES[0].value,
    referral: '',
    referral_id: null as string | null,
    notes: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'phone') {
      setForm((prev) => ({ ...prev, phone: formatPhoneInput(value) }))
      return
    }
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])

    // Validate using shared renewal logic
    const validation = validateRenewalRecord(form, 'commercial', false)
    if (!validation.isValid) {
      setErrors(validation.errors)
      toast('Please fix validation errors before submitting.', 'error')
      return
    }

    setLoading(true)
    try {
      const { pipelineId, stageId } = await resolveRenewalPipelineAndStage(supabase, 'commercial')

      const payload = buildRenewalPayload(
        form,
        'commercial',
        pipelineId,
        stageId,
        assignedCsrId,
        false
      )

      const response = await fetch('/api/renewals/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'commercial', payload: [payload] }),
      })

      const resData = await response.json()
      if (!response.ok || resData.error) {
        throw new Error(resData.error || 'Failed to create renewal record.')
      }

      toast('Commercial renewal policy created successfully!', 'success')
      onSuccess()
    } catch (err: any) {
      console.error(err)
      setErrors([err.message || 'Failed to create renewal record.'])
      toast(err.message || 'Error creating record.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      {/* Top Bar / Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={onCancel}
          type="button"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-[#A84E34] transition-colors bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-brand-dark to-[#A84E34] px-6 py-6 text-white">
          <h1 className="text-2xl font-bold tracking-tight">Manual Renewal Entry (Commercial Lines)</h1>
          <p className="text-orange-100 text-sm mt-1">
            Create a single commercial renewal record manually using the same validation and pipeline rules as Excel import.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
          {/* Error Alert Box */}
          {errors.length > 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg flex items-start gap-3 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Please correct the following errors:</p>
                <ul className="list-disc pl-5 mt-1 text-xs space-y-0.5">
                  {errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Section 1: Business & Client Information */}
          <div>
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-brand-dark" />
              Applicant / Account Data
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="sm:col-span-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Business / Company Name (Optional)
                </label>
                <div className="relative">
                  <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    name="business_name"
                    value={form.business_name}
                    onChange={handleChange}
                    placeholder="e.g. Acme Corporation LLC"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all"
                  />
                </div>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Primary Contact / Account Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="client_name"
                  value={form.client_name}
                  onChange={handleChange}
                  placeholder="e.g. Jane Smith (or Account Name)"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Phone Number (Optional)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="e.g. 555-0199"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all"
                  />
                </div>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Email Address (Optional)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="e.g. contact@acmecorp.com"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Policy Information */}
          <div>
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-dark" />
              Policy Data (Required for Renewal)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Policy Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="policy_number"
                  value={form.policy_number}
                  onChange={handleChange}
                  placeholder="e.g. COM-442819"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Policy Expiration / Renewal Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="date"
                    name="renewal_date"
                    value={form.renewal_date}
                    onChange={handleChange}
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Total Written Premium ($) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="number"
                    step="0.01"
                    name="current_premium"
                    value={form.current_premium}
                    onChange={handleChange}
                    placeholder="0.00"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Master Company / Carrier
                </label>
                <div className="relative">
                  <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    name="carrier"
                    value={form.carrier}
                    onChange={handleChange}
                    placeholder="e.g. Hartford / CNA / Travelers"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Line of Business / Policy Type
                </label>
                <div className="relative">
                  <select
                    name="policy_type"
                    value={form.policy_type}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all bg-white appearance-none"
                  >
                    {COMMERCIAL_POLICY_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                    Lead Source / Referral
                  </label>
                  <ReferralSelect 
                    value={form.referral_id || ""}
                    onChange={(id, name) => setForm((prev) => ({ ...prev, referral_id: id || null, referral: name }))}
                  />
                </div>
            </div>
          </div>

          {/* Section 3: Notes */}
          <div>
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-dark" />
              Additional Notes
            </h2>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Enter any relevant renewal notes, underwriting instructions, or terms..."
              className="w-full p-3.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-brand-dark focus:border-transparent text-sm shadow-sm outline-none transition-all"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={onCancel}
              type="button"
              className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-brand-dark hover:bg-[#A84E34] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving Record...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Create Commercial Renewal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
