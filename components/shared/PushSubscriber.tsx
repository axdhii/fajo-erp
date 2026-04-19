'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store/auth-store'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray.buffer as ArrayBuffer
}

export function PushSubscriber() {
    const { profile } = useAuthStore()

    useEffect(() => {
        if (!profile?.id || !VAPID_PUBLIC_KEY) return
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

        const setup = async () => {
            try {
                // Register service worker
                const registration = await navigator.serviceWorker.register('/sw.js')
                await navigator.serviceWorker.ready

                // Check if already subscribed
                const existing = await registration.pushManager.getSubscription()
                if (existing) {
                    // Re-send to server in case it was lost
                    await fetch('/api/push/subscribe', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ subscription: existing.toJSON() }),
                    })
                    return
                }

                // Request permission
                const permission = await Notification.requestPermission()
                if (permission !== 'granted') return

                // Subscribe to push
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                })

                // Send subscription to server
                await fetch('/api/push/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subscription: subscription.toJSON() }),
                })
            } catch (err) {
                console.error('Push subscription setup failed:', err)
            }
        }

        setup()
    }, [profile?.id])

    return null // This component renders nothing — it's a side-effect only
}
