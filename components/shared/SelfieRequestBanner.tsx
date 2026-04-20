'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import { Camera, Upload } from 'lucide-react'
import type { SelfieRequest } from '@/lib/types'

interface SelfieRequestBannerProps {
    staffId: string
    hotelId: string
}

export function SelfieRequestBanner({ staffId, hotelId }: SelfieRequestBannerProps) {
    const [pendingRequest, setPendingRequest] = useState<SelfieRequest | null>(null)
    const [cameraActive, setCameraActive] = useState(false)
    const [cameraFailed, setCameraFailed] = useState(false)
    const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Fetch pending selfie requests on mount
    const fetchPending = useCallback(async () => {
        if (!staffId || !hotelId) return
        try {
            const res = await fetch(`/api/selfie-requests?status=PENDING&hotel_id=${hotelId}`)
            const json = await res.json()
            if (res.ok && json.data && json.data.length > 0) {
                setPendingRequest(json.data[0])
            } else {
                setPendingRequest(null)
            }
        } catch {
            // Silent fail — banner is non-critical
        }
    }, [staffId, hotelId])

    useEffect(() => {
        fetchPending()
    }, [fetchPending])

    // Subscribe to realtime for new selfie requests targeting this staff
    useEffect(() => {
        if (!staffId) return

        const channel = supabase
            .channel(`selfie-requests-${staffId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'selfie_requests',
                    filter: `target_staff_id=eq.${staffId}`,
                },
                (payload) => {
                    if (payload.new && payload.new.status === 'PENDING') {
                        setPendingRequest(payload.new as SelfieRequest)
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [staffId])

    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            stopCamera()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 320, height: 240 },
            })
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play()
            }
            setCameraActive(true)
            setCameraFailed(false)
        } catch {
            setCameraFailed(true)
            toast.error('Camera unavailable — use the upload option instead')
        }
    }

    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream
            stream.getTracks().forEach((t) => t.stop())
            videoRef.current.srcObject = null
        }
        setCameraActive(false)
    }

    const capturePhoto = () => {
        if (!videoRef.current) return
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 240
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 320, 240)
            setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.6))
        }
        stopCamera()
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file')
            return
        }
        const reader = new FileReader()
        reader.onload = () => {
            const img = new window.Image()
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = 320
                canvas.height = 240
                const ctx = canvas.getContext('2d')
                if (ctx) {
                    ctx.drawImage(img, 0, 0, 320, 240)
                    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.6))
                }
            }
            img.src = reader.result as string
        }
        reader.readAsDataURL(file)
    }

    const handleSubmit = async () => {
        if (!capturedPhoto || !pendingRequest) return

        setSubmitting(true)
        try {
            // Convert data URL to blob
            const res = await fetch(capturedPhoto)
            const blob = await res.blob()

            // Build storage path: selfies/YYYY-MM/selfie_{staffId}_{timestamp}.jpg
            const now = new Date()
            const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            const filePath = `selfies/${yearMonth}/selfie_${staffId}_${Date.now()}.jpg`

            const { error: uploadError } = await supabase.storage
                .from('reports')
                .upload(filePath, blob, {
                    contentType: 'image/jpeg',
                    upsert: false,
                })

            if (uploadError) {
                throw new Error('Upload failed: ' + uploadError.message)
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('reports')
                .getPublicUrl(filePath)

            // PATCH the selfie request
            const patchRes = await fetch('/api/selfie-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: pendingRequest.id,
                    photo_url: urlData.publicUrl,
                }),
            })

            const patchJson = await patchRes.json()
            if (!patchRes.ok) throw new Error(patchJson.error || 'Failed to submit selfie')

            toast.success('Selfie submitted')
            setPendingRequest(null)
            setCapturedPhoto(null)
            setCameraActive(false)
            setCameraFailed(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit selfie')
        } finally {
            setSubmitting(false)
        }
    }

    const handleRetake = () => {
        setCapturedPhoto(null)
        startCamera()
    }

    // Don't render anything if no pending request
    if (!pendingRequest) return null

    return (
        <Dialog open={!!pendingRequest} onOpenChange={() => { /* prevent closing */ }}>
            <DialogContent
                className="sm:max-w-md"
                showCloseButton={false}
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-700">
                        <Camera className="h-5 w-5" />
                        Selfie Requested
                    </DialogTitle>
                    <DialogDescription>
                        {pendingRequest?.reason || 'Admin has requested a live selfie from you. Please take a selfie to continue.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Default state: show Take Selfie button */}
                {!cameraActive && !capturedPhoto && !cameraFailed && (
                    <div className="flex flex-col items-center gap-3 py-4">
                        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
                            <Camera className="h-10 w-10 text-amber-600" />
                        </div>
                        <Button
                            onClick={startCamera}
                            className="bg-amber-600 hover:bg-amber-700 text-white min-h-[44px]"
                        >
                            <Camera className="h-4 w-4 mr-2" />
                            Take Selfie
                        </Button>
                    </div>
                )}

                {/* Camera active: show video preview + capture button */}
                {cameraActive && !capturedPhoto && (
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-amber-800 text-center">Position yourself and take the photo</p>
                        <div className="flex justify-center">
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className="rounded-lg border border-amber-300 w-[320px] h-[240px] object-cover"
                            />
                        </div>
                        <div className="flex justify-center">
                            <Button
                                onClick={capturePhoto}
                                className="bg-amber-600 hover:bg-amber-700 text-white min-h-[44px]"
                            >
                                <Camera className="h-4 w-4 mr-2" />
                                Capture
                            </Button>
                        </div>
                    </div>
                )}

                {/* Camera failed: show fallback file upload */}
                {cameraFailed && !capturedPhoto && (
                    <div className="space-y-3 py-2">
                        <p className="text-sm font-medium text-amber-800 text-center">Camera unavailable -- upload a photo instead</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="user"
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <div className="flex justify-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                                className="border-amber-300 text-amber-700 min-h-[44px]"
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                Choose Photo
                            </Button>
                            <Button
                                variant="outline"
                                onClick={startCamera}
                                className="border-amber-300 text-amber-700 min-h-[44px]"
                            >
                                <Camera className="h-4 w-4 mr-2" />
                                Try Camera Again
                            </Button>
                        </div>
                    </div>
                )}

                {/* Photo captured: show preview + submit/retake */}
                {capturedPhoto && (
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-amber-800 text-center">Review your selfie</p>
                        <div className="flex justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={capturedPhoto}
                                alt="Selfie preview"
                                className="rounded-lg border border-amber-300 w-[320px] h-[240px] object-cover"
                            />
                        </div>
                        <div className="flex justify-center gap-2">
                            <Button
                                variant="outline"
                                onClick={handleRetake}
                                disabled={submitting}
                                className="border-amber-300 text-amber-700 min-h-[44px]"
                            >
                                Retake
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="bg-amber-600 hover:bg-amber-700 text-white min-h-[44px]"
                            >
                                {submitting ? 'Submitting...' : 'Submit Selfie'}
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
