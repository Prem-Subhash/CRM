'use client'

import React, { useState, useEffect } from 'react'
import {
  Landmark,
  Plus,
  Trash2,
  Copy,
  Building2,
  Mail,
  Phone,
  UserCheck,
  Briefcase,
  ShieldCheck,
  Check,
  X
} from 'lucide-react'
import { toast } from '@/lib/toast'

export interface LenderBlockData {
  id: string
  lenderBank: string
  bankOfficerName: string
  bankUnderwriterName: string
  titleAgencyName: string
  bankClosingAgentName: string
  contactEmail: string
  contactPhone: string
  isCustomBank?: boolean
}

const PREDEFINED_BANKS = [
  'American Commercial Bank & Trust',
  'Byline Bank',
  'Celtic Bank',
  'Center Stone SBA Lending',
  'First Financial Bank',
  'Harvest Bank',
  'LakeSide Bank',
  'Merchants Bank',
  'US Bank',
  'First Midwest Commercial',
  'BMO Harris Commercial Lending',
  'Chase Business Banking'
]

interface SectionELenderInfoProps {
  initialBlocks?: LenderBlockData[]
  onChange?: (blocks: LenderBlockData[]) => void
}

export default function SectionELenderInfo({
  initialBlocks,
  onChange
}: SectionELenderInfoProps) {
  const [blocks, setBlocks] = useState<LenderBlockData[]>(
    initialBlocks && initialBlocks.length > 0 ? initialBlocks : []
  )

  useEffect(() => {
    if (initialBlocks) {
      setBlocks(initialBlocks)
    }
  }, [initialBlocks])

  // Quick Action "+ Add Bank" modal/input state
  const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false)
  const [customBankName, setCustomBankName] = useState('')
  const [customBankOfficer, setCustomBankOfficer] = useState('')
  const [customBankEmail, setCustomBankEmail] = useState('')

  const [availableBanksList, setAvailableBanksList] = useState<string[]>(PREDEFINED_BANKS)

  const updateBlock = (id: string, field: keyof LenderBlockData, value: string) => {
    const nextBlocks = blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    setBlocks(nextBlocks)
    if (onChange) onChange(nextBlocks)
  }

  // Requirement 3: Every click on "+ Add More" duplicates or adds a complete lender information block
  const handleAddMore = () => {
    const lastBlock = blocks[blocks.length - 1]
    const newBlock: LenderBlockData = lastBlock
      ? {
          ...lastBlock,
          id: `lender-block-${Date.now()}`,
          lenderBank: lastBlock.lenderBank // Duplicates complete lender block
        }
      : {
          id: `lender-block-${Date.now()}`,
          lenderBank: PREDEFINED_BANKS[0] || 'American Commercial Bank & Trust',
          bankOfficerName: '',
          bankUnderwriterName: '',
          titleAgencyName: '',
          bankClosingAgentName: '',
          contactEmail: '',
          contactPhone: ''
        }

    const nextBlocks = [...blocks, newBlock]
    setBlocks(nextBlocks)
    if (onChange) onChange(nextBlocks)
    toast(lastBlock ? 'Duplicated complete lender information block' : 'Added lender information block', 'success')
  }

  // Requirement 5: Allow removing dynamically added lender blocks
  const handleRemoveBlock = (id: string) => {
    const nextBlocks = blocks.filter((b) => b.id !== id)
    setBlocks(nextBlocks)
    if (onChange) onChange(nextBlocks)
    toast('Removed Lender Information block', 'info')
  }

  // Requirement 1: "+ Add Bank" quick action to manually create a custom lender entry
  const handleCreateCustomBankEntry = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customBankName.trim()) {
      toast('Please enter a custom bank name', 'error')
      return
    }

    if (!availableBanksList.includes(customBankName.trim())) {
      setAvailableBanksList((prev) => [...prev, customBankName.trim()])
    }

    const newCustomBlock: LenderBlockData = {
      id: `lender-custom-${Date.now()}`,
      lenderBank: customBankName.trim(),
      bankOfficerName: customBankOfficer.trim() || 'Assigned Officer',
      bankUnderwriterName: '',
      titleAgencyName: 'Standard Title & Escrow Agency',
      bankClosingAgentName: '',
      contactEmail: customBankEmail.trim() || 'officer@custombank.com',
      contactPhone: '(555) 000-0000',
      isCustomBank: true
    }

    const nextBlocks = [...blocks, newCustomBlock]
    setBlocks(nextBlocks)
    if (onChange) onChange(nextBlocks)

    setIsAddBankModalOpen(false)
    setCustomBankName('')
    setCustomBankOfficer('')
    setCustomBankEmail('')
    toast(`Added custom lender entry for "${newCustomBlock.lenderBank}"`, 'success')
  }

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      {/* Section E Header Banner */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-extrabold">
                E
              </span>
              <span>Section E — Lender Information</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage assigned financial institutions, officers, underwriters, and closing/title agents. Each lender block is independently editable.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Requirement 1: + Add Bank Quick Action */}
            <button
              type="button"
              onClick={() => setIsAddBankModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#10B889] border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Plus size={15} />
              <span>+ Add Bank (Custom Entry)</span>
            </button>
          </div>
        </div>

        {/* Custom "+ Add Bank" Inline Quick Creation Box */}
        {isAddBankModalOpen && (
          <form
            onSubmit={handleCreateCustomBankEntry}
            className="bg-emerald-50/60 border-2 border-emerald-200 rounded-2xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark size={18} className="text-[#10B889]" />
                <h4 className="text-sm font-extrabold text-slate-900">
                  Quick Action: Manually Create Custom Lender Entry
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsAddBankModalOpen(false)}
                className="text-gray-400 hover:text-slate-700 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                  Custom Lender / Bank Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Heritage Valley Commercial Bank"
                  value={customBankName}
                  onChange={(e) => setCustomBankName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#10B889] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                  Bank Officer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. David Miller (VP Commercial)"
                  value={customBankOfficer}
                  onChange={(e) => setCustomBankOfficer(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#10B889] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  placeholder="officer@bank.com"
                  value={customBankEmail}
                  onChange={(e) => setCustomBankEmail(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#10B889] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddBankModalOpen(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-1.5 bg-brand hover:bg-brand-dark text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Create Lender Entry</span>
              </button>
            </div>
          </form>
        )}

        {/* Dynamic Lender Information Blocks */}
        <div className="space-y-6">
          {blocks.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-slate-50/50 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-[#10B889] flex items-center justify-center mx-auto">
                <Landmark size={24} />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Participating Lenders Assigned</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No lender banking institutions are currently attached to this commercial loan file. Click <strong className="text-slate-700">+ Add Bank</strong> or <strong className="text-slate-700">+ Add First Lender</strong> to assign participating financial institutions.
              </p>
              <button
                type="button"
                onClick={handleAddMore}
                className="px-4 py-2 bg-white border border-gray-300 hover:border-[#10B889] text-slate-700 hover:text-[#10B889] text-xs font-bold rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5"
              >
                <Plus size={14} />
                <span>+ Add First Lender</span>
              </button>
            </div>
          ) : (
            blocks.map((block, index) => (
              <div
                key={block.id}
                className="bg-slate-50/70 border border-gray-200 rounded-2xl p-6 shadow-2xs space-y-5 transition-all hover:border-slate-300"
              >
              {/* Block Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-200/80">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#10B889] text-white font-extrabold text-xs flex items-center justify-center shadow-2xs">
                    #{index + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                      Lender Information Block #{index + 1}
                    </h3>
                    {block.isCustomBank && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                        Custom Bank
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {/* Duplicate this block quick action */}
                  <button
                    type="button"
                    onClick={() => {
                      const duplicate: LenderBlockData = {
                        ...block,
                        id: `lender-block-${Date.now()}`
                      }
                      const nextBlocks = [...blocks]
                      nextBlocks.splice(index + 1, 0, duplicate)
                      setBlocks(nextBlocks)
                      if (onChange) onChange(nextBlocks)
                      toast(`Duplicated Block #${index + 1}`, 'success')
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1 shadow-2xs"
                    title="Duplicate Lender Block"
                  >
                    <Copy size={13} />
                    <span>Duplicate</span>
                  </button>

                  {/* Requirement 5: Remove dynamically added lender block */}
                  <button
                    type="button"
                    onClick={() => handleRemoveBlock(block.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                    title="Remove Lender Block"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Form Grid for all 7 required fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* 1. Lender / Bank */}
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Landmark size={14} className="text-[#10B889]" />
                    <span>Lender / Bank</span>
                  </label>
                  <input
                    type="text"
                    list={`banks-list-${block.id}`}
                    value={block.lenderBank}
                    onChange={(e) => updateBlock(block.id, 'lenderBank', e.target.value)}
                    placeholder="Select or enter bank name..."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                  <datalist id={`banks-list-${block.id}`}>
                    {availableBanksList.map((bank) => (
                      <option key={bank} value={bank} />
                    ))}
                  </datalist>
                </div>

                {/* 2. Bank Officer Name */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <UserCheck size={14} className="text-slate-500" />
                    <span>Bank Officer Name</span>
                  </label>
                  <input
                    type="text"
                    value={block.bankOfficerName}
                    onChange={(e) => updateBlock(block.id, 'bankOfficerName', e.target.value)}
                    placeholder="e.g. Robert Jenkins (SBA Officer)"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                {/* 3. Bank Underwriter Officer Name */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-slate-500" />
                    <span>Bank Underwriter Officer Name</span>
                  </label>
                  <input
                    type="text"
                    value={block.bankUnderwriterName}
                    onChange={(e) => updateBlock(block.id, 'bankUnderwriterName', e.target.value)}
                    placeholder="e.g. Michael Chang (VP Underwriting)"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                {/* 4. Title Agent / Title Agency Name */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Building2 size={14} className="text-slate-500" />
                    <span>Title Agent / Title Agency Name</span>
                  </label>
                  <input
                    type="text"
                    value={block.titleAgencyName}
                    onChange={(e) => updateBlock(block.id, 'titleAgencyName', e.target.value)}
                    placeholder="e.g. First American Title & Escrow Co."
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                {/* 5. Bank Closing Agent Name */}
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Briefcase size={14} className="text-slate-500" />
                    <span>Bank Closing Agent Name</span>
                  </label>
                  <input
                    type="text"
                    value={block.bankClosingAgentName}
                    onChange={(e) => updateBlock(block.id, 'bankClosingAgentName', e.target.value)}
                    placeholder="e.g. Sarah Jenkins (Closing Counsel)"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  />
                </div>

                {/* 6 & 7. Contact Email & Contact Phone */}
                <div className="sm:col-span-2 lg:col-span-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <Mail size={14} className="text-slate-500" />
                      <span>Contact Email</span>
                    </label>
                    <input
                      type="email"
                      value={block.contactEmail}
                      onChange={(e) => updateBlock(block.id, 'contactEmail', e.target.value)}
                      placeholder="officer@bank.com"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-gray-700 mb-1.5 flex items-center gap-1.5">
                      <Phone size={14} className="text-slate-500" />
                      <span>Contact Phone</span>
                    </label>
                    <input
                      type="tel"
                      value={block.contactPhone}
                      onChange={(e) => updateBlock(block.id, 'contactPhone', e.target.value)}
                      placeholder="(312) 888-4321"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )))}
        </div>

        {/* Requirement 2 & 3: "+ Add More" button below Section E */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100">
          <div className="text-xs font-semibold text-slate-500">
            Showing <strong className="text-slate-800">{blocks.length}</strong> independent Lender Information {blocks.length === 1 ? 'block' : 'blocks'}.
          </div>

          <button
            type="button"
            onClick={handleAddMore}
            className="w-full sm:w-auto px-6 py-3 bg-brand hover:bg-brand-dark text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
          >
            <Plus size={16} />
            <span> Add More (Duplicate Lender Block)</span>
          </button>
        </div>
      </div>
    </div>
  )
}
