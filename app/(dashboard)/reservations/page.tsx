import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ReservationsClient } from './client'

export default async function ReservationsPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    return <ReservationsClient hotelId={staff.hotelId} />
}
