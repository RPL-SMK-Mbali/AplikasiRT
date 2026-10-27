'use client'

// ============================================================
// Dashboard role-aware
// - Pengurus: saldo kas, status periode, statistik keuangan & rapat
// - Warga: undangan mendatang, tombol konfirmasi, notulen publik
// ============================================================

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, CalendarDays,
  ClipboardCheck, FileText, AlertTriangle, Clock, CheckCircle2, BellRing,
} from 'lucide-react'
import { useApp, useCan, PageHeader, StatusBadge, LoadingBox, ErrorBox } from './shared'
import type { MeetingRow, NotificationRow, TransactionRow, ActionItemRow } from './types'
import { apiGet, apiPut } from '@/lib/api-client'
import { formatRupiah, formatDate, formatDateTime } from '@/lib/format'
import { PERIOD_STATUS, TX_TYPE, RESPONSE_STATUS } from '@/lib/labels'

interface DashboardPengurus {
  role: 'PENGURUS'
  balance: number
  currentPeriod: { id: string; code: string; name: string; status: string } | null
  draftTxCount: number
  unreconciled: number
  invitationStats: { draft: number; pendingApproval: number; published: number }
  minutesStats: { draft: number; pendingReview: number; published: number }
  actionStats: { notStarted: number; inProgress: number; completed: number; overdue: number }
  pendingResponses: number
  upcomingMeetings: MeetingRow[]
  recentTransactions: TransactionRow[]
  recentArchives: MeetingRow[]
}

interface DashboardWarga {
  role: 'WARGA'
  upcomingMeetings: MeetingRow[]
  publicMinutes: { id: string; minutesNumber: string; publishedAt: string; meeting: { id: string; title: string; meetingDate: string } }[]
  publicDecisions: { id: string; decision: string; meeting: { title: string } }[]
  myAttendance: { id: string; responseStatus: string; meeting: { id: string; title: string; meetingDate: string; status: string } }[]
  myActionItems: ActionItemRow[]
}

