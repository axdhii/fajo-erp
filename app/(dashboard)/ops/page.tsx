import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { OpsClient } from './client'

export default async function OpsPage() {
    const supabase = await createClient()

    // Server-side auth check
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Server-side profile fetch
    const { data: profile } = await supabase
        .from('staff')
        .select('id, hotel_id, role')
        .eq('user_id', user.id)
        .single()

    if (!profile) redirect('/login')

    // Server-side Role Protection
    if (profile.role !== 'OpsManager' && profile.role !== 'Admin') {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center mt-10">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-red-600">Unauthorized Area</h2>
                <p className="text-slate-500 mt-2">Only Operations Managers and Admins can access this dashboard.</p>
            </div>
        )
    }

    return <OpsClient hotelId={profile.hotel_id} staffId={profile.id} />
}
