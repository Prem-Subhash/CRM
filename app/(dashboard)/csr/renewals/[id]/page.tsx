'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Loading from '@/components/ui/Loading'
import { canAccessInsuranceCategory } from '@/utils/authClient'
import RenewalDetailView from '@/components/leads/RenewalDetailView'

export default function RenewalDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const handleBackToPipeline = () => {
    const fromInternalPipeline =
      typeof window !== 'undefined' &&
      document.referrer &&
      document.referrer.includes(window.location.host) &&
      (document.referrer.includes('/csr/pipeline') ||
       document.referrer.includes('/csr/renewals') ||
       document.referrer.includes('/csr/leads') ||
       document.referrer.includes('/csr'));

    if (fromInternalPipeline && window.history.length > 1) {
      router.back();
      return;
    }

    const isCommercialPath = lead?.insurence_category?.toLowerCase() === 'commercial';
    router.push(isCommercialPath ? '/csr/renewals/commercial' : '/csr/renewals/personal');
  };

  const load = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: prof } = await supabase.from('profiles').select('role, insurance_access').eq('id', user.id).single()
    const isGlobalView = prof?.role === 'superadmin' || prof?.role === 'admin'

    let query = supabase
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
        pipeline_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk (
          id,
          stage_name,
          stage_order,
          mandatory_fields
        )
      `)
      .eq('id', id)

    if (!isGlobalView) {
      query = query.eq('assigned_csr', user.id) // STRICT CSR AUTHORIZATION
    }

    const { data, error } = await query.single()

    if (error || !data) {
      console.error("Renewal fetch error:", error)
      setLoading(false)
      return
    }

    if (!canAccessInsuranceCategory(prof, data.insurence_category)) {
      router.replace('/unauthorized')
      return
    }

    const stage = Array.isArray(data.pipeline_stage)
      ? data.pipeline_stage[0]
      : (data.pipeline_stage || null)

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
      <Loading message="Syncing renewal data..." />
    </div>
  )

  if (!lead) return (
    <div className="p-8 text-center">
      <h2 className="text-xl font-semibold text-gray-700">Renewal Not Found</h2>
      <p className="text-gray-500 mt-2">This renewal does not exist or you do not have permission to view it.</p>
    </div>
  )

  return <RenewalDetailView initialLead={lead} onBack={handleBackToPipeline} refreshLead={load} />
}
