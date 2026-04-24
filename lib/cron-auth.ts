import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

/**
 * Cron/maintenance route gate. Accepts either:
 *   - Vercel Cron: `Authorization: Bearer <CRON_SECRET>` header
 *   - Any authenticated staff member (dev/manual trigger path)
 *
 * NOTE: This intentionally does NOT require Admin/Developer role. Prior
 * tightening was reverted at user request — any authenticated staff can
 * trigger crons as before.
 */
export async function requireCronOrAdmin(request: NextRequest): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return { ok: true }
    }
    const auth = await requireAuth()
    if (!auth.authenticated) return { ok: false, response: auth.response }
    return { ok: true }
}
