import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'

export interface Notification {
    id: string
    hotel_id: string
    recipient_role: string
    recipient_staff_id: string | null
    type: string
    title: string
    message: string
    link: string | null
    source_table: string | null
    source_id: string | null
    read: boolean
    created_at: string
}

interface NotificationState {
    notifications: Notification[]
    unreadCount: number
    isLoading: boolean
    error: string | null
    initialized: boolean
    fetchNotifications: (hotelId: string, role: string, staffId: string) => Promise<void>
    markAsRead: (id: string) => Promise<void>
    markAllAsRead: (hotelId: string, role: string, staffId: string) => Promise<void>
    subscribe: (hotelId: string, role: string, staffId: string) => () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    initialized: false,

    fetchNotifications: async (hotelId, role, staffId) => {
        set({ isLoading: true, error: null })

        // Auto-cleanup old notifications (fire-and-forget, 30 days)
        supabase.from('notifications').delete().lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).then()

        let query = supabase
            .from('notifications')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (role !== 'Admin') {
            query = query.or(`recipient_role.eq.${role},recipient_staff_id.eq.${staffId}`)
        }

        const { data, error } = await query

        if (error) {
            console.error('Failed to fetch notifications:', error)
            set({ isLoading: false, error: error.message })
            return
        }

        const notifications = (data || []) as Notification[]
        set({
            notifications,
            unreadCount: notifications.filter(n => !n.read).length,
            isLoading: false,
            error: null,
        })
    },

    markAsRead: async (id) => {
        const prev = { notifications: get().notifications, unreadCount: get().unreadCount }
        // Optimistic update
        set(state => ({
            notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
            unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => n.id === id && !n.read) ? 1 : 0)),
        }))

        const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
        if (error) {
            console.error('Failed to mark notification as read:', error)
            set(prev) // rollback
        }
    },

    markAllAsRead: async (hotelId, role, staffId) => {
        const prev = { notifications: get().notifications, unreadCount: get().unreadCount }
        // Optimistic update
        set(state => ({
            notifications: state.notifications.map(n => ({ ...n, read: true })),
            unreadCount: 0,
        }))

        let query = supabase.from('notifications').update({ read: true }).eq('hotel_id', hotelId).eq('read', false)
        if (role !== 'Admin') {
            query = query.or(`recipient_role.eq.${role},recipient_staff_id.eq.${staffId}`)
        }

        const { error } = await query
        if (error) {
            console.error('Failed to mark all as read:', error)
            set(prev) // rollback
        }
    },

    subscribe: (hotelId, role, staffId) => {
        if (get().initialized) return () => {} // already subscribed
        set({ initialized: true })

        const channel = supabase
            .channel(`notif_${staffId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `hotel_id=eq.${hotelId}`,
            }, (payload) => {
                const n = payload.new as Notification
                const isForMe = role === 'Admin' || n.recipient_role === role || n.recipient_staff_id === staffId
                if (isForMe) {
                    set(state => ({
                        notifications: [n, ...state.notifications].slice(0, 50),
                        unreadCount: state.unreadCount + 1,
                    }))
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `hotel_id=eq.${hotelId}`,
            }, (payload) => {
                const updated = payload.new as Notification
                set(state => {
                    const notifications = state.notifications.map(n => n.id === updated.id ? updated : n)
                    return { notifications, unreadCount: notifications.filter(n => !n.read).length }
                })
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
            set({ initialized: false })
        }
    },
}))
