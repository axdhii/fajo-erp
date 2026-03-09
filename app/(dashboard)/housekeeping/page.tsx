import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { HousekeepingClient } from './client'

export default async function HousekeepingPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase
        .from('staff')
        .select('id, hotel_id, role')
        .eq('user_id', user.id)
        .single()

    if (!profile) return null

    if (profile.role !== 'Admin' && profile.role !== 'Housekeeping') {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center mt-10">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold">Unauthorized Area</h2>
                <p className="text-slate-500">Only designated Housekeeping staff can access this task list.</p>
            </div>
        )
    }

    return <HousekeepingClient hotelId={profile.hotel_id} staffId={profile.id} />
}
