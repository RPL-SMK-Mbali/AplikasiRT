'use client'

// ============================================================
// Halaman Login
// ============================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiPost } from '@/lib/api-client'
import type { SessionUser } from './types'

interface LoginResponse {
  user: SessionUser
  permissions: string[]
}

const DEMO_ACCOUNTS = [
  { role: 'Admin RT', username: 'admin' },
  { role: 'Ketua RT', username: 'ketua' },
  { role: 'Sekretaris RT', username: 'sekretaris' },
  { role: 'Bendahara RT', username: 'bendahara' },
  { role: 'Warga', username: 'warga1' },
]

export default function LoginView({ onSuccess }: { onSuccess: (r: LoginResponse) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiPost<LoginResponse>('/api/auth/login', { username, password })
      onSuccess(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-surface min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 shadow-lg shadow-blue-600/25 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8 text-white">
              <path d="M3 21h18" />
              <path d="M5 21V7l7-4 7 4v14" />
              <path d="M9 21v-6h6v6" />
              <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-primary">Kas RT Online</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sistem Kas &amp; Manajemen Rapat RT — transparan, aman, dapat ditelusuri
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Masuk ke Aplikasi</CardTitle>
            <CardDescription>Gunakan akun yang diberikan Admin RT</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Nama Pengguna</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="misal: bendahara"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Kata Sandi</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kata sandi akun Anda"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2">{error}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Memproses...' : 'Masuk'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Akun Demo</CardTitle>
            <CardDescription className="text-xs">
              Sandi untuk semua akun demo: <span className="font-mono font-semibold">rt123456</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => {
                    setUsername(a.username)
                    setPassword('rt123456')
                  }}
                  className="rounded-md border px-3 py-2 text-left text-xs hover:bg-accent transition-colors"
                >
                  <span className="block font-medium">{a.role}</span>
                  <span className="text-muted-foreground font-mono">{a.username}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
