'use client'

import { useState } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { LENDING_STAGES, LENDING_STAGE_FIELDS } from '@/app/lending/lib/constants'
import { toast } from '@/lib/toast'
import { Spinner } from '@/components/ui/Loading'
import { Modal } from '@/components/ui/Modal'

type Props = {
  loan: any
  onClose: () => void
  onSuccess: () => void
}

export default function UpdateStageModal({ loan, onClose, onSuccess }: Props) {
  const [modalStage, setModalStage] = useState<string>(loan.current_stage || LENDING_STAGES[0])
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [remarks, setRemarks] = useState('')
  const [overrideDate, setOverrideDate] = useState('')
  const [saving, setSaving] = useState(false)

  const activeFields = LENDING_STAGE_FIELDS[modalStage] || {}

  const handleSave = async () => {
    // Validate required fields
    for (const key of Object.keys(activeFields)) {
      if (activeFields[key].required && !formData[key]) {
        toast(`Please fill required field: ${activeFields[key].label}`, 'error')
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/lending/loans/${loan.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageName: modalStage,
          stageMetadata: formData,
          remarks: remarks || null,
          changedAtOverride: overrideDate ? new Date(overrideDate).toISOString() : null
        })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to update stage')

      toast(`Stage updated to ${modalStage}`, 'success')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const renderField = (key: string, field: any) => {
    const commonClasses = "w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-gray-700"

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            className={commonClasses}
            value={formData[key] || ''}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
          />
        )
      case 'number':
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
            <input
              type="number"
              className={`${commonClasses} pl-7`}
              value={formData[key] || ''}
              onChange={(e) => setFormData({ ...formData, [key]: e.target.value ? Number(e.target.value) : '' })}
            />
          </div>
        )
      case 'textarea':
        return (
          <textarea
            rows={4}
            className={`${commonClasses} resize-y`}
            value={formData[key] || ''}
            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
          />
        )
      default:
        return null
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={loan.borrower_name}
      subtitle={
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/90">
          <span>Update Pipeline Stage</span>
          <span>•</span>
          <span>{loan.id.split('-').pop()}</span>
        </div>
      }
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-6">
            <h3 className="text-base font-extrabold text-slate-900 mb-1">
              Current Stage: {loan.current_stage || LENDING_STAGES[0]}
            </h3>
            <p className="text-xs text-slate-600">
              Standard workflow checkpoint. Update the stage and provide any requested data for this stage.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Move To Stage</label>
              <div className="relative">
                <select
                  value={modalStage}
                  onChange={(e) => {
                    setModalStage(e.target.value)
                    setFormData({}) // Reset form data on stage change
                  }}
                  className="appearance-none w-full pl-4 pr-9 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B889]"
                >
                  {LENDING_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              </div>
            </div>

            {/* Dynamic Fields */}
            {Object.keys(activeFields).length > 0 && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 border-b border-gray-200 pb-2">
                  Stage Requirements
                </h4>
                {Object.entries(activeFields).map(([key, field]: [string, any]) => (
                  <div key={key}>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    {renderField(key, field)}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center justify-between">
                <span>Manual Progression Date (Optional)</span>
                <span className="text-[10px] text-gray-400 font-normal lowercase">defaults to current server time</span>
              </label>
              <input 
                type="datetime-local"
                value={overrideDate}
                onChange={e => setOverrideDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B889]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5">Remarks / Internal Notes (Optional)</label>
              <textarea 
                rows={3}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Notes regarding this stage change..."
                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#10B889] resize-y"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-100 mt-8">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-3 border-2 border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 h-[46px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 h-[46px]
              ${saving
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white md:hover:-translate-y-0.5 shadow-emerald-200 hover:shadow-emerald-300'
              }
            `}
          >
            {saving ? (
              <>
                <Spinner size={16} />
                Saving...
              </>
            ) : (
              'Save Status'
            )}
          </button>
        </div>
    </Modal>
  )
}
