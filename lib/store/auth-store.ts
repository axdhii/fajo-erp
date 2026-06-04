import { create } from 'zustand'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import type { ShiftReport } from '@/lib/types'
import { useUnitStore } from '@/lib/store/unit-store'
import { useNotificationStore } from '@/lib/store/notification-store'

// Reset all auxiliary Zustand stores so the next user who signs in on a shared
// tablet doesn't briefly see the previous user's data.
function clearAllStores() {
    try { useUnitStore.setState({ units: [], isLoading: false }) } catch {}
    try { useNotificationStore.setState({ notifications: [], unreadCount: 0, initialized: false, isLoading: false, error: null }) } catch {}
}

interface StaffProfile {
    id: string
    hotel_id: string
    role: 'Admin' | 'FrontDesk' | 'HR' | 'ZonalOps' | 'ZonalHK' | 'Developer' | 'Housekeeping' | 'Accounts'
    name: string | null
}

interface AuthState {
    user: User | null
    profile: StaffProfile | null
    activeHotelId: string | null
    isLoading: boolean
    shiftReport: ShiftReport | null
    setActiveHotelId: (id: string) => void
    checkAuth: () => Promise<void>
    signOut: () => Promise<void>
    completeSignOut: () => Promise<void>
    clearShiftReport: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    profile: null,
    activeHotelId: null,
    isLoading: true,
    shiftReport: null,

    setActiveHotelId: (id: string) => set({ activeHotelId: id }),

    checkAuth: async () => {
        try {
            set({ isLoading: true })
            const { data: { session } } = await supabase.auth.getSession()

            if (!session?.user) {
                set({ user: null, profile: null, activeHotelId: null })
                return
            }

            // Fetch the staff profile to know their role and hotel
            const { data: staffData, error: staffError } = await supabase
                .from('staff')
                .select('*')
                .eq('user_id', session.user.id)
                .single()

            // Defensive: if the session is valid but the staff row can't be loaded
            // (RLS error, stale session pointing to a deleted/edited row, transient
            // network failure), sign the user out cleanly instead of dereferencing
            // null. Previously this would throw and trip React's error boundary —
            // user saw "Application error: a client-side exception has occurred".
            if (staffError || !staffData) {
                console.error('[auth-store] staff lookup failed:', staffError?.message || 'no staff row for user_id')
                try { await supabase.auth.signOut() } catch { /* swallow */ }
                set({ user: null, profile: null, activeHotelId: null })
                return
            }

            const profile = staffData as StaffProfile
            set({ user: session.user, profile, activeHotelId: profile.hotel_id })
        } catch (e) {
            console.error('[auth-store] checkAuth error:', e)
            set({ user: null, profile: null, activeHotelId: null })
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
                // Surface report errors to the user — silently swallowing these
                // hid the shift_reports missing-column bug for days.
                if (json.reportError) {
                    const detail = json.debug?.message || json.debug?.code || json.reportError
                    toast.error(`Shift report failed to save: ${detail}. Please inform admin.`)
                }
                // API itself failed (4xx/5xx) — show the message so the CRE knows their
                // attendance may not have updated either.
                if (!res.ok) {
                    toast.error(`Clock-out failed: ${json.error || 'unknown error'}`)
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'network error'
                toast.error(`Clock-out failed: ${msg}. Please retry.`)
                // Don't block sign-out
            }
        }

        await supabase.auth.signOut()
        clearAllStores()
        set({ user: null, profile: null, activeHotelId: null, shiftReport: null })
    },

    completeSignOut: async () => {
        await supabase.auth.signOut()
        clearAllStores()
        set({ user: null, profile: null, activeHotelId: null, shiftReport: null })
    },

    clearShiftReport: () => {
        set({ shiftReport: null })
    },
}))
