"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
    Building2,
    BedDouble,
    Sparkles,
    Users,
    Shield,
    Globe,
    ClipboardList,
    Wrench,
    Phone,
    KeyRound,
    ArrowLeft,
    Loader2,
    AlertTriangle,
    MapPin,
    RefreshCw,
    Camera,
    CheckCircle2,
    Code2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Hotel {
    id: string
    name: string
    city: string
    status: string
}

type RoleKey =
    | 'FrontDesk'
    | 'Housekeeping'
    | 'HR'
    | 'Admin'
    | 'ZonalManager'
    | 'ZonalOps'
    | 'ZonalHK'
    | 'Developer'

interface RoleInfo {
    label: string
    description: string
    icon: LucideIcon
}

/* ------------------------------------------------------------------ */
/*  Role metadata                                                      */
/* ------------------------------------------------------------------ */

const ROLE_META: Record<RoleKey, RoleInfo> = {
    FrontDesk: {
        label: 'CRE',
        description: 'Reception & Check-ins',
        icon: BedDouble,
    },
    Housekeeping: {
        label: 'Housekeeping',
        description: 'Room Cleaning',
        icon: Sparkles,
    },
    HR: {
        label: 'HR',
        description: 'Staff & Payroll',
        icon: Users,
    },
    Admin: {
        label: 'Admin',
        description: 'System Management',
        icon: Shield,
    },
    ZonalManager: {
        label: 'Zonal Manager',
        description: 'Multi-Property Overview',
        icon: Globe,
    },
    ZonalOps: {
        label: 'Zonal Ops',
        description: 'Operations Management',
        icon: ClipboardList,
    },
    ZonalHK: {
        label: 'Zonal HK',
        description: 'Housekeeping Management',
        icon: Wrench,
    },
    Developer: {
        label: 'Developer',
        description: 'System Developer',
        icon: Code2,
    },
}

/* ------------------------------------------------------------------ */
/*  Roles that require photo clock-in after login                      */
/* ------------------------------------------------------------------ */

const AUTO_CLOCK_ROLES: RoleKey[] = ['FrontDesk', 'Housekeeping', 'HR']

/* ------------------------------------------------------------------ */
/*  Role → dashboard route mapping                                     */
/* ------------------------------------------------------------------ */

