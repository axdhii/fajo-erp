import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Public routes that don't need authentication
const publicRoutes = ['/login', '/']

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    // Allow public routes
    if (publicRoutes.includes(pathname)) {
        if (user && pathname === '/login') {
            return NextResponse.redirect(new URL('/', request.url))
        }
        return supabaseResponse
    }

    // API routes: don't redirect to login (would return HTML to JSON-expecting clients)
    // Instead let the API handle its own auth or work without auth
    if (pathname.startsWith('/api/')) {
        return supabaseResponse
    }

    // Protect ALL dashboard routes
    if (!user) {
        const loginUrl = new URL('/login', request.url)
        return NextResponse.redirect(loginUrl)
    }

    // Role-based route protection for admin
    if (pathname.startsWith('/admin')) {
        const { data: profile } = await supabase
            .from('staff')
            .select('role')
            .eq('user_id', user.id)
            .single()

        if (!profile || profile.role !== 'Admin') {
            return NextResponse.redirect(new URL('/front-desk', request.url))
        }
    }

    // Role-based route protection for Zonal Manager
    if (pathname.startsWith('/zonal')) {
        const { data: profile } = await supabase
            .from('staff')
            .select('role')
            .eq('user_id', user.id)
            .single()

        if (!profile || !['Admin', 'ZonalManager'].includes(profile.role)) {
            const redirectPath = profile?.role === 'HR' ? '/hr' : profile?.role === 'Housekeeping' ? '/housekeeping' : '/front-desk'
            return NextResponse.redirect(new URL(redirectPath, request.url))
        }
    }

    // Role-based route protection for Operations Manager
    if (pathname.startsWith('/ops')) {
        const { data: profile } = await supabase
            .from('staff')
            .select('role')
            .eq('user_id', user.id)
            .single()

        if (!profile || !['Admin', 'OpsManager'].includes(profile.role)) {
            const redirectPath = profile?.role === 'HR' ? '/hr' : profile?.role === 'ZonalManager' ? '/zonal' : profile?.role === 'Housekeeping' ? '/housekeeping' : '/front-desk'
            return NextResponse.redirect(new URL(redirectPath, request.url))
        }
    }

    // Role-based route protection for HR
    if (pathname.startsWith('/hr')) {
        const { data: profile } = await supabase
            .from('staff')
            .select('role')
            .eq('user_id', user.id)
            .single()

        if (!profile || !['Admin', 'HR'].includes(profile.role)) {
            return NextResponse.redirect(new URL('/front-desk', request.url))
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
