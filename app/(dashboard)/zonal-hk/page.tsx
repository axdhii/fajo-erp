import { createClient } from '@/lib/supabase/server'
import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ZonalHKClient } from './client'

export default async function ZonalHKPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    // Fetch all hotels for the multi-hotel selector
    const supabase = await createClient()
    const { data: hotels } = await supabase
        .from('hotels')
        .select('id, name')
        .order('name')

    return (
        <ZonalHKClient
            hotelId={staff.hotelId}
            staffId={staff.staffId}
            hotels={hotels || []}
        />
    )
}
