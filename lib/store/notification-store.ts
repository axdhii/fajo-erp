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
    fetchNotifications: (hotelId: string, role: string, staffId: string) => Promise<void>
    markAsRead: (id: string) => Promise<void>
    markAllAsRead: (hotelId: string, role: string, staffId: string) => Promise<void>
    subscribe: (hotelId: string, role: string, staffId: string) => () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,

    fetchNotifications: async (hotelId, role, staffId) => {
        set({ isLoading: true })

        // Fetch notifications targeted to this user's role OR directly to them
        // Admin sees all notifications for their hotel
        let query = supabase
            .from('notifications')
            .select('*')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (role === 'Admin') {
            // Admin sees everything for their hotel — no extra filter
        } else {
            // Non-admin: see notifications for their role OR addressed to them personally
            query = query.or(`recipient_role.eq.${role},recipient_staff_id.eq.${staffId}`)
        }

        const { data, error } = await query

        if (error) {
            console.error('Failed to fetch notifications:', error)
            set({ isLoading: false })
            return
        }

        const notifications = (data || []) as Notification[]
        set({
            notifications,
            unreadCount: notifications.filter(n => !n.read).length,
            isLoading: false,
        })
    },

    markAsRead: async (id) => {
        // Optimistic update
        set(state => ({
            notifications: state.notifications.map(n =>
                n.id === id ? { ...n, read: true } : n
            ),
            unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => n.id === id && !n.read) ? 1 : 0)),
        }))

        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', id)

        if (error) {
            console.error('Failed to mark notification as read:', error)
        }
    },

    markAllAsRead: async (hotelId, role, staffId) => {
        // Optimistic update
        set(state => ({
            notifications: state.notifications.map(n => ({ ...n, read: true })),
            unreadCount: 0,
        }))

        let query = supabase
            .from('notifications')
            .update({ read: true })
            .eq('hotel_id', hotelId)
            .eq('read', false)

        if (role !== 'Admin') {
            query = query.or(`recipient_role.eq.${role},recipient_staff_id.eq.${staffId}`)
        }

        const { error } = await query

        if (error) {
            console.error('Failed to mark all as read:', error)
        }
    },

    subscribe: (hotelId, role, staffId) => {
        const channelName = `notif_${staffId.slice(0, 8)}`
        const subscription = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `hotel_id=eq.${hotelId}`,
                },
                (payload) => {
                    const newNotif = payload.new as Notification

                    // Only add if it targets this user
                    const isForMe =
                        role === 'Admin' ||
                        newNotif.recipient_role === role ||
                        newNotif.recipient_staff_id === staffId

                    if (isForMe) {
                        set(state => ({
                            notifications: [newNotif, ...state.notifications].slice(0, 50),
                            unreadCount: state.unreadCount + 1,
                        }))
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'notifications',
                    filter: `hotel_id=eq.${hotelId}`,
                },
                (payload) => {
                    const updated = payload.new as Notification
                    set(state => {
                        const notifications = state.notifications.map(n =>
                            n.id === updated.id ? updated : n
                        )
                        return {
                            notifications,
                            unreadCount: notifications.filter(n => !n.read).length,
                        }
                    })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(subscription)
        }
    },
}))
