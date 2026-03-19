import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// Admin-only Supabase client for auth operations (create/delete users)
// IMPORTANT: SUPABASE_SERVICE_ROLE_KEY must be set in .env.local for login account creation/deletion to work
function getAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

/** Verify the caller is an Admin. Returns the staff profile or an error response. */
async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
    const { data: profile } = await supabase
        .from('staff')
        .select('id, role')
        .eq('user_id', userId)
        .single()

    if (!profile || profile.role !== 'Admin') {
        return { error: NextResponse.json({ error: 'Forbidden — Admin role required' }, { status: 403 }) }
    }
    return { profile }
}

// ============================================================
// POST /api/admin/staff — Create a new staff member
// ============================================================
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const adminCheck = await requireAdmin(supabase, auth.userId)
        if ('error' in adminCheck) return adminCheck.error

        const body = await request.json()
        const { name, phone, role, hotel_id, base_salary, create_login, email, password } = body

        if (!name || !role || !hotel_id) {
            return NextResponse.json(
                { error: 'name, role, and hotel_id are required' },
                { status: 400 }
            )
        }

        const validRoles = ['Admin', 'FrontDesk', 'Housekeeping', 'HR', 'ZonalManager', 'ZonalOps', 'ZonalHK']
        if (!validRoles.includes(role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { status: 400 }
            )
        }

        let userId: string | null = null

        // If creating a login account, use the admin client to create an auth user
        if (create_login) {
            if (!email || !password) {
                return NextResponse.json(
                    { error: 'email and password are required when creating a login account' },
                    { status: 400 }
                )
            }
            if (password.length < 6) {
                return NextResponse.json(
                    { error: 'Password must be at least 6 characters' },
                    { status: 400 }
                )
            }

            const adminClient = getAdminClient()
            const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
            })

            if (authError) {
                console.error('Auth user creation error:', authError)
                return NextResponse.json(
                    { error: `Failed to create login: ${authError.message}` },
                    { status: 500 }
                )
            }

            userId = authUser.user.id
        }

        // Insert the staff record
        const { data, error } = await supabase
            .from('staff')
            .insert({
                user_id: userId,
                hotel_id,
                role,
                name,
                phone: phone || null,
                base_salary: base_salary ? Number(base_salary) : 0,
                is_idle: true,
            })
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .single()

        if (error) {
            console.error('Staff insert error:', error)
            // If we created an auth user but staff insert failed, clean up
            if (userId) {
                try {
                    const adminClient = getAdminClient()
                    await adminClient.auth.admin.deleteUser(userId)
                } catch (cleanupErr) {
                    console.error('Failed to clean up auth user after staff insert failure:', cleanupErr)
                }
            }
            return NextResponse.json({ error: 'Failed to create staff record' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Admin staff POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// ============================================================
// PATCH /api/admin/staff — Update staff (extended: role + hotel transfer)
// ============================================================
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const adminCheck = await requireAdmin(supabase, auth.userId)
        if ('error' in adminCheck) return adminCheck.error

        const body = await request.json()
        const { staff_id, name, phone, base_salary, role, hotel_id } = body

        if (!staff_id) {
            return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
        }

        const validRoles = ['Admin', 'FrontDesk', 'Housekeeping', 'HR', 'ZonalManager', 'ZonalOps', 'ZonalHK']

        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name
        if (phone !== undefined) updates.phone = phone
        if (base_salary !== undefined) updates.base_salary = Number(base_salary)
        if (role !== undefined) {
            if (!validRoles.includes(role)) {
                return NextResponse.json(
                    { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                    { status: 400 }
                )
            }
            updates.role = role
        }
        if (hotel_id !== undefined) updates.hotel_id = hotel_id

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('staff')
            .update(updates)
            .eq('id', staff_id)
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .single()

        if (error) {
            console.error('Admin staff update error:', error)
            return NextResponse.json({ error: 'Failed to update staff' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Admin staff PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// ============================================================
// DELETE /api/admin/staff — Remove a staff member
// ============================================================
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const adminCheck = await requireAdmin(supabase, auth.userId)
        if ('error' in adminCheck) return adminCheck.error

        const body = await request.json()
        const { staff_id } = body

        if (!staff_id) {
            return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
        }

        // Prevent deleting yourself
        if (adminCheck.profile.id === staff_id) {
            return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
        }

        // Check for dependent records (attendance, incidents, payroll)
        const [
            { count: attendanceCount },
            { count: incidentCount },
            { count: payrollCount },
        ] = await Promise.all([
            supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('staff_id', staff_id),
            supabase.from('staff_incidents').select('id', { count: 'exact', head: true }).eq('staff_id', staff_id),
            supabase.from('payroll').select('id', { count: 'exact', head: true }).eq('staff_id', staff_id),
        ])

        const totalDeps = (attendanceCount || 0) + (incidentCount || 0) + (payrollCount || 0)
        if (totalDeps > 0) {
            return NextResponse.json(
                {
                    error: 'Cannot delete staff with existing records. Remove their attendance, incident, and payroll records first.',
                    details: {
                        attendance: attendanceCount || 0,
                        incidents: incidentCount || 0,
                        payroll: payrollCount || 0,
                    },
                },
                { status: 409 }
            )
        }

        // Fetch staff to check for auth user
        const { data: staffRecord } = await supabase
            .from('staff')
            .select('user_id')
            .eq('id', staff_id)
            .single()

        if (!staffRecord) {
            return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
        }

        // Delete auth user if exists
        if (staffRecord.user_id) {
            try {
                const adminClient = getAdminClient()
                const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(staffRecord.user_id)
                if (authDeleteError) {
                    console.error('Auth user deletion error:', authDeleteError)
                    // Continue with staff deletion even if auth cleanup fails
                }
            } catch (authErr) {
                console.error('Auth user deletion exception:', authErr)
            }
        }

        // Delete staff record
        const { error } = await supabase
            .from('staff')
            .delete()
            .eq('id', staff_id)

        if (error) {
            console.error('Staff delete error:', error)
            return NextResponse.json({ error: 'Failed to delete staff record' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Admin staff DELETE error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
