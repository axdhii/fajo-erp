'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Building2,
    Plus,
    Pencil,
    Save,
    Trash2,
    Ban,
    BedDouble,
    BedSingle,
    ChevronUp,
    ChevronDown,
    Wrench,
    Sparkles,
    MapPin,
    IndianRupee,
    Loader2,
    Hash,
} from 'lucide-react'

import type { DevTabProps as AdminTabProps } from '@/app/(dashboard)/developer/client'

// ============================================================
// Types
// ============================================================

interface HotelRow {
    id: string
    name: string
    city: string
    status: string
}

interface UnitRow {
    id: string
    hotel_id: string
    unit_number: string
    type: 'ROOM' | 'DORM'
    status: string
    base_price: number
    max_guests: number
    bed_position: string | null
    maintenance_reason: string | null
    ac_type: string | null
}

const HOTEL_STATUSES = ['ACTIVE', 'MAINTENANCE'] as const
const UNIT_TYPES = ['ROOM', 'DORM'] as const
const UNIT_STATUSES = ['AVAILABLE', 'OCCUPIED', 'DIRTY', 'IN_PROGRESS', 'MAINTENANCE'] as const

const UNIT_STATUS_COLORS: Record<string, string> = {
    AVAILABLE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    OCCUPIED: 'bg-red-100 text-red-700 border-red-200',
    DIRTY: 'bg-amber-100 text-amber-700 border-amber-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
    MAINTENANCE: 'bg-slate-100 text-slate-600 border-slate-200',
}

const HOTEL_STATUS_COLORS: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    MAINTENANCE: 'bg-amber-100 text-amber-700 border-amber-200',
}

// ============================================================
// Component
// ============================================================

