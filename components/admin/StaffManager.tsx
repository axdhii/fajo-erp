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
    Users,
    Plus,
    Pencil,
    Save,
    Trash2,
    Ban,
    Phone,
    Building2,
    Shield,
    UserPlus,
    ChevronUp,
    Camera,
} from 'lucide-react'

import type { AdminTabProps } from '@/app/(dashboard)/admin/client'
import type { SelfieRequest } from '@/lib/types'

interface StaffRow {
    id: string
    user_id: string | null
    hotel_id: string
    role: string
    name: string | null
    phone: string | null
    base_salary: number
}

const ALL_ROLES = [
    { value: 'Admin', label: 'Admin' },
    { value: 'FrontDesk', label: 'CRE' },
    { value: 'HR', label: 'HR' },
    { value: 'ZonalOps', label: 'Zonal Ops' },
    { value: 'ZonalHK', label: 'Zonal HK' },
]

const ROLE_COLORS: Record<string, string> = {
    Admin: 'bg-red-100 text-red-700 border-red-200',
    FrontDesk: 'bg-blue-100 text-blue-700 border-blue-200',
    HR: 'bg-violet-100 text-violet-700 border-violet-200',
    ZonalOps: 'bg-orange-100 text-orange-700 border-orange-200',
    ZonalHK: 'bg-teal-100 text-teal-700 border-teal-200',
}

