'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Search, Filter, Pencil, Building2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { LENDING_STAGES } from '@/app/lending/lib/constants'
import { AccurateLendingLoan } from '@/app/lending/lib/types'

export default function LendingLoansDirectoryPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('ALL')
  const [loans, setLoans] = useState<AccurateLendingLoan[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const formatCommission = (val: any) => {
    if (val === null || val === undefined || val === '') return '—'
    const num = Number(val)
    if (isNaN(num)) return '—'
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  useEffect(() => {
    const fetchLoans = async () => {
      try {
        setIsLoading(true)
        const res = await fetch('/api/lending/loans?limit=500')
        const json = await res.json()
        if (json.success) {
          setLoans(json.loans || [])
        } else {
          throw new Error(json.error)
        }
      } catch (err: any) {
        toast(err.message, 'error')
      } finally {
        setIsLoading(false)
      }
    }
    fetchLoans()
  }, [])

  const filteredLoans = loans.filter(loan => {
    const matchesSearch = 
      (loan.borrower_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loan.loan_type || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (loan.nature_of_loan || '').toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesType = selectedType === 'ALL' || loan.loan_type === selectedType

    return matchesSearch && matchesType
  })

  return (
    <div className="w-full space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#10B889] mb-1">
            <Building2 size={14} />
            <span>Commercial Loan Directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Active Loan Portfolio
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            View all borrower applications, assigned lenders, and current stage statuses.
          </p>
        </div>

        <button
          onClick={() => router.push('/lending/loans/new')}
          className="w-full sm:w-auto bg-brand hover:bg-brand-dark text-white font-bold py-3 px-5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
        >
          <PlusCircle size={18} />
          <span> New Loan Application</span>
        </button>
      </div>

      {/* Toolbar & Filter Bar */}
      <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search borrower, lender, or nature..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 hover:bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#10B889]/20 focus:border-[#10B889] transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5 mr-1 whitespace-nowrap">
            <Filter size={14} />
            Loan Type:
          </span>
          <select 
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-gray-100 text-gray-700 border border-gray-200"
          >
              <option value="ALL">All Types</option>
              <option value="SBA 7a">SBA 7a</option>
              <option value="SBA 504">SBA 504</option>
              <option value="Conventional">Conventional</option>
              <option value="Bridge Loan">Bridge Loan</option>
              <option value="Private Loan">Private Loan</option>
              <option value="Equipment Financing">Equipment Financing</option>
          </select>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white border border-gray-200/80 rounded-2xl shadow-sm overflow-hidden flex-1">
        <div className="p-4 bg-slate-50/70 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Showing {filteredLoans.length} Loans
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left table-fixed min-w-[1300px]">
             <colgroup>
                <col className="w-[200px]" />
                <col className="w-[120px]" />
                <col className="w-[200px]" />
                <col className="w-[140px]" />
                <col className="w-[150px]" />
                <col className="w-[240px]" />
                <col className="w-[120px]" />
                <col className="w-[100px]" />
            </colgroup>
            <thead className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white text-[10px] uppercase tracking-wider border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold">Borrower Name</th>
                <th className="px-6 py-4 font-semibold">Loan Type</th>
                <th className="px-6 py-4 font-semibold">Purpose & Nature</th>
                <th className="px-6 py-4 font-semibold">Amount / Down</th>
                <th className="px-6 py-4 font-semibold">Broker Commission</th>
                <th className="px-6 py-4 font-semibold">Pipeline Stage</th>
                <th className="px-6 py-4 font-semibold text-center">Inquiry Date</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                  <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-500">Loading directory...</td>
                  </tr>
              ) : filteredLoans.length === 0 ? (
                  <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-slate-500">No loans found matching your criteria.</td>
                  </tr>
              ) : (
                filteredLoans.map(loan => (
                <tr key={loan.id} className="hover:bg-gray-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="font-extrabold text-slate-900 truncate">{loan.borrower_name}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">ID: {loan.id.split('-').pop()}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md text-xs border border-slate-200">
                      {loan.loan_type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-800 truncate">{loan.loan_purpose}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{loan.nature_of_loan}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-extrabold text-slate-900 text-base">
                        {loan.purchase_price ? `$${Number(loan.purchase_price).toLocaleString()}` : '—'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Down: {loan.down_payment_percent}%</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-extrabold text-slate-900 text-base">
                      {formatCommission(loan.broker_commission)}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase whitespace-nowrap border inline-block bg-gray-100 border-gray-200 text-gray-700`}>
                      {loan.current_stage || LENDING_STAGES[0]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-slate-500 font-medium whitespace-nowrap">
                    {loan.inquiry_date ? loan.inquiry_date : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => router.push(`/lending/loans/${loan.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-[#10B889] text-emerald-700 hover:text-white font-bold rounded-lg transition-all text-xs border border-emerald-200 hover:border-[#10B889] shadow-2xs"
                    >
                      <Pencil size={14} />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
