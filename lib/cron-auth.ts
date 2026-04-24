import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

/**
 * Gate a cron/admin-maintenance route. Accepts either:
 *   - Vercel Cron: `Authorization: Bearer <CRON_SECRET>` header
 *   - A human caller (dev/manual trigger): must be authenticated AND have role Admin or Developer
 *
 * Prevents random staff (FrontDesk, Housekeeping, etc.) from triggering destructive
 * crons that would force-close colleagues' shifts or purge historical data.
 */
export async function requireCronOrAdmin(request: NextRequest): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
        return { ok: true }
    }

    const auth = await requireAuth()
    if (!auth.authenticated) return { ok: false, response: auth.response }

    const supabase = await createClient()
    const { data: caller } = await supabase
        .from('staff').select('role').eq('user_id', auth.userId).single()
    if (!caller || !['Admin', 'Developer'].includes(caller.role)) {
        return { ok: false, response: NextResponse.json({ error: 'Forbidden — Admin or Developer only' }, { status: 403 }) }
    }
    return { ok: true }
}
