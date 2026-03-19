import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

interface StaffProfile {
    id: string
    hotel_id: string
    role: 'Admin' | 'FrontDesk' | 'Housekeeping' | 'HR' | 'ZonalManager' | 'ZonalOps' | 'ZonalHK'
    name: string | null
}

interface AuthState {
    user: User | null
    profile: StaffProfile | null
    isLoading: boolean
    checkAuth: () => Promise<void>
    signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    profile: null,
    isLoading: true,

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
        if (profile && ['FrontDesk', 'Housekeeping', 'HR'].includes(profile.role)) {
            try {
                await fetch('/api/attendance/clock-out', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ staff_id: profile.id }),
                })
            } catch {
                // Silently ignore clock-out errors — don't block sign-out
            }
        }

        await supabase.auth.signOut()
        set({ user: null, profile: null })
    }
}))
