'use client'

// ============================================================
// Kas RT Online — Entri Aplikasi (SPA)
// Sesi diperiksa via /api/auth/me; login ditampilkan bila belum masuk.
// ============================================================

import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LoginView from '@/components/app/LoginView'
import AppShell from '@/components/app/AppShell'
import { LoadingBox } from '@/components/app/shared'
import type { SessionUser, RTSettings } from '@/components/app/types'
import { apiGet } from '@/lib/api-client'

interface MeResponse {
  user: SessionUser
  permissions: string[]
  settings: RTSettings
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
  },
})

function Root() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet<MeResponse>('/api/auth/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingBox />
      </div>
    )
  }

  if (!me) {
    return (
      <LoginView
        onSuccess={async () => {
          // Setelah login, ambil ulang profil lengkap (termasuk pengaturan RT)
          try {
            const full = await apiGet<MeResponse>('/api/auth/me')
            setMe(full)
          } catch {
            setMe(null)
          }
        }}
      />
    )
  }

  return (
    <AppShell
      key={me.user.id}
      ctx={{ user: me.user, permissions: me.permissions, settings: me.settings }}
      onLogout={() => setMe(null)}
    />
  )
}

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  )
}
