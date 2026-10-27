'use client'

// ============================================================
// Detail Rapat — Undangan, Peserta & Kehadiran, Notulen,
// Keputusan & Tindak Lanjut, Lampiran
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
  Send, CheckCircle2, Megaphone, Share2, Printer, FileEdit, UserPlus,
  Download, Upload, Plus, Trash2, Archive, CircleCheck, Undo2,
} from 'lucide-react'
import { useApp, useCan, PageHeader, StatusBadge, LoadingBox, ErrorBox, Field } from './shared'
import type { MeetingDetail, AttendanceRow, ResidentRow, ActionItemRow } from './types'
import { api, apiGet, apiPost, apiPut, apiDelete, downloadCsv } from '@/lib/api-client'
import { formatDate, formatDateTime } from '@/lib/format'
import {
  INV_STATUS, MINUTES_STATUS, RESPONSE_STATUS, ATTENDANCE_STATUS,
  MEETING_TYPE, MEETING_METHOD, SCOPE, PRIORITY, ACTION_STATUS, ATTACHMENT_TYPE,
} from '@/lib/labels'
import { InvitationDoc, MinutesDoc, AttendanceDoc } from './print-docs'
import { toast } from '@/hooks/use-toast'

export default function MeetingDetailView({ meetingId }: { meetingId: string }) {
  const { navigate } = useApp()
  const can = useCan()
  const qc = useQueryClient()
  const [printMode, setPrintMode] = useState<'invitation' | 'minutes' | 'attendance' | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => apiGet<MeetingDetail>(`/api/meetings/${meetingId}`),
  })

  const invMut = useMutation({
    mutationFn: (action: string) => apiPut(`/api/meetings/${meetingId}/invitation`, { action }),
    onSuccess: (_d, action) => {
      qc.invalidateQueries({ queryKey: ['meeting', meetingId] })
      qc.invalidateQueries({ queryKey: ['meetings'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      const msg: Record<string, string> = {
        'submit-approval': 'Undangan diajukan untuk persetujuan Ketua/Admin.',
        approve: 'Undangan disetujui — siap diterbitkan.',
        reject: 'Undangan dikembalikan ke pembuat.',
        publish: 'Undangan diterbitkan — notifikasi dikirim ke peserta.',
        complete: 'Rapat ditandai selesai — siap dibuat notulen.',
        archive: 'Dokumen rapat diarsipkan.',
      }
      toast({ title: 'Berhasil', description: msg[action] ?? 'Tersimpan.' })
    },
    onError: (e: Error) => toast({ title: 'Gagal', description: e.message, variant: 'destructive' }),
  })

  const cancelMut = useMutation({
    mutationFn: () =>
      fetch(`/api/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      }).then(async (r) => {
        const j = await r.json()
        if (!j.success) throw new Error(j.error)
        return j
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meetings'] })
      setCancelOpen(false)
      toast({ title: 'Rapat dibatalkan', description: 'Notifikasi pembatalan dikirim kepada peserta.' })
      navigate('rapat')
    },
    onError: (e: Error) => toast({ title: 'Gagal membatalkan', description: e.message, variant: 'destructive' }),
  })

  function shareWhatsApp() {
    if (!meeting?.invitation) return
    const text =
      `*UNDANGAN RAPAT*\n` +
      `Nomor: ${meeting.invitation.invitationNumber}\n\n` +
      `${meeting.title}\n` +
      `Hari/Tanggal: ${formatDate(meeting.meetingDate)}\n` +
      `Waktu: ${meeting.startTime}${meeting.endTime ? `-${meeting.endTime}` : ''} WIB\n` +
      `Tempat: ${meeting.location}\n\n` +
      `Mohon konfirmasi kehadiran melalui aplikasi Kas RT Online.`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  if (!meeting) return null

  const inv = meeting.invitation
  const min = meeting.minutes
  const isPublished = inv?.status === 'PUBLISHED'
  const myRow = meeting.attendances.find((a) => a.residentId === undefined)

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description={`${MEETING_TYPE[meeting.meetingType] ?? meeting.meetingType} · ${formatDate(meeting.meetingDate)} · ${meeting.startTime}${meeting.endTime ? `–${meeting.endTime}` : ''} WIB · ${meeting.location} · ${MEETING_METHOD[meeting.meetingMethod] ?? meeting.meetingMethod}`}
        actions={
          <Button variant="ghost" onClick={() => navigate('rapat')}>← Kembali</Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {inv ? <StatusBadge label={`Undangan: ${INV_STATUS[inv.status]?.label ?? inv.status}`} color={INV_STATUS[inv.status]?.color ?? ''} /> : null}
        {min ? <StatusBadge label={`Notulen: ${MINUTES_STATUS[min.documentStatus]?.label ?? min.documentStatus}`} color={MINUTES_STATUS[min.documentStatus]?.color ?? ''} /> : null}
        {meeting.status === 'CANCELLED' ? <StatusBadge label="Rapat Dibatalkan" color="bg-rose-100 text-rose-700" /> : null}
      </div>

      <Tabs defaultValue="undangan">
        <TabsList className="flex-wrap">
          <TabsTrigger value="undangan">Undangan</TabsTrigger>
          <TabsTrigger value="kehadiran">Peserta &amp; Kehadiran</TabsTrigger>
          <TabsTrigger value="notulen">Notulen</TabsTrigger>
          <TabsTrigger value="keputusan">Keputusan &amp; Tindak Lanjut</TabsTrigger>
          <TabsTrigger value="lampiran">Lampiran ({meeting.attachments.length})</TabsTrigger>
        </TabsList>

        {/* ================= UNDANGAN ================= */}
        <TabsContent value="undangan" className="space-y-4">
          {inv ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Dokumen Undangan {inv.invitationNumber}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p><span className="text-muted-foreground">Sasaran:</span> {SCOPE[inv.participantScope] ?? inv.participantScope}</p>
                    <p><span className="text-muted-foreground">Tanggal undangan:</span> {formatDate(inv.invitationDate)}</p>
                    <p><span className="text-muted-foreground">Batas konfirmasi:</span> {inv.responseDeadline ? formatDate(inv.responseDeadline) : '-'}</p>
                    <p><span className="text-muted-foreground">Dibuat oleh:</span> {inv.createdBy?.name ?? '-'}{inv.approvedBy ? ` · Disetujui: ${inv.approvedBy.name}` : ''}</p>
                    {inv.publishedAt ? <p><span className="text-muted-foreground">Diterbitkan:</span> {formatDateTime(inv.publishedAt)}</p> : null}
                    {inv.changeNotes ? <p className="sm:col-span-2"><span className="text-muted-foreground">Catatan perubahan:</span> {inv.changeNotes}</p> : null}
                  </div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{inv.invitationContent}</pre>
                  </div>
                </CardContent>
              </Card>

              {/* Workflow undangan */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Alur Undangan</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {can('meeting.update') && inv.status === 'DRAFT' ? (
                    <Button variant="outline" disabled={invMut.isPending} onClick={() => invMut.mutate('submit-approval')}>
                      <Send className="mr-2 h-4 w-4" /> Ajukan Persetujuan
                    </Button>
                  ) : null}
                  {can('meeting.approve') && inv.status === 'PENDING_APPROVAL' ? (
                    <>
                      <Button disabled={invMut.isPending} onClick={() => invMut.mutate('approve')}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui
                      </Button>
                      <Button variant="outline" disabled={invMut.isPending} onClick={() => invMut.mutate('reject')}>
                        <Undo2 className="mr-2 h-4 w-4" /> Kembalikan
                      </Button>
                    </>
                  ) : null}
                  {can('meeting.publish') && (inv.status === 'DRAFT' || inv.status === 'PENDING_APPROVAL') ? (
                    <Button disabled={invMut.isPending} onClick={() => invMut.mutate('publish')}>
                      <Megaphone className="mr-2 h-4 w-4" /> Terbitkan Undangan
                    </Button>
                  ) : null}
                  {can('meeting.update') && inv.status === 'PUBLISHED' ? (
                    <Button variant="outline" disabled={invMut.isPending} onClick={() => invMut.mutate('complete')}>
                      <CircleCheck className="mr-2 h-4 w-4" /> Rapat Telah Dilaksanakan
                    </Button>
                  ) : null}
                  {can('meeting_minutes.archive') && inv.status === 'COMPLETED' ? (
                    <Button variant="outline" disabled={invMut.isPending} onClick={() => invMut.mutate('archive')}>
                      <Archive className="mr-2 h-4 w-4" /> Arsipkan
                    </Button>
                  ) : null}
                  {['PUBLISHED', 'DRAFT', 'PENDING_APPROVAL'].includes(inv.status) ? (
                    <>
                      <Button variant="outline" onClick={() => setPrintMode('invitation')}>
                        <Printer className="mr-2 h-4 w-4" /> Cetak Undangan
                      </Button>
                      <Button variant="outline" onClick={shareWhatsApp}>
                        <Share2 className="mr-2 h-4 w-4" /> Bagikan via WhatsApp
                      </Button>
                    </>
                  ) : null}
                  {can('meeting.cancel') && !['ARCHIVED', 'CANCELLED'].includes(inv.status) ? (
                    <Button variant="destructive" onClick={() => setCancelOpen(true)}>Batalkan Rapat</Button>
                  ) : null}
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                Undangan yang telah diterbitkan tidak dapat diubah diam-diam: perubahan jadwal/tempat dicatat di audit log dan
                notifikasi perubahan dikirim ke peserta. Undangan tidak dapat dihapus permanen setelah diterbitkan.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Undangan belum dibuat.</p>
          )}
        </TabsContent>

        {/* ================= KEHADIRAN ================= */}
        <TabsContent value="kehadiran">
          <AttendanceTab meeting={meeting} onPrint={() => setPrintMode('attendance')} />
        </TabsContent>

        {/* ================= NOTULEN ================= */}
        <TabsContent value="notulen">
          <MinutesTab meeting={meeting} onPrint={() => setPrintMode('minutes')} />
        </TabsContent>

        {/* ================= KEPUTUSAN & TINDAK LANJUT ================= */}
        <TabsContent value="keputusan">
          <DecisionsTab meeting={meeting} />
        </TabsContent>

        {/* ================= LAMPIRAN ================= */}
        <TabsContent value="lampiran">
          <AttachmentsTab meeting={meeting} />
        </TabsContent>
      </Tabs>

      {/* Print overlays */}
      {printMode === 'invitation' ? <InvitationDoc meeting={meeting} onClose={() => setPrintMode(null)} /> : null}
      {printMode === 'minutes' && min ? <MinutesDoc meeting={meeting} onClose={() => setPrintMode(null)} /> : null}
      {printMode === 'attendance' ? (
        <AttendancePrintWrapper meetingId={meetingId} meeting={meeting} onClose={() => setPrintMode(null)} />
      ) : null}

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan rapat ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Notifikasi pembatalan akan dikirim kepada seluruh peserta. Pembatalan tercatat dalam audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Alasan pembatalan (opsional)" />
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelMut.isPending}
              onClick={(e) => {
                e.preventDefault()
                cancelMut.mutate()
              }}
            >
              Batalkan Rapat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- TAB KEHADIRAN ----------

function AttendanceTab({ meeting, onPrint }: { meeting: MeetingDetail; onPrint: () => void }) {
  const { user } = useApp()
  const can = useCan()
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['attendance', meeting.id],
    queryFn: () => apiGet<{ rows: AttendanceRow[]; rekap: Record<string, number>; deadline: string | null }>(
      `/api/meetings/${meeting.id}/attendance`
    ),
  })

  const manageMut = useMutation({
    mutationFn: (input: Record<string, unknown>) => apiPut(`/api/meetings/${meeting.id}/attendance`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance', meeting.id] })
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
    },
    onError: (e: Error) => toast({ title: 'Gagal mencatat', description: e.message, variant: 'destructive' }),
  })

  const confirmMut = useMutation({
    mutationFn: (responseStatus: string) =>
      fetch(`/api/meetings/${meeting.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseStatus }),
      }).then(async (r) => {
        const j = await r.json()
        if (!j.success) throw new Error(j.error)
        return j
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance', meeting.id] })
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast({ title: 'Konfirmasi tersimpan', description: 'Konfirmasi HADIR belum otomatis dianggap kehadiran aktual.' })
    },
    onError: (e: Error) => toast({ title: 'Gagal konfirmasi', description: e.message, variant: 'destructive' }),
  })

  const isPetugas = can('meeting_attendance.manage')
  const isParticipant = !!user.residentId
  const myRow = data?.rows.find((r) => r.residentId === user.residentId)
  const published = meeting.invitation?.status === 'PUBLISHED'

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  if (!data) return null

  function exportExcel() {
    downloadCsv(`daftar-hadir-${meeting.meetingNumber}.csv`, [
      [`Daftar Hadir — ${meeting.title}`],
      [`${formatDate(meeting.meetingDate)} ${meeting.startTime} WIB — ${meeting.location}`],
      [],
      ['Nama', 'Rumah', 'Konfirmasi', 'Kehadiran Aktual', 'Waktu Hadir', 'Catatan'],
      ...data.rows.map((r) => [
        r.resident.fullName,
        r.resident.houseNumber,
        RESPONSE_STATUS[r.responseStatus]?.label ?? r.responseStatus,
        ATTENDANCE_STATUS[r.attendanceStatus]?.label ?? r.attendanceStatus,
        r.attendanceTime ? formatDateTime(r.attendanceTime) : '',
        r.notes ?? '',
      ]),
      [],
      ['Diundang', data.rekap.invited ?? data.rows.length],
      ['Konfirmasi', data.rekap.confirmed ?? 0],
      ['Hadir Aktual', data.rekap.attended ?? 0],
    ])
  }

  return (
    <div className="space-y-4">
      {/* Konfirmasi milik warga */}
      {isParticipant && published ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium">Konfirmasi kehadiran Anda</p>
              <p className="text-xs text-muted-foreground">
                Status: {myRow ? RESPONSE_STATUS[myRow.responseStatus]?.label : 'Tidak terdaftar sebagai peserta'}
                {data.deadline ? ` · Batas waktu: ${formatDate(data.deadline)}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={confirmMut.isPending || myRow?.responseStatus === 'HADIR'} onClick={() => confirmMut.mutate('HADIR')}>
                Saya Hadir
              </Button>
              <Button size="sm" variant="outline" disabled={confirmMut.isPending || myRow?.responseStatus === 'TIDAK_HADIR'} onClick={() => confirmMut.mutate('TIDAK_HADIR')}>
                Tidak Hadir
              </Button>
              <Button size="sm" variant="outline" disabled={confirmMut.isPending || myRow?.responseStatus === 'BELUM_PASTI'} onClick={() => confirmMut.mutate('BELUM_PASTI')}>
                Belum Pasti
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Rekap */}
      {isPetugas || can('meeting_attendance.view') ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <RekapBox label="Diundang" value={data.rekap.invited ?? 0} />
          <RekapBox label="Konfirmasi" value={data.rekap.confirmed ?? 0} />
          <RekapBox label="Hadir Aktual" value={data.rekap.attended ?? 0} tone="in" />
          <RekapBox label="Tidak Hadir/Izin" value={data.rekap.absent ?? 0} tone="out" />
          <RekapBox label="Belum Merespons" value={data.rekap.belumRespons ?? 0} />
        </div>
      ) : null}

      {isPetugas ? (
        <div className="flex flex-wrap gap-2">
          <WalkInDialog meetingId={meeting.id} />
          <Button variant="outline" onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" /> Cetak Daftar Hadir
          </Button>
          <Button variant="outline" onClick={exportExcel}>
            <Download className="mr-2 h-4 w-4" /> Excel
          </Button>
        </div>
      ) : null}

      {/* Tabel peserta */}
      <div className="rounded-lg border bg-background">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium">Warga</th>
                <th className="px-3 py-2 text-left font-medium">Konfirmasi</th>
                <th className="px-3 py-2 text-left font-medium">Kehadiran Aktual</th>
                {isPetugas ? <th className="px-3 py-2 text-right font-medium">Aksi Petugas</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{r.resident.fullName}</p>
                    <p className="text-xs text-muted-foreground">Rumah {r.resident.houseNumber}{r.resident.isHeadOfFamily ? ' · KK' : ''}</p>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      label={RESPONSE_STATUS[r.responseStatus]?.label ?? r.responseStatus}
                      color={RESPONSE_STATUS[r.responseStatus]?.color ?? ''}
                    />
                    {r.responseAt ? <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(r.responseAt)}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      label={ATTENDANCE_STATUS[r.attendanceStatus]?.label ?? r.attendanceStatus}
                      color={ATTENDANCE_STATUS[r.attendanceStatus]?.color ?? ''}
                    />
                    {r.verifiedBy ? <p className="mt-1 text-[10px] text-muted-foreground">Dicatat {r.verifiedBy.name}</p> : null}
                  </td>
                  {isPetugas ? (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm" variant="outline"
                          disabled={manageMut.isPending || r.attendanceStatus === 'HADIR'}
                          onClick={() => manageMut.mutate({ action: 'record', attendanceId: r.id, attendanceStatus: 'HADIR', attendanceMethod: 'MANUAL' })}
                        >
                          Hadir
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          disabled={manageMut.isPending || r.attendanceStatus === 'IZIN'}
                          onClick={() => manageMut.mutate({ action: 'record', attendanceId: r.id, attendanceStatus: 'IZIN', notes: r.notes || 'Izin (dicatat petugas)' })}
                        >
                          Izin
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          disabled={manageMut.isPending || r.attendanceStatus === 'TIDAK_HADIR'}
                          onClick={() => manageMut.mutate({ action: 'record', attendanceId: r.id, attendanceStatus: 'TIDAK_HADIR' })}
                        >
                          Absen
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Konfirmasi HADIR dari warga tidak otomatis dianggap kehadiran aktual — kehadiran aktual dicatat oleh petugas berwenang.
      </p>
    </div>
  )
}

function RekapBox({ label, value, tone }: { label: string; value: number; tone?: 'in' | 'out' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${tone === 'in' ? 'text-emerald-700' : tone === 'out' ? 'text-rose-700' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function WalkInDialog({ meetingId }: { meetingId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [residentId, setResidentId] = useState('')

  const { data: support } = useQuery({
    queryKey: ['meeting-support-walkin'],
    queryFn: () => api<{ residents: ResidentRow[] }>('/api/meetings', { method: 'OPTIONS' }),
    enabled: open,
  })

  const mut = useMutation({
    mutationFn: () => apiPut(`/api/meetings/${meetingId}/attendance`, { action: 'add-walk-in', residentId, attendanceStatus: 'HADIR' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance', meetingId] })
      qc.invalidateQueries({ queryKey: ['meeting', meetingId] })
      toast({ title: 'Peserta hadir langsung ditambahkan' })
      setOpen(false)
      setResidentId('')
    },
    onError: (e: Error) => toast({ title: 'Gagal menambah peserta', description: e.message, variant: 'destructive' }),
  })

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" /> Tambah Hadir Langsung
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Peserta Hadir Langsung</DialogTitle>
            <DialogDescription>Tambahkan warga yang hadir namun tidak termasuk daftar sasaran awal.</DialogDescription>
          </DialogHeader>
          <Field label="Warga" required>
            <Select value={residentId} onValueChange={setResidentId}>
              <SelectTrigger><SelectValue placeholder="Pilih warga" /></SelectTrigger>
              <SelectContent>
                {(support?.residents ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.fullName} — Rumah {r.houseNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button disabled={!residentId || mut.isPending} onClick={() => mut.mutate()}>Tambah</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AttendancePrintWrapper({
  meetingId, meeting, onClose,
}: {
  meetingId: string
  meeting: MeetingDetail
  onClose: () => void
}) {
  const { data } = useQuery({
    queryKey: ['attendance', meetingId],
    queryFn: () => apiGet<{ rows: AttendanceRow[] }>(`/api/meetings/${meetingId}/attendance`),
  })
  if (!data) return <LoadingBox />
  return <AttendanceDoc meeting={meeting} rows={data.rows} onClose={onClose} />
}

// ---------- TAB NOTULEN ----------

function MinutesTab({ meeting, onPrint }: { meeting: MeetingDetail; onPrint: () => void }) {
  const can = useCan()
  const qc = useQueryClient()
  const min = meeting.minutes

  const [chairperson, setChairperson] = useState(min?.chairperson ?? '')
  const [minuteTaker, setMinuteTaker] = useState(min?.minuteTaker ?? '')
  const [discussion, setDiscussion] = useState(min?.discussionSummary ?? '')
  const [closing, setClosing] = useState(min?.closingNotes ?? '')
  const [changeReason, setChangeReason] = useState('')
  const [count, setCount] = useState(min?.attendeesCount ?? 0)

  const createMut = useMutation({
    mutationFn: () => apiPost(`/api/meetings/${meeting.id}/minutes`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast({ title: 'Draft notulen dibuat', description: 'Nomor notulen dibuat otomatis (contoh: NTR/RT05/2026/001).' })
    },
    onError: (e: Error) => toast({ title: 'Gagal membuat notulen', description: e.message, variant: 'destructive' }),
  })

  const saveMut = useMutation({
    mutationFn: (action: string) =>
      apiPut(`/api/meetings/${meeting.id}/minutes`, {
        action,
        chairperson: chairperson || undefined,
        minuteTaker: minuteTaker || undefined,
        attendeesCount: count || undefined,
        discussionSummary: discussion,
        closingNotes: closing,
        changeReason: changeReason || undefined,
      }),
    onSuccess: (_d, action) => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      setChangeReason('')
      const msg: Record<string, string> = {
        save: 'Notulen tersimpan.',
        submit: 'Notulen diajukan untuk pemeriksaan Ketua RT.',
        'review-approve': 'Notulen disetujui — Sekretaris dapat menerbitkan.',
        'review-reject': 'Notulen dikembalikan ke notulis.',
        publish: 'Notulen diterbitkan — notifikasi dikirim ke peserta.',
        archive: 'Notulen diarsipkan.',
      }
      toast({ title: 'Berhasil', description: msg[action] ?? 'Tersimpan.' })
    },
    onError: (e: Error) => toast({ title: 'Gagal', description: e.message, variant: 'destructive' }),
  })

  if (!min) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Notulen belum dibuat untuk rapat ini.</p>
        {can('meeting_minutes.create') && meeting.status === 'COMPLETED' ? (
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            <FileEdit className="mr-2 h-4 w-4" /> Buat Notulen
          </Button>
        ) : meeting.status !== 'COMPLETED' ? (
          <p className="text-xs text-muted-foreground">Notulen dapat dibuat setelah rapat ditandai telah dilaksanakan.</p>
        ) : null}
      </div>
    )
  }

  const editable = can('meeting_minutes.update') && ['DRAFT', 'PENDING_REVIEW'].includes(min.documentStatus)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">{min.minutesNumber}</Badge>
        <StatusBadge label={MINUTES_STATUS[min.documentStatus]?.label ?? min.documentStatus} color={MINUTES_STATUS[min.documentStatus]?.color ?? ''} />
        <Badge variant="secondary">Versi {min.version}</Badge>
        {min.publishedAt ? <span className="text-xs text-muted-foreground">Diterbitkan {formatDateTime(min.publishedAt)}</span> : null}
      </div>

      {can('meeting_minutes.view') ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pimpinan Rapat">
              <Input value={chairperson} onChange={(e) => setChairperson(e.target.value)} disabled={!editable} />
            </Field>
            <Field label="Notulis">
              <Input value={minuteTaker} onChange={(e) => setMinuteTaker(e.target.value)} disabled={!editable} />
            </Field>
          </div>
          <Field label="Jumlah Hadir" hint="Dihitung dari kehadiran aktual: dapat disesuaikan">
            <Input type="number" min="0" value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={!editable} />
          </Field>
        </div>
      ) : null}

      <Field label="Ringkasan Pembahasan">
        <Textarea
          value={discussion}
          onChange={(e) => setDiscussion(e.target.value)}
          disabled={!editable}
          rows={7}
          placeholder="Ringkasan pembahasan setiap agenda, usulan penting, dan tanggapan peserta..."
        />
      </Field>
      <Field label="Catatan Penutup">
        <Textarea value={closing} onChange={(e) => setClosing(e.target.value)} disabled={!editable} rows={3} placeholder="Rapat ditutup..." />
      </Field>

      {min.documentStatus === 'PENDING_REVIEW' && editable ? (
        <Field label="Alasan revisi (wajib bila mengubah notulen yang diajukan)" hint="Versi sebelumnya tersimpan sebagai arsip dokumen">
          <Input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Contoh: menambah hasil Voting agenda 2" />
        </Field>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable ? (
          <Button onClick={() => saveMut.mutate('save')} disabled={saveMut.isPending}>Simpan</Button>
        ) : null}
        {can('meeting_minutes.update') && min.documentStatus === 'DRAFT' ? (
          <Button variant="outline" onClick={() => saveMut.mutate('submit')} disabled={saveMut.isPending}>
            <Send className="mr-2 h-4 w-4" /> Ajukan Pemeriksaan
          </Button>
        ) : null}
        {can('meeting_minutes.review') && min.documentStatus === 'PENDING_REVIEW' ? (
          <>
            <Button onClick={() => saveMut.mutate('review-approve')} disabled={saveMut.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Setujui
            </Button>
            <Button variant="outline" onClick={() => saveMut.mutate('review-reject')} disabled={saveMut.isPending}>
              <Undo2 className="mr-2 h-4 w-4" /> Kembalikan
            </Button>
          </>
        ) : null}
        {can('meeting_minutes.publish') && min.documentStatus === 'APPROVED' ? (
          <Button onClick={() => saveMut.mutate('publish')} disabled={saveMut.isPending}>
            <Megaphone className="mr-2 h-4 w-4" /> Terbitkan Notulen
          </Button>
        ) : null}
        {can('meeting_minutes.archive') && min.documentStatus === 'PUBLISHED' ? (
          <Button variant="outline" onClick={() => saveMut.mutate('archive')} disabled={saveMut.isPending}>
            <Archive className="mr-2 h-4 w-4" /> Arsipkan
          </Button>
        ) : null}
        <Button variant="outline" onClick={onPrint}>
          <Printer className="mr-2 h-4 w-4" /> Cetak Notulen
        </Button>
      </div>

      {min.versions && min.versions.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Riwayat Versi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {min.versions.map((v) => (
              <p key={v.id} className="text-xs text-muted-foreground">
                Versi {v.version} — {v.changeReason ?? 'tanpa alasan'} · {formatDateTime(v.createdAt)}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Notulen diterbitkan tidak dapat diubah diam-diam. Koreksi mencatat alasan, nilai sebelum/sesudah, pengguna, waktu, dan versi dokumen sebelumnya.
      </p>
    </div>
  )
}

// ---------- TAB KEPUTUSAN & TINDAK LANJUT ----------

function DecisionsTab({ meeting }: { meeting: MeetingDetail }) {
  const can = useCan()
  const qc = useQueryClient()
  const [decisionText, setDecisionText] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [taskOpen, setTaskOpen] = useState(false)

  const decMut = useMutation({
    mutationFn: () => apiPost(`/api/meetings/${meeting.id}/decisions`, { decision: decisionText, isPublic }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      setDecisionText('')
      toast({ title: 'Keputusan tercatat' })
    },
    onError: (e: Error) => toast({ title: 'Gagal', description: e.message, variant: 'destructive' }),
  })

  const delMut = useMutation({
    mutationFn: (decisionId: string) => apiDelete(`/api/meetings/${meeting.id}/decisions?decisionId=${decisionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast({ title: 'Keputusan dihapus' })
    },
    onError: (e: Error) => toast({ title: 'Gagal menghapus', description: e.message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-4">
      {can('meeting_decision.manage') ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Catat Keputusan Rapat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={decisionText} onChange={(e) => setDecisionText(e.target.value)} placeholder="Contoh: Membersihkan saluran air lingkungan setiap 2 minggu sekali" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4" />
                Umumkan ke warga (publik)
              </label>
              <Button disabled={decisionText.trim().length < 3 || decMut.isPending} onClick={() => decMut.mutate()}>
                <Plus className="mr-2 h-4 w-4" /> Simpan Keputusan
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Keputusan mengenai anggaran tidak otomatis mengubah saldo atau membuat transaksi keuangan — pengeluaran tetap melalui workflow keuangan.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        {meeting.decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada keputusan yang dicatat.</p>
        ) : (
          meeting.decisions.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">
                    {d.order}. {d.decision}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.isPublic ? 'Diumumkan ke warga' : 'Internal pengurus'} · {d._count?.actionItems ?? 0} tindak lanjut
                  </p>
                </div>
                <div className="flex gap-1">
                  {can('meeting_action_item.create') ? (
                    <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Tugas
                    </Button>
                  ) : null}
                  {can('meeting_decision.manage') && (d._count?.actionItems ?? 0) === 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => delMut.mutate(d.id)} title="Hapus keputusan">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Tugas Tindak Lanjut Rapat Ini</p>
        {meeting.actionItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada tindak lanjut.</p>
        ) : (
          meeting.actionItems.map((a) => <ActionItemCard key={a.id} item={a} />)
        )}
      </div>

      <ActionItemDialog
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        meetingId={meeting.id}
        decisions={meeting.decisions.map((d) => ({ id: d.id, decision: d.decision }))}
      />
    </div>
  )
}

export function ActionItemCard({ item }: { item: ActionItemRow }) {
  const can = useCan()
  const qc = useQueryClient()
  const [completeOpen, setCompleteOpen] = useState(false)
  const [notes, setNotes] = useState('')

  const overdue = item.dueDate && new Date(item.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(item.status)

  const mut = useMutation({
    mutationFn: (input: Record<string, unknown>) => apiPut('/api/action-items', input),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['meeting'] })
      qc.invalidateQueries({ queryKey: ['action-items'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setCompleteOpen(false)
      toast({
        title: input.verify ? 'Penyelesaian diverifikasi' : input.status === 'COMPLETED' ? 'Tugas ditandai selesai' : 'Tugas diperbarui',
      })
    },
    onError: (e: Error) => toast({ title: 'Gagal', description: e.message, variant: 'destructive' }),
  })

  const isMine = !!item.responsibleUser || !!item.responsibleResident

  return (
    <Card className={overdue ? 'border-destructive/40' : ''}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{item.title}</p>
            {item.description ? <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Penanggung jawab: {item.responsibleResident?.fullName ?? item.responsibleUser?.name ?? '-'}
              {item.dueDate ? ` · Tenggat: ${formatDate(item.dueDate)}` : ' · Tanpa tenggat'}
              {item.verifiedBy ? ` · Diverifikasi ${item.verifiedBy.name}` : ''}
            </p>
            {item.completionNotes ? (
              <p className="mt-1 text-xs text-emerald-700">Catatan penyelesaian: {item.completionNotes}</p>
            ) : null}
            {overdue ? <p className="mt-1 text-xs font-medium text-destructive">Melewati tenggat — tugas tidak otomatis dianggap selesai</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StatusBadge label={PRIORITY[item.priority]?.label ?? item.priority} color={PRIORITY[item.priority]?.color ?? ''} />
            <StatusBadge label={ACTION_STATUS[item.status]?.label ?? item.status} color={ACTION_STATUS[item.status]?.color ?? ''} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {can('meeting_action_item.complete') && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' ? (
            <Button size="sm" variant="outline" onClick={() => setCompleteOpen(true)}>
              <CircleCheck className="mr-1 h-3.5 w-3.5" /> Tandai Selesai
            </Button>
          ) : null}
          {can('meeting_action_item.verify') && item.status === 'COMPLETED' && !item.verifiedBy ? (
            <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate({ id: item.id, verify: true })}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Verifikasi
            </Button>
          ) : null}
          {can('meeting_action_item.update') && ['NOT_STARTED', 'IN_PROGRESS'].includes(item.status) ? (
            <Button
              size="sm" variant="ghost"
              disabled={mut.isPending}
              onClick={() => mut.mutate({ id: item.id, status: item.status === 'NOT_STARTED' ? 'IN_PROGRESS' : 'NOT_STARTED' })}
            >
              {item.status === 'NOT_STARTED' ? 'Mulai Kerjakan' : 'Hentikan Sementara'}
            </Button>
          ) : null}
          {can('meeting_action_item.update') && item.status !== 'CANCELLED' && item.status !== 'COMPLETED' ? (
            <Button size="sm" variant="ghost" disabled={mut.isPending} onClick={() => mut.mutate({ id: item.id, status: 'CANCELLED' })}>
              Batalkan Tugas
            </Button>
          ) : null}
          {isMine && !can('meeting_action_item.complete') && item.status === 'IN_PROGRESS' ? (
            <Button size="sm" variant="outline" onClick={() => setCompleteOpen(true)}>Laporkan Selesai</Button>
          ) : null}
        </div>
      </CardContent>

      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan tugas "{item.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Cantumkan catatan perkembangan/bukti penyelesaian. Tugas tidak otomatis selesai hanya karena tenggat telah lewat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: saluran air blok A-C telah dibersihkan pada 10 Nov; foto tersimpan di arsip rapat" />
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={notes.trim().length < 3 || mut.isPending}
              onClick={(e) => {
                e.preventDefault()
                mut.mutate({ id: item.id, status: 'COMPLETED', completionNotes: notes })
              }}
            >
              Selesaikan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ---------- DIALOG TUGAS ----------

function ActionItemDialog({
  open, onClose, meetingId, decisions,
}: {
  open: boolean
  onClose: () => void
  meetingId: string
  decisions: { id: string; decision: string }[]
}) {
  const qc = useQueryClient()
  const { user } = useApp()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [decisionId, setDecisionId] = useState('')
  const [target, setTarget] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('NORMAL')

  const { data: support } = useQuery({
    queryKey: ['meeting-support-tasks'],
    queryFn: () => api<{ residents: ResidentRow[] }>('/api/meetings', { method: 'OPTIONS' }),
    enabled: open,
  })
  const { data: users } = useQuery({
    queryKey: ['users-light'],
    queryFn: () => apiGet<{ id: string; name: string; role: string }[]>('/api/users'),
    enabled: open,
  })

  const mut = useMutation({
    mutationFn: () =>
      apiPost('/api/action-items', {
        meetingId,
        decisionId,
        title,
        description,
        responsibleResidentId: target.startsWith('r:') ? target.slice(2) : '',
        responsibleUserId: target.startsWith('u:') ? target.slice(2) : '',
        dueDate,
        priority,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meetingId] })
      qc.invalidateQueries({ queryKey: ['action-items'] })
      toast({ title: 'Tugas tindak lanjut dibuat', description: 'Notifikasi dikirim ke penanggung jawab.' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal membuat tugas', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat Tugas Tindak Lanjut</DialogTitle>
          <DialogDescription>Tetapkan penanggung jawab dan tenggat. Tugas terhubung ke keputusan rapat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Judul Tugas" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bersihkan saluran air lingkungan" />
          </Field>
          {decisions.length > 0 ? (
            <Field label="Terkait Keputusan">
              <Select value={decisionId || 'NONE'} onValueChange={(v) => setDecisionId(v === 'NONE' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Tidak terkait keputusan khusus</SelectItem>
                  {decisions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.decision.slice(0, 70)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Deskripsi">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detail pelaksanaan, titik lokasi, dll." />
          </Field>
          <Field label="Penanggung Jawab" required>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder="Pilih pengurus atau warga" /></SelectTrigger>
              <SelectContent>
                {(users ?? []).filter((u) => u.role !== 'WARGA').map((u) => (
                  <SelectItem key={u.id} value={`u:${u.id}`}>[Pengurus] {u.name}</SelectItem>
                ))}
                {(support?.residents ?? []).map((r) => (
                  <SelectItem key={r.id} value={`r:${r.id}`}>[Warga] {r.fullName} — Rumah {r.houseNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tenggat">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Prioritas">
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={title.trim().length < 3 || !target || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? 'Menyimpan...' : 'Buat Tugas'}
          </Button>
        </DialogFooter>
        <p className="text-[11px] text-muted-foreground">Dibuat oleh {user.name} — tercatat di audit log.</p>
      </DialogContent>
    </Dialog>
  )
}

// ---------- TAB LAMPIRAN ----------

function AttachmentsTab({ meeting }: { meeting: MeetingDetail }) {
  const can = useCan()
  const qc = useQueryClient()
  const [type, setType] = useState('FOTO')
  const [isPublic, setIsPublic] = useState(false)

  const mut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      form.append('type', type)
      form.append('isPublic', String(isPublic))
      const res = await fetch(`/api/meetings/${meeting.id}/attachments`, { method: 'POST', body: form })
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      return j
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast({ title: 'Lampiran terunggah' })
    },
    onError: (e: Error) => toast({ title: 'Gagal mengunggah', description: e.message, variant: 'destructive' }),
  })

  const delMut = useMutation({
    mutationFn: (fileId: string) => apiDelete(`/api/meetings/${meeting.id}/attachments?file=${fileId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting', meeting.id] })
      toast({ title: 'Lampiran dihapus' })
    },
    onError: (e: Error) => toast({ title: 'Gagal menghapus', description: e.message, variant: 'destructive' }),
  })

  return (
    <div className="space-y-4">
      {can('meeting_attachment.upload') ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Unggah Lampiran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Jenis">
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ATTACHMENT_TYPE).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="h-4 w-4" />
                Publik (dapat diunduh warga)
              </label>
              <label className="pb-2">
                <input
                  type="file"
                  className="text-sm"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  disabled={mut.isPending}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) mut.mutate(f)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Maksimal 5 MB. Format: gambar, PDF, Word, Excel. Dokumen internal tidak dapat diakses warga tanpa izin.</p>
          </CardContent>
        </Card>
      ) : null}

      {meeting.attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada lampiran.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {meeting.attachments.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {ATTACHMENT_TYPE[a.type] ?? a.type} · {(a.fileSize / 1024).toFixed(0)} KB · {a.isPublic ? 'Publik' : 'Internal'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{a.uploadedBy?.name} · {formatDateTime(a.createdAt)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {can('meeting_attachment.download') || a.isPublic ? (
                    <Button
                      size="sm" variant="outline"
                      onClick={async () => {
                        const res = await fetch(`/api/meetings/${meeting.id}/attachments?file=${a.id}`)
                        if (!res.ok) {
                          toast({ title: 'Gagal mengunduh', variant: 'destructive' })
                          return
                        }
                        const blob = await res.blob()
                        const url = URL.createObjectURL(blob)
                        const el = document.createElement('a')
                        el.href = url
                        el.download = a.fileName
                        el.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  ) : null}
                  {can('meeting_attachment.upload') ? (
                    <Button size="sm" variant="ghost" onClick={() => delMut.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
