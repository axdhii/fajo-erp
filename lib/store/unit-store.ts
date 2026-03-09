import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import type { Unit, UnitStatus, UnitType, Booking } from '@/lib/types'

// Natural sort: 101 < 108 < A1 < A2 < A10 < A13 < A14 < A36
function naturalSort(a: string, b: string): number {
    const extract = (s: string) => {
        const match = s.match(/^([A-Za-z]*)(\d+)$/)
        return match ? { prefix: match[1], num: parseInt(match[2]) } : { prefix: s, num: 0 }
    }
    const pa = extract(a)
    const pb = extract(b)
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix)
    return pa.num - pb.num
}

export interface UnitWithBooking extends Unit {
    active_booking?: Booking | null
}

interface UnitState {
    units: UnitWithBooking[]
    isLoading: boolean
    setUnits: (units: UnitWithBooking[]) => void
    fetchUnits: (hotelId: string) => Promise<void>
    fetchUnitsWithBookings: (hotelId: string) => Promise<void>
    updateUnitStatus: (unitId: string, status: UnitStatus) => Promise<void>
    subscribeToUnits: (hotelId: string, withBookings?: boolean) => () => void
    startPolling: (hotelId: string, withBookings?: boolean, intervalMs?: number) => () => void
}

export const useUnitStore = create<UnitState>((set, get) => ({
    units: [],
    isLoading: false,
    setUnits: (units) => set({ units }),

    fetchUnits: async (hotelId) => {
        const { data, error } = await supabase
            .from('units')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('unit_number', { ascending: true })

        if (error) {
            console.error('Failed to fetch units:', error.message || error.code || JSON.stringify(error))
            return
        }

        if (data) {
            const sorted = [...data].sort((a, b) => naturalSort(a.unit_number, b.unit_number))
            set({ units: sorted as UnitWithBooking[], isLoading: false })
        }
    },

    fetchUnitsWithBookings: async (hotelId) => {
        // Fetch units
        const { data: unitsData, error: unitsError } = await supabase
            .from('units')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('unit_number', { ascending: true })

        if (unitsError) {
            console.error('Failed to fetch units:', unitsError.message || unitsError.code || JSON.stringify(unitsError))
            // Check if auth session expired (RLS denial returns empty error)
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                console.warn('Session expired — redirecting to login')
                if (typeof window !== 'undefined') {
                    window.location.href = '/login'
                }
            }
            return
        }

        // Fetch active bookings with guests
        const { data: bookingsData } = await supabase
            .from('bookings')
            .select('*, guests(*)')
            .eq('status', 'CHECKED_IN')

        const bookingsByUnit: Record<string, Booking> = {}
        if (bookingsData) {
            for (const b of bookingsData) {
                bookingsByUnit[b.unit_id] = b as Booking
            }
        }

        const unitsWithBookings = (unitsData || []).map((unit) => ({
            ...unit,
            active_booking: bookingsByUnit[unit.id] || null,
        })) as UnitWithBooking[]

        unitsWithBookings.sort((a, b) => naturalSort(a.unit_number, b.unit_number))
        set({ units: unitsWithBookings, isLoading: false })
    },

    updateUnitStatus: async (unitId, status) => {
        const previousUnits = get().units

        // Optimistic update
        set({
            units: previousUnits.map((u) =>
                u.id === unitId ? { ...u, status } : u
            ),
        })

        const { error } = await supabase
            .from('units')
            .update({ status })
            .eq('id', unitId)

        if (error) {
            console.error('Failed to update unit status:', error)
            set({ units: previousUnits })
            throw error
        }
    },

    // Supabase real-time subscription (best-effort, not guaranteed)
    subscribeToUnits: (hotelId, withBookings = false) => {
        const channelName = `units_${withBookings ? 'full' : 'basic'}_${hotelId.slice(0, 8)}`
        const subscription = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'units',
                    filter: `hotel_id=eq.${hotelId}`,
                },
                (payload) => {
                    if (payload.eventType === 'UPDATE') {
                        const oldUnit = get().units.find(u => u.id === payload.new.id)
                        const statusChanged = oldUnit && oldUnit.status !== payload.new.status

                        if (statusChanged && withBookings) {
                            get().fetchUnitsWithBookings(hotelId)
                        } else if (statusChanged) {
                            get().fetchUnits(hotelId)
                        } else {
                            set((state) => ({
                                units: state.units.map((u) =>
                                    u.id === payload.new.id
                                        ? { ...u, ...payload.new }
                                        : u
                                ),
                            }))
                        }
                    } else if (payload.eventType === 'INSERT') {
                        if (withBookings) {
                            get().fetchUnitsWithBookings(hotelId)
                        } else {
                            get().fetchUnits(hotelId)
                        }
                    } else if (payload.eventType === 'DELETE') {
                        set((state) => ({
                            units: state.units.filter(
                                (u) => u.id !== payload.old.id
                            ),
                        }))
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    },

    // Guaranteed polling fallback — re-fetches data every N ms
    startPolling: (hotelId, withBookings = false, intervalMs = 10000) => {
        const fetchFn = withBookings
            ? () => get().fetchUnitsWithBookings(hotelId)
            : () => get().fetchUnits(hotelId)

        const interval = setInterval(fetchFn, intervalMs)

        return () => {
            clearInterval(interval)
        }
    },
}))
