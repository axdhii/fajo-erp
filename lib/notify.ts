import { SupabaseClient } from '@supabase/supabase-js'

interface NotifyOptions {
    supabase: SupabaseClient
    hotelId: string
    recipientRole: string
    recipientStaffId?: string | null
    type: string
    title: string
    message: string
    sourceTable?: string
    sourceId?: string
    url?: string
}

/**
 * Creates a notification record AND sends a push notification.
 * Non-blocking — errors are logged but never thrown.
 */
export async function notify(options: NotifyOptions) {
    const { supabase, hotelId, recipientRole, recipientStaffId, type, title, message, sourceTable, sourceId, url } = options

    // 1. Insert notification record
    try {
        await supabase.from('notifications').insert({
            hotel_id: hotelId,
            recipient_role: recipientRole,
            recipient_staff_id: recipientStaffId || null,
            type,
            title,
            message,
            source_table: sourceTable || null,
            source_id: sourceId || null,
            link: url || null,
        })
    } catch (err) {
        console.error('Notification insert failed:', err)
    }

    // 2. Send push notification (dynamic import to avoid bundling web-push in client)
    try {
        const { sendPushToStaff, sendPushToRole } = await import('@/lib/push')
        const payload = { title, message, url: url || '/', tag: type }

        if (recipientStaffId) {
            await sendPushToStaff(recipientStaffId, payload)
        } else if (recipientRole) {
            await sendPushToRole(hotelId, recipientRole, payload)
        }
    } catch (err) {
        console.error('Push notification failed:', err)
    }
}
