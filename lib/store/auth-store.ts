import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

interface StaffProfile {
    id: string
    hotel_id: string
    role: 'Admin' | 'FrontDesk' | 'Housekeeping'
}

interface AuthState {
    user: User | null
    profile: StaffProfile | null
    isLoading: boolean
    checkAuth: () => Promise<void>
    signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
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
        await supabase.auth.signOut()
        set({ user: null, profile: null })
    }
}))
