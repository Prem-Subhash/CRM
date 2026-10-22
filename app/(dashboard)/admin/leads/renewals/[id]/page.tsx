'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Loading from '@/components/ui/Loading'
import RenewalDetailView from '@/components/leads/RenewalDetailView'

export default function AdminRenewalDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const handleBackToPipeline = () => {
    const isCommercialPath = lead?.insurence_category?.toLowerCase() === 'commercial';
    router.push(isCommercialPath ? '/admin/insurance/commercial-renewal' : '/admin/insurance/personal-renewal');
  };

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/login')
      return
    }

    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!prof || (prof.role !== 'admin' && prof.role !== 'superadmin')) {
      router.replace('/unauthorized')
      return
    }

    const { data, error } = await supabase
      .from('temp_leads_basics')
      .select(`
        id,
        client_name,
        email,
        phone,
        policy_type,
        renewal_date,
        carrier,
        policy_number,
        current_premium,
        renewal_premium,
        new_carrier,
        new_policy_number,
        new_premium,
        pipeline_id,
        current_stage_id,
        stage_metadata,
        business_name,
        insurence_category,
        savings,
        pipeline_stages!temp_leads_basics_stage_pipeline_fk (
          id,
          stage_name,
          stage_order,
          mandatory_fields
        )
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      console.error(error)
      setLoading(false)
      return
    }

    const stage = Array.isArray(data.pipeline_stages)
      ? data.pipeline_stages[0]
      : data.pipeline_stages

    setLead({
      ...data,
      pipeline_stage: stage,
    })

    setLoading(false)
  }

  useEffect(() => {
    if (id) {
      load()
    }
  }, [id])

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Loading message="Syncing admin renewal data..." />
    </div>
  )

  if (!lead) return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-700">Renewal Not Found</h2>
      <p className="text-gray-500 mt-2">This renewal does not exist.</p>
    </div>
  )

  return <RenewalDetailView initialLead={lead} onBack={handleBackToPipeline} refreshLead={load} />
}
