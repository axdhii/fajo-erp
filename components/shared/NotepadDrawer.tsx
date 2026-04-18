'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { StickyNote, Plus, ArrowLeft, Trash2, Loader2, FileText } from 'lucide-react'
import { timeAgo } from '@/lib/utils/time'

// ── Types ────────────────────────────────────────────────────
interface Note {
    id: string
    content: string
    created_at: string
    updated_at: string
}

// ── Props ────────────────────────────────────────────────────
interface NotepadDrawerProps {
    open: boolean
    onClose: () => void
    staffId: string
    hotelId: string
}

// ── Main Component ───────────────────────────────────────────
export function NotepadDrawer({ open, onClose, staffId, hotelId }: NotepadDrawerProps) {
    const [view, setView] = useState<'list' | 'editor'>('list')
    const [notes, setNotes] = useState<Note[]>([])
    const [selectedNote, setSelectedNote] = useState<Note | null>(null)
    const [editorContent, setEditorContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ── Fetch notes ──────────────────────────────────────────
    const fetchNotes = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/notes')
            if (!res.ok) throw new Error('Failed to fetch notes')
            const json = await res.json()
            setNotes(Array.isArray(json.data) ? json.data : [])
        } catch {
            toast.error('Failed to load notes')
            setNotes([])
        }
        setLoading(false)
    }, [])

    // ── Create new note ──────────────────────────────────────
    const handleCreate = async () => {
        if (creating) return
        setCreating(true)
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: '' }),
            })
            if (!res.ok) throw new Error('Failed to create note')
            const json = await res.json()
            const newNote = json?.data
            if (newNote?.id) {
                setSelectedNote(newNote)
                setEditorContent(newNote.content || '')
                setView('editor')
                setSaveStatus('idle')
                // Refresh list in background
                fetchNotes()
            }
        } catch {
            toast.error('Failed to create note')
        }
        setCreating(false)
    }

    // ── Save note (auto-save on blur) ────────────────────────
    const saveNote = useCallback(async (noteId: string, content: string) => {
        setSaving(true)
        setSaveStatus('saving')
        try {
            const res = await fetch('/api/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: noteId, content }),
            })
            if (!res.ok) throw new Error('Failed to save')
            setSaveStatus('saved')
            setSelectedNote(prev => prev ? { ...prev, content } : prev)

            // Reset status after 2 seconds
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
        } catch {
            toast.error('Failed to save note')
            setSaveStatus('idle')
        }
        setSaving(false)
    }, [])

    // ── Delete note ──────────────────────────────────────────
    const handleDelete = async () => {
        if (!selectedNote || deleting) return

        const confirmed = window.confirm('Are you sure you want to delete this note?')
        if (!confirmed) return

        setDeleting(true)
        try {
            const res = await fetch(`/api/notes?id=${selectedNote.id}`, {
                method: 'DELETE',
            })
            if (!res.ok) throw new Error('Failed to delete')
            toast.success('Note deleted')
            setView('list')
            setSelectedNote(null)
            setEditorContent('')
            fetchNotes()
        } catch {
            toast.error('Failed to delete note')
        }
        setDeleting(false)
    }

    // ── Open note for editing ────────────────────────────────
    const openNote = (note: Note) => {
        setSelectedNote(note)
        setEditorContent(note.content || '')
        setView('editor')
        setSaveStatus('idle')
    }

    // ── Back to list ─────────────────────────────────────────
    const goBack = async () => {
        // Save before going back if content changed
        if (selectedNote && editorContent !== selectedNote.content) {
            await saveNote(selectedNote.id, editorContent)
        }
        setView('list')
        setSelectedNote(null)
        setEditorContent('')
        setSaveStatus('idle')
        fetchNotes()
    }

    // ── Handle blur (auto-save) ──────────────────────────────
    const handleBlur = () => {
        if (selectedNote && editorContent !== selectedNote.content) {
            saveNote(selectedNote.id, editorContent)
        }
    }

    // ── Load notes on open ───────────────────────────────────
    useEffect(() => {
        if (open) {
            fetchNotes()
            setView('list')
            setSelectedNote(null)
            setEditorContent('')
            setSaveStatus('idle')
        }
    }, [open, fetchNotes])

    // ── Cleanup save timer ───────────────────────────────────
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        }
    }, [])

    // ── Preview text ─────────────────────────────────────────
    const previewText = (content: string) => {
        if (!content || !content.trim()) return 'Empty note'
        return content.length > 100 ? content.substring(0, 100) + '...' : content
    }

    return (
        <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
            <SheetContent
                side="right"
                showCloseButton={view === 'list'}
                className="w-full sm:max-w-[400px] flex flex-col p-0"
            >
                {/* ── NOTES LIST VIEW ─────────────────────────── */}
                {view === 'list' && (
                    <>
                        <SheetHeader className="border-b border-slate-100 px-4 py-3">
                            <SheetTitle className="flex items-center gap-2 text-base">
                                <StickyNote className="h-5 w-5 text-amber-500" />
                                Notepad
                            </SheetTitle>
                            <SheetDescription className="sr-only">
                                Personal notes
                            </SheetDescription>
                        </SheetHeader>

                        {/* New Note button */}
                        <div className="px-4 py-2 border-b border-slate-50">
                            <Button
                                onClick={handleCreate}
                                disabled={creating}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                                size="sm"
                            >
                                {creating ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Plus className="h-4 w-4 mr-2" />
                                )}
                                New Note
                            </Button>
                        </div>

                        {/* Notes list */}
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <p className="mt-2 text-xs">Loading notes...</p>
                                </div>
                            ) : notes.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                    <FileText className="h-8 w-8 mb-2" />
                                    <p className="text-sm font-medium">No notes yet</p>
                                    <p className="text-xs mt-1">Create your first note above</p>
                                </div>
                            ) : (
                                notes.map(note => (
                                    <button
                                        key={note.id}
                                        onClick={() => openNote(note)}
                                        className="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-amber-50/50 transition-colors"
                                    >
                                        <p className="text-sm text-slate-700 line-clamp-2">
                                            {previewText(note.content)}
                                        </p>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            {note.updated_at
                                                ? timeAgo(note.updated_at)
                                                : timeAgo(note.created_at)
                                            }
                                        </p>
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* ── EDITOR VIEW ─────────────────────────────── */}
                {view === 'editor' && selectedNote && (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={goBack}
                                    className="flex-shrink-0 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                    <ArrowLeft className="h-5 w-5 text-slate-600" />
                                </button>
                                <span className="text-sm font-medium text-slate-500">
                                    {saveStatus === 'saving' && 'Saving...'}
                                    {saveStatus === 'saved' && 'Saved'}
                                    {saveStatus === 'idle' && 'Note'}
                                </span>
                            </div>
                            <Button
                                onClick={handleDelete}
                                disabled={deleting}
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                                {deleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        </div>

                        {/* Editor textarea */}
                        <div className="flex-1 p-4">
                            <textarea
                                value={editorContent}
                                onChange={e => setEditorContent(e.target.value)}
                                onBlur={handleBlur}
                                placeholder="Start typing..."
                                className="w-full h-full text-sm text-slate-700 resize-none focus:outline-none leading-relaxed"
                            />
                        </div>

                        {/* Footer save button */}
                        <div className="border-t border-slate-100 px-4 py-3">
                            <Button
                                onClick={() => {
                                    if (selectedNote) saveNote(selectedNote.id, editorContent)
                                }}
                                disabled={saving || editorContent === selectedNote.content}
                                className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                                size="sm"
                            >
                                {saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <StickyNote className="h-4 w-4 mr-2" />
                                )}
                                Save Note
                            </Button>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    )
}
