import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DevClient } from './client'

export default async function DevPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    // Only Developer role can access this dashboard
    if (staff.role !== 'Developer') redirect('/')

    return <DevClient hotelId={staff.hotelId} staffId={staff.staffId} />
}
