import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const publicRoutes = ['/login', '/']

// Role -> allowed path prefixes
const ROLE_ROUTES: Record<string, string[]> = {
    Developer: ['/developer', '/admin', '/front-desk', '/reservations', '/housekeeping', '/hr', '/zonal-ops', '/zonal-hk'],
    Admin: ['/admin', '/front-desk', '/reservations', '/housekeeping', '/hr', '/zonal-ops', '/zonal-hk'],
    FrontDesk: ['/front-desk', '/reservations', '/housekeeping'],
    Housekeeping: ['/housekeeping'],
    HR: ['/hr'],
    ZonalOps: ['/zonal-ops'],
    ZonalHK: ['/zonal-hk'],
}

// Where to redirect a user who tries to access a route they can't
function defaultPathForRole(role: string): string {
    switch (role) {
        case 'Developer': return '/developer'
        case 'Admin': return '/admin'
        case 'HR': return '/hr'
        case 'ZonalOps': return '/zonal-ops'
        case 'ZonalHK': return '/zonal-hk'
        case 'Housekeeping': return '/housekeeping'
        default: return '/front-desk'
    }
}

export async function middleware(request: NextRequest) {
    // Track cookies set by Supabase auth so we can replay them onto the final response
    let refreshedCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    // Buffer cookies; we'll apply them to whichever response we return
                    refreshedCookies = cookiesToSet as typeof refreshedCookies
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                },
            },
        }
    )

    // Helper: apply buffered Supabase auth cookies to any response
    function applyCookies(res: NextResponse) {
        for (const { name, value, options } of refreshedCookies) {
            res.cookies.set(name, value, options)
        }
        return res
    }

    // Use getSession() to read JWT locally — no network call (saves 100-300ms per navigation)
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user

    const { pathname } = request.nextUrl

    // ── Public routes ──────────────────────────────────────────────
    if (publicRoutes.includes(pathname)) {
        if (user && pathname === '/login') {
            return applyCookies(NextResponse.redirect(new URL('/', request.url)))
        }
        return applyCookies(NextResponse.next({ request }))
    }

    // ── API routes: let them handle their own auth ─────────────────
    if (pathname.startsWith('/api/')) {
        return applyCookies(NextResponse.next({ request }))
    }

    // ── Invoice routes: authentication only, no role check ─────────
    if (pathname.startsWith('/invoice/')) {
        if (!user) {
            return applyCookies(NextResponse.redirect(new URL('/login', request.url)))
        }
        return applyCookies(NextResponse.next({ request }))
    }

    // ── All other routes require authentication ────────────────────
    if (!user) {
        return applyCookies(NextResponse.redirect(new URL('/login', request.url)))
    }

    // ── Fetch staff profile ONCE ───────────────────────────────────
    const { data: profile } = await supabase
        .from('staff')
        .select('id, hotel_id, role')
        .eq('user_id', user.id)
        .single()

    if (!profile) {
        return applyCookies(NextResponse.redirect(new URL('/login', request.url)))
    }

    // ── Role-based route protection ────────────────────────────────
    const allowedPrefixes = ROLE_ROUTES[profile.role] || ['/front-desk']
    const isAllowed = allowedPrefixes.some((prefix) => pathname.startsWith(prefix))

    if (!isAllowed) {
        return applyCookies(
            NextResponse.redirect(new URL(defaultPathForRole(profile.role), request.url))
        )
    }

    // ── Inject staff context into request headers for server pages ─
    // Eliminates the need for each page to re-query auth + staff table.
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-staff-id', profile.id)
    requestHeaders.set('x-staff-hotel-id', profile.hotel_id)
    requestHeaders.set('x-staff-role', profile.role)

    const response = NextResponse.next({
        request: { headers: requestHeaders },
    })

    return applyCookies(response)
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
