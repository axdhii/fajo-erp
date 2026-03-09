import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'

export type RoomStatus = 'Available' | 'Occupied' | 'Cleaning'

export interface Room {
    id: string
    hotel_id: string
    room_number: string
    status: RoomStatus
    current_staff_id: string | null
}

interface RoomState {
    rooms: Room[]
    setRooms: (rooms: Room[]) => void
    updateRoomStatus: (roomId: string, status: RoomStatus, staffId?: string | null) => Promise<void>
    subscribeToRooms: (hotelId: string) => () => void
    fetchRooms: (hotelId: string) => Promise<void>
}

export const useRoomStore = create<RoomState>((set, get) => ({
    rooms: [],
    setRooms: (rooms) => set({ rooms }),

    // Optimistic update
    updateRoomStatus: async (roomId, status, staffId = undefined) => {
        const previousRooms = get().rooms

        // Optimistically update UI
        set({
            rooms: previousRooms.map((r) =>
                r.id === roomId ? { ...r, status, current_staff_id: staffId !== undefined ? staffId : r.current_staff_id } : r
            )
        })

        // Perform backend change
        const updatePayload: any = { status }
        if (staffId !== undefined) {
            updatePayload.current_staff_id = staffId
        }

        const { error } = await supabase
            .from('rooms')
            .update(updatePayload)
            .eq('id', roomId)

        if (error) {
            console.error('Failed to update room status:', error)
            // Rollback on failure
            set({ rooms: previousRooms })
            throw error
        }
    },

    fetchRooms: async (hotelId) => {
        const { data, error } = await supabase
            .from('rooms')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('room_number', { ascending: true })

        if (error) {
            console.error('Failed to fetch rooms', error)
            return
        }

        if (data) set({ rooms: data as Room[] })
    },

    subscribeToRooms: (hotelId) => {
        const subscription = supabase
            .channel('rooms_changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'rooms',
                filter: `hotel_id=eq.${hotelId}`
            }, (payload) => {
                if (payload.eventType === 'UPDATE') {
                    set((state) => ({
                        rooms: state.rooms.map((r) =>
                            r.id === payload.new.id ? { ...r, ...payload.new } : r
                        )
                    }))
                } else if (payload.eventType === 'INSERT') {
                    set((state) => ({
                        rooms: [...state.rooms, payload.new as Room].sort((a, b) => a.room_number.localeCompare(b.room_number))
                    }))
                } else if (payload.eventType === 'DELETE') {
                    set((state) => ({
                        rooms: state.rooms.filter((r) => r.id !== payload.old.id)
                    }))
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    }
}))
