'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function DebugRenewalsPage() {
    const [user, setUser] = useState<any>(null)
    const [records, setRecords] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const runDebug = async () => {
            // 1. Get User
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            // 2. Get Raw Data
            const { data, error } = await supabase
                .from('temp_leads_basics')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(20)

            if (error) console.error(error)
            setRecords(data || [])

            // 3. Test Relationship (The likely breaker)
            const { error: relError } = await supabase
                .from('temp_leads_basics')
                .select('id, pipeline_stages!temp_leads_basics_stage_pipeline_fk(stage_name)')
                .limit(1)

            if (relError) {
                console.error('RELATIONSHIP ERROR:', relError)
                alert('Relationship Error: ' + relError.message + ' - Check console')
            }

            setLoading(false)
        }

        runDebug()
    }, [])

    if (loading) return <div className="p-8">Loading debug info...</div>

    return (
        <div className="p-8 max-w-6xl mx-auto font-mono text-sm">
            <h1 className="text-xl font-bold mb-4 text-red-600">DEBUG CONSOLE</h1>

            <div className="bg-gray-100 p-4 rounded mb-6 border">
                <h2 className="font-bold mb-2">Current User Session</h2>
                <p><strong>User ID:</strong> {user?.id || 'NOT LOGGED IN'}</p>
                <p><strong>Email:</strong> {user?.email}</p>
            </div>

            <h2 className="font-bold mb-2">Latest 20 Records (temp_leads_basics)</h2>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300">
                    <thead className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] text-white uppercase text-xs tracking-wider">
                        <tr>
                            <th className="border p-2 text-left">Client</th>
                            <th className="border p-2 text-left">Renewal Date</th>
                            <th className="border p-2 text-left">Policy Flow</th>
                            <th className="border p-2 text-left">Referral</th>
                            <th className="border p-2 text-left">Assigned CSR</th>
                            <th className="border p-2 text-left">Match?</th>
                        </tr>
                    </thead>
                    <tbody>
                        {records.map(r => {
                            const isMatch = user?.id && r.assigned_csr === user.id
                            return (
                                <tr key={r.id} className={isMatch ? 'bg-green-50' : 'bg-red-50'}>
                                    <td className="border p-2">{r.client_name}</td>
                                    <td className="border p-2">{r.renewal_date}</td>
                                    <td className="border p-2">{r.policy_flow}</td>
                                    <td className="border p-2">{r.referral || '-'}</td>
                                    <td className="border p-2 text-xs">{r.assigned_csr || 'NULL'}</td>
                                    <td className="border p-2 font-bold">
                                        {isMatch ? (
                                            <span className="text-green-600">YES</span>
                                        ) : (
                                            <span className="text-red-600">NO</span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
