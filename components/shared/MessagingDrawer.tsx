'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Send, Users, Loader2 } from 'lucide-react'
import { timeAgo } from '@/lib/utils/time'
import type { Message } from '@/lib/types'

// ── Props ────────────────────────────────────────────────────
interface MessagingDrawerProps {
    open: boolean
    onClose: () => void
    staffId: string
    hotelId: string
}

// ── Role badge color ─────────────────────────────────────────
function roleBadgeStyle(role: string): string {
    switch (role) {
        case 'FrontDesk':    return 'bg-emerald-100 text-emerald-700'
        case 'ZonalOps':     return 'bg-orange-100 text-orange-700'
        case 'ZonalHK':      return 'bg-teal-100 text-teal-700'
        case 'Admin':        return 'bg-slate-800 text-white'
        case 'HR':           return 'bg-purple-100 text-purple-700'
        case 'Developer':    return 'bg-indigo-100 text-indigo-700'
        case 'Housekeeping': return 'bg-amber-100 text-amber-700'
        default:             return 'bg-slate-100 text-slate-700'
    }
}

// ── Main Component ───────────────────────────────────────────
export function MessagingDrawer({ open, onClose, staffId, hotelId }: MessagingDrawerProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [messageBody, setMessageBody] = useState('')
    const [loading, setLoading] = useState(false)
    const [sending, setSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // ── Fetch group messages ─────────────────────────────────
    const fetchMessages = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/messages')
            if (!res.ok) throw new Error('Failed to fetch messages')
            const json = await res.json()
            setMessages(Array.isArray(json.data) ? json.data : [])
        } catch {
            toast.error('Failed to load messages')
            setMessages([])
        }
        setLoading(false)
    }, [])

    // ── Mark chat as read ────────────────────────────────────
    const markAsRead = useCallback(async () => {
        try {
            await fetch('/api/messages', { method: 'PATCH' })
        } catch {
            // Non-critical — silently fail
        }
    }, [])

    // ── Send message ─────────────────────────────────────────
    const handleSend = async () => {
        if (!messageBody.trim() || sending) return

        setSending(true)
        try {
            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: messageBody.trim() }),
            })
            if (!res.ok) throw new Error('Failed to send')

            const json = await res.json()
            const sent = json?.data
            setMessageBody('')
            if (sent?.id) {
                setMessages(prev => [...prev, sent])
            } else {
                fetchMessages()
            }
        } catch {
            toast.error('Failed to send message')
        }
        setSending(false)
    }

    // ── Auto-scroll to bottom ────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // ── Load messages + mark read on open ────────────────────
    useEffect(() => {
        if (open) {
            fetchMessages()
            markAsRead()
        }
    }, [open, fetchMessages, markAsRead])

    // ── Realtime subscription for incoming group messages ────
    useEffect(() => {
        if (!open) return

        const channel = supabase
            .channel('group-chat-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `hotel_id=eq.${hotelId}`,
                },
                (payload) => {
                    const newMsg = payload.new as Message
                    // Only add group messages (recipient_id is null) from others
                    if (newMsg.recipient_id === null && newMsg.sender_id !== staffId) {
                        setMessages(prev => [...prev, newMsg])
                        markAsRead()
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [open, hotelId, staffId, markAsRead])

    return (
        <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[400px] flex flex-col p-0"
            >
                {/* Header */}
                <SheetHeader className="border-b border-slate-100 px-4 py-3">
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <Users className="h-5 w-5 text-cyan-600" />
                        Team Chat
                    </SheetTitle>
                </SheetHeader>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <p className="mt-2 text-xs">Loading messages...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <Users className="h-8 w-8 mb-2" />
                            <p className="text-sm font-medium">No messages yet</p>
                            <p className="text-xs mt-1">Start the team conversation!</p>
                        </div>
                    ) : (
                        messages.map(msg => {
                            const isMine = msg.sender_id === staffId
                            const senderName = msg.sender?.name || 'Unknown'
                            const senderRole = msg.sender?.role || ''

                            return (
                                <div
                                    key={msg.id}
                                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[80%] ${isMine ? '' : ''}`}>
                                        {/* Sender info for others' messages */}
                                        {!isMine && (
                                            <div className="flex items-center gap-1.5 mb-1 ml-1">
                                                <span className="text-xs font-bold text-slate-700">
                                                    {senderName}
                                                </span>
                                                {senderRole && (
                                                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${roleBadgeStyle(senderRole)}`}>
                                                        {senderRole}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Message bubble */}
                                        <div
                                            className={`rounded-2xl px-3.5 py-2 ${
                                                isMine
                                                    ? 'bg-cyan-600 text-white rounded-br-md'
                                                    : 'bg-slate-100 text-slate-800 rounded-bl-md'
                                            }`}
                                        >
                                            <p className="text-sm whitespace-pre-wrap break-words">
                                                {msg.body}
                                            </p>
                                        </div>

                                        {/* Timestamp below bubble */}
                                        <p className={`text-[10px] mt-0.5 ${
                                            isMine ? 'text-right text-slate-400' : 'text-left text-slate-400 ml-1'
                                        }`}>
                                            {timeAgo(msg.created_at)}
                                        </p>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="border-t border-slate-100 px-4 py-3">
                    <div className="flex items-end gap-2">
                        <textarea
                            value={messageBody}
                            onChange={e => setMessageBody(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder="Type a message..."
                            rows={1}
                            disabled={sending}
                            className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none min-h-[40px] max-h-[120px] focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-50"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!messageBody.trim() || sending}
                            className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl h-10 w-10 p-0 shrink-0 flex items-center justify-center transition-colors"
                        >
                            {sending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
