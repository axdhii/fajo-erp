"use client"
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { KeyRound, Mail } from 'lucide-react'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) throw error

            // Get role from the staff table
            const { data: staffData } = await supabase
                .from('staff')
                .select('role')
                .eq('user_id', data.user.id)
                .single()

            toast.success('Login successful')

            // Use hard navigation so the proxy/RSC picks up the fresh session cookies
            const role = staffData?.role
            if (role === 'Admin') {
                window.location.href = '/admin'
            } else if (role === 'HR') {
                window.location.href = '/hr'
            } else if (role === 'ZonalManager') {
                window.location.href = '/zonal'
            } else if (role === 'OpsManager') {
                window.location.href = '/ops'
            } else if (role === 'Housekeeping') {
                window.location.href = '/housekeeping'
            } else {
                window.location.href = '/front-desk'
            }

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Failed to login'
            toast.error(message)
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center h-12 w-12 mx-auto rounded-xl bg-emerald-600 text-white shadow-xl items-center">
                    <span className="font-bold text-2xl leading-none">F</span>
                </div>
                <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900">
                    Sign in to FAJO ERP
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    Hotel management system
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-[400px]">
                <Card className="border-slate-200/60 shadow-xl shadow-slate-200/50">
                    <form onSubmit={handleLogin}>
                        <CardContent className="pt-6 space-y-5">
                            <div className="space-y-2 relative">
                                <Label htmlFor="email">Email address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        required
                                        className="pl-9"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 relative">
                                <Label htmlFor="password">Password</Label>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="password"
                                        type="password"
                                        required
                                        className="pl-9"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" disabled={loading} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
                                {loading ? 'Signing in...' : 'Sign in'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>
        </div>
    )
}