export function HotelsUnits({ hotelId, hotels: _hotels }: AdminTabProps) {
    // Hotel state
    const [hotels, setHotels] = useState<HotelRow[]>([])
    const [loadingHotels, setLoadingHotels] = useState(false)
    const [expandedHotelId, setExpandedHotelId] = useState<string | null>(null)
    const [editingHotelId, setEditingHotelId] = useState<string | null>(null)
    const [editHotelName, setEditHotelName] = useState('')
    const [editHotelCity, setEditHotelCity] = useState('')
    const [editHotelStatus, setEditHotelStatus] = useState('')

    // Add hotel form
    const [showAddHotel, setShowAddHotel] = useState(false)
    const [addHotelName, setAddHotelName] = useState('')
    const [addHotelCity, setAddHotelCity] = useState('')
    const [addHotelStatus, setAddHotelStatus] = useState<string>('ACTIVE')

    // Unit state per hotel
    const [unitsByHotel, setUnitsByHotel] = useState<Record<string, UnitRow[]>>({})
    const [loadingUnits, setLoadingUnits] = useState<string | null>(null)

    // Edit unit inline
    const [editingUnitId, setEditingUnitId] = useState<string | null>(null)
    const [editUnitNumber, setEditUnitNumber] = useState('')
    const [editUnitType, setEditUnitType] = useState<string>('ROOM')
    const [editUnitPrice, setEditUnitPrice] = useState('')
    const [editUnitStatus, setEditUnitStatus] = useState<string>('AVAILABLE')
    const [editUnitMaintenance, setEditUnitMaintenance] = useState('')
    const [editUnitMaxGuests, setEditUnitMaxGuests] = useState('')
    const [editUnitBedPosition, setEditUnitBedPosition] = useState<string>('')
    const [editUnitAcType, setEditUnitAcType] = useState<string>('')

    // Add unit form
    const [addUnitHotelId, setAddUnitHotelId] = useState<string | null>(null)
    const [addUnitNumber, setAddUnitNumber] = useState('')
    const [addUnitType, setAddUnitType] = useState<string>('ROOM')
    const [addUnitPrice, setAddUnitPrice] = useState('')
    const [addUnitMaxGuests, setAddUnitMaxGuests] = useState('3')
    const [addUnitBedPosition, setAddUnitBedPosition] = useState<string>('')
    const [addUnitAcType, setAddUnitAcType] = useState<string>('')

    // Delete confirmation
    const [deleteHotelTarget, setDeleteHotelTarget] = useState<HotelRow | null>(null)
    const [deleteUnitTarget, setDeleteUnitTarget] = useState<UnitRow | null>(null)

    const [saving, setSaving] = useState(false)

    // ---- Fetch hotels ----
    const fetchHotels = useCallback(async () => {
        setLoadingHotels(true)
        const { data, error } = await supabase
            .from('hotels')
            .select('id, name, city, status')
            .order('name')

        if (error) {
            console.error('Hotels fetch error:', error)
            toast.error('Failed to load hotels')
        } else {
            setHotels(data || [])
        }
        setLoadingHotels(false)
    }, [])

    useEffect(() => {
        fetchHotels()
    }, [fetchHotels])

    // Auto-expand if hotelId filter is set
    useEffect(() => {
        if (hotelId) setExpandedHotelId(hotelId)
    }, [hotelId])

    // ---- Fetch units for a hotel ----
    const fetchUnits = useCallback(async (hId: string) => {
        setLoadingUnits(hId)
        const { data, error } = await supabase
            .from('units')
            .select('id, hotel_id, unit_number, type, status, base_price, max_guests, bed_position, maintenance_reason, ac_type')
            .eq('hotel_id', hId)
            .order('unit_number')

        if (error) {
            console.error('Units fetch error:', error)
            toast.error('Failed to load units')
        } else {
            setUnitsByHotel(prev => ({ ...prev, [hId]: data || [] }))
        }
        setLoadingUnits(null)
    }, [])

    // Fetch units when a hotel is expanded
    useEffect(() => {
        if (expandedHotelId && !unitsByHotel[expandedHotelId]) {
            fetchUnits(expandedHotelId)
        }
    }, [expandedHotelId, unitsByHotel, fetchUnits])

    // ---- Hotel CRUD ----
    const handleAddHotel = async () => {
        if (!addHotelName.trim() || !addHotelCity.trim()) {
            toast.error('Name and city are required')
            return
        }
        setSaving(true)
        const { error } = await supabase.from('hotels').insert({
            name: addHotelName.trim(),
            city: addHotelCity.trim(),
            status: addHotelStatus,
        })
        if (error) {
            toast.error('Failed to create hotel: ' + error.message)
        } else {
            toast.success(`Hotel "${addHotelName.trim()}" created`)
            setAddHotelName('')
            setAddHotelCity('')
            setAddHotelStatus('ACTIVE')
            setShowAddHotel(false)
            fetchHotels()
        }
        setSaving(false)
    }

    const handleSaveHotel = async (id: string) => {
        if (!editHotelName.trim()) {
            toast.error('Hotel name is required')
            return
        }
        setSaving(true)
        const { error } = await supabase
            .from('hotels')
            .update({
                name: editHotelName.trim(),
                city: editHotelCity.trim(),
                status: editHotelStatus,
            })
            .eq('id', id)

        if (error) {
            toast.error('Failed to update hotel: ' + error.message)
        } else {
            toast.success('Hotel updated')
            setEditingHotelId(null)
            fetchHotels()
        }
        setSaving(false)
    }

    const handleDeleteHotel = async () => {
        if (!deleteHotelTarget) return
        setSaving(true)
        // Check for units first
        const { count } = await supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('hotel_id', deleteHotelTarget.id)

        if (count && count > 0) {
            toast.error(`Cannot delete hotel with ${count} units. Remove all units first.`)
            setDeleteHotelTarget(null)
            setSaving(false)
            return
        }

        const { error } = await supabase
            .from('hotels')
            .delete()
            .eq('id', deleteHotelTarget.id)

        if (error) {
            toast.error('Failed to delete hotel: ' + error.message)
        } else {
            toast.success(`Hotel "${deleteHotelTarget.name}" deleted`)
            setDeleteHotelTarget(null)
            if (expandedHotelId === deleteHotelTarget.id) setExpandedHotelId(null)
            fetchHotels()
        }
        setSaving(false)
    }

    const startEditingHotel = (h: HotelRow) => {
        setEditingHotelId(h.id)
        setEditHotelName(h.name)
        setEditHotelCity(h.city)
        setEditHotelStatus(h.status || 'ACTIVE')
    }

    // ---- Unit CRUD ----
    const handleAddUnit = async () => {
        if (!addUnitHotelId || !addUnitNumber.trim()) {
            toast.error('Unit number is required')
            return
        }
        setSaving(true)
        const { error } = await supabase.from('units').insert({
            hotel_id: addUnitHotelId,
            unit_number: addUnitNumber.trim(),
            type: addUnitType,
            status: 'AVAILABLE',
            base_price: addUnitPrice ? Number(addUnitPrice) : (addUnitType === 'ROOM' ? 2000 : 400),
            max_guests: addUnitMaxGuests ? Number(addUnitMaxGuests) : 3,
            bed_position: addUnitType === 'DORM' && addUnitBedPosition ? addUnitBedPosition : null,
            ac_type: addUnitType === 'ROOM' && addUnitAcType ? addUnitAcType : null,
        })
        if (error) {
            toast.error('Failed to create unit: ' + error.message)
        } else {
            toast.success(`Unit "${addUnitNumber.trim()}" created`)
            setAddUnitNumber('')
            setAddUnitPrice('')
            setAddUnitType('ROOM')
            setAddUnitMaxGuests('3')
            setAddUnitBedPosition('')
            setAddUnitAcType('')
            setAddUnitHotelId(null)
            fetchUnits(addUnitHotelId)
        }
        setSaving(false)
    }

    const handleSaveUnit = async (u: UnitRow) => {
        if (!editUnitNumber.trim()) {
            toast.error('Unit number is required')
            return
        }
        setSaving(true)
        const updateData: Record<string, unknown> = {
            unit_number: editUnitNumber.trim(),
            type: editUnitType,
            base_price: editUnitPrice ? Number(editUnitPrice) : u.base_price,
            max_guests: editUnitMaxGuests ? Number(editUnitMaxGuests) : u.max_guests,
            bed_position: editUnitType === 'DORM' && editUnitBedPosition ? editUnitBedPosition : null,
            ac_type: editUnitType === 'ROOM' && editUnitAcType ? editUnitAcType : null,
            status: editUnitStatus,
            maintenance_reason: editUnitStatus === 'MAINTENANCE' ? (editUnitMaintenance.trim() || null) : null,
        }
        const { error } = await supabase
            .from('units')
            .update(updateData)
            .eq('id', u.id)

        if (error) {
            toast.error('Failed to update unit: ' + error.message)
        } else {
            toast.success(`Unit "${editUnitNumber.trim()}" updated`)
            setEditingUnitId(null)
            fetchUnits(u.hotel_id)
        }
        setSaving(false)
    }

    const handleDeleteUnit = async () => {
        if (!deleteUnitTarget) return
        setSaving(true)
        // Check for bookings
        const { count } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('unit_id', deleteUnitTarget.id)
            .in('status', ['CHECKED_IN', 'PENDING', 'CONFIRMED'])

        if (count && count > 0) {
            toast.error(`Cannot delete unit with ${count} active booking(s). Check out or cancel first.`)
            setDeleteUnitTarget(null)
            setSaving(false)
            return
        }

        const { error } = await supabase
            .from('units')
            .delete()
            .eq('id', deleteUnitTarget.id)

        if (error) {
            toast.error('Failed to delete unit: ' + error.message)
        } else {
            toast.success(`Unit "${deleteUnitTarget.unit_number}" deleted`)
            const hId = deleteUnitTarget.hotel_id
            setDeleteUnitTarget(null)
            fetchUnits(hId)
        }
        setSaving(false)
    }

    const startEditingUnit = (u: UnitRow) => {
        setEditingUnitId(u.id)
        setEditUnitNumber(u.unit_number)
        setEditUnitType(u.type)
        setEditUnitPrice(String(u.base_price))
        setEditUnitStatus(u.status)
        setEditUnitMaintenance(u.maintenance_reason || '')
        setEditUnitMaxGuests(String(u.max_guests ?? 3))
        setEditUnitBedPosition(u.bed_position || '')
        setEditUnitAcType(u.ac_type || '')
    }

    // ---- Computed ----
    const filteredHotels = hotelId ? hotels.filter(h => h.id === hotelId) : hotels

    // ---- Render ----
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-indigo-600" />
                        Hotels & Units
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        {filteredHotels.length} hotel{filteredHotels.length !== 1 ? 's' : ''} &middot; Manage properties and room inventory
                    </p>
                </div>
                <Button
                    onClick={() => setShowAddHotel(!showAddHotel)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    {showAddHotel ? <ChevronUp className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                    {showAddHotel ? 'Close Form' : 'Add Hotel'}
                </Button>
            </div>

            {/* Add Hotel Form */}
            {showAddHotel && (
                <Card className="border-indigo-200 bg-indigo-50/30">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-indigo-600" />
                            New Hotel
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Hotel Name *</Label>
                                <Input
                                    value={addHotelName}
                                    onChange={e => setAddHotelName(e.target.value)}
                                    placeholder="e.g. FAJO Rooms Kochi"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">City *</Label>
                                <Input
                                    value={addHotelCity}
                                    onChange={e => setAddHotelCity(e.target.value)}
                                    placeholder="e.g. Kochi"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Status</Label>
                                <Select value={addHotelStatus} onValueChange={setAddHotelStatus}>
                                    <SelectTrigger className="mt-1 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {HOTEL_STATUSES.map(s => (
                                            <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setShowAddHotel(false)}>Cancel</Button>
                            <Button
                                onClick={handleAddHotel}
                                disabled={saving || !addHotelName.trim() || !addHotelCity.trim()}
                                className="bg-indigo-600 hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Create Hotel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Hotels List */}
            {loadingHotels ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : filteredHotels.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">No hotels found.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filteredHotels.map(hotel => {
                        const isExpanded = expandedHotelId === hotel.id
                        const isEditing = editingHotelId === hotel.id
                        const units = unitsByHotel[hotel.id] || []
                        const roomCount = units.filter(u => u.type === 'ROOM').length
                        const dormCount = units.filter(u => u.type === 'DORM').length
                        const isAddingUnit = addUnitHotelId === hotel.id

                        return (
                            <Card key={hotel.id} className="overflow-hidden border-slate-200">
                                {/* Hotel Row */}
                                <div className="px-4 py-3">
                                    {isEditing ? (
                                        /* Edit Mode */
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <Label className="text-xs text-slate-500">Name</Label>
                                                    <Input
                                                        value={editHotelName}
                                                        onChange={e => setEditHotelName(e.target.value)}
                                                        placeholder="Hotel name"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-500">City</Label>
                                                    <Input
                                                        value={editHotelCity}
                                                        onChange={e => setEditHotelCity(e.target.value)}
                                                        placeholder="City"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-500">Status</Label>
                                                    <Select value={editHotelStatus} onValueChange={setEditHotelStatus}>
                                                        <SelectTrigger className="mt-1 bg-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {HOTEL_STATUSES.map(s => (
                                                                <SelectItem key={s} value={s}>{s}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="ghost" onClick={() => setEditingHotelId(null)}>
                                                    <Ban className="h-3 w-3 mr-1" /> Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveHotel(hotel.id)}
                                                    disabled={saving}
                                                    className="bg-indigo-600 hover:bg-indigo-700"
                                                >
                                                    <Save className="h-3 w-3 mr-1" /> Save
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* View Mode */
                                        <div className="flex items-center justify-between gap-4">
                                            <button
                                                onClick={() => setExpandedHotelId(isExpanded ? null : hotel.id)}
                                                className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                                            >
                                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                                                    <Building2 className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-sm text-slate-900">{hotel.name}</span>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] px-1.5 py-0 ${HOTEL_STATUS_COLORS[hotel.status] || 'bg-slate-100 text-slate-600'}`}
                                                        >
                                                            {hotel.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                                        <span className="flex items-center gap-1">
                                                            <MapPin className="h-3 w-3" />
                                                            {hotel.city}
                                                        </span>
                                                        {isExpanded && (
                                                            <>
                                                                <span className="flex items-center gap-1">
                                                                    <BedDouble className="h-3 w-3" />
                                                                    {roomCount} rooms
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <BedSingle className="h-3 w-3" />
                                                                    {dormCount} dorms
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className="ml-auto shrink-0">
                                                    {isExpanded
                                                        ? <ChevronUp className="h-4 w-4 text-slate-400" />
                                                        : <ChevronDown className="h-4 w-4 text-slate-400" />
                                                    }
                                                </span>
                                            </button>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => { e.stopPropagation(); startEditingHotel(hotel) }}
                                                    className="text-slate-500 hover:text-indigo-600"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => { e.stopPropagation(); setDeleteHotelTarget(hotel) }}
                                                    className="text-slate-400 hover:text-red-600"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Expanded: Units */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50">
                                        {/* Units header */}
                                        <div className="px-4 py-3 flex items-center justify-between">
                                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                                Units ({units.length})
                                            </h3>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setAddUnitHotelId(isAddingUnit ? null : hotel.id)}
                                                className="h-7 text-xs"
                                            >
                                                {isAddingUnit
                                                    ? <><ChevronUp className="h-3 w-3 mr-1" /> Close</>
                                                    : <><Plus className="h-3 w-3 mr-1" /> Add Unit</>
                                                }
                                            </Button>
                                        </div>

                                        {/* Add unit form */}
                                        {isAddingUnit && (
                                            <div className="mx-4 mb-3 p-3 rounded-lg border border-indigo-200 bg-white space-y-3">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Unit Number *</Label>
                                                        <Input
                                                            value={addUnitNumber}
                                                            onChange={e => setAddUnitNumber(e.target.value)}
                                                            placeholder="e.g. 101 or A1"
                                                            className="mt-1 h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Type</Label>
                                                        <Select value={addUnitType} onValueChange={setAddUnitType}>
                                                            <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {UNIT_TYPES.map(t => (
                                                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Base Price</Label>
                                                        <Input
                                                            type="number"
                                                            value={addUnitPrice}
                                                            onChange={e => setAddUnitPrice(e.target.value)}
                                                            placeholder={addUnitType === 'ROOM' ? '2000' : '400'}
                                                            className="mt-1 h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Max Guests</Label>
                                                        <Input
                                                            type="number"
                                                            min={1}
                                                            max={10}
                                                            value={addUnitMaxGuests}
                                                            onChange={(e) => setAddUnitMaxGuests(e.target.value)}
                                                            placeholder="3"
                                                            className="mt-1 h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div className="flex items-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={handleAddUnit}
                                                            disabled={saving || !addUnitNumber.trim()}
                                                            className="h-8 bg-indigo-600 hover:bg-indigo-700"
                                                        >
                                                            <Plus className="h-3 w-3 mr-1" /> Create
                                                        </Button>
                                                    </div>
                                                </div>
                                                {addUnitType === 'DORM' && (
                                                    <div className="w-48">
                                                        <Label className="text-xs text-slate-500">Bed Position</Label>
                                                        <Select value={addUnitBedPosition} onValueChange={setAddUnitBedPosition}>
                                                            <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="UPPER">Upper Bed</SelectItem>
                                                                <SelectItem value="LOWER">Lower Bed</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                                {addUnitType === 'ROOM' && (
                                                    <div className="space-y-1">
                                                        <Label className="text-xs">AC Type</Label>
                                                        <Select value={addUnitAcType} onValueChange={setAddUnitAcType}>
                                                            <SelectTrigger className="h-9">
                                                                <SelectValue placeholder="Select..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="AC">AC</SelectItem>
                                                                <SelectItem value="NON_AC">Non-AC</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Units list */}
                                        {loadingUnits === hotel.id ? (
                                            <div className="flex items-center justify-center py-8">
                                                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                            </div>
                                        ) : units.length === 0 ? (
                                            <div className="px-4 pb-4 text-center">
                                                <p className="text-xs text-slate-400 py-6">No units configured for this hotel.</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {units.map(u => {
                                                    const isEditingUnit = editingUnitId === u.id
                                                    return (
                                                        <div key={u.id} className="px-4 py-2.5 hover:bg-white/80 transition-colors">
                                                            {isEditingUnit ? (
                                                                /* Unit Edit Mode */
                                                                <div className="space-y-3">
                                                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                                                        <div>
                                                                            <Label className="text-xs text-slate-500">Unit Number</Label>
                                                                            <Input
                                                                                value={editUnitNumber}
                                                                                onChange={e => setEditUnitNumber(e.target.value)}
                                                                                className="mt-1 h-8 text-sm"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <Label className="text-xs text-slate-500">Type</Label>
                                                                            <Select value={editUnitType} onValueChange={setEditUnitType}>
                                                                                <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {UNIT_TYPES.map(t => (
                                                                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                        <div>
                                                                            <Label className="text-xs text-slate-500">Base Price</Label>
                                                                            <Input
                                                                                type="number"
                                                                                value={editUnitPrice}
                                                                                onChange={e => setEditUnitPrice(e.target.value)}
                                                                                className="mt-1 h-8 text-sm"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <Label className="text-xs text-slate-500">Max Guests</Label>
                                                                            <Input
                                                                                type="number"
                                                                                min={1}
                                                                                max={10}
                                                                                value={editUnitMaxGuests}
                                                                                onChange={(e) => setEditUnitMaxGuests(e.target.value)}
                                                                                placeholder="3"
                                                                                className="mt-1 h-8 text-sm"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <Label className="text-xs text-slate-500">Status</Label>
                                                                            <Select value={editUnitStatus} onValueChange={setEditUnitStatus}>
                                                                                <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    {UNIT_STATUSES.map(s => (
                                                                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                                                                    ))}
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>
                                                                        {editUnitType === 'DORM' && (
                                                                            <div>
                                                                                <Label className="text-xs text-slate-500">Bed Position</Label>
                                                                                <Select value={editUnitBedPosition} onValueChange={setEditUnitBedPosition}>
                                                                                    <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                                                                                        <SelectValue placeholder="Select..." />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="UPPER">Upper Bed</SelectItem>
                                                                                        <SelectItem value="LOWER">Lower Bed</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </div>
                                                                        )}
                                                                        {editUnitType === 'ROOM' && (
                                                                            <div>
                                                                                <Label className="text-xs text-slate-500">AC Type</Label>
                                                                                <Select value={editUnitAcType} onValueChange={setEditUnitAcType}>
                                                                                    <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                                                                                        <SelectValue placeholder="Select..." />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="AC">AC</SelectItem>
                                                                                        <SelectItem value="NON_AC">Non-AC</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </div>
                                                                        )}
                                                                        {editUnitStatus === 'MAINTENANCE' && (
                                                                            <div>
                                                                                <Label className="text-xs text-slate-500">Reason</Label>
                                                                                <Input
                                                                                    value={editUnitMaintenance}
                                                                                    onChange={e => setEditUnitMaintenance(e.target.value)}
                                                                                    placeholder="Maintenance reason"
                                                                                    className="mt-1 h-8 text-sm"
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button size="sm" variant="ghost" onClick={() => setEditingUnitId(null)} className="h-7 text-xs">
                                                                            <Ban className="h-3 w-3 mr-1" /> Cancel
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            onClick={() => handleSaveUnit(u)}
                                                                            disabled={saving}
                                                                            className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700"
                                                                        >
                                                                            <Save className="h-3 w-3 mr-1" /> Save
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* Unit View Mode */
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 shrink-0">
                                                                            {u.type === 'DORM'
                                                                                ? <BedSingle className="h-3.5 w-3.5 text-violet-500" />
                                                                                : <BedDouble className="h-3.5 w-3.5 text-emerald-500" />
                                                                            }
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="font-bold text-sm text-slate-800">
                                                                                    <Hash className="h-3 w-3 inline text-slate-400" />{u.unit_number}
                                                                                </span>
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className={`text-[9px] px-1.5 py-0 ${u.type === 'DORM' ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}
                                                                                >
                                                                                    {u.type}
                                                                                </Badge>
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className={`text-[9px] px-1.5 py-0 ${UNIT_STATUS_COLORS[u.status] || 'bg-slate-100 text-slate-600'}`}
                                                                                >
                                                                                    {u.status === 'MAINTENANCE' && <Wrench className="h-2.5 w-2.5 mr-0.5" />}
                                                                                    {u.status === 'AVAILABLE' && <Sparkles className="h-2.5 w-2.5 mr-0.5" />}
                                                                                    {u.status.replace('_', ' ')}
                                                                                </Badge>
                                                                            </div>
                                                                            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                                                                <span className="flex items-center gap-0.5">
                                                                                    <IndianRupee className="h-3 w-3" />
                                                                                    {Number(u.base_price).toLocaleString('en-IN')}
                                                                                </span>
                                                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                                                    Max {u.max_guests} guests
                                                                                </span>
                                                                                {u.bed_position && (
                                                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                                                                        {u.bed_position === 'UPPER' ? 'Upper Bed' : 'Lower Bed'}
                                                                                    </span>
                                                                                )}
                                                                                {u.type === 'ROOM' && u.ac_type && (
                                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                                        u.ac_type === 'AC' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                                                                                    }`}>
                                                                                        {u.ac_type === 'AC' ? 'AC' : 'Non-AC'}
                                                                                    </span>
                                                                                )}
                                                                                {u.maintenance_reason && (
                                                                                    <span className="text-[10px] text-amber-600 truncate max-w-[200px]" title={u.maintenance_reason}>
                                                                                        {u.maintenance_reason}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => startEditingUnit(u)}
                                                                            className="h-7 w-7 p-0 text-slate-500 hover:text-indigo-600"
                                                                        >
                                                                            <Pencil className="h-3 w-3" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => setDeleteUnitTarget(u)}
                                                                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                                                        >
                                                                            <Trash2 className="h-3 w-3" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Delete Hotel Confirmation */}
            <Dialog open={!!deleteHotelTarget} onOpenChange={open => { if (!open) setDeleteHotelTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Hotel</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteHotelTarget?.name}</strong> ({deleteHotelTarget?.city})?
                            All associated data must be removed first. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteHotelTarget(null)} disabled={saving}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteHotel} disabled={saving}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Unit Confirmation */}
            <Dialog open={!!deleteUnitTarget} onOpenChange={open => { if (!open) setDeleteUnitTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Unit</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete unit <strong>{deleteUnitTarget?.unit_number}</strong> ({deleteUnitTarget?.type})?
                            Units with active bookings cannot be deleted. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteUnitTarget(null)} disabled={saving}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteUnit} disabled={saving}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
