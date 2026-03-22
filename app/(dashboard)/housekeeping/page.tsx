import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { HousekeepingClient } from './client'

export default async function HousekeepingPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    return <HousekeepingClient hotelId={staff.hotelId} staffId={staff.staffId} />
}
