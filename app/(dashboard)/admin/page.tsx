import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdminClient } from './client'

export default async function AdminPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    return <AdminClient hotelId={staff.hotelId} staffId={staff.staffId} />
}
