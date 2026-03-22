import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ZonalHKClient } from './client'

export default async function ZonalHKPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    return <ZonalHKClient hotelId={staff.hotelId} staffId={staff.staffId} />
}
