import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const publicRoutes = ['/login', '/']

// Hard timeout on every Supabase call inside middleware so that an upstream
// auth-service outage cannot hang the request long enough to trigger Vercel's
// MIDDLEWARE_INVOCATION_TIMEOUT (504) at the edge. On timeout we treat the
// user as logged-out and fall through to the normal "redirect to /login" path.
const AUTH_TIMEOUT_MS = 3000

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timeout: ${label} after ${ms}ms`)),
            ms,
        )
        Promise.resolve(promise).then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })
}

// Role -> allowed path prefixes
const ROLE_ROUTES: Record<string, string[]> = {
    Developer: ['/developer', '/admin', '/front-desk', '/reservations', '/housekeeping', '/hr', '/zonal-ops', '/zonal-hk', '/accounts'],
    Admin: ['/admin', '/front-desk', '/reservations', '/housekeeping', '/hr', '/zonal-ops', '/zonal-hk', '/accounts'],
    FrontDesk: ['/front-desk', '/reservations', '/housekeeping'],
    Housekeeping: ['/housekeeping'],
    HR: ['/hr'],
    ZonalOps: ['/zonal-ops'],
    ZonalHK: ['/zonal-hk'],
    Accounts: ['/accounts'],
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
        case 'Accounts': return '/accounts'
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

    // Use getSession() to read JWT locally — no network call (saves 100-300ms per navigation).
    // Wrapped in withTimeout because @supabase/ssr can auto-refresh through /token, which
    // hangs (15s+) during Supabase auth-service degradation and would 504 the page.
    let user: { id: string } | null = null
    try {
        const { data: { session } } = await withTimeout(
            supabase.auth.getSession(),
            AUTH_TIMEOUT_MS,
            'auth.getSession',
        )
        user = session?.user ?? null
    } catch (err) {
        console.error('[middleware] getSession failed:', (err as Error).message)
        // Treat as unauthenticated; protected routes below will bounce to /login.
    }

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

    // ── Fetch staff profile ONCE (with timeout so a degraded DB cannot 504 us) ─
    type StaffProfile = { id: string; hotel_id: string; role: string }
    let profile: StaffProfile | null = null
    try {
        const { data } = await withTimeout(
            supabase
                .from('staff')
                .select('id, hotel_id, role')
                .eq('user_id', user.id)
                .single(),
            AUTH_TIMEOUT_MS,
            'staff lookup',
        )
        profile = data as StaffProfile | null
    } catch (err) {
        console.error('[middleware] staff lookup failed:', (err as Error).message)
        return applyCookies(NextResponse.redirect(new URL('/login', request.url)))
    }

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
