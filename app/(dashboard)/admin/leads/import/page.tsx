'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { parseImportFile, normalizeImportDate } from '@/utils/fileParser'
import {
    resolveRenewalPipelineAndStage,
    validateRenewalRecord,
    buildRenewalPayload,
    saveRenewalRecords
} from '@/utils/renewalHelper'
import Papa from 'papaparse'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Info, ArrowLeft } from 'lucide-react'
import { Spinner } from '@/components/ui/Loading'
import PageBackButton from '@/components/ui/PageBackButton'

export default function AdminRenewalImportPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const category = searchParams.get('category') === 'commercial' ? 'commercial' : 'personal'

    const [rows, setRows] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)
    const [detectedHeaders, setDetectedHeaders] = useState<string[]>([])
    const [normalizedHeaders, setNormalizedHeaders] = useState<string[]>([])
    const [missingHeaders, setMissingHeaders] = useState<string[]>([])
    const [mappingMismatches, setMappingMismatches] = useState<string[]>([])

    const EXPECTED_HEADERS = [
        'Applicant Data Account Name',
        'Applicant Data Lead Source',
        'Policy Data Policy Type',
        'Policy Data Line Of Business',
        'Policy Data Master Company',
        'Policy Data Policy Number',
        'Policy Data Policy Expiration Date',
        'Policy Data TotalWrittenPremium'
    ]

    const normalizeKey = (key: string) => {
        if (!key) return ''
        return key
            .replace(/\uFEFF/g, '') // remove BOM
            .trim()
            .replace(/\s+/g, ' ') // normalize multiple spaces
    }

    const formatDate = (input: any) => normalizeImportDate(input)

    const processParsedData = (data: any[]) => {
        const rawHeaders = Object.keys(data[0] || {})
        const normHeaders = rawHeaders.map(h => normalizeKey(h).toLowerCase())
        setDetectedHeaders(rawHeaders)
        setNormalizedHeaders(normHeaders)

        const expectedLower = EXPECTED_HEADERS.map(h => h.toLowerCase())
        setMissingHeaders(expectedLower.filter(h => !normHeaders.includes(h)))

        setMappingMismatches(rawHeaders.filter(h => normalizeKey(h) !== h))

        const normalizedData = data.map((row: any) => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
                const normalizedKey = normalizeKey(key).toLowerCase();
                let val = row[key];
                if (normalizedKey === 'policy data policy expiration date' || normalizedKey.includes('date') || normalizedKey.includes('expiration')) {
                    const normDate = formatDate(val);
                    val = normDate !== null ? normDate : (val !== null && val !== undefined ? String(val) : '');
                } else if (val !== null && val !== undefined && typeof val !== 'string') {
                    val = String(val);
                }
                newRow[normalizedKey] = val;
            });
            return newRow;
        });
        setRows(normalizedData)
        setMessage({ text: `${data.length} rows loaded. Ready to import.`, type: 'info' })
    }

    const handleFileUpload = async (file: File) => {
        setFileName(file.name)
        setMessage({ text: 'Parsing file...', type: 'info' })

        const isExcel = file.name.match(/\.(xlsx|xls)$/i)

        if (isExcel) {
            try {
                const ExcelJS = (await import('exceljs')).default
                const workbook = new ExcelJS.Workbook()
                await workbook.xlsx.load(await file.arrayBuffer())
                const worksheet = workbook.worksheets[0]

                if (!worksheet || worksheet.rowCount === 0) {
                    throw new Error('Empty Excel file')
                }

                const rawData: any[] = []
                let headers: string[] = []

                worksheet.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) {
                        row.eachCell((cell, colNumber) => {
                            headers[colNumber] = cell.text || cell.value?.toString() || `Column${colNumber}`
                        })
                    } else {
                        const rowData: any = {}
                        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                            const header = headers[colNumber]
                            if (header) {
                                let val = cell.value;
                                if (val && typeof val === 'object') {
                                    if (val instanceof Date) {
                                        val = val;
                                    } else if ('result' in val && val.result !== undefined) {
                                        val = val.result;
                                    } else if ('text' in val && val.text !== undefined) {
                                        val = val.text;
                                    } else {
                                        val = cell.text || '';
                                    }
                                }
                                rowData[header] = val !== null && val !== undefined ? val : (cell.text || '');
                            }
                        })
                        rawData.push(rowData)
                    }
                })

                if (rawData.length >
                    0) {
                    console.log("EXCEL RAW RESULTS:", rawData)
                    processParsedData(rawData)
                } else {
                    throw new Error('No data found in Excel file')
                }
            } catch (err) {
                console.error(err)
                setMessage({ text: 'Excel file could not be parsed.', type: 'error' })
                setRows([])
                setDetectedHeaders([])
                setNormalizedHeaders([])
                setMissingHeaders([])
                setMappingMismatches([])
            }
        } else {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    console.log("CSV RAW RESULTS:", results)
                    if (results.data && results.data.length > 0) {
                        processParsedData(results.data)
                    } else {
                        setRows([])
                        setDetectedHeaders([])
                        setNormalizedHeaders([])
                        setMissingHeaders([])
                        setMappingMismatches([])
                        setMessage({ text: 'CSV file is empty or could not be parsed.', type: 'error' })
                    }
                },
                error: (error) => {
                    console.error(error)
                    setMessage({ text: 'Error reading CSV file.', type: 'error' })
                }
            })
        }
    }


    const validateRow = (r: any) => {
        return validateRenewalRecord(r, category, true)
    }

    const handleImport = async () => {
        setLoading(true)
        setMessage(null)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            setMessage({ text: 'Session expired. Please login again.', type: 'error' })
            setLoading(false)
            return
        }

        let pipelineResolution
        try {
            pipelineResolution = await resolveRenewalPipelineAndStage(supabase, category)
        } catch (err: any) {
            setMessage({ text: err.message || 'Failed to resolve renewal pipeline stage.', type: 'error' })
            setLoading(false)
            return
        }

        const { pipelineId, stageId } = pipelineResolution
        const payload: any[] = []
        const skippedRows: string[] = []

        rows.forEach((r, index) => {
            const validation = validateRow(r)
            if (!validation.isValid) {
                skippedRows.push(`Row ${index + 1}: ${validation.errors.join(', ')}`)
                return
            }

            // PASS NULL TO assigned_csr so it remains unassigned for Admins
            payload.push(buildRenewalPayload(r, category, pipelineId, stageId, null, true))
        })

        if (payload.length === 0) {
            setMessage({
                text: skippedRows.length > 0
                    ? `Validation failed: all rows were skipped due to errors. Errors:\n${skippedRows.slice(0, 5).join('\n')}${skippedRows.length > 5 ? '\n...' : ''}`
                    : 'No valid data to import.',
                type: 'error'
            })
            setLoading(false)
            return
        }

        try {
            const response = await fetch('/api/renewals/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category, payload }),
            })
            const resData = await response.json()

            if (!response.ok || resData.error) {
                setMessage({ text: `Import failed: ${resData.error || 'Server error'}`, type: 'error' })
            } else {
                let successMsg = `Successfully imported ${resData.count || payload.length} ${category} renewals.`
                if (skippedRows.length > 0) {
                    successMsg += ` Skipped ${skippedRows.length} rows due to validation errors:\n${skippedRows.slice(0, 5).join('\n')}${skippedRows.length > 5 ? '\n...' : ''}`
                }
                setMessage({ text: successMsg, type: 'success' })
                setRows([])
                setFileName(null)
                setDetectedHeaders([])
                setNormalizedHeaders([])
            }
        } catch (err: any) {
            setMessage({ text: `Import failed: ${err.message || 'Network error'}`, type: 'error' })
        }

        setLoading(false)
    }



    return (
        <div className="p-8 max-w-2xl mx-auto">
            <PageBackButton fallbackUrl="/admin/leads" className="mb-4" />
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-4">

                    <div className="p-3 bg-brand/10 rounded-2xl text-brand">
                        <FileSpreadsheet size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 tracking-tight capitalize">
                            Import {category} Renewals
                        </h1>
                        <p className="text-gray-500 mt-1 flex items-center gap-2">
                            Upload a CSV or Excel file to bulk create {category} renewal records (Admin Unassigned)
                        </p></div>
                </div>
            </div>

            {/* Unified Card */}
            <div className="bg-white border border-gray-100 rounded-[32px] shadow-2xl shadow-gray-200/50 overflow-hidden">
                <div className="p-8 md:p-10 space-y-10">
                    {/* Requirements Section */}
                    <div className="bg-emerald-50/50 rounded-2xl p-6 border border-emerald-100/50">
                        <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Info size={16} className="text-emerald-600" />
                            Required Excel Columns
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                            {[
                                'Applicant Data Account Name',
                                'Applicant Data Lead Source',
                                'Policy Data Policy Type',
                                'Policy Data Line Of Business',
                                'Policy Data Master Company',
                                'Policy Data Policy Number',
                                'Policy Data Policy Expiration Date',
                                'Policy Data TotalWrittenPremium',
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-2.5 text-sm text-emerald-900 font-medium">
                                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Upload Area */}
                    <div className="space-y-6">
                        <div className="relative group">
                            <input
                                type="file"
                                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                                id="file-upload"
                                className="hidden"
                                onChange={e => e.target.files && handleFileUpload(e.target.files[0])}
                            />
                            <label
                                htmlFor="file-upload"
                                className={`
                                    flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-[24px] cursor-pointer transition-all
                                    ${fileName
                                        ? 'bg-emerald-50/20 border-emerald-200 text-emerald-900'
                                        : 'bg-gray-50/50 border-gray-200 hover:border-brand/40 hover:bg-brand/5 text-gray-500'}
                                `}
                            >
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${fileName ? 'bg-emerald-100 text-emerald-600' : 'bg-white shadow-sm text-gray-400'}`}>
                                    <Upload size={32} />
                                </div>
                                <div className="text-center">
                                    <p className="text-lg font-bold text-gray-900 mb-1">
                                        {fileName ? fileName : 'Drag & drop your CSV or Excel file'}
                                    </p>
                                    <p className="text-sm">
                                        {fileName ? 'Click to change file' : 'or click to browse from computer'}
                                    </p>
                                </div>
                            </label>
                        </div>

                        {/* CSV Header Debug Panel */}
                        {detectedHeaders.length > 0 && (
                            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-6 space-y-4">
                                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                    File Header Debugger
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                    <div className="space-y-1.5">
                                        <p className="font-bold text-slate-500">Detected Headers ({detectedHeaders.length}):</p>
                                        <div className="bg-white border border-slate-100 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[10px] text-slate-700 divide-y divide-slate-100">
                                            {detectedHeaders.map((h, i) => (
                                                <div key={i} className="py-1 flex justify-between gap-2">
                                                    <span className="break-all" title={h}>{h || ' [Empty] '}</span>
                                                    {normalizeKey(h) !== h && (
                                                        <span className="text-[9px] bg-amber-50 text-amber-700 px-1 rounded font-sans shrink-0 font-bold">Has Whitespace/BOM</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="font-bold text-slate-500">Normalized Headers ({normalizedHeaders.length}):</p>
                                        <div className="bg-white border border-slate-100 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[10px] text-slate-700 divide-y divide-slate-100">
                                            {normalizedHeaders.map((h, i) => (
                                                <div key={i} className="py-1">
                                                    <span className="break-all" title={h}>{h || ' [Empty] '}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 text-xs">
                                    {missingHeaders.length > 0 ? (
                                        <div className="bg-red-50 border border-red-100/50 rounded-xl p-3 text-red-800 space-y-1">
                                            <p className="font-bold flex items-center gap-1.5 text-red-900">
                                                <AlertCircle size={14} className="text-red-600 shrink-0" />
                                                Missing Expected Headers ({missingHeaders.length}):
                                            </p>
                                            <ul className="list-disc pl-5 font-mono text-[10px] space-y-0.5">
                                                {missingHeaders.map((h, i) => (
                                                    <li key={i}>{h}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : (
                                        <div className="bg-emerald-50 border border-emerald-100/50 rounded-xl p-3 text-emerald-800 font-medium flex items-center gap-1.5">
                                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                                            All expected headers found and matched successfully!
                                        </div>
                                    )}

                                    {mappingMismatches.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-100/50 rounded-xl p-3 text-amber-800 space-y-1">
                                            <p className="font-bold flex items-center gap-1.5 text-amber-900">
                                                <Info size={14} className="text-amber-600 shrink-0" />
                                                Resolved Mapping Mismatches ({mappingMismatches.length}):
                                            </p>
                                            <ul className="list-disc pl-5 font-mono text-[10px] space-y-1">
                                                {mappingMismatches.map((h, i) => (
                                                    <li key={i}>
                                                        Raw: <span className="bg-white px-1 py-0.5 rounded border border-amber-200">"{h}"</span>
                                                        &rarr; Cleaned: <span className="bg-white px-1 py-0.5 rounded border border-amber-200 font-bold">"{normalizeKey(h)}"</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Loaded Data Preview Table */}
                        {rows.length > 0 && message?.type !== 'success' && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Loaded Data Preview</h3>
                                    <span className="text-xs text-gray-500 font-semibold bg-gray-100 px-2 py-1 rounded">{rows.length} rows loaded</span>
                                </div>
                                <div className="border border-gray-200 rounded-xl overflow-auto shadow-sm max-h-72">
                                    <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                                        <thead className="bg-gray-50 text-gray-700 font-bold uppercase sticky top-0 border-b border-gray-200">
                                            <tr>
                                                <th className="p-3">Client / Account</th>
                                                <th className="p-3">Line of Business</th>
                                                <th className="p-3">Policy #</th>
                                                <th className="p-3">Carrier</th>
                                                <th className="p-3">Expiration</th>
                                                <th className="p-3">Premium</th>
                                                <th className="p-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {rows.slice(0, 15).map((r, idx) => {
                                                const validation = validateRow(r);
                                                return (
                                                    <tr key={idx} className={`hover:bg-gray-50/50 ${validation.isValid ? '' : 'bg-red-50/20'}`}>
                                                        <td className="p-3 font-semibold text-gray-800 break-words align-top" title={r['applicant data account name']}>
                                                            {r['applicant data account name'] || '—'}
                                                        </td>
                                                        <td className="p-3 text-gray-600 break-words align-top" title={r['policy data line of business']}>
                                                            {r['policy data line of business'] || '—'}
                                                        </td>
                                                        <td className="p-3 text-gray-500 font-mono break-all align-top" title={r['policy data policy number']}>
                                                            {r['policy data policy number'] || '—'}
                                                        </td>
                                                        <td className="p-3 text-gray-600 break-words align-top" title={r['policy data master company']}>
                                                            {r['policy data master company'] || '—'}
                                                        </td>
                                                        <td className="p-3 text-gray-700 whitespace-nowrap align-top" title={r['policy data policy expiration date']}>
                                                            {r['policy data policy expiration date'] || '—'}
                                                        </td>
                                                        <td className="p-3 text-gray-900 font-semibold whitespace-nowrap align-top">
                                                            {r['policy data totalwrittenpremium'] ? `$${Number(r['policy data totalwrittenpremium']).toLocaleString()}` : '—'}
                                                        </td>
                                                        <td className="p-3 text-center whitespace-nowrap align-top">
                                                            {validation.isValid ? (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                    Valid
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200" title={validation.errors.join(', ')}>
                                                                    Skip: {validation.errors[0]}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {rows.length > 15 && (
                                    <p className="text-xs text-gray-400 text-center italic">Showing first 15 rows of {rows.length}</p>
                                )}
                            </div>
                        )}

                        {rows.length > 0 && message?.type !== 'success' && (
                            <button
                                onClick={handleImport}
                                disabled={loading}
                                className="w-full bg-brand-dark hover:bg-brand text-white py-4 rounded-2xl font-bold shadow-xl shadow-brand/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
                            >
                                {loading && <Spinner size={20} />}
                                {loading ? 'Importing Data...' : `Start Importing ${rows.length} Rows`}
                            </button>
                        )}

                        {message && (
                            <div className={`
                                p-6 rounded-2xl flex items-start gap-4 border animate-in slide-in-from-top-4
                                ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
                                    message.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' :
                                        'bg-blue-50 border-blue-100 text-blue-800'}
                            `}>
                                {message.type === 'success' ? <CheckCircle2 className="shrink-0 text-emerald-500 mt-0.5" /> :
                                    message.type === 'error' ? <AlertCircle className="shrink-0 text-red-500 mt-0.5" /> :
                                        <Info className="shrink-0 text-blue-500 mt-0.5" />}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold uppercase tracking-wider mb-2 leading-none">{message.type}</p>
                                    <p className="text-sm font-medium opacity-90 leading-relaxed whitespace-pre-line overflow-y-auto max-h-48 scrollbar-thin">{message.text}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
