'use client'

import { useState, useEffect } from 'react'
import { Calendar, Clock, Edit3, User, Check, X, ShieldAlert } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Spinner } from '@/components/ui/Loading'
import { LENDING_STAGE_FIELDS } from '@/app/lending/lib/constants'
import { Modal } from '@/components/ui/Modal'

type Props = {
  loanId: string
  borrowerName: string
  onClose: () => void
}

export default function StageHistoryModal({ loanId, borrowerName, onClose }: Props) {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editReason, setEditReason] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  const fetchHistory = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/lending/loans/${loanId}/history`)
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch history')
      }

      setHistory(data.history || [])
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [loanId])

  const openDateEditor = (item: any) => {
    setEditingItem(item)
    // Convert changed_at to local datetime-local format YYYY-MM-DDTHH:mm
    const d = new Date(item.changed_at)
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setEditDate(localIso)
    setEditReason(item.stage_data?.manual_adjustment_reason || '')
  }

  const handleSaveDate = async () => {
    if (!editingItem || !editDate) {
      toast('Please select a valid date & time', 'error')
      return
    }

    try {
      setSavingDate(true)
      const res = await fetch('/api/lending/activity-log/manual-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyId: editingItem.id,
          newProgressionDate: new Date(editDate).toISOString(),
          reason: editReason.trim() || 'Manual progression date adjustment'
        })
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update progression date')
      }

      toast('Progression date updated successfully', 'success')
      setEditingItem(null)
      await fetchHistory()
    } catch (err: any) {
      toast(err.message, 'error')
    } finally {
      setSavingDate(false)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Stage Progression History"
      subtitle={
        <div className="flex items-center gap-2 text-xs font-bold text-white/90">
          <span>{borrowerName}</span>
          <span>•</span>
          <span className="font-mono">{loanId.split('-').pop()}</span>
        </div>
      }
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Spinner size={32} />
            <p className="font-medium text-sm">Loading progression audit trail...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
            No stage history found for this loan.
          </div>
        ) : (
          history.map((item) => {
            const stageData = item.stage_data || {}
            const eventType = stageData.event_type || 
              (stageData.new_status ? 'STATUS_CHANGED' : 'STAGE_CHANGED')
            const isManual = Boolean(
              stageData.is_manual_date || 
              stageData.manual_progression_date ||
              stageData.original_timestamp
            )
            const updaterName = item.updater?.full_name || stageData._updated_by || 'System'
            const origTimestamp = stageData.original_timestamp || stageData.system_timestamp

            return (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition hover:border-slate-300">
                {/* Header Strip */}
                <div className="bg-slate-50 px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-md border ${
                      eventType === 'STATUS_CHANGED'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : eventType === 'STAGE_DATE_UPDATED'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {eventType.replace(/_/g, ' ')}
                    </span>
                    <h3 className="font-bold text-slate-800 text-sm">
                      {item.current_stage}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Timestamp & Manual Pill */}
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      <Clock size={13} className="text-[#10B889]" />
                      <span>{new Date(item.changed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>

                    {isManual && (
                      <span 
                        className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full"
                        title={origTimestamp ? `Original system time: ${new Date(origTimestamp).toLocaleString()}` : 'Manually entered date'}
                      >
                        Manual Date
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => openDateEditor(item)}
                      className="text-slate-400 hover:text-[#10B889] hover:bg-slate-100 p-1.5 rounded-md transition"
                      title="Adjust progression date"
                    >
                      <Edit3 size={14} />
                    </button>
                  </div>
                </div>

                {/* Sub details: User & Original time if manual */}
                <div className="px-5 py-2 bg-slate-50/50 border-b border-slate-100 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <User size={13} className="text-slate-400" />
                    <span>Updated by: <strong className="text-slate-700">{updaterName}</strong></span>
                  </div>

                  {isManual && origTimestamp && (
                    <div className="text-[11px] text-slate-400 italic">
                      System timestamp: {new Date(origTimestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  )}
                </div>

                {/* Stage Data Fields */}
                {stageData && Object.keys(stageData).length > 0 ? (
                  <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
                      {Object.entries(stageData).map(([k, v]) => {
                        // Skip internal system audit keys from visual grid
                        if (['_updated_by', 'event_type', 'system_timestamp', 'is_manual_date', 'manual_progression_date', 'original_timestamp', 'target_history_id'].includes(k)) {
                          return null
                        }

                        const activeFields = LENDING_STAGE_FIELDS[item.current_stage] || {}
                        const friendlyLabel = activeFields[k]?.label || k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                        
                        let displayValue = String(v)
                        const lowerK = k.toLowerCase()
                        if (lowerK.includes('amount') || lowerK.includes('fee')) {
                          displayValue = `$${Number(v).toLocaleString()}`
                        }

                        return (
                          <div key={k} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider mb-0.5">{friendlyLabel}</span>
                            <span className="font-semibold text-slate-800 break-words">{displayValue}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Remarks or reason */}
                {(item.remarks || stageData.manual_adjustment_reason || stageData.manual_reason) && (
                  <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-xs text-slate-600">
                    <span className="font-bold text-slate-700 mr-1.5">Note:</span>
                    {item.remarks || stageData.manual_adjustment_reason || stageData.manual_reason}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Manual Date Edit Inline Modal / Drawer */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h4 className="font-extrabold text-slate-900 text-base">Adjust Progression Date</h4>
                <p className="text-xs text-slate-500 mt-0.5">Stage: {editingItem.current_stage}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingItem(null)} 
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 space-y-1">
              <div className="font-semibold">Original System Timestamp:</div>
              <div className="font-mono text-[11px] text-blue-900">
                {new Date(editingItem.stage_data?.system_timestamp || editingItem.changed_at).toLocaleString()}
              </div>
              <p className="text-[10px] text-blue-700/80 pt-1">
                The original timestamp is permanently preserved in the audit log for compliance.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                New Progression Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B889]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Reason for Adjustment (Optional)
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g., Client signed term sheet on this date"
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#10B889]"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDate}
                onClick={handleSaveDate}
                className="px-5 py-2 bg-[#10B889] hover:bg-[#0c966f] text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingDate ? <Spinner size={14} /> : <Check size={14} />}
                <span>Save Date</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="w-full sm:w-auto px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-600 font-bold hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 text-sm"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}

