'use client'

// ─────────────────────────────────────────────────────────────
// AadharCapture — stitched front+back Aadhar capture widget.
//
// Extracted from CheckInSheet.tsx so the BulkCheckInSheet wizard
// can reuse the EXACT same capture / compress / stitch / upload
// pipeline that the single-bed flow uses today. Do not fork —
// every Aadhar upload in the system goes through this pipeline.
//
// Upload path:
//   bucket:   aadhars
//   filename: <YYYY-MM>/<roomNumber>_<guest>_<phone>_<dd-mm-yyyy>_<hh-mm>.jpg
//
// State model:
//   front blob captured           → preview, awaiting back
//   front + back blobs captured   → stitched, uploaded, stitched preview shown
//   onChange fires with the final storage path once upload succeeds.
//
// onClear hides the previews and lets the user re-capture.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Camera, CheckCircle2 } from 'lucide-react'

interface AadharCaptureProps {
    /** Where the photo will be uploaded — used to brand the filename. */
    roomNumber: string
    guestName: string
    /** 10-digit phone, used in the filename. */
    guestPhone: string
    /** Optional position label printed inside the stitched image footer. */
    guestLabel?: string
    /** Existing storage path if the photo was already captured / merged from a prior visit. */
    value?: string
    /** Public URL of the existing stored image (shown as the stitched preview). */
    valuePublicUrl?: string
    /** Fires with the final stitched storage path once upload succeeds. */
    onChange: (storagePath: string) => void
    /** Optional clear handler — invoked when the CRE wants to re-capture. */
    onClear?: () => void
    disabled?: boolean
}

interface PendingAadhar {
    front?: Blob
    back?: Blob
}

export function AadharCapture({
    roomNumber,
    guestName,
    guestPhone,
    guestLabel,
    value,
    valuePublicUrl,
    onChange,
    onClear,
    disabled,
}: AadharCaptureProps) {
    const [pending, setPending] = useState<PendingAadhar>({})
    const [previews, setPreviews] = useState<{ front?: string; back?: string; stitched?: string }>({})
    const [uploading, setUploading] = useState(false)

    // If a parent supplies an existing stored photo, surface it as the stitched preview.
    useEffect(() => {
        if (value && valuePublicUrl) {
            setPreviews(p => ({ ...p, stitched: valuePublicUrl }))
        }
    }, [value, valuePublicUrl])

    // Revoke blob URLs on unmount to prevent memory leaks (Rule 15).
    useEffect(() => {
        return () => {
            if (previews.front?.startsWith('blob:')) URL.revokeObjectURL(previews.front)
            if (previews.back?.startsWith('blob:')) URL.revokeObjectURL(previews.back)
            if (previews.stitched?.startsWith('blob:')) URL.revokeObjectURL(previews.stitched)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleCapture = async (side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const { compressImage } = await import('@/lib/utils/compress-image')
            const compressed = await compressImage(file)
            const previewUrl = URL.createObjectURL(compressed)
            setPreviews(p => ({ ...p, [side]: previewUrl }))
            const next: PendingAadhar = { ...pending, [side]: compressed }
            setPending(next)

            if (next.front && next.back) {
                setUploading(true)
                try {
                    const { stitchAadhar } = await import('@/lib/utils/stitch-aadhar')
                    const safeName = (guestName || 'Guest').replace(/[^a-zA-Z0-9]/g, '_')
                    const phone = (guestPhone || '0000000000').replace(/\D/g, '').padStart(10, '0').slice(0, 10)
                    const dateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
                    const stitched = await stitchAadhar(next.front, next.back, {
                        roomNumber,
                        guestName: guestName || 'Guest',
                        phone,
                        date: dateStr,
                    })

                    const monthStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
                    const timeStr = new Date()
                        .toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
                        .replace(':', '-')
                    const labelPart = guestLabel ? `_${guestLabel.replace(/[^a-zA-Z0-9]/g, '_')}` : ''
                    const fileName = `${monthStr}/${roomNumber}_${safeName}_${phone}_${dateStr}_${timeStr}${labelPart}.jpg`

                    const { error: uploadErr } = await supabase.storage
                        .from('aadhars')
                        .upload(fileName, stitched, { contentType: 'image/jpeg', upsert: true })

                    if (uploadErr) {
                        console.error('Aadhar upload error:', uploadErr)
                        toast.error('Failed to upload Aadhar photo')
                        return
                    }

                    // Replace the front/back previews with the stitched preview.
                    const stitchedPreview = URL.createObjectURL(stitched)
                    setPreviews(prev => {
                        if (prev.front?.startsWith('blob:')) URL.revokeObjectURL(prev.front)
                        if (prev.back?.startsWith('blob:')) URL.revokeObjectURL(prev.back)
                        return { stitched: stitchedPreview }
                    })

                    onChange(fileName)
                    toast.success('Aadhar photos stitched & uploaded')
                } catch (err) {
                    console.error('Stitch / upload error:', err)
                    toast.error('Failed to stitch Aadhar photos')
                } finally {
                    setUploading(false)
                }
            } else {
                toast.info(`Captured ${side}. Now capture the ${side === 'front' ? 'back' : 'front'} side.`)
            }
        } catch (err) {
            console.error('Aadhar capture error:', err)
            toast.error('Failed to process Aadhar photo')
        }
    }

    const clearAll = () => {
        setPending({})
        setPreviews(prev => {
            if (prev.front?.startsWith('blob:')) URL.revokeObjectURL(prev.front)
            if (prev.back?.startsWith('blob:')) URL.revokeObjectURL(prev.back)
            if (prev.stitched?.startsWith('blob:')) URL.revokeObjectURL(prev.stitched)
            return {}
        })
        onClear?.()
    }

    if (previews.stitched) {
        return (
            <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Aadhar Photos</Label>
                <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={previews.stitched}
                        alt={`Aadhar — ${guestName}`}
                        className="w-full h-auto max-h-48 object-contain"
                    />
                    <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Front + Back
                    </div>
                    {!disabled && (
                        <button
                            type="button"
                            onClick={clearAll}
                            className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors"
                        >
                            Re-capture
                        </button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-1.5">
            <Label className="text-xs text-slate-600">Aadhar Photos *</Label>
            <div className="grid grid-cols-2 gap-2">
                {(['front', 'back'] as const).map(side => (
                    <div className="space-y-1" key={side}>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">
                            {side === 'front' ? 'Front' : 'Back'}
                        </p>
                        {previews[side] ? (
                            <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={previews[side]!}
                                    alt={`Aadhar ${side} — ${guestName}`}
                                    className="w-full h-24 object-cover"
                                />
                                <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                </div>
                                <label className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors">
                                    Replace
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        className="sr-only"
                                        disabled={disabled || uploading}
                                        onChange={(e) => handleCapture(side, e)}
                                    />
                                </label>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-2 py-3 cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors min-h-[68px]">
                                <Camera className="h-4 w-4 text-slate-400" />
                                <span className="text-[9px] font-semibold text-slate-500">
                                    {uploading ? 'Stitching...' : `Capture ${side === 'front' ? 'Front' : 'Back'}`}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="sr-only"
                                    disabled={disabled || uploading}
                                    onChange={(e) => handleCapture(side, e)}
                                />
                            </label>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