const ROLE_ROUTE: Record<RoleKey, string> = {
    Developer: '/developer',
    Admin: '/admin',
    HR: '/hr',
    ZonalManager: '/zonal',
    ZonalOps: '/zonal-ops',
    ZonalHK: '/zonal-hk',
    Housekeeping: '/housekeeping',
    FrontDesk: '/front-desk',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LoginPage() {
    // Wizard state
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

    // Data
    const [hotels, setHotels] = useState<Hotel[]>([])
    const [availableRoles, setAvailableRoles] = useState<RoleKey[]>([])

    // Selections
    const [selectedHotel, setSelectedHotel] = useState<Hotel | null>(null)
    const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null)

    // Form
    const [phone, setPhone] = useState('')
    const [password, setPassword] = useState('')

    // Loading / error states
    const [initialLoading, setInitialLoading] = useState(true)
    const [hotelsLoading, setHotelsLoading] = useState(true)
    const [hotelsError, setHotelsError] = useState<string | null>(null)
    const [rolesLoading, setRolesLoading] = useState(false)
    const [signingIn, setSigningIn] = useState(false)

    // Step 4: Photo clock-in state
    const [clockInPhoto, setClockInPhoto] = useState<string | null>(null)
    const [cameraActive, setCameraActive] = useState(false)
    const [clockingIn, setClockingIn] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    /* -------------------------------------------------------------- */
    /*  Already authenticated? Redirect.                               */
    /* -------------------------------------------------------------- */

    useEffect(() => {
        const checkSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (session?.user) {
                    window.location.href = '/'
                    return
                }
            } catch {
                // no session, continue to login
            } finally {
                setInitialLoading(false)
            }
        }
        checkSession()
    }, [])

    /* -------------------------------------------------------------- */
    /*  Step 1: Fetch hotels                                           */
    /* -------------------------------------------------------------- */

    const fetchHotels = useCallback(async () => {
        setHotelsLoading(true)
        setHotelsError(null)
        try {
            const { data, error } = await supabase
                .from('hotels')
                .select('id, name, city, status')
                .order('name')

            if (error) {
                setHotelsError('Failed to load properties. Please try again.')
                return
            }
            setHotels(data || [])
        } catch {
            setHotelsError('Network error. Please check your connection.')
        } finally {
            setHotelsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchHotels()
    }, [fetchHotels])

    /* -------------------------------------------------------------- */
    /*  Step 2: Fetch roles for selected hotel                         */
    /* -------------------------------------------------------------- */

    const fetchRoles = useCallback(async (hotelId: string) => {
        setRolesLoading(true)
        try {
            const { data, error } = await supabase
                .from('staff')
                .select('role')
                .eq('hotel_id', hotelId)

            if (error) {
                toast.error('Failed to load roles')
                return
            }

            const uniqueRoles = [...new Set((data || []).map((s) => s.role))] as RoleKey[]
            // Sort roles in display order
            const order: RoleKey[] = [
                'FrontDesk',
                'Housekeeping',
                'HR',
                'Admin',
                'ZonalManager',
                'ZonalOps',
                'ZonalHK',
            ]
            const sorted = order.filter((r) => uniqueRoles.includes(r))
            setAvailableRoles(sorted)
        } finally {
            setRolesLoading(false)
        }
    }, [])

    /* -------------------------------------------------------------- */
    /*  Handlers                                                       */
    /* -------------------------------------------------------------- */

    const handleSelectHotel = (hotel: Hotel) => {
        if (hotel.status.toUpperCase() !== 'ACTIVE') {
            toast.error(`${hotel.name} is currently under maintenance`)
            return
        }
        setSelectedHotel(hotel)
        fetchRoles(hotel.id)
        setStep(2)
    }

    const handleSelectRole = (role: RoleKey) => {
        setSelectedRole(role)
        setStep(3)
    }

    const handleBack = () => {
        if (step === 2) {
            setStep(1)
            setSelectedHotel(null)
            setSelectedRole(null)
            setAvailableRoles([])
        } else if (step === 3) {
            setStep(2)
            setSelectedRole(null)
            setPhone('')
            setPassword('')
        }
    }

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault()

        const digits = phone.replace(/\D/g, '')
        if (digits.length !== 10) {
            toast.error('Please enter a valid 10-digit phone number')
            return
        }

        setSigningIn(true)
        try {
            const email = `${digits}@fajo.local`
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                toast.error('Invalid phone number or password')
                return
            }

            toast.success('Signed in successfully')

            // Property-level roles get photo clock-in step
            if (selectedRole && AUTO_CLOCK_ROLES.includes(selectedRole)) {
                setSigningIn(false)
                setStep(4)
                return
            }

            // Direct redirect to role-specific dashboard (skip root page hop)
            window.location.href = selectedRole ? ROLE_ROUTE[selectedRole] : '/'
        } catch {
            toast.error('Invalid phone number or password')
        } finally {
            setSigningIn(false)
        }
    }

    /* -------------------------------------------------------------- */
    /*  Step 4: Camera & Clock-in functions                            */
    /* -------------------------------------------------------------- */

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
        } catch {
            toast.error('Camera access denied')
        }
    }

    const capturePhoto = () => {
        if (!videoRef.current) return
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 240
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 320, 240)
            setClockInPhoto(canvas.toDataURL('image/jpeg', 0.6))
        }
        stopCamera()
    }

    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream
            stream.getTracks().forEach((t) => t.stop())
            videoRef.current.srcObject = null
        }
        setCameraActive(false)
    }

    const handleClockIn = async () => {
        setClockingIn(true)
        try {
            const {
                data: { user },
            } = await supabase.auth.getUser()
            if (!user) {
                window.location.href = '/'
                return
            }

            const { data: profile } = await supabase
                .from('staff')
                .select('id, hotel_id')
                .eq('user_id', user.id)
                .single()
            if (!profile) {
                window.location.href = selectedRole ? ROLE_ROUTE[selectedRole] : '/'
                return
            }

            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: profile.id,
                    hotel_id: profile.hotel_id,
                    photo: clockInPhoto,
                    clock_in_method: 'AUTO_LOGIN',
                }),
            })

            if (res.status === 409) {
                // Already clocked in (e.g. browser crash re-login) — skip silently
                toast.info('Already clocked in — resuming session')
                stopCamera()
                window.location.href = selectedRole ? ROLE_ROUTE[selectedRole] : '/'
            } else if (!res.ok) {
                const json = await res.json()
                toast.error(json.error || 'Clock-in failed — please try again')
                setClockingIn(false)
                // DON'T redirect — staff must clock in to proceed
                return
            } else {
                const json = await res.json()
                toast.success(`Clocked in — ${json.shift} shift`)
                stopCamera()
                window.location.href = selectedRole ? ROLE_ROUTE[selectedRole] : '/'
            }
        } catch {
            toast.error('Clock-in failed — please try again')
            setClockingIn(false)
            // DON'T redirect — staff must clock in to proceed
            return
        }
    }

    // Auto-start camera when entering step 4
    useEffect(() => {
        if (step === 4) {
            startCamera()
        }
        return () => {
            if (step === 4) stopCamera()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step])

    // Cleanup camera on unmount
    useEffect(() => {
        return () => stopCamera()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /* -------------------------------------------------------------- */
    /*  Derived state                                                  */
    /* -------------------------------------------------------------- */

    const needsClockIn = selectedRole ? AUTO_CLOCK_ROLES.includes(selectedRole) : false
    const totalSteps = needsClockIn ? 4 : 3

    /* -------------------------------------------------------------- */
    /*  Initial loading state                                          */
    /* -------------------------------------------------------------- */

    if (initialLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
        )
    }

    /* -------------------------------------------------------------- */
    /*  Render                                                         */
    /* -------------------------------------------------------------- */

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 flex flex-col">
            {/* Header */}
            <div className="pt-8 sm:pt-12 pb-4 px-4 text-center">
                <div className="flex justify-center mb-4">
                    <div className="h-14 w-14 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center">
                        <span className="font-bold text-3xl leading-none">F</span>
                    </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    FAJO ERP
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                    Hotel Management System
                </p>
            </div>

            {/* Step indicator */}
            <div className="flex justify-center px-4 pb-6 sm:pb-8">
                <div className="flex items-center gap-2">
                    {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
                        <div key={s} className="flex items-center gap-2">
                            <div
                                className={`
                                    h-2 rounded-full transition-all duration-300
                                    ${s === step ? 'w-8 bg-emerald-500' : s < step ? 'w-2 bg-emerald-400' : 'w-2 bg-slate-200'}
                                `}
                            />
                            {s < totalSteps && (
                                <div className={`w-4 h-px ${s < step ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col items-center px-4 pb-8">
                <div className="w-full max-w-lg">

                    {/* ============================================ */}
                    {/*  STEP 1: Property Selection                   */}
                    {/* ============================================ */}
                    {step === 1 && (
                        <div className="animate-in fade-in duration-300">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                    <Building2 className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">
                                        Select Property
                                    </h2>
                                    <p className="text-sm text-slate-500">
                                        Choose your work location
                                    </p>
                                </div>
                            </div>

                            {hotelsLoading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                                </div>
                            ) : hotelsError ? (
                                <div className="text-center py-12">
                                    <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-400" />
                                    <p className="text-sm text-slate-600 mb-4">{hotelsError}</p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={fetchHotels}
                                        className="gap-2"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                        Retry
                                    </Button>
                                </div>
                            ) : hotels.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Building2 className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                                    <p className="text-sm">No properties configured yet</p>
                                    <p className="text-xs text-slate-400 mt-1">Contact your administrator</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {hotels.map((hotel) => {
                                        const isActive = hotel.status.toUpperCase() === 'ACTIVE'
                                        return (
                                            <button
                                                key={hotel.id}
                                                type="button"
                                                onClick={() => handleSelectHotel(hotel)}
                                                className={`
                                                    group relative text-left w-full rounded-2xl border-2 p-6 transition-all duration-200
                                                    min-h-[140px] flex flex-col justify-between
                                                    ${isActive
                                                        ? 'border-emerald-200 bg-white hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-100 cursor-pointer active:scale-[0.98]'
                                                        : 'border-slate-200 bg-slate-50 cursor-pointer opacity-70'
                                                    }
                                                `}
                                            >
                                                {/* Top section */}
                                                <div>
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className={`
                                                            h-11 w-11 rounded-xl flex items-center justify-center
                                                            ${isActive
                                                                ? 'bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200'
                                                                : 'bg-slate-200 text-slate-400'
                                                            }
                                                        `}>
                                                            <Building2 className="h-5 w-5" />
                                                        </div>
                                                        {!isActive && (
                                                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[11px]">
                                                                <AlertTriangle className="h-3 w-3" />
                                                                Under Maintenance
                                                            </Badge>
                                                        )}
                                                        {isActive && (
                                                            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-100" />
                                                        )}
                                                    </div>
                                                    <h3 className={`
                                                        font-semibold text-base
                                                        ${isActive ? 'text-slate-900' : 'text-slate-500'}
                                                    `}>
                                                        {hotel.name}
                                                    </h3>
                                                </div>

                                                {/* Bottom section */}
                                                <div className="flex items-center gap-1.5 mt-2">
                                                    <MapPin className={`h-3.5 w-3.5 ${isActive ? 'text-slate-400' : 'text-slate-300'}`} />
                                                    <span className={`text-sm ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>
                                                        {hotel.city}
                                                    </span>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============================================ */}
                    {/*  STEP 2: Role Selection                       */}
                    {/* ============================================ */}
                    {step === 2 && (
                        <div className="animate-in fade-in duration-300">
                            {/* Back + Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors active:scale-95"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                                <div className="flex-1">
                                    <h2 className="text-lg font-semibold text-slate-900">
                                        Select Role
                                    </h2>
                                    <p className="text-sm text-slate-500">
                                        {selectedHotel?.name}
                                    </p>
                                </div>
                            </div>

                            {rolesLoading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                                </div>
                            ) : availableRoles.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Users className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                                    <p className="text-sm">No roles available at this property</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {availableRoles.map((role) => {
                                        const meta = ROLE_META[role]
                                        if (!meta) return null
                                        const Icon = meta.icon
                                        return (
                                            <button
                                                key={role}
                                                type="button"
                                                onClick={() => handleSelectRole(role)}
                                                className="
                                                    group relative text-left w-full rounded-2xl border-2 border-slate-200 bg-white p-4
                                                    hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-100
                                                    transition-all duration-200 cursor-pointer active:scale-[0.97]
                                                    min-h-[120px] flex flex-col
                                                "
                                            >
                                                <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mb-3 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors">
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <h3 className="font-semibold text-sm text-slate-900 mb-0.5">
                                                    {meta.label}
                                                </h3>
                                                <p className="text-xs text-slate-500 leading-snug">
                                                    {meta.description}
                                                </p>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============================================ */}
                    {/*  STEP 3: Phone + Password                     */}
                    {/* ============================================ */}
                    {step === 3 && (
                        <div className="animate-in fade-in duration-300">
                            {/* Back + Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="h-10 w-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors active:scale-95"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                                <div className="flex-1">
                                    <h2 className="text-lg font-semibold text-slate-900">
                                        Sign In
                                    </h2>
                                    <p className="text-sm text-slate-500">
                                        {selectedHotel?.name} &middot; {selectedRole && ROLE_META[selectedRole]?.label}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                                <form onSubmit={handleSignIn} className="space-y-5">
                                    {/* Phone */}
                                    <div className="space-y-2">
                                        <Label htmlFor="phone" className="text-sm font-medium text-slate-700">
                                            Phone Number
                                        </Label>
                                        <div className="relative">
                                            <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <Input
                                                id="phone"
                                                type="tel"
                                                inputMode="numeric"
                                                maxLength={10}
                                                required
                                                placeholder="Enter your phone number"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                                className="pl-10 h-12 text-base rounded-xl border-slate-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-100"
                                            />
                                        </div>
                                    </div>

                                    {/* Password */}
                                    <div className="space-y-2">
                                        <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                                            Password
                                        </Label>
                                        <div className="relative">
                                            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <Input
                                                id="password"
                                                type="password"
                                                required
                                                placeholder="Enter role password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="pl-10 h-12 text-base rounded-xl border-slate-200 focus-visible:border-emerald-400 focus-visible:ring-emerald-100"
                                            />
                                        </div>
                                    </div>

                                    {/* Submit */}
                                    <Button
                                        type="submit"
                                        disabled={signingIn}
                                        className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]"
                                    >
                                        {signingIn ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Signing in...
                                            </>
                                        ) : (
                                            'Sign In'
                                        )}
                                    </Button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ============================================ */}
                    {/*  STEP 4: Photo Capture + Clock-In             */}
                    {/* ============================================ */}
                    {step === 4 && (
                        <div className="animate-in fade-in duration-300">
                            {/* Header */}
                            <div className="flex items-center gap-3 mb-6">
                                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                                    <Camera className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                    <h2 className="text-lg font-semibold text-slate-900">
                                        Clock In — Photo Verification
                                    </h2>
                                    <p className="text-sm text-slate-500">
                                        {selectedHotel?.name} &middot; {selectedRole && ROLE_META[selectedRole]?.label}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                                <div className="flex flex-col items-center gap-5">
                                    {/* Camera preview — video always mounted so ref is available */}
                                    {!clockInPhoto && (
                                        <>
                                            <div className="rounded-2xl border-2 border-slate-200 overflow-hidden bg-black">
                                                <video
                                                    ref={videoRef}
                                                    autoPlay
                                                    playsInline
                                                    muted
                                                    width={320}
                                                    height={240}
                                                    className="block"
                                                />
                                            </div>
                                            {cameraActive ? (
                                                <Button
                                                    type="button"
                                                    onClick={capturePhoto}
                                                    className="h-12 px-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] gap-2"
                                                >
                                                    <Camera className="h-5 w-5" />
                                                    Capture Photo
                                                </Button>
                                            ) : (
                                                <p className="text-sm text-slate-400 animate-pulse">Starting camera...</p>
                                            )}
                                        </>
                                    )}

                                    {/* Photo preview after capture */}
                                    {clockInPhoto && (
                                        <>
                                            <div className="rounded-2xl border-2 border-emerald-200 overflow-hidden">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={clockInPhoto}
                                                    alt="Clock-in photo"
                                                    width={320}
                                                    height={240}
                                                    className="block"
                                                />
                                            </div>
                                            <div className="flex gap-3 w-full">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setClockInPhoto(null)
                                                        startCamera()
                                                    }}
                                                    className="flex-1 h-12 rounded-xl font-semibold text-base"
                                                >
                                                    Retake
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={handleClockIn}
                                                    disabled={clockingIn}
                                                    className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] gap-2"
                                                >
                                                    {clockingIn ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Clocking in...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 className="h-5 w-5" />
                                                            Clock In &amp; Continue
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </>
                                    )}

                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="pb-6 text-center">
                <p className="text-xs text-slate-400">
                    FAJO Hotels &middot; Management Portal
                </p>
            </div>
        </div>
    )
}
