import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import type { ShiftReport } from '@/lib/types'

interface StaffProfile {
    id: string
    hotel_id: string
    role: 'Admin' | 'FrontDesk' | 'HR' | 'ZonalOps' | 'ZonalHK' | 'Developer'
    name: string | null
}

interface AuthState {
    user: User | null
    profile: StaffProfile | null
    isLoading: boolean
    shiftReport: ShiftReport | null
    checkAuth: () => Promise<void>
    signOut: () => Promise<void>
    completeSignOut: () => Promise<void>
    clearShiftReport: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    profile: null,
    isLoading: true,
    shiftReport: null,

    checkAuth: async () => {
        try {
            set({ isLoading: true })
            const { data: { session } } = await supabase.auth.getSession()

            if (session?.user) {
                // Fetch the staff profile to know their role and hotel
                const { data: staffData } = await supabase
                    .from('staff')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .single()

                set({ user: session.user, profile: staffData as StaffProfile })
            } else {
                set({ user: null, profile: null })
            }
        } catch (e) {
            console.error(e)
        } finally {
            set({ isLoading: false })
        }
    },

    signOut: async () => {
        const state = get()
        const profile = state.profile

        // Auto clock-out for property-level roles
        if (profile && ['FrontDesk', 'HR', 'ZonalOps', 'ZonalHK'].includes(profile.role)) {
            try {
                const res = await fetch('/api/attendance/clock-out', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ staff_id: profile.id }),
                })
                const json = await res.json()
                if (json.shiftReport) {
                    // Store report for the modal to display — don't sign out yet
                    set({ shiftReport: json.shiftReport })
                    return
                }
                // Log report errors but don't block sign-out
                if (json.reportError) console.warn('Shift report:', json.reportError)
            } catch (err) {
                console.warn('Clock-out error:', err)
                // Don't block sign-out
            }
        }

        await supabase.auth.signOut()
        set({ user: null, profile: null, shiftReport: null })
    },

    completeSignOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, profile: null, shiftReport: null })
    },

    clearShiftReport: () => {
        set({ shiftReport: null })
    },
}))
