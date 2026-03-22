import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ROLE_ROUTE: Record<string, string> = {
  Admin: '/admin',
  HR: '/hr',
  ZonalManager: '/zonal',
  ZonalOps: '/zonal-ops',
  ZonalHK: '/zonal-hk',
  Housekeeping: '/housekeeping',
  FrontDesk: '/front-desk',
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    redirect('/login')
  }

  const { data: staff } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', session.user.id)
    .single()

  if (!staff?.role) {
    redirect('/login')
  }

  redirect(ROLE_ROUTE[staff.role] || '/front-desk')
}
