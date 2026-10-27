'use client'

// ============================================================
// Agenda & Undangan Rapat — daftar rapat + buat undangan
// Nomor undangan otomatis: UND/RT05/2026/001
// ============================================================

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Search, Eye, Users } from 'lucide-react'
import { useApp, useCan, PageHeader, StatusBadge, LoadingBox, ErrorBox, EmptyState, Field } from './shared'
import type { MeetingRow, ResidentRow, RTSettings } from './types'
import { api, apiGet, apiPost } from '@/lib/api-client'
import { formatDate, dayName } from '@/lib/format'
import { INV_STATUS, MEETING_TYPE, MEETING_METHOD, SCOPE } from '@/lib/labels'
import { toast } from '@/hooks/use-toast'

export default function MeetingsView() {
  const { user, navigate } = useApp()
  const can = useCan()
  const qc = useQueryClient()
  const [tab, setTab] = useState('ALL')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['meetings', tab, q],
    queryFn: () => apiGet<MeetingRow[]>(`/api/meetings?${tab !== 'ALL' ? `status=${tab}&` : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  const rows = data ?? []

  return (
    <div>
      <PageHeader
        title={can('meeting.view_all') ? 'Agenda & Undangan Rapat' : 'Undangan Rapat'}
        description={
          can('meeting.view_all')
            ? 'Kelola siklus rapat: undangan → konfirmasi → daftar hadir → notulen → keputusan → tindak lanjut → arsip.'
            : 'Undangan rapat yang ditujukan kepada Anda. Silakan konfirmasi kehadiran sesuai batas waktu.'
        }
        actions={
          can('meeting.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Buat Undangan Rapat
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="ALL">Semua</TabsTrigger>
            {can('meeting.view_all') ? (
              <>
                <TabsTrigger value="SCHEDULED">Terjadwal</TabsTrigger>
                <TabsTrigger value="COMPLETED">Selesai</TabsTrigger>
                <TabsTrigger value="CANCELLED">Dibatalkan</TabsTrigger>
              </>
            ) : null}
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor/judul rapat..." className="pl-8" />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada rapat"
          hint={can('meeting.create') ? 'Buat undangan rapat pertama Anda. Nomor undangan dibuat otomatis (contoh: UND/RT05/2026/001).' : 'Undangan yang diterbitkan akan tampil di sini.'}
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((m) => {
            const myResponse = m.attendances?.[0]?.responseStatus
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-sm">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{m.title}</p>
                      <StatusBadge label={INV_STATUS[m.invitation?.status ?? '']?.label ?? '-'} color={INV_STATUS[m.invitation?.status ?? '']?.color ?? ''} />
                      {m.status === 'CANCELLED' ? <StatusBadge label="Dibatalkan" color="bg-rose-100 text-rose-700" /> : null}
                      {m.status === 'COMPLETED' ? <StatusBadge label="Rapat Selesai" color="bg-teal-100 text-teal-800" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {dayName(m.meetingDate)}, {formatDate(m.meetingDate)} · {m.startTime}{m.endTime ? `–${m.endTime}` : ''} WIB · {m.location} · {MEETING_METHOD[m.meetingMethod] ?? m.meetingMethod}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{m.invitation?.invitationNumber ?? m.meetingNumber}</span>
                      {' · '}{MEETING_TYPE[m.meetingType] ?? m.meetingType}
                      {m._count ? ` · ${m._count.attendances} peserta · ${m._count.decisions} keputusan · ${m._count.actionItems} tindak lanjut` : ''}
                    </p>
                    {myResponse && m.invitation?.status === 'PUBLISHED' ? (
                      <p className="mt-1 text-xs">
                        Konfirmasi Anda: <StatusBadge label={myResponse === 'HADIR' ? 'Hadir' : myResponse === 'TIDAK_HADIR' ? 'Tidak Hadir' : myResponse === 'BELUM_PASTI' ? 'Belum Pasti' : 'Belum Merespons'} color={myResponse === 'HADIR' ? 'bg-emerald-100 text-emerald-800' : myResponse === 'TIDAK_HADIR' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'} />
                      </p>
                    ) : null}
                  </div>
                  <Button variant="outline" onClick={() => navigate(`rapat-detail:${m.id}`)}>
                    <Eye className="mr-2 h-4 w-4" /> Buka
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <CreateMeetingDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}

interface CreateResult {
  settings?: RTSettings
  residents?: ResidentRow[]
}

export function CreateMeetingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { navigate } = useApp()
  const { settings } = useApp()

  const { data: support } = useQuery({
    queryKey: ['meeting-support'],
    queryFn: () => api<CreateResult>('/api/meetings', { method: 'OPTIONS' }),
    enabled: open,
  })

  const [title, setTitle] = useState('')
  const [meetingType, setMeetingType] = useState('RUTIN')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('19:00')
  const [endTime, setEndTime] = useState('21:00')
  const [location, setLocation] = useState('')
  const [method, setMethod] = useState('LURING')
  const [agendaText, setAgendaText] = useState('')
  const [scope, setScope] = useState('SEMUA_KK')
  const [scopeResidents, setScopeResidents] = useState<string[]>([])
  const [deadline, setDeadline] = useState('')

  // Pratinjau template undangan resmi
  const preview = useMemo(() => {
    const lines: string[] = []
    lines.push(`UNDANGAN RAPAT WARGA RT ${settings.nomorRT} RW ${settings.nomorRW}`)
    lines.push(`Nomor: (otomatis: UND/RT${settings.nomorRT}/${new Date().getFullYear()}/NNN)`)
    lines.push('')
    lines.push('Kepada Yth.')
    lines.push(`Bapak/Ibu Warga RT ${settings.nomorRT} RW ${settings.nomorRW}`)
    lines.push('')
    lines.push('Dengan hormat,')
    lines.push(`Dalam rangka ${title || '[judul rapat]'}, kami mengundang Bapak/Ibu untuk menghadiri rapat yang akan diselenggarakan pada:`)
    lines.push('')
    lines.push(`- Hari/Tanggal: ${date ? `${dayName(date)}, ${formatDate(date)}` : '[tanggal]'}`)
    lines.push(`- Waktu: ${startTime}${endTime ? `–${endTime}` : ''} WIB`)
    lines.push(`- Tempat: ${location || '[lokasi]'}`)
    lines.push(`- Agenda: ${agendaText.trim().split('\n').filter(Boolean).map((a, i) => `${i + 1}) ${a.trim()}`).join(' ') || '[agenda rapat]'}`)
    lines.push('')
    lines.push('Demikian undangan ini disampaikan. Kami berharap Bapak/Ibu dapat hadir dan berpartisipasi.')
    lines.push('')
    lines.push('Atas perhatian dan kehadirannya, kami mengucapkan terima kasih.')
    lines.push('')
    lines.push(`${settings.desa}, ${date ? formatDate(date) : '[tanggal undangan]'}`)
    lines.push('')
    lines.push(`Ketua RT,                    Sekretaris RT,`)
    lines.push('')
    lines.push('')
    lines.push(`${settings.ketuaName}              ${settings.sekretarisName}`)
    return lines.join('\n')
  }, [settings, title, date, startTime, endTime, location, agendaText])

  const mut = useMutation({
    mutationFn: () =>
      apiPost<{ id: string }>('/api/meetings', {
        title,
        meetingType,
        meetingDate: date,
        startTime,
        endTime,
        location,
        meetingMethod: method,
        agendas: agendaText.trim().split('\n').filter(Boolean).map((a) => ({ title: a.trim() })),
        invitationContent: preview,
        participantScope: scope,
        scopeResidents,
        invitationDate: new Date().toISOString(),
        responseDeadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : '',
      }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['meetings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Draft undangan dibuat', description: 'Periksa pratinjau, lalu terbitkan untuk memberi tahu peserta.' })
      onClose()
      navigate(`rapat-detail:${m.id}`)
    },
    onError: (e: Error) => toast({ title: 'Gagal membuat undangan', description: e.message, variant: 'destructive' }),
  })

  function toggleResident(id: string) {
    setScopeResidents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Undangan Rapat</DialogTitle>
          <DialogDescription>
            Isi detail rapat. Nomor undangan dibuat otomatis dengan mekanisme aman anti-duplikat. Nama pejabat dan identitas RT diambil dari pengaturan aplikasi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="Judul Rapat" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rapat Warga: Rencana Kerja Tahun 2026" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis Rapat">
                <Select value={meetingType} onValueChange={setMeetingType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEETING_TYPE).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Metode">
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MEETING_METHOD).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tanggal" required>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Mulai" required>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </Field>
              <Field label="Selesai">
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </Field>
            </div>
            <Field label="Tempat" required>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Balai RT 05" />
            </Field>
            <Field label="Agenda (satu baris satu butir)" required>
              <Textarea
                value={agendaText}
                onChange={(e) => setAgendaText(e.target.value)}
                placeholder={'1. Laporan bendahara\n2. Rencana kerja 2026\n3. Keamanan lingkungan'}
              />
            </Field>
            <Field label="Batas Konfirmasi Kehadiran" hint="Opsional — setelah batas ini warga tidak dapat mengubah konfirmasi">
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            <Field label="Sasaran Peserta" required>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SCOPE).filter(([k]) => k !== 'PILIHAN' || true).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {scope === 'PILIHAN' ? (
              <div className="rounded-md border p-3 max-h-48 overflow-y-auto space-y-2">
                {(support?.residents ?? []).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={scopeResidents.includes(r.id)} onCheckedChange={() => toggleResident(r.id)} />
                    {r.fullName} — Rumah {r.houseNumber}
                  </label>
                ))}
                {scopeResidents.length === 0 ? (
                  <p className="text-xs text-destructive">Pilih minimal satu warga.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Pratinjau undangan */}
          <div>
            <p className="mb-2 text-sm font-medium flex items-center gap-1.5">
              <Eye className="h-4 w-4" /> Pratinjau Template Undangan
            </p>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed font-mono max-h-[480px] overflow-y-auto">
              {preview}
            </pre>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Peserta dibuat dari data warga aktif. Konfirmasi kehadiran dibuka setelah undangan diterbitkan.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={
              title.trim().length < 3 || !date || !startTime || location.trim().length < 2 ||
              agendaText.trim().length === 0 || (scope === 'PILIHAN' && scopeResidents.length === 0) || mut.isPending
            }
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan Draft Undangan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
