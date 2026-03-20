'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Archive,
    Download,
    Trash2,
    Loader2,
    FileImage,
    X,
    AlertTriangle,
} from 'lucide-react'
import JSZip from 'jszip'

// ============================================================
// Types
// ============================================================

interface StorageFile {
    name: string
    id: string
    metadata?: { size?: number }
}

interface AadharArchiveProps {
    open: boolean
    onClose: () => void
}

// ============================================================
// Component
// ============================================================

export function AadharArchive({ open, onClose }: AadharArchiveProps) {
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [month, setMonth] = useState(defaultMonth)
    const [files, setFiles] = useState<StorageFile[]>([])
    const [loading, setLoading] = useState(false)
    const [totalSize, setTotalSize] = useState(0)

    const [downloading, setDownloading] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 })
    const [downloadComplete, setDownloadComplete] = useState(false)

    const [clearing, setClearing] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)
    const [clearResult, setClearResult] = useState<string | null>(null)

    // Fetch files for the selected month
    const fetchFiles = useCallback(async () => {
        setLoading(true)
        setDownloadComplete(false)
        setClearResult(null)
        setConfirmClear(false)
        try {
            const { data, error } = await supabase.storage
                .from('aadhars')
                .list(month, { limit: 1000 })

            if (error) {
                console.error('Failed to list aadhar photos:', error)
                setFiles([])
                setTotalSize(0)
                return
            }

            // Filter out folder placeholders (empty names or .emptyFolderPlaceholder)
            const realFiles = (data || []).filter(
                f => f.name && f.name !== '.emptyFolderPlaceholder'
            )
            setFiles(realFiles)

            // Estimate size from metadata if available
            let size = 0
            for (const f of realFiles) {
                size += (f.metadata as { size?: number })?.size || 0
            }
            setTotalSize(size)
        } finally {
            setLoading(false)
        }
    }, [month])

    useEffect(() => {
        if (open) fetchFiles()
    }, [open, fetchFiles])

    // Format file size
    const formatSize = (bytes: number): string => {
        if (bytes === 0) return 'size unknown'
        if (bytes < 1024) return `${bytes} B`
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    // Format month for display
    const formatMonth = (m: string): string => {
        const [year, mo] = m.split('-')
        const date = new Date(Number(year), Number(mo) - 1)
        return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    }

    // Download all files as ZIP
    const handleDownload = async () => {
        if (files.length === 0) return
        setDownloading(true)
        setDownloadProgress({ current: 0, total: files.length })

        try {
            const zip = new JSZip()
            const folder = zip.folder(month)!

            for (let i = 0; i < files.length; i++) {
                setDownloadProgress({ current: i + 1, total: files.length })

                const { data, error } = await supabase.storage
                    .from('aadhars')
                    .download(`${month}/${files[i].name}`)

                if (error) {
                    console.error(`Failed to download ${files[i].name}:`, error)
                    continue
                }

                if (data) {
                    folder.file(files[i].name, data)
                }
            }

            const blob = await zip.generateAsync({ type: 'blob' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `aadhars-${month}.zip`
            a.click()
            URL.revokeObjectURL(url)

            setDownloadComplete(true)
        } catch (err) {
            console.error('ZIP download error:', err)
        } finally {
            setDownloading(false)
        }
    }

    // Clear month's photos via API
    const handleClear = async () => {
        setClearing(true)
        setClearResult(null)
        try {
            const res = await fetch('/api/admin/aadhar-archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })

            const data = await res.json()

            if (!res.ok) {
                setClearResult(`Error: ${data.error || 'Failed to clear'}`)
                return
            }

            setClearResult(data.message)
            setConfirmClear(false)
            // Refresh the file list
            await fetchFiles()
        } catch (err) {
            console.error('Clear error:', err)
            setClearResult('Error: Network failure')
        } finally {
            setClearing(false)
        }
    }

    // Generate month options (last 12 months)
    const monthOptions: string[] = []
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                            <Archive className="h-4 w-4" />
                        </div>
                        <h2 className="text-base font-bold text-slate-900">Aadhar Photo Archive</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-5 py-4 space-y-4">
                    {/* Month Selector */}
                    <div>
                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                            Month
                        </label>
                        <select
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
                        >
                            {monthOptions.map((m) => (
                                <option key={m} value={m}>
                                    {formatMonth(m)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Stats Card */}
                    <Card className="border-slate-200">
                        <CardContent className="py-4">
                            {loading ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading...
                                </div>
                            ) : files.length === 0 ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <FileImage className="h-4 w-4" />
                                    No photos for {formatMonth(month)}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <FileImage className="h-5 w-5 text-violet-500" />
                                    <span className="text-sm font-semibold text-slate-800">
                                        {files.length} photo{files.length !== 1 ? 's' : ''}
                                    </span>
                                    <span className="text-xs text-slate-400">
                                        &mdash; ~{formatSize(totalSize)}
                                    </span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Download ZIP */}
                    <Button
                        variant="outline"
                        className="w-full"
                        disabled={files.length === 0 || downloading || loading}
                        onClick={handleDownload}
                    >
                        {downloading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Downloading {downloadProgress.current} of {downloadProgress.total}...
                            </>
                        ) : downloadComplete ? (
                            <>
                                <Download className="h-4 w-4 mr-2 text-emerald-600" />
                                <span className="text-emerald-600">Downloaded — Click to re-download</span>
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4 mr-2" />
                                Download as ZIP
                            </>
                        )}
                    </Button>

                    {/* Clear Month */}
                    {!confirmClear ? (
                        <Button
                            variant="outline"
                            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={files.length === 0 || !downloadComplete || clearing || loading}
                            onClick={() => setConfirmClear(true)}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Clear {formatMonth(month)} Photos
                        </Button>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-red-700">
                                    This will permanently delete {files.length} photo{files.length !== 1 ? 's' : ''} from
                                    storage and mark guest records as archived. This cannot be undone.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => setConfirmClear(false)}
                                    disabled={clearing}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex-1"
                                    onClick={handleClear}
                                    disabled={clearing}
                                >
                                    {clearing ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                            Clearing...
                                        </>
                                    ) : (
                                        'Confirm Delete'
                                    )}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Clear Result */}
                    {clearResult && (
                        <p className={`text-xs text-center ${clearResult.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
                            {clearResult}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
