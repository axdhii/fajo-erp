import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// Admin-only Supabase client for auth operations (create/delete users)
// IMPORTANT: SUPABASE_SERVICE_ROLE_KEY must be set in .env.local AND in Vercel env vars
function getAdminClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
            'Set it in .env.local (local dev) and in Vercel Environment Variables (production).'
        )
    }
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
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

    if (!profile || !['Admin', 'Developer'].includes(profile.role)) {
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
        const { name, phone, role, hotel_id, base_salary, password: customPassword } = body

        if (!name || !role || !hotel_id) {
            return NextResponse.json(
                { error: 'name, role, and hotel_id are required' },
                { status: 400 }
            )
        }

        // Phone is required and must be 10 digits
        if (!phone || !/^\d{10}$/.test(phone)) {
            return NextResponse.json(
                { error: 'Phone must be exactly 10 digits' },
                { status: 400 }
            )
        }

        const validRoles = ['Admin', 'Developer', 'FrontDesk', 'HR', 'ZonalOps', 'ZonalHK']
        if (!validRoles.includes(role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { status: 400 }
            )
        }

        // Validate custom password if provided
        if (customPassword && typeof customPassword === 'string' && customPassword.trim().length > 0 && customPassword.trim().length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters' },
                { status: 400 }
            )
        }

        // Check phone uniqueness at this hotel
        const { data: existingStaff } = await supabase
            .from('staff')
            .select('id')
            .eq('hotel_id', hotel_id)
            .eq('phone', phone)
            .maybeSingle()

        if (existingStaff) {
            return NextResponse.json(
                { error: 'A staff member with this phone number already exists at this hotel' },
                { status: 409 }
            )
        }

        // Use custom password if provided, otherwise fall back to role-based default
        const email = `${phone}@fajo.local`
        const password = (customPassword && typeof customPassword === 'string' && customPassword.trim().length >= 6)
            ? customPassword.trim()
            : (['Admin', 'Developer'].includes(role) ? 'password123' : 'fajo123')

        let adminClient
        try {
            adminClient = getAdminClient()
        } catch (configErr) {
            console.error('Admin client config error:', configErr)
            const msg = configErr instanceof Error ? configErr.message : 'Service role key not configured'
            return NextResponse.json({ error: msg }, { status: 500 })
        }

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

        const userId = authUser.user.id

        // Insert the staff record
        const { data, error } = await supabase
            .from('staff')
            .insert({
                user_id: userId,
                hotel_id,
                role,
                name,
                phone,
                base_salary: base_salary ? Number(base_salary) : 0,
                is_idle: true,
            })
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .single()

        if (error) {
            console.error('Staff insert error:', error)
            // Clean up auth user if staff insert failed
            try {
                await adminClient.auth.admin.deleteUser(userId)
            } catch (cleanupErr) {
                console.error('Failed to clean up auth user after staff insert failure:', cleanupErr)
            }
            return NextResponse.json({ error: 'Failed to create staff record' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Admin staff POST error:', err)
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: `Staff creation failed: ${message}` }, { status: 500 })
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
        const { staff_id, name, phone, base_salary, role, hotel_id, password } = body

        if (!staff_id) {
            return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
        }

        // Validate phone: must be 10 digits if provided and non-null
        if (phone !== undefined && phone !== null && phone !== '' && !/^\d{10}$/.test(phone)) {
            return NextResponse.json({ error: 'Phone must be exactly 10 digits' }, { status: 400 })
        }

        const validRoles = ['Admin', 'Developer', 'FrontDesk', 'HR', 'ZonalOps', 'ZonalHK']

        if (role !== undefined && !validRoles.includes(role)) {
            return NextResponse.json(
                { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
                { status: 400 }
            )
        }

        // Validate base_salary: must be a valid number if provided
        if (base_salary !== undefined) {
            const salaryNum = Number(base_salary)
            if (isNaN(salaryNum)) {
                return NextResponse.json({ error: 'Base salary must be a valid number' }, { status: 400 })
            }
            if (salaryNum < 0) {
                return NextResponse.json({ error: 'Base salary cannot be negative' }, { status: 400 })
            }
        }

        // Fetch existing staff record to detect changes
        const { data: existing, error: fetchError } = await supabase
            .from('staff')
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .eq('id', staff_id)
            .single()

        if (fetchError || !existing) {
            console.error('Staff fetch error:', fetchError)
            return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
        }

        // Build staff table updates
        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name
        if (phone !== undefined) updates.phone = phone || null
        if (base_salary !== undefined) updates.base_salary = Number(base_salary)
        if (role !== undefined) updates.role = role
        if (hotel_id !== undefined) updates.hotel_id = hotel_id

        if (Object.keys(updates).length === 0 && !password) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
        }

        // ── Auth updates (phone/email, role-default password, explicit password) ──
        // We combine ALL auth changes into a single updateUserById call to avoid
        // a role-change default password overwriting an explicit password change.
        if (existing.user_id) {
            const authUpdates: Record<string, unknown> = {}

            // Phone changed -> update auth email (only if new phone is a valid 10-digit number)
            const newPhone = phone !== undefined ? phone : existing.phone
            if (newPhone && /^\d{10}$/.test(newPhone) && newPhone !== existing.phone) {
                authUpdates.email = `${newPhone}@fajo.local`
            }

            // Determine the password to set:
            // 1. If admin explicitly set a password, use that (takes priority)
            // 2. Else if role changed, set the role-based default password
            if (password && password.length >= 6) {
                authUpdates.password = password
            } else if (password && password.length < 6) {
                return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
            } else if (role !== undefined && role !== existing.role) {
                // Only set default password on role change when no explicit password was given
                authUpdates.password = ['Admin', 'Developer'].includes(role) ? 'password123' : 'fajo123'
            }

            if (Object.keys(authUpdates).length > 0) {
                let adminClient
                try {
                    adminClient = getAdminClient()
                } catch (configErr) {
                    console.error('Admin client config error:', configErr)
                    const msg = configErr instanceof Error ? configErr.message : 'Service role key not configured'
                    return NextResponse.json({ error: msg }, { status: 500 })
                }

                const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(
                    existing.user_id,
                    authUpdates
                )
                if (authUpdateError) {
                    console.error('Auth user update error:', authUpdateError)
                    return NextResponse.json(
                        { error: `Failed to update login credentials: ${authUpdateError.message}` },
                        { status: 500 }
                    )
                }
            }
        } else if (password) {
            // Staff has no auth user — cannot update password
            return NextResponse.json(
                { error: 'This staff member has no login account. Cannot update password.' },
                { status: 400 }
            )
        }

        // ── Update staff table ──
        if (Object.keys(updates).length > 0) {
            const { data, error } = await supabase
                .from('staff')
                .update(updates)
                .eq('id', staff_id)
                .select('id, user_id, hotel_id, role, name, phone, base_salary')
                .single()

            if (error) {
                console.error('Admin staff update error:', error)
                return NextResponse.json(
                    { error: `Failed to update staff record: ${error.message}` },
                    { status: 500 }
                )
            }

            return NextResponse.json({ data })
        }

        // If only password was changed (no staff table fields), return the existing record
        return NextResponse.json({ data: existing })
    } catch (err) {
        console.error('Admin staff PATCH error:', err)
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json(
            { error: `Staff update failed: ${message}` },
            { status: 500 }
        )
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
                // If service role key is missing, warn but still allow staff record deletion
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
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: `Staff deletion failed: ${message}` }, { status: 500 })
    }
}
