import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronOrAdmin } from '@/lib/cron-auth'

// GET /api/cron/message-cleanup
// Called by Vercel Cron or external scheduler.
// Deletes messages older than 7 days.
// In production, requires CRON_SECRET header. In dev, requires auth.
export async function GET(request: NextRequest) {
    try {
        const gate = await requireCronOrAdmin(request)
        if (!gate.ok) return gate.response

        const supabase = await createClient()

        // Calculate 7 days ago
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        const { error } = await supabase
            .from('messages')
            .delete()
            .lt('created_at', sevenDaysAgo.toISOString())

        if (error) {
            console.error('Message cleanup error:', error)
            return NextResponse.json(
                { error: 'Failed to clean up old messages' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Cleaned up old messages',
        })
    } catch (err) {
        console.error('Message cleanup cron error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