export function StaffManager({ hotelId, hotels, staffId }: AdminTabProps) {
    const [staff, setStaff] = useState<StaffRow[]>([])
    const [loading, setLoading] = useState(false)

    // Filters
    const [filterRole, setFilterRole] = useState<string>('ALL')
    const [filterHotel, setFilterHotel] = useState<string>('ALL')

    // Inline edit state
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editPhone, setEditPhone] = useState('')
    const [editSalary, setEditSalary] = useState('')
    const [editRole, setEditRole] = useState('')
    const [editHotel, setEditHotel] = useState('')
    const [editPassword, setEditPassword] = useState('')

    // Add form state
    const [showAddForm, setShowAddForm] = useState(false)
    const [addName, setAddName] = useState('')
    const [addPhone, setAddPhone] = useState('')
    const [addRole, setAddRole] = useState('FrontDesk')
    const [addHotel, setAddHotel] = useState(hotelId || (hotels.length > 0 ? hotels[0].id : ''))
    const [addSalary, setAddSalary] = useState('')
    const [addPassword, setAddPassword] = useState('')

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null)

    // Selfie viewer
    const [selfieViewOpen, setSelfieViewOpen] = useState(false)
    const [selfieRequests, setSelfieRequests] = useState<SelfieRequest[]>([])
    const [loadingSelfies, setLoadingSelfies] = useState(false)

    // ── Fetch staff ──
    const fetchStaff = useCallback(async () => {
        let query = supabase
            .from('staff')
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .order('name', { ascending: true })

        if (filterHotel !== 'ALL') {
            query = query.eq('hotel_id', filterHotel)
        }
        if (filterRole !== 'ALL') {
            query = query.eq('role', filterRole)
        }

        const { data, error } = await query
        if (error) {
            console.error('Staff fetch error:', error)
            toast.error('Failed to load staff')
            return
        }
        setStaff(data || [])
    }, [filterRole, filterHotel])

    useEffect(() => {
        fetchStaff()
    }, [fetchStaff])

    // Update addHotel default when hotelId prop changes
    useEffect(() => {
        if (hotelId) setAddHotel(hotelId)
    }, [hotelId])

    // ── Inline edit: save ──
    const handleSaveEdit = async (sid: string) => {
        const phoneTrimmed = editPhone.trim()
        if (phoneTrimmed && !/^\d{10}$/.test(phoneTrimmed)) {
            toast.error('Phone must be exactly 10 digits')
            return
        }
        if (editPassword.trim() && editPassword.trim().length < 6) {
            toast.error('Password must be at least 6 characters')
            return
        }
        setLoading(true)
        try {
            const payload: Record<string, unknown> = {
                staff_id: sid,
                name: editName,
                phone: phoneTrimmed || null,
                base_salary: editSalary ? Number(editSalary) : 0,
                role: editRole,
                hotel_id: editHotel,
            }
            if (editPassword.trim()) {
                payload.password = editPassword.trim()
            }
            const res = await fetch('/api/admin/staff', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Staff updated')
            setEditingId(null)
            setEditPassword('')
            fetchStaff()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Update failed')
        } finally {
            setLoading(false)
        }
    }

    // ── Add staff ──
    const handleAddStaff = async () => {
        if (!addName.trim()) {
            toast.error('Name is required')
            return
        }
        const phoneTrimmed = addPhone.trim()
        if (!phoneTrimmed || !/^\d{10}$/.test(phoneTrimmed)) {
            toast.error('Phone must be exactly 10 digits')
            return
        }
        if (!addHotel) {
            toast.error('Select a hotel')
            return
        }
        const passwordTrimmed = addPassword.trim()
        if (passwordTrimmed && passwordTrimmed.length < 6) {
            toast.error('Password must be at least 6 characters')
            return
        }

        setLoading(true)
        try {
            const payload: Record<string, unknown> = {
                name: addName.trim(),
                phone: phoneTrimmed,
                role: addRole,
                hotel_id: addHotel,
                base_salary: addSalary ? Number(addSalary) : 0,
            }
            if (passwordTrimmed) {
                payload.password = passwordTrimmed
            }
            const res = await fetch('/api/admin/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            toast.success(`Staff member "${addName.trim()}" created`)
            // Reset form
            setAddName('')
            setAddPhone('')
            setAddRole('FrontDesk')
            setAddHotel(hotelId || (hotels.length > 0 ? hotels[0].id : ''))
            setAddSalary('')
            setAddPassword('')
            setShowAddForm(false)
            fetchStaff()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to create staff')
        } finally {
            setLoading(false)
        }
    }

    // ── Delete staff ──
    const handleDeleteStaff = async () => {
        if (!deleteTarget) return
        setLoading(true)
        try {
            const res = await fetch('/api/admin/staff', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staff_id: deleteTarget.id }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            toast.success(`Removed "${deleteTarget.name || deleteTarget.phone || 'staff member'}"`)
            setDeleteTarget(null)
            fetchStaff()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Delete failed')
        } finally {
            setLoading(false)
        }
    }

    // ── Request Selfie ──
    const handleRequestSelfie = async (targetStaffId: string, staffName: string | null) => {
        try {
            const res = await fetch('/api/selfie-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_staff_id: targetStaffId }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(`Selfie requested from ${staffName || 'staff'}`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to request selfie')
        }
    }

    // ── Fetch selfie requests ──
    const fetchSelfieRequests = async () => {
        if (!hotelId) return
        setLoadingSelfies(true)
        try {
            const res = await fetch(`/api/selfie-requests?hotel_id=${hotelId}`)
            if (res.ok) {
                const json = await res.json()
                setSelfieRequests(json.data || [])
            }
        } catch {
            // Silent fail
        }
        setLoadingSelfies(false)
    }

    // ── Helpers ──
    const getHotelName = (hid: string) => hotels.find(h => h.id === hid)?.name || 'Unknown'

    const startEditing = (s: StaffRow) => {
        setEditingId(s.id)
        setEditName(s.name || '')
        setEditPhone(s.phone || '')
        setEditSalary(String(s.base_salary || 0))
        setEditRole(s.role)
        setEditHotel(s.hotel_id)
        setEditPassword('')
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <Users className="h-6 w-6 text-violet-600" />
                        Staff Management
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">{staff.length} staff members across all properties</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { fetchSelfieRequests(); setSelfieViewOpen(true) }}
                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                    >
                        <Camera className="h-3.5 w-3.5 mr-1.5" />
                        Selfie Requests
                    </Button>
                    <Button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="bg-violet-600 hover:bg-violet-700"
                    >
                        {showAddForm ? <ChevronUp className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                        {showAddForm ? 'Close Form' : 'Add Staff'}
                    </Button>
                </div>
            </div>

            {/* Add Staff Form (collapsible) */}
            {showAddForm && (
                <Card className="border-violet-200 bg-violet-50/30">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-violet-600" />
                            New Staff Member
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Name *</Label>
                                <Input
                                    value={addName}
                                    onChange={e => setAddName(e.target.value)}
                                    placeholder="Full name"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Phone * (Login ID)</Label>
                                <Input
                                    value={addPhone}
                                    onChange={e => setAddPhone(e.target.value)}
                                    placeholder="10-digit phone number"
                                    maxLength={10}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Role *</Label>
                                <Select value={addRole} onValueChange={setAddRole}>
                                    <SelectTrigger className="mt-1 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ALL_ROLES.map(r => (
                                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Hotel *</Label>
                                <Select value={addHotel} onValueChange={setAddHotel}>
                                    <SelectTrigger className="mt-1 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {hotels.map(h => (
                                            <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Base Salary</Label>
                                <Input
                                    type="number"
                                    value={addSalary}
                                    onChange={e => setAddSalary(e.target.value)}
                                    placeholder="Monthly salary"
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Password</Label>
                                <Input
                                    type="password"
                                    value={addPassword}
                                    onChange={e => setAddPassword(e.target.value)}
                                    placeholder="Min 6 chars (optional)"
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <p className="text-xs text-slate-500 mt-1">
                            A login account will be created using the phone number. If password is left empty, the default is used (Admin: password123, Others: fajo123).
                        </p>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
                            <Button
                                onClick={handleAddStaff}
                                disabled={loading || !addName.trim() || !/^\d{10}$/.test(addPhone.trim())}
                                className="bg-violet-600 hover:bg-violet-700"
                            >
                                <Plus className="h-4 w-4 mr-1" />
                                Create Staff
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="w-48">
                    <Select value={filterRole} onValueChange={setFilterRole}>
                        <SelectTrigger className="bg-white border-slate-200">
                            <Shield className="h-4 w-4 mr-2 text-slate-400" />
                            <SelectValue placeholder="Filter by role" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Roles</SelectItem>
                            {ALL_ROLES.map(r => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="w-56">
                    <Select value={filterHotel} onValueChange={setFilterHotel}>
                        <SelectTrigger className="bg-white border-slate-200">
                            <Building2 className="h-4 w-4 mr-2 text-slate-400" />
                            <SelectValue placeholder="Filter by hotel" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Hotels</SelectItem>
                            {hotels.map(h => (
                                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Staff List */}
            <Card>
                <CardContent className="p-0">
                    {staff.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p>No staff members found matching your filters.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {staff.map(s => (
                                <div
                                    key={s.id}
                                    className="px-4 py-3 hover:bg-slate-50/50 transition-colors"
                                >
                                    {editingId === s.id ? (
                                        /* ── Edit Mode ── */
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                                <div>
                                                    <Label className="text-xs text-slate-500">Name</Label>
                                                    <Input
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        placeholder="Name"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-500">Phone</Label>
                                                    <Input
                                                        value={editPhone}
                                                        onChange={e => setEditPhone(e.target.value)}
                                                        placeholder="Phone"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-500">Salary</Label>
                                                    <Input
                                                        type="number"
                                                        value={editSalary}
                                                        onChange={e => setEditSalary(e.target.value)}
                                                        placeholder="Salary"
                                                        className="mt-1"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-500">Role</Label>
                                                    <Select value={editRole} onValueChange={setEditRole}>
                                                        <SelectTrigger className="mt-1 bg-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {ALL_ROLES.map(r => (
                                                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-500">Hotel</Label>
                                                    <Select value={editHotel} onValueChange={setEditHotel}>
                                                        <SelectTrigger className="mt-1 bg-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {hotels.map(h => (
                                                                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-slate-500">New Password (leave empty to keep current)</Label>
                                                    <Input
                                                        type="password"
                                                        value={editPassword}
                                                        onChange={(e) => setEditPassword(e.target.value)}
                                                        placeholder="Leave empty to keep current"
                                                        className="mt-1"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setEditingId(null)}
                                                >
                                                    <Ban className="h-3 w-3 mr-1" /> Cancel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveEdit(s.id)}
                                                    disabled={loading}
                                                    className="bg-violet-600 hover:bg-violet-700"
                                                >
                                                    <Save className="h-3 w-3 mr-1" /> Save
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ── View Mode ── */
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-slate-800 truncate">
                                                            {s.name || s.phone || '(Staff)'}
                                                        </span>
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[s.role] || 'bg-slate-100 text-slate-600'}`}
                                                        >
                                                            {ALL_ROLES.find(r => r.value === s.role)?.label || s.role}
                                                        </Badge>
                                                        {s.phone && (
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-200">
                                                                Login: {s.phone}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                                        <span className="flex items-center gap-1">
                                                            <Building2 className="h-3 w-3" />
                                                            {getHotelName(s.hotel_id)}
                                                        </span>
                                                        {s.phone && (
                                                            <span className="flex items-center gap-1">
                                                                <Phone className="h-3 w-3" />
                                                                {s.phone}
                                                            </span>
                                                        )}
                                                        <span className="font-medium text-slate-700">
                                                            ₹{Number(s.base_salary).toLocaleString('en-IN')}/mo
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRequestSelfie(s.id, s.name)}
                                                    className="text-slate-500 hover:text-amber-600"
                                                    title="Request Selfie"
                                                >
                                                    <Camera className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => startEditing(s)}
                                                    className="text-slate-500 hover:text-violet-600"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeleteTarget(s)}
                                                    className="text-slate-400 hover:text-red-600"
                                                    disabled={s.id === staffId}
                                                    title={s.id === staffId ? 'Cannot delete yourself' : 'Delete staff'}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Staff Member</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteTarget?.name || deleteTarget?.phone || '(Staff Member)'}</strong>?
                            {deleteTarget?.user_id && ' Their login account will also be removed.'}
                            {' '}This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteStaff}
                            disabled={loading}
                        >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Selfie Requests Viewer Dialog */}
            <Dialog open={selfieViewOpen} onOpenChange={setSelfieViewOpen}>
                <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Selfie Requests</DialogTitle>
                        <DialogDescription>View submitted selfies from staff</DialogDescription>
                    </DialogHeader>

                    {loadingSelfies ? (
                        <div className="text-center py-8 text-slate-400">Loading...</div>
                    ) : selfieRequests.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No selfie requests yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {selfieRequests.map(sr => (
                                <div key={sr.id} className="border rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <span className="text-sm font-bold text-slate-800">{sr.target?.name || 'Unknown'}</span>
                                            <span className="text-xs text-slate-400 ml-2">{sr.target?.role}</span>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            sr.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                                            sr.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                            'bg-slate-100 text-slate-500'
                                        }`}>
                                            {sr.status}
                                        </span>
                                    </div>
                                    {sr.reason && <p className="text-xs text-slate-500 mb-2">{sr.reason}</p>}
                                    {sr.photo_url && sr.status === 'COMPLETED' && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={sr.photo_url} alt={`Selfie from ${sr.target?.name}`} className="w-full max-h-64 object-contain rounded-lg border bg-slate-50" />
                                    )}
                                    <p className="text-[10px] text-slate-400 mt-2">
                                        {new Date(sr.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                                        {sr.completed_at && ` → Submitted ${new Date(sr.completed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}`}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
