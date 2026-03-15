import { NextRequest, NextResponse } from 'next/server'
import { getDevNow, setDevTime, getDevTimeValue, advanceDevTime, isDevTimeActive } from '@/lib/dev-time'
import { requireAuth } from '@/lib/auth'

function devOnly() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Dev-only endpoint' }, { status: 403 })
    }
    return null
}

// GET /api/dev/time — Get current simulated time status
export async function GET() {
    const blocked = devOnly()
    if (blocked) return blocked

    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const simulated = getDevTimeValue()
    const now = getDevNow()

    return NextResponse.json({
        isSimulated: isDevTimeActive(),
        currentTime: now.toISOString(),
        realTime: new Date().toISOString(),
        simulatedTime: simulated?.toISOString() || null,
    })
}

// POST /api/dev/time — Set, advance, or reset simulated time
export async function POST(request: NextRequest) {
    const blocked = devOnly()
    if (blocked) return blocked

    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const body = await request.json()
    const { action, time, advanceMs, advanceHours, advanceDays } = body

    if (action === 'set' && time) {
        const newTime = new Date(time)
        if (isNaN(newTime.getTime())) {
            return NextResponse.json({ error: 'Invalid time format' }, { status: 400 })
        }
        setDevTime(newTime)
        return NextResponse.json({
            success: true,
            message: `Time set to ${newTime.toISOString()}`,
            currentTime: newTime.toISOString(),
        })
    }

    if (action === 'advance') {
        let ms = Number(advanceMs) || 0
        if (advanceHours) ms += Number(advanceHours) * 60 * 60 * 1000
        if (advanceDays) ms += Number(advanceDays) * 24 * 60 * 60 * 1000

        if (ms === 0) {
            return NextResponse.json({ error: 'Specify advanceMs, advanceHours, or advanceDays' }, { status: 400 })
        }

        const newTime = advanceDevTime(ms)
        return NextResponse.json({
            success: true,
            message: `Time advanced to ${newTime.toISOString()}`,
            currentTime: newTime.toISOString(),
        })
    }

    if (action === 'reset') {
        setDevTime(null)
        return NextResponse.json({
            success: true,
            message: 'Time reset to real time',
            currentTime: new Date().toISOString(),
        })
    }

    return NextResponse.json({ error: 'Invalid action. Use: set, advance, reset' }, { status: 400 })
}
