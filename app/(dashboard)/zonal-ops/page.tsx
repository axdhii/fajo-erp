import { createClient } from '@/lib/supabase/server'
import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ZonalOpsClient } from './client'

export default async function ZonalOpsPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    // Fetch all hotels for the multi-hotel selector
    const supabase = await createClient()
    const { data: hotels } = await supabase
        .from('hotels')
        .select('id, name')
        .order('name')

    return (
        <ZonalOpsClient
            staffId={staff.staffId}
            hotels={hotels || []}
        />
    )
}
