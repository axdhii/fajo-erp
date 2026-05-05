import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AccountsClient } from './client'

export default async function AccountsPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    return <AccountsClient hotelId={staff.hotelId} staffId={staff.staffId} />
}
