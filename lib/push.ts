// @ts-expect-error -- web-push has no type declarations
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''

if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails('mailto:admin@fajohotels.com', VAPID_PUBLIC, VAPID_PRIVATE)
}

interface PushPayload {
    title: string
    message: string
    url?: string
    tag?: string
}

/**
 * Send push notification to a specific staff member (all their devices)
 */
export async function sendPushToStaff(staffId: string, payload: PushPayload) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return

    const supabase = await createClient()
    const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('staff_id', staffId)

    if (!subs?.length) return

    const promises = subs.map(sub =>
        webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
        ).catch(async (err: { statusCode?: number }) => {
            // Remove expired/invalid subscriptions (410 Gone or 404)
            if (err.statusCode === 410 || err.statusCode === 404) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
        })
    )

    await Promise.allSettled(promises)
}

/**
 * Send push notification to all staff with a given role in a hotel
 */
export async function sendPushToRole(hotelId: string, role: string, payload: PushPayload) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return

    const supabase = await createClient()

    // Get all staff IDs for this role in this hotel
    const { data: staffList } = await supabase
        .from('staff')
        .select('id')
        .eq('hotel_id', hotelId)
        .eq('role', role)

    if (!staffList?.length) return

    const staffIds = staffList.map(s => s.id)

    // Get all push subscriptions for these staff
    const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .in('staff_id', staffIds)

    if (!subs?.length) return

    const promises = subs.map(sub =>
        webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
        ).catch(async (err: { statusCode?: number }) => {
            if (err.statusCode === 410 || err.statusCode === 404) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
            }
        })
    )

    await Promise.allSettled(promises)
}
