import { NextRequest, NextResponse } from 'next/server'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET || ''

// Push notifications are DISABLED. This endpoint short-circuits before any
// DB/webpush work to minimize compute cost if the Supabase trigger is still
// active. The real cost elimination is dropping the `trigger_push_notification`
// trigger on public.notifications — see docs/push-kill.md (or the git log).
const PUSH_ENABLED = false

export async function POST(request: NextRequest) {
    if (!PUSH_ENABLED) {
        return NextResponse.json({ ok: true, disabled: true })
    }
    try {
        // Verify webhook authenticity
        const authHeader = request.headers.get('x-webhook-secret') || request.headers.get('authorization')
        if (!WEBHOOK_SECRET || !authHeader?.includes(WEBHOOK_SECRET)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const payload = await request.json()

        // Only handle INSERT events on notifications table
        if (payload.type !== 'INSERT' || payload.table !== 'notifications') {
            return NextResponse.json({ ok: true, skipped: true })
        }

        const record = payload.record
        if (!record?.hotel_id) {
            return NextResponse.json({ ok: true, skipped: true })
        }

        const pushPayload = {
            title: record.title || 'FAJO ERP',
            message: record.message || 'New notification',
            url: record.link || '/',
            tag: record.type || 'default',
        }

        // Dynamic import to avoid bundling web-push in edge
        const { sendPushToStaff, sendPushToRole } = await import('@/lib/push')

        if (record.recipient_staff_id) {
            // Send to specific staff member
            await sendPushToStaff(record.recipient_staff_id, pushPayload)
        } else if (record.recipient_role) {
            // Send to all staff with this role
            await sendPushToRole(record.hotel_id, record.recipient_role, pushPayload)

            // If targeting Admin, also send to Developer role
            if (record.recipient_role === 'Admin') {
                await sendPushToRole(record.hotel_id, 'Developer', pushPayload)
            }
        }

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('Push webhook error:', err)
        // Return 200 even on error to prevent Supabase from retrying
        return NextResponse.json({ ok: true, error: 'Internal error' })
    }
}
