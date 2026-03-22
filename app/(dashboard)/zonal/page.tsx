import { getStaffFromHeaders } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ZonalClient } from './client'

export default async function ZonalPage() {
    const staff = await getStaffFromHeaders()
    if (!staff) redirect('/login')

    return <ZonalClient staffId={staff.staffId} />
}
