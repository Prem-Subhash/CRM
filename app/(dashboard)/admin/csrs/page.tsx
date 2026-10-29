import { createServer } from '@/lib/supabaseServer'
import Link from 'next/link'
import { AdminCsrCreationHeader } from '@/components/users/AdminCsrCreationHeader'


export default async function AdminCSRsPage() {
    const supabase = await createServer()

    // Fetch CSR profiles
    const { data: csrs } = await supabase
        .from('profiles')
        .select('id, full_name, email, created_at, insurance_access, is_active')
        .eq('role', 'csr')
        .order('created_at', { ascending: false })

    return (
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <AdminCsrCreationHeader />

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                                <tr className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white  tracking-wider">
                                    <th className="p-4 font-semibold">CSR</th>
                                    <th className="p-4 font-semibold">Email Address</th>
                                    <th className="p-4 font-semibold">Insurance Access</th>
                                    <th className="p-4 font-semibold">Status</th>
                                    <th className="p-4 font-semibold">Joined Date</th>
                                    <th className="p-4 font-semibold text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(csrs || []).map((csr: any) => (
                                    <tr key={csr.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="p-4 text-gray-800 font-medium">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm">
                                                    {csr.full_name?.charAt(0) || 'U'}
                                                </div>
                                                {csr.full_name || 'Unknown User'}
                                            </div>
                                        </td>
                                        <td className="p-4 text-gray-600 text-sm">{csr.email}</td>
                                        <td className="p-4">
                                            {csr.insurance_access && (
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {csr.insurance_access.includes('personal') && (
                                                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-xs font-bold uppercase">Personal</span>
                                                    )}
                                                    {csr.insurance_access.includes('commercial') && (
                                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-xs font-bold uppercase">Commercial</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${csr.is_active !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                                                {csr.is_active !== false ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-gray-500 text-sm">
                                            {new Date(csr.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 text-right">
                                            <Link
                                                href={`/admin/csrs/${csr.id}`}
                                                className="text-sm font-bold text-emerald-600 hover:text-emerald-800 hover:underline transition-colors"
                                            >
                                                View Workload
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                                {(!csrs || csrs.length === 0) && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">
                                            No CSRs found in the system.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}
