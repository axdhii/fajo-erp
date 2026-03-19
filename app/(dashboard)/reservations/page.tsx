import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { ReservationsClient } from './client'

export default async function ReservationsPage() {
    const supabase = await createClient()

    const user = await getAuthUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('staff')
        .select('hotel_id, role')
        .eq('user_id', user.id)
        .single()

    if (!profile) return null

    if (profile.role !== 'Admin' && profile.role !== 'FrontDesk') {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center mt-10">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-red-600">Unauthorized Area</h2>
                <p className="text-slate-500 mt-2">Only CRE staff and Admins can access reservations.</p>
            </div>
        )
    }

    return <ReservationsClient hotelId={profile.hotel_id} />
}
