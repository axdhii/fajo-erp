'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, Send, ArrowLeft, Search, Loader2, Inbox } from 'lucide-react'
import { timeAgo } from '@/lib/utils/time'

// ── Types ────────────────────────────────────────────────────
interface StaffContact {
    id: string
    name: string
    role: string
}

interface ConversationSummary {
    contact_id: string
    last_message: string
    last_message_at: string
    unread_count: number
}

interface Message {
    id: string
    sender_id: string
    recipient_id: string
    body: string
    read: boolean
    created_at: string
}

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
        case 'Admin':     return 'bg-purple-100 text-purple-700'
        case 'Developer': return 'bg-indigo-100 text-indigo-700'
        case 'FrontDesk': return 'bg-emerald-100 text-emerald-700'
        case 'ZonalOps':  return 'bg-orange-100 text-orange-700'
        case 'ZonalHK':   return 'bg-teal-100 text-teal-700'
        case 'HR':        return 'bg-blue-100 text-blue-700'
        default:          return 'bg-slate-100 text-slate-700'
    }
}

// ── Main Component ───────────────────────────────────────────
export function MessagingDrawer({ open, onClose, staffId, hotelId }: MessagingDrawerProps) {
    const [view, setView] = useState<'contacts' | 'conversation'>('contacts')
    const [contacts, setContacts] = useState<StaffContact[]>([])
    const [summaries, setSummaries] = useState<ConversationSummary[]>([])
    const [selectedContact, setSelectedContact] = useState<StaffContact | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [messageBody, setMessageBody] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [loadingContacts, setLoadingContacts] = useState(false)
    const [loadingMessages, setLoadingMessages] = useState(false)
    const [sending, setSending] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const selectedContactRef = useRef<StaffContact | null>(null)

    // ── Fetch staff contacts ─────────────────────────────────
    const fetchContacts = useCallback(async () => {
        setLoadingContacts(true)
        const { data, error } = await supabase
            .from('staff')
            .select('id, name, role')
            .eq('hotel_id', hotelId)
            .neq('id', staffId)

        if (error) {
            toast.error('Failed to load contacts')
        } else if (data) {
            setContacts(data)
        }
        setLoadingContacts(false)
    }, [hotelId, staffId])

    // ── Fetch conversation summaries ─────────────────────────
    const fetchSummaries = useCallback(async () => {
        try {
            const res = await fetch('/api/messages')
            if (!res.ok) throw new Error('Failed to fetch conversations')
            const json = await res.json()
            setSummaries(Array.isArray(json.data) ? json.data : [])
        } catch {
            // Silently fail — contacts will still render without summaries
        }
    }, [])

    // ── Fetch messages for a conversation ────────────────────
    const fetchMessages = useCallback(async (contactId: string) => {
        setLoadingMessages(true)
        try {
            const res = await fetch(`/api/messages?with=${contactId}`)
            if (!res.ok) throw new Error('Failed to fetch messages')
            const json = await res.json()
            setMessages(Array.isArray(json.data) ? json.data : [])
        } catch {
            toast.error('Failed to load messages')
            setMessages([])
        }
        setLoadingMessages(false)
    }, [])

    // ── Mark messages as read ────────────────────────────────
    const markAsRead = useCallback(async (contactId: string) => {
        try {
            await fetch('/api/messages', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender_id: contactId }),
            })
            // Refresh summaries to update unread counts
            fetchSummaries()
        } catch {
            // Non-critical — silently fail
        }
    }, [fetchSummaries])

    // ── Send message ─────────────────────────────────────────
    const handleSend = async () => {
        if (!messageBody.trim() || !selectedContact || sending) return

        setSending(true)
        try {
            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient_id: selectedContact.id,
                    body: messageBody.trim(),
                }),
            })
            if (!res.ok) throw new Error('Failed to send')

            // Optimistically add to local messages
            const json = await res.json()
            const sent = json?.data
            setMessageBody('')
            if (sent?.id) {
                setMessages(prev => [...prev, sent])
            } else {
                // Refetch if no data returned
                fetchMessages(selectedContact.id)
            }
        } catch {
            toast.error('Failed to send message')
        }
        setSending(false)
    }

    // ── Open conversation ────────────────────────────────────
    const openConversation = (contact: StaffContact) => {
        selectedContactRef.current = contact
        setSelectedContact(contact)
        setView('conversation')
        fetchMessages(contact.id)
        markAsRead(contact.id)
    }

    // ── Back to contacts ─────────────────────────────────────
    const goBack = () => {
        selectedContactRef.current = null
        setView('contacts')
        setSelectedContact(null)
        setMessages([])
        setMessageBody('')
        fetchSummaries()
    }

    // ── Auto-scroll to bottom ────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // ── Load contacts + summaries on open ────────────────────
    useEffect(() => {
        if (open) {
            fetchContacts()
            fetchSummaries()
            setView('contacts')
            setSelectedContact(null)
            setMessages([])
        }
    }, [open, fetchContacts, fetchSummaries])

    // ── Realtime subscription for incoming messages ──────────
    useEffect(() => {
        if (!open) return

        const channel = supabase
            .channel('messaging-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `recipient_id=eq.${staffId}`,
                },
                (payload) => {
                    const newMsg = payload.new as Message
                    const current = selectedContactRef.current

                    // If currently viewing conversation with this sender, add message
                    if (current && newMsg.sender_id === current.id) {
                        setMessages(prev => [...prev, newMsg])
                        markAsRead(current.id)
                    }

                    // Always refresh summaries for unread counts
                    fetchSummaries()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [open, staffId, markAsRead, fetchSummaries])

    // ── Build sorted contact list ────────────────────────────
    const summaryMap = new Map(summaries.map(s => [s.contact_id, s]))

    const filteredContacts = contacts
        .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            const sa = summaryMap.get(a.id)
            const sb = summaryMap.get(b.id)

            // Unread first
            const ua = sa?.unread_count ?? 0
            const ub = sb?.unread_count ?? 0
            if (ua > 0 && ub === 0) return -1
            if (ub > 0 && ua === 0) return 1

            // Then by last message time
            const ta = sa?.last_message_at ?? ''
            const tb = sb?.last_message_at ?? ''
            if (ta && tb) return new Date(tb).getTime() - new Date(ta).getTime()
            if (ta) return -1
            if (tb) return 1

            // Alphabetical fallback
            return a.name.localeCompare(b.name)
        })

    const totalUnread = summaries.reduce((sum, s) => sum + (s.unread_count ?? 0), 0)

    return (
        <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <SheetContent
                side="right"
                showCloseButton={view === 'contacts'}
                className="w-full sm:max-w-[400px] flex flex-col p-0"
            >
                {/* ── CONTACTS VIEW ───────────────────────────── */}
                {view === 'contacts' && (
                    <>
                        <SheetHeader className="border-b border-slate-100 px-4 py-3">
                            <SheetTitle className="flex items-center gap-2 text-base">
                                <MessageSquare className="h-5 w-5 text-cyan-600" />
                                Messages
                                {totalUnread > 0 && (
                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                        {totalUnread > 99 ? '99+' : totalUnread}
                                    </span>
                                )}
                            </SheetTitle>
                            <SheetDescription className="sr-only">
                                Staff messaging
                            </SheetDescription>
                        </SheetHeader>

                        {/* Search */}
                        <div className="px-4 py-2 border-b border-slate-50">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search staff..."
                                    className="pl-9 h-9 text-sm"
                                />
                            </div>
                        </div>

                        {/* Contact list */}
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            {loadingContacts ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <p className="mt-2 text-xs">Loading contacts...</p>
                                </div>
                            ) : filteredContacts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Inbox className="h-8 w-8 mb-2" />
                                    <p className="text-sm font-medium">
                                        {searchQuery ? 'No matching contacts' : 'No contacts available'}
                                    </p>
                                </div>
                            ) : (
                                filteredContacts.map(contact => {
                                    const summary = summaryMap.get(contact.id)
                                    const hasUnread = (summary?.unread_count ?? 0) > 0

                                    return (
                                        <button
                                            key={contact.id}
                                            onClick={() => openConversation(contact)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 text-left transition-colors hover:bg-slate-50 ${
                                                hasUnread ? 'bg-cyan-50/50' : ''
                                            }`}
                                        >
                                            {/* Avatar circle */}
                                            <div className="flex-shrink-0 h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
                                                {contact.name.charAt(0).toUpperCase()}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm ${hasUnread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                                                        {contact.name}
                                                    </span>
                                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleBadgeStyle(contact.role)}`}>
                                                        {contact.role}
                                                    </span>
                                                </div>
                                                {summary?.last_message && (
                                                    <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                                                        {summary.last_message}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Right side: time + unread */}
                                            <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                                {summary?.last_message_at && (
                                                    <span className="text-[10px] text-slate-400">
                                                        {timeAgo(summary.last_message_at)}
                                                    </span>
                                                )}
                                                {hasUnread && (
                                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-white">
                                                        {(summary?.unread_count ?? 0) > 99 ? '99+' : summary?.unread_count}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    )
                                })
                            )}
                        </div>
                    </>
                )}

                {/* ── CONVERSATION VIEW ───────────────────────── */}
                {view === 'conversation' && selectedContact && (
                    <>
                        {/* Header */}
                        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                            <button
                                onClick={goBack}
                                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <ArrowLeft className="h-5 w-5 text-slate-600" />
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-slate-900">
                                        {selectedContact.name}
                                    </span>
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleBadgeStyle(selectedContact.role)}`}>
                                        {selectedContact.role}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-2">
                            {loadingMessages ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <p className="mt-2 text-xs">Loading messages...</p>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <MessageSquare className="h-8 w-8 mb-2" />
                                    <p className="text-sm font-medium">No messages yet</p>
                                    <p className="text-xs mt-1">Start the conversation!</p>
                                </div>
                            ) : (
                                messages.map(msg => {
                                    const isSent = msg.sender_id === staffId
                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                                                    isSent
                                                        ? 'bg-cyan-600 text-white rounded-br-md'
                                                        : 'bg-slate-100 text-slate-800 rounded-bl-md'
                                                }`}
                                            >
                                                <p className="text-sm whitespace-pre-wrap break-words">
                                                    {msg.body}
                                                </p>
                                                <p className={`text-[10px] mt-1 ${
                                                    isSent ? 'text-cyan-200' : 'text-slate-400'
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

                        {/* Input */}
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
                                    className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none min-h-[40px] max-h-[120px] focus:outline-none focus:ring-2 focus:ring-cyan-300"
                                />
                                <Button
                                    onClick={handleSend}
                                    disabled={!messageBody.trim() || sending}
                                    size="sm"
                                    className="bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl h-10 w-10 p-0 shrink-0"
                                >
                                    {sending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
