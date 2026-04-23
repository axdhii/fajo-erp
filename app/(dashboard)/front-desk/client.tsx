'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { UnitGrid } from '@/components/units/UnitGrid'
import { useUnitStore } from '@/lib/store/unit-store'
import { useAuthStore } from '@/lib/store/auth-store'
import { useCurrentTime, getCheckoutAlert } from '@/lib/hooks/use-current-time'
import type { UnitType, UnitStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
    BedDouble,
    BedSingle,
    LayoutGrid,
    CheckCircle2,
    Users,
    AlertTriangle,
    Loader2,
    Wrench,
    Clock,
    Bell,
    ChevronDown,
    ChevronUp,
    Package,
    Receipt,
    MessageSquareWarning,
    Banknote,
    Smartphone,
    IndianRupee,
    Droplets,
    Plus,
    Minus,
    Camera,
} from 'lucide-react'
import type { AadharMatch } from '@/lib/utils/merge-aadhar'
import { RestockSheet as RestockForm } from '@/components/units/RestockSheet'

interface FrontDeskClientProps {
    hotelId: string
    staffId: string
    role?: string
}

type TypeFilter = UnitType | 'ALL'
type StatusFilter = UnitStatus | 'ALL'

export function FrontDeskClient({ hotelId, staffId, role }: FrontDeskClientProps) {
    const { profile, activeHotelId } = useAuthStore()
    const isAdminOrDev = profile?.role === 'Admin' || profile?.role === 'Developer'
    const effectiveHotelId = (isAdminOrDev && activeHotelId) ? activeHotelId : hotelId

    const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
    const { units } = useUnitStore()

    // Restock state
    const [restockOpen, setRestockOpen] = useState(false)

    // Customer issue report state
    const [issueOpen, setIssueOpen] = useState(false)
    const [issueDescription, setIssueDescription] = useState('')
    const [issueGuestName, setIssueGuestName] = useState('')
    const [issueGuestPhone, setIssueGuestPhone] = useState('')
    const [issueSubmitting, setIssueSubmitting] = useState(false)

    // Hotel issue report state
    const [hotelIssueOpen, setHotelIssueOpen] = useState(false)
    const [hotelIssueDescription, setHotelIssueDescription] = useState('')
    const [hotelIssueCategory, setHotelIssueCategory] = useState('')
    const [hotelIssuePhoto, setHotelIssuePhoto] = useState('')
    const [hotelIssueUploading, setHotelIssueUploading] = useState(false)
    const [hotelIssueSubmitting, setHotelIssueSubmitting] = useState(false)

    // Expense request state
    const [expenseOpen, setExpenseOpen] = useState(false)
    const [expenseDescription, setExpenseDescription] = useState('')
    const [expenseAmount, setExpenseAmount] = useState('')
    const [expenseCategory, setExpenseCategory] = useState('')
    const [expenseSubmitting, setExpenseSubmitting] = useState(false)

    // Freshup state
    const [freshupOpen, setFreshupOpen] = useState(false)
    const [freshupName, setFreshupName] = useState('')
    const [freshupPhone, setFreshupPhone] = useState('')
    const [freshupCount, setFreshupCount] = useState(1)
    const [freshupPayment, setFreshupPayment] = useState<'CASH' | 'DIGITAL'>('CASH')
    const [freshupSubmitting, setFreshupSubmitting] = useState(false)

    // Freshup hotel config
    const [freshupMode, setFreshupMode] = useState<'PERSON' | 'ROOM'>('PERSON')
    const [freshupPersonPrice, setFreshupPersonPrice] = useState(100)
    const [freshupAcPrice, setFreshupAcPrice] = useState(799)
    const [freshupNonacPrice, setFreshupNonacPrice] = useState(699)
    const [freshupMaxGuests, setFreshupMaxGuests] = useState<number | null>(null)
    const [freshupAcType, setFreshupAcType] = useState<'AC' | 'NON_AC'>('AC')

    // Freshup Aadhar state (Guest 1)
    const [freshupAadharFront, setFreshupAadharFront] = useState<Blob | null>(null)
    const [freshupAadharBack, setFreshupAadharBack] = useState<Blob | null>(null)
    const [freshupAadharPreviews, setFreshupAadharPreviews] = useState<Record<string, string>>({})
    const [freshupAadharUrlFront, setFreshupAadharUrlFront] = useState('')
    const [freshupAadharUrlBack, setFreshupAadharUrlBack] = useState('')
    const [freshupUploading, setFreshupUploading] = useState(false)
    const [freshupAadharMatch, setFreshupAadharMatch] = useState<AadharMatch | null>(null)
    const [freshupLookingUp, setFreshupLookingUp] = useState(false)
    const [freshupAadharBypass, setFreshupAadharBypass] = useState(false)

    // Freshup Guest 2 state (for ROOM mode with 2 guests)
    const [freshupName2, setFreshupName2] = useState('')
    const [freshupPhone2, setFreshupPhone2] = useState('')
    const [freshupAadharFront2, setFreshupAadharFront2] = useState<Blob | null>(null)
    const [freshupAadharBack2, setFreshupAadharBack2] = useState<Blob | null>(null)
    const [freshupAadharPreviews2, setFreshupAadharPreviews2] = useState<Record<string, string>>({})
    const [freshupAadharUrlFront2, setFreshupAadharUrlFront2] = useState('')
    const [freshupAadharUrlBack2, setFreshupAadharUrlBack2] = useState('')
    const [freshupUploading2, setFreshupUploading2] = useState(false)

    // CRE Payment counter state
    const [shiftCash, setShiftCash] = useState(0)
    const [shiftDigital, setShiftDigital] = useState(0)

    const fetchShiftRevenue = useCallback(async () => {
        // Use current clock-in session start (not midnight) to scope revenue to THIS session only
        const { data: activeSession } = await supabase
            .from('attendance')
            .select('clock_in')
            .eq('staff_id', staffId)
            .eq('status', 'CLOCKED_IN')
            .order('clock_in', { ascending: false })
            .limit(1)
            .maybeSingle()

        const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        const sessionStart = activeSession?.clock_in || `${todayIST}T00:00:00+05:30`

        const { data: myBookings } = await supabase
            .from('bookings')
            .select('id, advance_amount, advance_type')
            .eq('created_by', staffId)
            .gte('created_at', sessionStart)

        if (!myBookings?.length) { setShiftCash(0); setShiftDigital(0); return }

        // Sum advances from bookings
        let cash = 0, digital = 0
        for (const b of myBookings) {
            const adv = Number(b.advance_amount || 0)
            if (adv > 0) {
                const t = String(b.advance_type || '').toUpperCase()
                if (t === 'DIGITAL' || t === 'UPI' || t === 'GPAY') digital += adv
                else cash += adv
            }
        }

        // Sum payments
        const { data: payments } = await supabase
            .from('payments')
            .select('amount_cash, amount_digital')
            .in('booking_id', myBookings.map(b => b.id))

        if (payments) {
            for (const p of payments) {
                cash += Number(p.amount_cash || 0)
                digital += Number(p.amount_digital || 0)
            }
        }

        // Sum extras added by this staff in the current session
        const { data: extras } = await supabase
            .from('booking_extras')
            .select('amount, payment_method')
            .eq('added_by', staffId)
            .gte('created_at', sessionStart)

        if (extras) {
            for (const e of extras) {
                if (e.payment_method === 'DIGITAL') digital += Number(e.amount || 0)
                else cash += Number(e.amount || 0)
            }
        }

        // Sum freshup records created by this staff in the current session
        const { data: freshups } = await supabase
            .from('freshup')
            .select('amount, payment_method')
            .eq('created_by', staffId)
            .gte('created_at', sessionStart)

        if (freshups) {
            for (const f of freshups) {
                if (f.payment_method === 'DIGITAL') digital += Number(f.amount || 0)
                else cash += Number(f.amount || 0)
            }
        }

        setShiftCash(cash)
        setShiftDigital(digital)
    }, [staffId])

    useEffect(() => {
        fetchShiftRevenue()
    }, [fetchShiftRevenue])

    // Realtime: refresh payment counter when payments change
    useEffect(() => {
        const channel = supabase
            .channel(`cre_payments_${staffId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'payments',
            }, () => {
                fetchShiftRevenue()
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'booking_extras',
            }, () => {
                fetchShiftRevenue()
            })
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'freshup',
            }, () => {
                fetchShiftRevenue()
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [staffId, fetchShiftRevenue])

    // Submit customer issue
    const handleSubmitIssue = async () => {
        if (!issueDescription.trim()) { toast.error('Please describe the issue'); return }
        setIssueSubmitting(true)
        try {
            const res = await fetch('/api/customer-issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: issueDescription.trim(),
                    guest_name: issueGuestName.trim() || null,
                    guest_phone: issueGuestPhone.trim() || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Customer issue reported to Zonal Ops')
            setIssueDescription('')
            setIssueGuestName('')
            setIssueGuestPhone('')
            setIssueOpen(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to report issue')
        } finally {
            setIssueSubmitting(false)
        }
    }

    // Submit hotel issue report
    const handleSubmitHotelIssue = async () => {
        if (!hotelIssueDescription.trim()) { toast.error('Please describe the issue'); return }
        if (!hotelIssueCategory) { toast.error('Please select a category'); return }
        setHotelIssueSubmitting(true)
        try {
            const res = await fetch('/api/property-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'ISSUE',
                    category: hotelIssueCategory,
                    description: hotelIssueDescription.trim(),
                    photo_url: hotelIssuePhoto || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Hotel issue reported to Zonal Ops & HK')
            setHotelIssueDescription('')
            setHotelIssueCategory('')
            setHotelIssuePhoto('')
            setHotelIssueOpen(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to report issue')
        } finally {
            setHotelIssueSubmitting(false)
        }
    }

    const handleHotelIssuePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setHotelIssueUploading(true)
        try {
            const { compressImage } = await import('@/lib/utils/compress-image')
            const compressed = await compressImage(file)
            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '-')
            const fileName = `${dateStr.slice(0, 7)}/issue_${dateStr}_${timeStr}_${Date.now()}.jpg`
            const { error: uploadErr } = await supabase.storage
                .from('reports')
                .upload(fileName, compressed, { contentType: 'image/jpeg', upsert: true })
            if (uploadErr) { toast.error('Failed to upload photo'); return }
            const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName)
            setHotelIssuePhoto(urlData.publicUrl)
            toast.success('Photo uploaded')
        } catch {
            toast.error('Failed to process photo')
        } finally {
            setHotelIssueUploading(false)
        }
    }

    // Submit expense request
    const handleSubmitExpense = async () => {
        if (!expenseDescription.trim()) { toast.error('Please describe the expense'); return }
        if (!expenseAmount || Number(expenseAmount) <= 0) { toast.error('Please enter a valid amount'); return }
        setExpenseSubmitting(true)
        try {
            const res = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: expenseDescription.trim(),
                    amount: Number(expenseAmount),
                    category: expenseCategory || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Expense request sent to Zonal Ops')
            setExpenseDescription('')
            setExpenseAmount('')
            setExpenseCategory('')
            setExpenseOpen(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit expense')
        } finally {
            setExpenseSubmitting(false)
        }
    }

    // Compute freshup price dynamically based on hotel mode
    const freshupPrice = freshupMode === 'ROOM'
        ? (freshupAcType === 'AC' ? freshupAcPrice : freshupNonacPrice)
        : freshupCount * freshupPersonPrice

    // Submit freshup
    const handleSubmitFreshup = async () => {
        if (freshupSubmitting) return
        if (!freshupName.trim()) { toast.error('Please enter primary guest name'); return }
        const digits = freshupPhone.replace(/\D/g, '')
        if (digits.length !== 10) { toast.error('Primary guest phone must be 10 digits'); return }
        if (!freshupAadharBypass && (!freshupAadharUrlFront || !freshupAadharUrlBack)) {
            toast.error('Primary guest Aadhar photos are mandatory')
            return
        }

        // For ROOM mode with 2 guests, validate guest 2 details
        const needsGuest2 = freshupMode === 'ROOM' && freshupCount >= 2
        let digits2 = ''
        if (needsGuest2) {
            if (!freshupName2.trim()) { toast.error('Please enter guest 2 name'); return }
            digits2 = freshupPhone2.replace(/\D/g, '')
            if (digits2.length !== 10) { toast.error('Guest 2 phone must be 10 digits'); return }
            if (!freshupAadharBypass && (!freshupAadharUrlFront2 || !freshupAadharUrlBack2)) {
                toast.error('Guest 2 Aadhar photos are mandatory')
                return
            }
        }

        setFreshupSubmitting(true)
        try {
            const res = await fetch('/api/freshup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guest_name: freshupName.trim(),
                    guest_phone: digits,
                    guest_count: freshupCount,
                    payment_method: freshupPayment,
                    aadhar_url_front: freshupAadharUrlFront || null,
                    aadhar_url_back: freshupAadharUrlBack || null,
                    ac_type: freshupMode === 'ROOM' ? freshupAcType : undefined,
                    guest_name_2: needsGuest2 ? freshupName2.trim() : null,
                    guest_phone_2: needsGuest2 ? digits2 : null,
                    aadhar_url_front_2: needsGuest2 ? (freshupAadharUrlFront2 || null) : null,
                    aadhar_url_back_2: needsGuest2 ? (freshupAadharUrlBack2 || null) : null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(`Freshup recorded — ${formatCurrency(freshupPrice)} ${freshupPayment}`)
            setFreshupName('')
            setFreshupPhone('')
            setFreshupCount(1)
            setFreshupPayment('CASH')
            setFreshupAcType('AC')
            setFreshupAadharFront(null)
            setFreshupAadharBack(null)
            Object.values(freshupAadharPreviews).forEach(url => { try { URL.revokeObjectURL(url) } catch {} })
            setFreshupAadharPreviews({})
            setFreshupAadharUrlFront('')
            setFreshupAadharUrlBack('')
            setFreshupAadharMatch(null)
            setFreshupAadharBypass(false)
            // Reset guest 2 state
            setFreshupName2('')
            setFreshupPhone2('')
            setFreshupAadharFront2(null)
            setFreshupAadharBack2(null)
            Object.values(freshupAadharPreviews2).forEach(url => { try { URL.revokeObjectURL(url) } catch {} })
            setFreshupAadharPreviews2({})
            setFreshupAadharUrlFront2('')
            setFreshupAadharUrlBack2('')
            setFreshupOpen(false)
            fetchShiftRevenue() // Update revenue counter
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to record freshup')
        } finally {
            setFreshupSubmitting(false)
        }
    }

    // Freshup: phone lookup for returning guest Aadhar
    const handleFreshupPhoneLookup = async (phone: string) => {
        const digits = phone.replace(/\D/g, '')
        if (digits.length !== 10) {
            // Clear any stale match banner when phone becomes invalid (prevents wrong aadhar linkage)
            setFreshupAadharMatch(null)
            return
        }
        if (freshupAadharUrlFront && freshupAadharUrlBack) return
        setFreshupLookingUp(true)
        try {
            const { lookupAadhar } = await import('@/lib/utils/merge-aadhar')
            const match = await lookupAadhar(digits)
            if (match) setFreshupAadharMatch(match)
        } catch {} finally {
            setFreshupLookingUp(false)
        }
    }

    // Freshup: apply matched Aadhar from previous visit
    const applyFreshupAadharMatch = async () => {
        if (!freshupAadharMatch) return
        setFreshupAadharUrlFront(freshupAadharMatch.aadhar_url_front)
        setFreshupAadharUrlBack(freshupAadharMatch.aadhar_url_back)
        try {
            const { getAadharPublicUrl } = await import('@/lib/utils/merge-aadhar')
            if (freshupAadharMatch.stitched) {
                setFreshupAadharPreviews({ stitched: getAadharPublicUrl(freshupAadharMatch.aadhar_url_front) })
            } else {
                setFreshupAadharPreviews({
                    front: getAadharPublicUrl(freshupAadharMatch.aadhar_url_front),
                    back: getAadharPublicUrl(freshupAadharMatch.aadhar_url_back),
                })
            }
        } catch {}
        setFreshupAadharMatch(null)
        toast.success('Aadhar photos linked from previous visit')
    }

    // Freshup: capture Aadhar photo (front or back)
    const handleFreshupAadharCapture = async (side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            const { compressImage } = await import('@/lib/utils/compress-image')
            const compressed = await compressImage(file)
            const previewUrl = URL.createObjectURL(compressed)
            setFreshupAadharPreviews(prev => ({ ...prev, [side]: previewUrl }))

            const newFront = side === 'front' ? compressed : freshupAadharFront
            const newBack = side === 'back' ? compressed : freshupAadharBack
            if (side === 'front') setFreshupAadharFront(compressed)
            if (side === 'back') setFreshupAadharBack(compressed)

            // If both sides captured, stitch + upload
            if (newFront && newBack) {
                setFreshupUploading(true)
                try {
                    const { stitchAadhar } = await import('@/lib/utils/stitch-aadhar')
                    const guestName = (freshupName || 'Guest').replace(/[^a-zA-Z0-9]/g, '_')
                    const phone = freshupPhone.replace(/\D/g, '') || '0000000000'
                    const dateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
                    const stitched = await stitchAadhar(newFront, newBack, {
                        guestName: freshupName || 'Guest', phone, date: dateStr,
                    })
                    const monthStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
                    const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '-')
                    const fileName = `${monthStr}/freshup_${guestName}_${phone}_${dateStr}_${timeStr}.jpg`

                    const { error: uploadErr } = await supabase.storage
                        .from('aadhars')
                        .upload(fileName, stitched, { contentType: 'image/jpeg', upsert: true })

                    if (uploadErr) {
                        toast.error('Failed to upload stitched Aadhar')
                        console.error('Upload error:', uploadErr)
                        return
                    }

                    setFreshupAadharUrlFront(fileName)
                    setFreshupAadharUrlBack(fileName)
                    const stitchedPreview = URL.createObjectURL(stitched)
                    setFreshupAadharPreviews({ stitched: stitchedPreview })
                    toast.success('Aadhar photos stitched & uploaded')
                } catch (err) {
                    console.error('Stitch/upload error:', err)
                    toast.error('Failed to stitch Aadhar photos')
                } finally {
                    setFreshupUploading(false)
                }
            } else {
                toast.info(`Aadhar ${side} captured — now capture the ${side === 'front' ? 'back' : 'front'} side`)
            }
        } catch (err) {
            console.error('Aadhar capture error:', err)
            toast.error('Failed to process Aadhar photo')
        }
    }

    // Freshup Guest 2: capture Aadhar photo (for Aluva ROOM mode with 2 guests)
    const handleFreshupAadharCapture2 = async (side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            const { compressImage } = await import('@/lib/utils/compress-image')
            const compressed = await compressImage(file)
            const previewUrl = URL.createObjectURL(compressed)
            setFreshupAadharPreviews2(prev => ({ ...prev, [side]: previewUrl }))

            const newFront = side === 'front' ? compressed : freshupAadharFront2
            const newBack = side === 'back' ? compressed : freshupAadharBack2
            if (side === 'front') setFreshupAadharFront2(compressed)
            if (side === 'back') setFreshupAadharBack2(compressed)

            if (newFront && newBack) {
                setFreshupUploading2(true)
                try {
                    const { stitchAadhar } = await import('@/lib/utils/stitch-aadhar')
                    const guestName = (freshupName2 || 'Guest2').replace(/[^a-zA-Z0-9]/g, '_')
                    const phone = freshupPhone2.replace(/\D/g, '') || '0000000000'
                    const dateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
                    const stitched = await stitchAadhar(newFront, newBack, {
                        guestName: freshupName2 || 'Guest 2', phone, date: dateStr,
                    })
                    const monthStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
                    const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '-')
                    const fileName = `${monthStr}/freshup_${guestName}_${phone}_${dateStr}_${timeStr}_g2.jpg`

                    const { error: uploadErr } = await supabase.storage
                        .from('aadhars')
                        .upload(fileName, stitched, { contentType: 'image/jpeg', upsert: true })

                    if (uploadErr) {
                        toast.error('Failed to upload Guest 2 Aadhar')
                        console.error('Upload error:', uploadErr)
                        return
                    }

                    setFreshupAadharUrlFront2(fileName)
                    setFreshupAadharUrlBack2(fileName)
                    const stitchedPreview = URL.createObjectURL(stitched)
                    setFreshupAadharPreviews2({ stitched: stitchedPreview })
                    toast.success('Guest 2 Aadhar stitched & uploaded')
                } catch (err) {
                    console.error('Stitch/upload error:', err)
                    toast.error('Failed to stitch Guest 2 Aadhar')
                } finally {
                    setFreshupUploading2(false)
                }
            } else {
                toast.info(`Guest 2 Aadhar ${side} captured — now capture the ${side === 'front' ? 'back' : 'front'} side`)
            }
        } catch (err) {
            console.error('Guest 2 Aadhar capture error:', err)
            toast.error('Failed to process Guest 2 Aadhar photo')
        }
    }

    // My expense requests (to see approval status)
    const [myExpenses, setMyExpenses] = useState<{ id: string; description: string; amount: number; status: string; rejection_reason: string | null; created_at: string }[]>([])

    const fetchMyExpenses = useCallback(async () => {
        const { data } = await supabase
            .from('property_expenses')
            .select('id, description, amount, status, rejection_reason, created_at')
            .eq('requested_by', staffId)
            .order('created_at', { ascending: false })
            .limit(5)
        if (data) setMyExpenses(data)
    }, [staffId])

    useEffect(() => { fetchMyExpenses() }, [fetchMyExpenses])

    // Fetch hotel freshup config on mount
    useEffect(() => {
        const fetchFreshupConfig = async () => {
            const { data } = await supabase
                .from('hotels')
                .select('freshup_mode, freshup_person_price, freshup_ac_price, freshup_nonac_price, freshup_max_guests')
                .eq('id', effectiveHotelId)
                .single()
            if (data) {
                setFreshupMode(data.freshup_mode || 'PERSON')
                setFreshupPersonPrice(Number(data.freshup_person_price) || 100)
                setFreshupAcPrice(Number(data.freshup_ac_price) || 799)
                setFreshupNonacPrice(Number(data.freshup_nonac_price) || 699)
                setFreshupMaxGuests(data.freshup_max_guests || null)
            }
        }
        fetchFreshupConfig()
    }, [effectiveHotelId])

    // Realtime for expense status updates
    useEffect(() => {
        const channel = supabase
            .channel(`cre_expenses_${staffId.slice(0, 8)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'property_expenses' }, () => { fetchMyExpenses() })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [staffId, fetchMyExpenses])

    const now = useCurrentTime(15000) // Poll every 15 seconds for time-sensitive alerts

    // Stats
    const stats = useMemo(() => {
        const filtered = typeFilter === 'ALL' ? units : units.filter(u => u.type === typeFilter)
        return {
            total: filtered.length,
            available: filtered.filter((u) => u.status === 'AVAILABLE').length,
            occupied: filtered.filter((u) => u.status === 'OCCUPIED').length,
            dirty: filtered.filter((u) => u.status === 'DIRTY').length,
            inProgress: filtered.filter((u) => u.status === 'IN_PROGRESS').length,
            maintenance: filtered.filter((u) => u.status === 'MAINTENANCE').length,
        }
    }, [units, typeFilter])

    // Checkout alerts for occupied units
    const checkoutAlerts = useMemo(() => {
        const occupied = units.filter(u => u.status === 'OCCUPIED' && u.active_booking?.check_out)
        return occupied
            .map(u => {
                const alert = getCheckoutAlert(u.active_booking!.check_out!, now)
                return {
                    unit: u,
                    alert,
                    guestName: u.active_booking?.guests?.[0]?.name || 'Unknown',
                }
            })
            .filter(a => a.alert.level !== 'none')
            .sort((a, b) => a.alert.minutesRemaining - b.alert.minutesRemaining)
    }, [units, now])

    const criticalCount = checkoutAlerts.filter(a => a.alert.level === 'critical').length
    const warningCount = checkoutAlerts.filter(a => a.alert.level === 'warning').length

    const typeFilters: { key: TypeFilter; label: string; icon: React.ReactNode }[] = [
        { key: 'ALL', label: 'All Units', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
        { key: 'ROOM', label: 'Rooms', icon: <BedDouble className="h-3.5 w-3.5" /> },
        { key: 'DORM', label: 'Dorms', icon: <BedSingle className="h-3.5 w-3.5" /> },
    ]

    const statusFilters: { key: StatusFilter; label: string; count: number; icon: React.ReactNode; color: string }[] = [
        { key: 'ALL', label: 'All', count: stats.total, icon: <LayoutGrid className="h-3 w-3" />, color: 'text-slate-600 bg-slate-100' },
        { key: 'AVAILABLE', label: 'Available', count: stats.available, icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-emerald-700 bg-emerald-50' },
        { key: 'OCCUPIED', label: 'Occupied', count: stats.occupied, icon: <Users className="h-3 w-3" />, color: 'text-red-700 bg-red-50' },
        { key: 'DIRTY', label: 'Dirty', count: stats.dirty, icon: <AlertTriangle className="h-3 w-3" />, color: 'text-amber-700 bg-amber-50' },
        { key: 'IN_PROGRESS', label: 'Cleaning', count: stats.inProgress, icon: <Loader2 className="h-3 w-3" />, color: 'text-sky-700 bg-sky-50' },
        { key: 'MAINTENANCE', label: 'Maintenance', count: stats.maintenance, icon: <Wrench className="h-3 w-3" />, color: 'text-purple-700 bg-purple-50' },
    ]

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* CRE Payment Counter */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                        <Banknote className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-emerald-800 leading-none">{formatCurrency(shiftCash)}</p>
                        <p className="text-[10px] font-medium text-emerald-500 uppercase tracking-wider mt-0.5">Session Cash</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                        <Smartphone className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-blue-800 leading-none">{formatCurrency(shiftDigital)}</p>
                        <p className="text-[10px] font-medium text-blue-500 uppercase tracking-wider mt-0.5">Session Digital</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-violet-50 border border-violet-200 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                        <IndianRupee className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-violet-800 leading-none">{formatCurrency(shiftCash + shiftDigital)}</p>
                        <p className="text-[10px] font-medium text-violet-500 uppercase tracking-wider mt-0.5">Session Total</p>
                    </div>
                </div>
            </div>

            {/* Checkout Alert Banner */}
            {checkoutAlerts.length > 0 && (
                <div className={`rounded-2xl border px-5 py-4 ${criticalCount > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                    }`}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${criticalCount > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                            }`}>
                            <Bell className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className={`text-sm font-bold ${criticalCount > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                                Checkout Alerts
                                {criticalCount > 0 && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-200 text-red-700 text-[10px] font-bold uppercase">
                                        {criticalCount} overdue
                                    </span>
                                )}
                                {warningCount > 0 && (
                                    <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold uppercase">
                                        {warningCount} soon
                                    </span>
                                )}
                            </h3>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        {checkoutAlerts.map((item) => (
                            <div
                                key={item.unit.id}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${item.alert.level === 'critical'
                                    ? 'bg-red-100/80 text-red-700'
                                    : item.alert.level === 'warning'
                                        ? 'bg-amber-100/80 text-amber-700'
                                        : 'bg-blue-50 text-blue-600'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    {item.alert.level === 'critical' && (
                                        <span className="relative flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                        </span>
                                    )}
                                    <span className="font-bold">{item.unit.unit_number}</span>
                                    <span className="text-[10px] opacity-70 truncate max-w-[120px]">
                                        {item.guestName}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span className="font-bold">{item.alert.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Restock Request Section */}
            <div className="rounded-2xl border border-orange-200 bg-orange-50/50 overflow-hidden">
                <button
                    onClick={() => setRestockOpen(!restockOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-orange-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                            <Package className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-orange-900">Request Restock</span>
                            <span className="ml-3 text-xs text-orange-500">Send supply requests to Zonal Ops</span>
                        </div>
                    </div>
                    {restockOpen ? <ChevronUp className="h-4 w-4 text-orange-400" /> : <ChevronDown className="h-4 w-4 text-orange-400" />}
                </button>

                {restockOpen && (
                    <div className="px-5 pb-5 border-t border-orange-200 pt-4">
                        <RestockForm open={restockOpen} onClose={() => setRestockOpen(false)} hotelId={effectiveHotelId} staffId={staffId} />
                    </div>
                )}
            </div>

            {/* Freshup Service Section */}
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 overflow-hidden">
                <button
                    onClick={() => setFreshupOpen(!freshupOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-cyan-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
                            <Droplets className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-cyan-900">Freshup Service</span>
                            <span className="ml-3 text-xs text-cyan-500">Record walk-in freshup guests</span>
                        </div>
                    </div>
                    {freshupOpen ? <ChevronUp className="h-4 w-4 text-cyan-400" /> : <ChevronDown className="h-4 w-4 text-cyan-400" />}
                </button>

                {freshupOpen && (
                    <div className="px-5 pb-5 border-t border-cyan-200 pt-4">
                        <div className="bg-white rounded-xl border border-cyan-100 p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Guest Name *</Label>
                                    <input
                                        type="text"
                                        placeholder="e.g. John Doe"
                                        value={freshupName}
                                        onChange={(e) => setFreshupName(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Guest Phone *</Label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 9876543210"
                                        inputMode="numeric"
                                        maxLength={10}
                                        value={freshupPhone}
                                        onChange={(e) => setFreshupPhone(e.target.value.replace(/\D/g, ''))}
                                        onBlur={() => handleFreshupPhoneLookup(freshupPhone)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                            </div>

                            {/* Returning guest Aadhar lookup */}
                            {freshupLookingUp && (
                                <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                                    Checking for returning guest...
                                </div>
                            )}
                            {freshupAadharMatch && (
                                <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5">
                                    <p className="text-xs text-blue-700 font-medium mb-2">
                                        Returning guest: <span className="font-bold">{freshupAadharMatch.name}</span> ({freshupAadharMatch.phone})
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={applyFreshupAadharMatch}
                                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
                                        >
                                            Use Previous Aadhar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFreshupAadharMatch(null)}
                                            className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-600 text-xs font-semibold hover:bg-blue-50 transition-colors"
                                        >
                                            Upload New
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Aadhar Photo Capture */}
                            {!freshupAadharBypass && (
                                <div className="space-y-2">
                                    <Label className="text-xs text-slate-600">Aadhar ID Photos *</Label>
                                    {freshupAadharPreviews.stitched ? (
                                        <div className="space-y-2">
                                            <div className="relative rounded-lg overflow-hidden border border-emerald-200">
                                                <img
                                                    src={freshupAadharPreviews.stitched}
                                                    alt="Stitched Aadhar"
                                                    className="w-full h-auto max-h-48 object-contain bg-slate-50"
                                                />
                                                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                                                    Front + Back
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFreshupAadharFront(null)
                                                    setFreshupAadharBack(null)
                                                    setFreshupAadharPreviews({})
                                                    setFreshupAadharUrlFront('')
                                                    setFreshupAadharUrlBack('')
                                                }}
                                                className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                                            >
                                                Re-capture
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {(['front', 'back'] as const).map((side) => (
                                                <div key={side}>
                                                    {freshupAadharPreviews[side] ? (
                                                        <div className="relative rounded-lg overflow-hidden border border-emerald-200">
                                                            <img
                                                                src={freshupAadharPreviews[side]}
                                                                alt={`Aadhar ${side}`}
                                                                className="w-full h-24 object-cover"
                                                            />
                                                            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold capitalize">
                                                                {side}
                                                            </div>
                                                            <div className="absolute top-1 right-1">
                                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <label className={`flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                                            freshupUploading
                                                                ? 'border-slate-200 bg-slate-50 cursor-wait'
                                                                : 'border-cyan-300 bg-cyan-50/50 hover:bg-cyan-50 hover:border-cyan-400'
                                                        }`}>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                capture="environment"
                                                                className="hidden"
                                                                disabled={freshupUploading}
                                                                onChange={(e) => handleFreshupAadharCapture(side, e)}
                                                            />
                                                            {freshupUploading ? (
                                                                <div className="text-center">
                                                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mx-auto mb-1" />
                                                                    <span className="text-[10px] text-slate-400">Stitching...</span>
                                                                </div>
                                                            ) : (
                                                                <div className="text-center">
                                                                    <Camera className="h-5 w-5 text-cyan-500 mx-auto mb-1" />
                                                                    <span className="text-[10px] font-semibold text-cyan-600 capitalize">{side}</span>
                                                                </div>
                                                            )}
                                                        </label>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AC/Non-AC toggle (ROOM mode only) */}
                            {freshupMode === 'ROOM' && (
                                <div className="flex items-center gap-3">
                                    <Label className="text-xs text-slate-600">Room Type</Label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFreshupAcType('AC')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                                freshupAcType === 'AC'
                                                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                            }`}
                                        >
                                            AC — {formatCurrency(freshupAcPrice)}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFreshupAcType('NON_AC')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                                freshupAcType === 'NON_AC'
                                                    ? 'bg-slate-200 border-slate-400 text-slate-700'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                            }`}
                                        >
                                            Non-AC — {formatCurrency(freshupNonacPrice)}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Guest count stepper */}
                            <div className="flex items-center gap-4">
                                <Label className="text-xs text-slate-600">Guest Count</Label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next = Math.max(1, freshupCount - 1)
                                            setFreshupCount(next)
                                            // Clear Guest 2 state if count drops below 2 (prevents stale data reuse)
                                            if (next < 2) {
                                                setFreshupName2('')
                                                setFreshupPhone2('')
                                                setFreshupAadharFront2(null)
                                                setFreshupAadharBack2(null)
                                                Object.values(freshupAadharPreviews2).forEach(url => { try { URL.revokeObjectURL(url) } catch {} })
                                                setFreshupAadharPreviews2({})
                                                setFreshupAadharUrlFront2('')
                                                setFreshupAadharUrlBack2('')
                                            }
                                        }}
                                        className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
                                    >
                                        <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="text-sm font-bold text-slate-800 w-8 text-center">{freshupCount}</span>
                                    <button
                                        type="button"
                                        onClick={() => setFreshupCount(
                                            (freshupMode === 'ROOM' && freshupMaxGuests)
                                                ? Math.min(freshupMaxGuests, freshupCount + 1)
                                                : freshupCount + 1
                                        )}
                                        className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
                                    >
                                        <Plus className="h-3 w-3" />
                                    </button>
                                </div>
                                <span className="text-sm font-bold text-cyan-700 ml-auto">
                                    {formatCurrency(freshupPrice)}
                                </span>
                            </div>

                            {/* Guest 2 section — ROOM mode with 2+ guests (Aluva) */}
                            {freshupMode === 'ROOM' && freshupCount >= 2 && (
                                <div className="rounded-xl border border-cyan-200 bg-cyan-50/30 p-3 space-y-3">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-700">
                                        Guest 2 Details
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-slate-600">Guest 2 Name *</Label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Jane Doe"
                                                value={freshupName2}
                                                onChange={(e) => setFreshupName2(e.target.value)}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 placeholder:text-slate-400"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-slate-600">Guest 2 Phone *</Label>
                                            <input
                                                type="text"
                                                placeholder="e.g. 9876543210"
                                                inputMode="numeric"
                                                maxLength={10}
                                                value={freshupPhone2}
                                                onChange={(e) => setFreshupPhone2(e.target.value.replace(/\D/g, ''))}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 placeholder:text-slate-400"
                                            />
                                        </div>
                                    </div>

                                    {/* Guest 2 Aadhar Capture */}
                                    {!freshupAadharBypass && (
                                        <div className="space-y-2">
                                            <Label className="text-xs text-slate-600">Guest 2 Aadhar Photos *</Label>
                                            {freshupAadharPreviews2.stitched ? (
                                                <div className="space-y-2">
                                                    <div className="relative rounded-lg overflow-hidden border border-emerald-200">
                                                        <img
                                                            src={freshupAadharPreviews2.stitched}
                                                            alt="Guest 2 Aadhar"
                                                            className="w-full h-auto max-h-48 object-contain bg-slate-50"
                                                        />
                                                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                                                            Front + Back
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFreshupAadharFront2(null)
                                                            setFreshupAadharBack2(null)
                                                            setFreshupAadharPreviews2({})
                                                            setFreshupAadharUrlFront2('')
                                                            setFreshupAadharUrlBack2('')
                                                        }}
                                                        className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                                                    >
                                                        Re-capture
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {(['front', 'back'] as const).map((side) => (
                                                        <div key={side}>
                                                            {freshupAadharPreviews2[side] ? (
                                                                <div className="relative rounded-lg overflow-hidden border border-emerald-200">
                                                                    <img
                                                                        src={freshupAadharPreviews2[side]}
                                                                        alt={`Guest 2 Aadhar ${side}`}
                                                                        className="w-full h-24 object-cover"
                                                                    />
                                                                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold capitalize">
                                                                        {side}
                                                                    </div>
                                                                    <div className="absolute top-1 right-1">
                                                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <label className={`flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                                                                    freshupUploading2
                                                                        ? 'border-slate-200 bg-slate-50 cursor-wait'
                                                                        : 'border-cyan-300 bg-cyan-50/50 hover:bg-cyan-50 hover:border-cyan-400'
                                                                }`}>
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        capture="environment"
                                                                        className="hidden"
                                                                        disabled={freshupUploading2}
                                                                        onChange={(e) => handleFreshupAadharCapture2(side, e)}
                                                                    />
                                                                    {freshupUploading2 ? (
                                                                        <div className="text-center">
                                                                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent mx-auto mb-1" />
                                                                            <span className="text-[10px] text-slate-400">Stitching...</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-center">
                                                                            <Camera className="h-5 w-5 text-cyan-500 mx-auto mb-1" />
                                                                            <span className="text-[10px] font-semibold text-cyan-600 capitalize">{side}</span>
                                                                        </div>
                                                                    )}
                                                                </label>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Payment method */}
                            <div className="flex items-center gap-3">
                                <Label className="text-xs text-slate-600">Payment</Label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFreshupPayment('CASH')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                            freshupPayment === 'CASH'
                                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Banknote className="h-3 w-3" />
                                        Cash
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFreshupPayment('DIGITAL')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                            freshupPayment === 'DIGITAL'
                                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        <Smartphone className="h-3 w-3" />
                                        Digital
                                    </button>
                                </div>
                            </div>

                            {/* Admin/Developer: Skip Aadhar bypass */}
                            {(role === 'Admin' || role === 'Developer') && (
                                <div className="flex items-center gap-3 px-1 py-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                                        <input
                                            type="checkbox"
                                            checked={freshupAadharBypass}
                                            onChange={(e) => setFreshupAadharBypass(e.target.checked)}
                                            className="rounded border-slate-300"
                                        />
                                        <span className="text-slate-600">Skip Aadhar Upload</span>
                                    </label>
                                </div>
                            )}

                            <Button
                                onClick={handleSubmitFreshup}
                                disabled={(() => {
                                    const needsGuest2 = freshupMode === 'ROOM' && freshupCount >= 2
                                    if (freshupSubmitting) return true
                                    if (freshupUploading || freshupUploading2) return true
                                    if (!freshupName.trim()) return true
                                    if (freshupPhone.replace(/\D/g, '').length !== 10) return true
                                    if (!freshupAadharBypass && (!freshupAadharUrlFront || !freshupAadharUrlBack)) return true
                                    if (needsGuest2) {
                                        if (!freshupName2.trim()) return true
                                        if (freshupPhone2.replace(/\D/g, '').length !== 10) return true
                                        if (!freshupAadharBypass && (!freshupAadharUrlFront2 || !freshupAadharUrlBack2)) return true
                                    }
                                    return false
                                })()}
                                size="sm"
                                className="bg-cyan-600 hover:bg-cyan-700 h-8 text-xs"
                            >
                                {freshupSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Recording...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Droplets className="h-3.5 w-3.5" />
                                        Record Freshup ({formatCurrency(freshupPrice)})
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Report Customer Issue Section */}
            <div className="rounded-2xl border border-red-200 bg-red-50/50 overflow-hidden">
                <button
                    onClick={() => setIssueOpen(!issueOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-red-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                            <MessageSquareWarning className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-red-900">Report Customer Issue</span>
                            <span className="ml-3 text-xs text-red-500">Send to Zonal Ops for resolution</span>
                        </div>
                    </div>
                    {issueOpen ? <ChevronUp className="h-4 w-4 text-red-400" /> : <ChevronDown className="h-4 w-4 text-red-400" />}
                </button>

                {issueOpen && (
                    <div className="px-5 pb-5 border-t border-red-200 pt-4">
                        <div className="bg-white rounded-xl border border-red-100 p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Guest Name</Label>
                                    <input
                                        type="text"
                                        placeholder="e.g. John Doe"
                                        value={issueGuestName}
                                        onChange={(e) => setIssueGuestName(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Guest Phone</Label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 9876543210"
                                        value={issueGuestPhone}
                                        onChange={(e) => setIssueGuestPhone(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600">Issue Description *</Label>
                                <textarea
                                    placeholder="Describe the customer issue in detail..."
                                    value={issueDescription}
                                    onChange={(e) => setIssueDescription(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 resize-none placeholder:text-slate-400"
                                />
                            </div>
                            <Button
                                onClick={handleSubmitIssue}
                                disabled={issueSubmitting || !issueDescription.trim()}
                                size="sm"
                                className="bg-red-600 hover:bg-red-700 h-8 text-xs"
                            >
                                {issueSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Sending...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <MessageSquareWarning className="h-3.5 w-3.5" />
                                        Report Issue
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Report Hotel Issue Section */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 overflow-hidden">
                <button
                    onClick={() => setHotelIssueOpen(!hotelIssueOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-amber-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                            <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-amber-900">Report Hotel Issue</span>
                            <span className="ml-3 text-xs text-amber-500">Send to Zonal Ops & Zonal HK</span>
                        </div>
                    </div>
                    {hotelIssueOpen ? <ChevronUp className="h-4 w-4 text-amber-400" /> : <ChevronDown className="h-4 w-4 text-amber-400" />}
                </button>

                {hotelIssueOpen && (
                    <div className="px-5 pb-5 border-t border-amber-200 pt-4">
                        <div className="bg-white rounded-xl border border-amber-100 p-4 space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600">Issue Description *</Label>
                                <textarea
                                    placeholder="Describe the hotel issue in detail (e.g. broken AC in Room 101, plumbing leak, damaged furniture...)"
                                    value={hotelIssueDescription}
                                    onChange={(e) => setHotelIssueDescription(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 resize-none placeholder:text-slate-400"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Category *</Label>
                                    <Select value={hotelIssueCategory} onValueChange={setHotelIssueCategory}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Select category..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="OBSERVATION">Observation</SelectItem>
                                            <SelectItem value="DAMAGE">Damage</SelectItem>
                                            <SelectItem value="SAFETY">Safety</SelectItem>
                                            <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                                            <SelectItem value="GUEST_COMPLAINT">Guest Complaint</SelectItem>
                                            <SelectItem value="OTHER">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Photo (optional)</Label>
                                    {hotelIssuePhoto ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Photo attached
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setHotelIssuePhoto('')}
                                                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <label className={`flex items-center justify-center gap-2 h-9 rounded-lg border cursor-pointer transition-colors ${
                                            hotelIssueUploading
                                                ? 'border-slate-200 bg-slate-50 cursor-wait'
                                                : 'border-amber-300 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400'
                                        }`}>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                disabled={hotelIssueUploading}
                                                onChange={handleHotelIssuePhotoCapture}
                                            />
                                            {hotelIssueUploading ? (
                                                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                                                    Uploading...
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
                                                    <Camera className="h-3.5 w-3.5" />
                                                    Capture Photo
                                                </span>
                                            )}
                                        </label>
                                    )}
                                </div>
                            </div>
                            <Button
                                onClick={handleSubmitHotelIssue}
                                disabled={hotelIssueSubmitting || !hotelIssueDescription.trim() || !hotelIssueCategory}
                                size="sm"
                                className="bg-amber-600 hover:bg-amber-700 h-8 text-xs"
                            >
                                {hotelIssueSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Sending...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Report Hotel Issue
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Property Expense Request Section */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 overflow-hidden">
                <button
                    onClick={() => setExpenseOpen(!expenseOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                            <Receipt className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-blue-900">Property Expense Request</span>
                            <span className="ml-3 text-xs text-blue-500">Submit for Zonal Ops approval</span>
                        </div>
                    </div>
                    {expenseOpen ? <ChevronUp className="h-4 w-4 text-blue-400" /> : <ChevronDown className="h-4 w-4 text-blue-400" />}
                </button>

                {expenseOpen && (
                    <div className="px-5 pb-5 border-t border-blue-200 pt-4">
                        <div className="bg-white rounded-xl border border-blue-100 p-4 space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600">Description *</Label>
                                <textarea
                                    placeholder="e.g. Plumbing repair in bathroom, AC filter replacement..."
                                    value={expenseDescription}
                                    onChange={(e) => setExpenseDescription(e.target.value)}
                                    rows={2}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 resize-none placeholder:text-slate-400"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Amount (INR) *</Label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 500"
                                        value={expenseAmount}
                                        onChange={(e) => setExpenseAmount(e.target.value)}
                                        min="1"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Category</Label>
                                    <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Select category..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Plumbing">Plumbing</SelectItem>
                                            <SelectItem value="Electrical">Electrical</SelectItem>
                                            <SelectItem value="Supplies">Supplies</SelectItem>
                                            <SelectItem value="Cleaning">Cleaning</SelectItem>
                                            <SelectItem value="Furniture">Furniture</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <Button
                                onClick={handleSubmitExpense}
                                disabled={expenseSubmitting || !expenseDescription.trim() || !expenseAmount || Number(expenseAmount) <= 0}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 h-8 text-xs"
                            >
                                {expenseSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Sending...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Receipt className="h-3.5 w-3.5" />
                                        Submit Expense Request
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* My Expense Request Statuses */}
            {myExpenses.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white/50 overflow-hidden">
                    <div className="px-5 py-3">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-slate-500" />
                            My Expense Requests
                        </h3>
                    </div>
                    <div className="px-5 pb-4 space-y-2">
                        {myExpenses.map(exp => (
                            <div key={exp.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-slate-100">
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium text-slate-800 truncate block">{exp.description}</span>
                                    <span className="text-xs text-slate-400">{formatCurrency(exp.amount)}</span>
                                </div>
                                <div className="flex items-center gap-2 ml-3 shrink-0">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        exp.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                                        exp.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                        'bg-amber-100 text-amber-700'
                                    }`}>
                                        {exp.status}
                                    </span>
                                    {exp.status === 'REJECTED' && exp.rejection_reason && (
                                        <span className="text-[10px] text-red-500 max-w-[120px] truncate" title={exp.rejection_reason}>
                                            {exp.rejection_reason}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        CRE
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        Manage check-ins, check-outs, and room statuses in
                        real-time.
                    </p>
                </div>

                {/* Type Filter Tabs */}
                <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
                    {typeFilters.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setTypeFilter(f.key)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${typeFilter === f.key
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                        >
                            {f.icon}
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {statusFilters.map((sf) => (
                    <button
                        key={sf.key}
                        onClick={() => setStatusFilter(sf.key)}
                        className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-left transition-all border ${statusFilter === sf.key
                            ? 'border-slate-300 shadow-sm ring-1 ring-slate-200 bg-white'
                            : 'border-transparent bg-white/50 hover:bg-white hover:border-slate-200'
                            }`}
                    >
                        <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${sf.color}`}
                        >
                            {sf.icon}
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-900 leading-none">
                                {sf.count}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">
                                {sf.label}
                            </p>
                        </div>
                    </button>
                ))}
            </div>

            {/* Unit Grid */}
            <UnitGrid
                hotelId={effectiveHotelId}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                now={now}
                role={role}
            />
        </div>
    )
}
