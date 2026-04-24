import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronOrAdmin } from '@/lib/cron-auth'

// GET /api/cron/selfie-cleanup
// Called by Vercel Cron or external scheduler.
// Deletes selfie requests older than 24 hours and their photos.
// In production, requires CRON_SECRET header. In dev, requires auth.
export async function GET(request: NextRequest) {
    try {
        const gate = await requireCronOrAdmin(request)
        if (!gate.ok) return gate.response

        const supabase = await createClient()

        // Calculate 24 hours ago
        const twentyFourHoursAgo = new Date()
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

        // Fetch expired selfie requests (older than 24h)
        const { data: expired, error: fetchError } = await supabase
            .from('selfie_requests')
            .select('id, photo_url')
            .lt('created_at', twentyFourHoursAgo.toISOString())

        if (fetchError) {
            console.error('Selfie cleanup fetch error:', fetchError)
            return NextResponse.json(
                { error: 'Failed to fetch expired selfie requests' },
                { status: 500 }
            )
        }

        if (!expired || expired.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'Cleaned up 0 expired selfie requests',
            })
        }

        // Delete photos from storage for requests that have a photo_url.
        // Handles both public and signed URL shapes so bucket privacy changes
        // don't silently orphan files.
        for (const req of expired) {
            if (req.photo_url) {
                try {
                    const url = new URL(req.photo_url)
                    const match = url.pathname.match(/\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)/)
                    if (match) {
                        const [, bucket, path] = match
                        const cleanPath = path.split('?')[0]
                        await supabase.storage.from(bucket).remove([cleanPath])
                    }
                } catch {
                    console.warn(`Failed to delete photo for selfie request ${req.id}`)
                }
            }
        }

        // Delete the selfie request rows
        const expiredIds = expired.map(r => r.id)
        const { error: deleteError } = await supabase
            .from('selfie_requests')
            .delete()
            .in('id', expiredIds)

        if (deleteError) {
            console.error('Selfie cleanup delete error:', deleteError)
            return NextResponse.json(
                { error: 'Failed to delete expired selfie requests' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: `Cleaned up ${expired.length} expired selfie requests`,
        })
    } catch (err) {
        console.error('Selfie cleanup cron error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
