import { createClient } from '@/lib/supabase/server'
import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { HRClient } from './client'

export default async function HRPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    // Hotel name is needed for shift report downloads — single lightweight query
    const supabase = await createClient()
    const { data: hotel } = await supabase
        .from('hotels')
        .select('name')
        .eq('id', staff.hotelId)
        .single()

    return <HRClient hotelId={staff.hotelId} staffId={staff.staffId} hotelName={hotel?.name || 'Hotel'} />
}
