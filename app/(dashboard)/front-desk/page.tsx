import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FrontDeskClient } from './client'

export default async function FrontDeskPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    return <FrontDeskClient hotelId={staff.hotelId} staffId={staff.staffId} role={staff.role} />
}
