import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServer } from '@/lib/supabaseServer'
import DashboardClientLayout from './DashboardClientLayout'

export const metadata: Metadata = {
  title: 'Innovative Insurance CRM',
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServer()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return <DashboardClientLayout>{children}</DashboardClientLayout>
}
