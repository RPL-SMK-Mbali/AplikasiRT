'use client'

// ============================================================
// Kerangka aplikasi — sidebar role-aware, header, notifikasi,
// dan perpindahan tampilan (SPA internal)
// ============================================================

import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, Wallet, CalendarRange, ArrowLeftRight, PiggyBank,
  BookOpen, Scale, BarChart3, Users, CalendarDays, ClipboardList, Archive,
  Bell, LogOut, Menu, Settings, ShieldCheck, Home, Landmark, FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AppContext, useApp, useCan, type AppContextValue } from './shared'
import type { SessionUser, RTSettings, NotificationRow } from './types'
import { ROLE_LABEL } from '@/lib/permissions'
import { apiGet, apiPut } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import DashboardView from './DashboardView'
import OpeningBalancesView from './OpeningBalancesView'
import PeriodsView from './PeriodsView'
import TransactionsView from './TransactionsView'
import IuranView from './IuranView'
import LedgerView from './LedgerView'
import ReconciliationView from './ReconciliationView'
import ReportsView from './ReportsView'
import MeetingsView from './MeetingsView'
import MeetingDetailView from './MeetingDetailView'
import ActionItemsView from './ActionItemsView'
import ArchivesView from './ArchivesView'
import ResidentsView from './ResidentsView'
import UsersView from './UsersView'
import SettingsView from './SettingsView'
import AuditLogView from './AuditLogView'
import PublicMinutesView from './PublicMinutesView'

interface NavItem {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
  group: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Beranda', icon: Home, group: 'UTAMA' },
  // KEUANGAN
  { key: 'saldo-awal', label: 'Saldo Awal', icon: Wallet, permission: 'opening_balance.view', group: 'KEUANGAN' },
  { key: 'periode-akuntansi', label: 'Periode Akuntansi', icon: CalendarRange, permission: 'accounting_period.view', group: 'KEUANGAN' },
  { key: 'transaksi', label: 'Transaksi', icon: ArrowLeftRight, permission: 'transaction.view', group: 'KEUANGAN' },
  { key: 'iuran', label: 'Iuran & Pembayaran', icon: PiggyBank, permission: 'transaction.view', group: 'KEUANGAN' },
  { key: 'ledger', label: 'Ledger', icon: BookOpen, permission: 'ledger.view', group: 'KEUANGAN' },
  { key: 'rekonsiliasi', label: 'Rekonsiliasi Kas', icon: Scale, permission: 'reconciliation.view', group: 'KEUANGAN' },
  { key: 'laporan', label: 'Laporan', icon: BarChart3, permission: 'report.view', group: 'KEUANGAN' },
  // MANAJEMEN RAPAT
  { key: 'rapat', label: 'Agenda & Undangan', icon: CalendarDays, permission: 'meeting.view', group: 'MANAJEMEN RAPAT' },
  { key: 'tindak-lanjut', label: 'Tindak Lanjut', icon: ClipboardList, permission: 'meeting_action_item.view', group: 'MANAJEMEN RAPAT' },
  { key: 'arsip-rapat', label: 'Arsip Rapat', icon: Archive, permission: 'meeting.view_all', group: 'MANAJEMEN RAPAT' },
  // KEGIATAN RT (warga)
  { key: 'notulen-publik', label: 'Notulen Publik', icon: FileText, permission: 'meeting_minutes.view_public', group: 'KEGIATAN RT' },
  // ADMINISTRASI
  { key: 'warga', label: 'Data Warga', icon: Users, permission: 'resident.view', group: 'ADMINISTRASI' },
  { key: 'pengguna', label: 'Pengguna & Hak Akses', icon: ShieldCheck, permission: 'user.manage', group: 'ADMINISTRASI' },
  { key: 'pengaturan', label: 'Pengaturan RT', icon: Settings, permission: 'settings.manage', group: 'ADMINISTRASI' },
  { key: 'audit-log', label: 'Audit Log', icon: Landmark, permission: 'audit.view', group: 'ADMINISTRASI' },
]

