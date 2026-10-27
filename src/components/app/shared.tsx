'use client'

// ============================================================
// Konteks aplikasi + komponen bersama
// ============================================================

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { SessionUser, RTSettings } from './types'
import { can } from '@/lib/permissions'

export interface AppContextValue {
  user: SessionUser
  permissions: string[]
  settings: RTSettings
  navigate: (view: string) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppContext')
  return ctx
}

export function useCan() {
  const { permissions } = useApp()
  return (permission: string) =>
    permissions.includes('*') || permissions.includes(permission)
}

// ---------- Komponen kecil bersama ----------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${color}`}>
      {label}
    </span>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint ? <p className="text-xs text-muted-foreground mt-1 max-w-md">{hint}</p> : null}
    </div>
  )
}

export function LoadingBox() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Memuat" />
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string
  children: ReactNode
  hint?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium leading-none">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