export default function DashboardView() {
  const { user, settings, navigate } = useApp()
  const can = useCan()

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiGet<DashboardPengurus | DashboardWarga>('/api/dashboard'),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  if (!data) return null

  const isWarga = data.role === 'WARGA'
  const d = data as DashboardPengurus

  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${user.name.split(' ')[0]}`}
        description={
          isWarga
            ? `Portal warga RT ${settings.nomorRT} — lihat undangan, konfirmasi kehadiran, dan hasil rapat.`
            : `Ringkasan keuangan dan kegiatan RT ${settings.nomorRT} / RW ${settings.nomorRW} sesuai hak akses Anda.`
        }
      />

      {isWarga ? (
        <WargaDashboard w={data as DashboardWarga} navigate={navigate} />
      ) : (
        <div className="space-y-6">
          {/* Kartu ringkasan keuangan */}
          <div className="summary-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Kas Saat Ini</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatRupiah(d.balance)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Saldo awal + pemasukan − pengeluaran (POSTED)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Periode Berjalan</CardTitle>
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {d.currentPeriod ? (
                  <>
                    <p className="text-lg font-semibold">{d.currentPeriod.name}</p>
                    <StatusBadge
                      label={PERIOD_STATUS[d.currentPeriod.status]?.label ?? d.currentPeriod.status}
                      color={PERIOD_STATUS[d.currentPeriod.status]?.color ?? ''}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Belum ada periode akuntansi</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Transaksi Draft</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{d.draftTxCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Menunggu diposting</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rekonsiliasi Perlu Tindak</CardTitle>
                <AlertTriangle className={`h-4 w-4 ${d.unreconciled > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${d.unreconciled > 0 ? 'text-destructive' : ''}`}>{d.unreconciled}</p>
                <p className="text-xs text-muted-foreground mt-1">Selisih belum diselesaikan</p>
              </CardContent>
            </Card>
          </div>

          {/* Statistik rapat */}
          <div className="summary-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="Undangan Diterbitkan"
              value={d.invitationStats.published}
              hint={`${d.invitationStats.draft} draft, ${d.invitationStats.pendingApproval} menunggu persetujuan`}
            />
            <StatCard
              icon={<FileText className="h-4 w-4" />}
              label="Notulen Diterbitkan"
              value={d.minutesStats.published}
              hint={`${d.minutesStats.draft} draft, ${d.minutesStats.pendingReview} menunggu pemeriksaan`}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Tugas Selesai"
              value={d.actionStats.completed}
              hint={`${d.actionStats.notStarted + d.actionStats.inProgress} belum selesai`}
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Tugas Lewat Tenggat"
              value={d.actionStats.overdue}
              hint={`${d.pendingResponses} peserta belum mengonfirmasi`}
              danger={d.actionStats.overdue > 0}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Rapat mendatang */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base font-semibold">Rapat Mendatang</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate('rapat')}>Lihat semua</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.upcomingMeetings.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Belum ada rapat terjadwal</p>
                ) : (
                  d.upcomingMeetings.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(m.meetingDate)} · {m.startTime} WIB · {m.location}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate(`rapat-detail:${m.id}`)}>
                        Buka
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Transaksi terbaru */}
            {can('ledger.view') ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base font-semibold">Transaksi Terbaru</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('ledger')}>Ledger</Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {d.recentTransactions.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">Belum ada transaksi terposting</p>
                  ) : (
                    d.recentTransactions.slice(0, 6).map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          {t.type === 'INCOME' ? (
                            <ArrowDownCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <ArrowUpCircle className="h-4 w-4 shrink-0 text-rose-600" />
                          )}
                          <span className="truncate">{t.description}</span>
                        </div>
                        <span className={`shrink-0 font-medium ${t.type === 'INCOME' ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {t.type === 'INCOME' ? '+' : '−'}{formatRupiah(t.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Aksi cepat pengurus */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Pintasan</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {can('opening_balance.create') ? (
                <Button variant="outline" onClick={() => navigate('saldo-awal')}>Kelola Saldo Awal</Button>
              ) : null}
              {can('accounting_period.create') ? (
                <Button variant="outline" onClick={() => navigate('periode-akuntansi')}>Kelola Periode</Button>
              ) : null}
              {can('transaction.create') ? (
                <Button variant="outline" onClick={() => navigate('transaksi')}>Catat Transaksi</Button>
              ) : null}
              {can('meeting.create') ? (
                <Button variant="outline" onClick={() => navigate('rapat')}>Buat Undangan Rapat</Button>
              ) : null}
              {can('report.view') ? (
                <Button variant="outline" onClick={() => navigate('laporan')}>Lihat Laporan</Button>
              ) : null}
              {can('audit.view') ? (
                <Button variant="outline" onClick={() => navigate('audit-log')}>Audit Log</Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon, label, value, hint, danger,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint?: string
  danger?: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${danger ? 'text-destructive' : ''}`}>{value}</p>
        {hint ? <p className="text-xs text-muted-foreground mt-1">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

function WargaDashboard({
  w, navigate,
}: {
  w: DashboardWarga
  navigate: (v: string) => void
}) {
  const { user } = useApp()
  const qc = useQueryClient()
  const [busy, setBusy] = useState('')

  async function confirm(meetingId: string, status: string) {
    setBusy(meetingId)
    try {
      await fetch(`/api/meetings/${meetingId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseStatus: status }),
      })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-6">
      {/* Undangan mendatang */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Undangan Rapat Mendatang
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {w.upcomingMeetings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada undangan rapat mendatang</p>
          ) : (
            w.upcomingMeetings.map((m) => {
              const my = w.myAttendance.find((a) => a.meeting.id === m.id)
              return (
                <div key={m.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{m.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatDate(m.meetingDate)} · {m.startTime}{m.endTime ? `–${m.endTime}` : ''} WIB · {m.location}
                      </p>
                    </div>
                    {my ? (
                      <StatusBadge
                        label={RESPONSE_STATUS[my.responseStatus]?.label ?? my.responseStatus}
                        color={RESPONSE_STATUS[my.responseStatus]?.color ?? ''}
                      />
                    ) : null}
                  </div>
                  {m.invitation?.status === 'PUBLISHED' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy === m.id || my?.responseStatus === 'HADIR'}
                        onClick={() => confirm(m.id, 'HADIR')}
                      >
                        Konfirmasi Hadir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === m.id || my?.responseStatus === 'TIDAK_HADIR'}
                        onClick={() => confirm(m.id, 'TIDAK_HADIR')}
                      >
                        Tidak Hadir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === m.id || my?.responseStatus === 'BELUM_PASTI'}
                        onClick={() => confirm(m.id, 'BELUM_PASTI')}
                      >
                        Belum Pasti
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`rapat-detail:${m.id}`)}>
                        Detail
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Notulen publik */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" /> Notulen Publik Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {w.publicMinutes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Belum ada notulen yang diterbitkan</p>
            ) : (
              <>
                {w.publicMinutes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => navigate(`rapat-detail:${n.meeting.id}`)}
                    className="block w-full rounded-md border p-3 text-left hover:bg-accent transition-colors"
                  >
                    <p className="text-sm font-medium">{n.meeting.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {n.minutesNumber} · Diterbitkan {formatDate(n.publishedAt)}
                    </p>
                  </button>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Keputusan yang diumumkan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Keputusan yang Diumumkan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {w.publicDecisions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Belum ada keputusan yang diumumkan</p>
            ) : (
              w.publicDecisions.map((dec, i) => (
                <div key={dec.id} className="rounded-md border p-3">
                  <p className="text-sm">
                    <span className="font-semibold">{i + 1}. </span>
                    {dec.decision}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Dari rapat: {dec.meeting.title}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tugas milik warga */}
      {w.myActionItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Tugas Tindak Lanjut untuk Anda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {w.myActionItems.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.dueDate ? `Tenggat: ${formatDate(a.dueDate)}` : 'Tanpa tenggat'}
                    {a.meeting ? ` · ${a.meeting.title}` : ''}
                  </p>
                </div>
                <Badge variant="outline">{a.status === 'COMPLETED' ? 'Selesai' : a.status === 'IN_PROGRESS' ? 'Berjalan' : 'Belum Dimulai'}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Notifikasi terbaru */}
      <NotifHint user={user.name} />
    </div>
  )
}

function NotifHint({ user }: { user: string }) {
  const { data } = useQuery({
    queryKey: ['notifications', 'dash'],
    queryFn: () => apiGet<{ notifications: NotificationRow[]; unread: number }>('/api/notifications'),
  })
  const qc = useQueryClient()
  if (!data || data.unread === 0) return null
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          {data.unread} notifikasi belum dibaca
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Separator className="mb-3" />
        <p className="text-xs text-muted-foreground mb-2">
          Notifikasi terbaru untuk {user} ada di ikon lonceng pada bilah atas.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await apiPut('/api/notifications', { all: true }).catch(() => null)
            qc.invalidateQueries({ queryKey: ['notifications', 'dash'] })
          }}
        >
          Tandai semua dibaca
        </Button>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Pemberitahuan terakhir: {data.notifications[0] ? formatDateTime(data.notifications[0].createdAt) : '-'}
        </p>
      </CardContent>
    </Card>
  )
}