function NavList({
  groups, view, onNavigate,
}: {
  groups: { name: string; items: NavItem[] }[]
  view: string
  onNavigate: (key: string) => void
}) {
  return (
    <div className="space-y-4 py-2">
      {groups.map((g) => (
        <div key={g.name}>
          {g.name !== 'UTAMA' ? (
            <p className="px-3 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground">{g.name}</p>
          ) : null}
          <div className="space-y-0.5">
            {g.items.map((item) => {
              const active = view === item.key || (item.key === 'rapat' && view.startsWith('rapat-detail:'))
              const Icon = item.icon
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-primary font-semibold text-primary-foreground shadow-md shadow-blue-600/20' : 'text-foreground/80 hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AppShell({
  ctx,
  onLogout,
}: {
  ctx: Omit<AppContextValue, 'navigate'>
  onLogout: () => void
}) {
  // navigate dijembatani via ref: state view hidup di ShellInner,
  // sementara seluruh konsumen konteks bisa memanggil navigate()
  const navigateRef = useRef<(v: string) => void>(() => {})
  const fullCtx: AppContextValue = {
    ...ctx,
    navigate: (v: string) => navigateRef.current(v),
  }

  return (
    <AppContext.Provider value={fullCtx}>
      <ShellInner onLogout={onLogout} registerNavigate={(fn) => (navigateRef.current = fn)} />
    </AppContext.Provider>
  )
}

function ShellInner({
  onLogout,
  registerNavigate,
}: {
  onLogout: () => void
  registerNavigate: (fn: (v: string) => void) => void
}) {
  const [view, setView] = useState('dashboard')
  const navigate = useCallback((v: string) => {
    setView(v)
    window.scrollTo({ top: 0 })
  }, [])
  registerNavigate(navigate)
  const { user, settings } = useApp()
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const can = useCan()
  const qc = useQueryClient()

  const notifQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<{ notifications: NotificationRow[]; unread: number }>('/api/notifications'),
    refetchInterval: 30000,
  })
  const notifications = notifQuery.data?.notifications ?? []
  const unread = notifQuery.data?.unread ?? 0

  async function markAllRead() {
    await apiPut('/api/notifications', { all: true }).catch(() => null)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function markRead(id: string, link?: string | null) {
    await apiPut('/api/notifications', { id }).catch(() => null)
    qc.invalidateQueries({ queryKey: ['notifications'] })
    if (link) {
      const [viewKey, meetingId] = link.split('/')
      setView(meetingId ? `rapat-detail:${meetingId}` : viewKey)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    onLogout()
  }

  const visibleNav = NAV_ITEMS.filter((n) => !n.permission || can(n.permission))

  const groups: { name: string; items: NavItem[] }[] = []
  for (const item of visibleNav) {
    let g = groups.find((x) => x.name === item.group)
    if (!g) {
      g = { name: item.group, items: [] }
      groups.push(g)
    }
    g.items.push(item)
  }

  function renderView() {
    if (view === 'dashboard') return <DashboardView />
    if (view === 'saldo-awal') return <OpeningBalancesView />
    if (view === 'periode-akuntansi') return <PeriodsView />
    if (view === 'transaksi') return <TransactionsView />
    if (view === 'iuran') return <IuranView />
    if (view === 'ledger') return <LedgerView />
    if (view === 'rekonsiliasi') return <ReconciliationView />
    if (view === 'laporan') return <ReportsView />
    if (view === 'rapat') return <MeetingsView />
    if (view === 'tindak-lanjut') return <ActionItemsView />
    if (view === 'arsip-rapat') return <ArchivesView />
    if (view === 'notulen-publik') return <PublicMinutesView />
    if (view === 'warga') return <ResidentsView />
    if (view === 'pengguna') return <UsersView />
    if (view === 'pengaturan') return <SettingsView />
    if (view === 'audit-log') return <AuditLogView />
    if (view.startsWith('rapat-detail:')) {
      const id = view.split(':')[1]
      return <MeetingDetailView meetingId={id} />
    }
    return <DashboardView />
  }

  return (
    <div className="app-surface min-h-screen flex flex-col">
      {/* Header */}
        <header className="app-header sticky top-0 z-40 border-b">
          <div className="flex h-14 items-center gap-3 px-4">
            {/* Mobile menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="app-sidebar w-72 p-0">
                <div className="flex h-14 items-center gap-2 border-b px-4">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Kas RT Online</span>
                </div>
                <ScrollArea className="h-[calc(100vh-3.5rem)] px-2">
                  <NavList groups={groups} view={view} onNavigate={(key) => { setView(key); setMobileOpen(false) }} />
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary hidden lg:block" />
              <div className="leading-tight">
                <p className="font-semibold text-sm">Kas RT Online</p>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  RT {settings.nomorRT} / RW {settings.nomorRW} — {settings.desa}
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Notifikasi */}
              <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Notifikasi">
                    <Bell className="h-5 w-5" />
                    {unread > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-96 max-w-[90vw]">
                  <div className="flex items-center justify-between px-3 py-2">
                    <p className="text-sm font-semibold">Notifikasi</p>
                    {unread > 0 ? (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                        Tandai semua dibaca
                      </Button>
                    ) : null}
                  </div>
                  <DropdownMenuSeparator />
                  <ScrollArea className="max-h-96">
                    {notifications.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada notifikasi</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id, n.link)}
                          className={`block w-full px-3 py-2.5 text-left hover:bg-accent transition-colors ${n.isRead ? '' : 'bg-primary/5'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm ${n.isRead ? 'font-normal' : 'font-semibold'}`}>{n.title}</p>
                            {!n.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                        </button>
                      ))
                    )}
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Profil */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 px-2.5" aria-label="Menu profil">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                      {user.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block text-xs font-semibold leading-tight">{user.name}</span>
                      <span className="block text-[10px] text-muted-foreground leading-tight">
                        {ROLE_LABEL[user.role] ?? user.role}
                      </span>
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[user.role] ?? user.role}
                      {user.resident ? ` — Rumah ${user.resident.houseNumber}` : ''}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <div className="flex flex-1">
          {/* Sidebar desktop */}
          <aside className="app-sidebar hidden lg:block w-64 shrink-0 border-r">
            <ScrollArea className="h-[calc(100vh-3.5rem)] sticky top-14 px-3">
              <NavList groups={groups} view={view} onNavigate={setView} />
            </ScrollArea>
          </aside>

          {/* Konten */}
          <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">{renderView()}</div>
          </main>
        </div>

        <footer className="border-t bg-background py-4">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-muted-foreground sm:flex-row">
            <p>
              Kas RT Online — RT {settings.nomorRT} RW {settings.nomorRW}, {settings.desa}
            </p>
            <p className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Zona waktu Asia/Jakarta</Badge>
              <span>Transparan sesuai hak akses</span>
            </p>
          </div>
        </footer>
    </div>
  )
}
