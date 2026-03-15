import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PrintTrigger from './PrintTrigger'
import { Building2, Phone, MapPin } from 'lucide-react'

interface InvoicePageProps {
    params: Promise<{ id: string }>
}

function formatDate(dateString: string | null) {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export default async function InvoicePage(props: InvoicePageProps) {
    const params = await props.params;
    const bookingId = params.id

    const supabase = await createClient()

    const { data: booking, error } = await supabase
        .from('bookings')
        .select(`
            *,
            unit:units (
                unit_number,
                type,
                base_price
            ),
            guests (
                name,
                phone
            ),
            payments (
                amount_cash,
                amount_digital,
                total_paid,
                created_at
            )
        `)
        .eq('id', bookingId)
        .single()

    if (error || !booking) {
        notFound()
    }

    const primaryGuest = booking.guests?.[0] || { name: 'Unknown', phone: '—' }

    const advanceAmount = Number(booking.advance_amount) || 0
    const paymentsArray = Array.isArray(booking.payments) ? booking.payments : (booking.payments ? [booking.payments] : [])
    const paymentsTotal = paymentsArray.reduce((sum: number, p: { total_paid: number }) => sum + Number(p.total_paid), 0)
    const totalPaid = advanceAmount + paymentsTotal
    const balanceDue = Math.max(0, Number(booking.grand_total) - totalPaid)

    return (
        <div className="mx-auto max-w-4xl p-8 sm:p-12">
            <PrintTrigger />
            
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-start gap-8 border-b-2 border-slate-900 pb-8">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">
                        Invoice
                    </h1>
                    <p className="text-slate-500 font-medium mt-1 uppercase tracking-widest text-sm">
                        Original Copy
                    </p>
                </div>
                
                <div className="text-right flex flex-col items-end">
                    <div className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900 mb-2">
                        <Building2 className="h-6 w-6 text-blue-600" />
                        Fajo Rooms
                    </div>
                    <div className="text-sm text-slate-600 space-y-1 text-right">
                        <p className="flex items-center justify-end gap-1.5 hover:text-slate-900">
                            <MapPin className="h-3.5 w-3.5" />
                            Stadium Link Rd, Kaloor, Kochi, Kerala 682017
                        </p>
                        <p className="flex items-center justify-end gap-1.5 hover:text-slate-900 font-medium">
                            <Phone className="h-3.5 w-3.5" />
                            +91 75590 49090
                        </p>
                    </div>
                </div>
            </header>

            {/* Meta Info */}
            <div className="grid grid-cols-2 gap-8 py-8">
                <div>
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        Billed To
                    </h2>
                    <p className="text-lg font-bold text-slate-900">{primaryGuest.name}</p>
                    <p className="text-sm text-slate-600 mt-1">{primaryGuest.phone}</p>
                    {booking.guests && booking.guests.length > 1 && (
                        <p className="text-xs text-slate-500 mt-1">
                            + {booking.guests.length - 1} additional guest(s)
                        </p>
                    )}
                </div>
                <div className="text-right">
                    <div className="mb-4">
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Invoice Number
                        </h2>
                        <p className="text-sm font-semibold text-slate-900 font-mono">
                            INV-{booking.id.split('-')[0].toUpperCase()}
                        </p>
                    </div>
                    <div>
                        <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Date of Issue
                        </h2>
                        <p className="text-sm font-semibold text-slate-900">
                            {formatDate(new Date().toISOString())}
                        </p>
                    </div>
                </div>
            </div>

            {/* Stay Details */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-6 mb-8 print:border-slate-300">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                    <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            {booking.unit?.type === 'DORM' ? 'Dormitory' : 'Room Number'}
                        </h3>
                        <p className="text-lg font-bold text-slate-900">
                            {booking.unit?.unit_number || 'N/A'}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Total Guests
                        </h3>
                        <p className="text-lg font-bold text-slate-900">
                            {booking.guest_count}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Check-In Time
                        </h3>
                        <p className="text-sm font-bold text-slate-900">
                            {formatDate(booking.check_in)}
                        </p>
                    </div>
                    <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Check-Out Time
                        </h3>
                        <p className="text-sm font-bold text-slate-900">
                            {formatDate(booking.check_out)}
                        </p>
                    </div>
                </div>
            </div>

            {/* Financial Breakdown Table */}
            <div className="mb-12">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-900">
                            <th className="py-4 text-[11px] font-bold uppercase tracking-wider text-slate-900">Description</th>
                            <th className="py-4 text-[11px] font-bold uppercase tracking-wider text-slate-900 text-right">Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        <tr>
                            <td className="py-4 font-medium text-slate-900">
                                Base Accommodation Charge 
                                <span className="block text-xs text-slate-500 font-normal mt-0.5">Primary rate for {booking.unit?.type === 'DORM' ? 'bed' : 'room'} booking</span>
                            </td>
                            <td className="py-4 font-semibold text-slate-900 text-right">
                                {(Number(booking.base_amount)).toLocaleString('en-IN')}
                            </td>
                        </tr>

                        {Number(booking.surcharge) > 0 && (
                            <tr>
                                <td className="py-4 font-medium text-slate-900">
                                    Extra Guest Surcharge
                                    <span className="block text-xs text-slate-500 font-normal mt-0.5">Surcharge for group sizes exceeding standard occupancy</span>
                                </td>
                                <td className="py-4 font-semibold text-slate-900 text-right">
                                    {Number(booking.surcharge).toLocaleString('en-IN')}
                                </td>
                            </tr>
                        )}

                    </tbody>
                </table>
            </div>

            {/* Totals Section */}
            <div className="flex justify-end pt-4">
                <div className="w-full sm:w-1/2 md:w-1/3">
                    <div className="flex justify-between items-center py-2 text-slate-600">
                        <span className="font-semibold text-sm">Subtotal</span>
                        <span className="font-semibold text-sm">₹{Number(booking.grand_total).toLocaleString('en-IN')}</span>
                    </div>
                    {advanceAmount > 0 && (
                        <div className="flex justify-between items-center py-2 text-slate-600">
                            <span className="font-semibold text-sm">Advance Paid</span>
                            <span className="font-semibold text-sm">- ₹{advanceAmount.toLocaleString('en-IN')}</span>
                        </div>
                    )}
                    {paymentsTotal > 0 && (
                        <div className="flex justify-between items-center py-2 text-slate-600">
                            <span className="font-semibold text-sm">Payments Made</span>
                            <span className="font-semibold text-sm">- ₹{paymentsTotal.toLocaleString('en-IN')}</span>
                        </div>
                    )}
                    
                    <div className="mt-4 border-t-2 border-slate-900 pt-4 flex justify-between items-center">
                        <span className="text-lg font-black tracking-tight text-slate-900">
                            {balanceDue > 0 ? 'Balance Due' : 'Paid in Full'}
                        </span>
                        <span className={`text-2xl font-black ${balanceDue > 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                            ₹{balanceDue.toLocaleString('en-IN')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-slate-200 text-center">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">
                    Thank you for staying at Fajo Rooms!
                </p>
                <p className="text-xs text-slate-400 mt-2">
                    This is a computer-generated invoice and requires no physical signature.
                </p>
            </div>
        </div>
    )
}
