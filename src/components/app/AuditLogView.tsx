'use client'

// ============================================================
// Audit Log — jejak audit (hanya baca, tidak dapat diubah/dihapus)
// ============================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Search, ShieldCheck } from 'lucide-react'
import { PageHeader, LoadingBox, ErrorBox } from './shared'
import type { AuditRow } from './types'
import { apiGet } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-800',
  APPROVE: 'bg-teal-100 text-teal-800',
  POST: 'bg-emerald-100 text-emerald-800',
  PUBLISH: 'bg-emerald-100 text-emerald-800',
  LOCK: 'bg-rose-100 text-rose-700',
  REOPEN: 'bg-amber-100 text-amber-800',
  CANCEL: 'bg-rose-100 text-rose-700',
  REVERSE: 'bg-rose-100 text-rose-700',
  DELETE: 'bg-rose-100 text-rose-700',
  CORRECT: 'bg-amber-100 text-amber-800',
  CLOSE: 'bg-orange-100 text-orange-800',
  VERIFY: 'bg-teal-100 text-teal-800',
  COMPLETE: 'bg-teal-100 text-teal-800',
}

export default function AuditLogView() {
  const [objectType, setObjectType] = useState('ALL')
  const [q, setQ] = useState('')
  const [detail, setDetail] = useState<AuditRow | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', objectType],
    queryFn: () =>
      apiGet<AuditRow[]>(`/api/audit-logs?take=300${objectType !== 'ALL' ? `&objectType=${objectType}` : ''}`),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  const rows = (data ?? []).filter((r) => {
    const query = q.toLowerCase()
    return (
      query === '' ||
      r.description.toLowerCase().includes(query) ||
      (r.userName ?? '').toLowerCase().includes(query)
    )
  })

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Seluruh aktivitas penting tercatat: pengguna, tindakan, waktu, objek, dan nilai sebelum/sesudah. Log tidak dapat diubah atau dihapus oleh pengguna mana pun."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={objectType} onValueChange={setObjectType}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Objek</SelectItem>
            <SelectItem value="OPENING_BALANCE">Saldo Awal</SelectItem>
            <SelectItem value="ACCOUNTING_PERIOD">Periode Akuntansi</SelectItem>
            <SelectItem value="TRANSACTION">Transaksi</SelectItem>
            <SelectItem value="CASH_TRANSFER">Transfer Kas</SelectItem>
            <SelectItem value="PAYMENT">Pembayaran Iuran</SelectItem>
            <SelectItem value="RECONCILIATION">Rekonsiliasi</SelectItem>
            <SelectItem value="MEETING">Rapat</SelectItem>
            <SelectItem value="MEETING_INVITATION">Undangan</SelectItem>
            <SelectItem value="MEETING_ATTENDANCE">Kehadiran</SelectItem>
            <SelectItem value="MEETING_MINUTES">Notulen</SelectItem>
            <SelectItem value="MEETING_DECISION">Keputusan</SelectItem>
            <SelectItem value="MEETING_ACTION_ITEM">Tindak Lanjut</SelectItem>
            <SelectItem value="USER">Pengguna</SelectItem>
            <SelectItem value="RESIDENT">Warga</SelectItem>
            <SelectItem value="APP_SETTINGS">Pengaturan</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari deskripsi/nama pengguna..." className="pl-8" />
        </div>
      </div>

      <div className="rounded-lg border bg-background">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Pengguna</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Objek</TableHead>
                <TableHead>Deskripsi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setDetail(r)}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell className="text-sm">{r.userName ?? '-'}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${ACTION_COLOR[r.action] ?? 'bg-muted text-muted-foreground'}`}>{r.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.objectType}</TableCell>
                  <TableCell className="max-w-md">
                    <p className="truncate text-sm">{r.description}</p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" /> Detail Jejak Audit
            </DialogTitle>
          </DialogHeader>
          {detail ? (
            <div className="space-y-3 text-sm">
              <p>{detail.description}</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <p>Pengguna: {detail.userName ?? '-'}</p>
                <p>Aksi: {detail.action}</p>
                <p>Objek: {detail.objectType}</p>
                <p>Waktu: {formatDateTime(detail.createdAt)}</p>
              </div>
              {detail.beforeData ? (
                <div>
                  <p className="mb-1 text-xs font-semibold">Nilai Sebelum</p>
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-[11px]">{prettyJson(detail.beforeData)}</pre>
                </div>
              ) : null}
              {detail.afterData ? (
                <div>
                  <p className="mb-1 text-xs font-semibold">Nilai Sesudah</p>
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-2 text-[11px]">{prettyJson(detail.afterData)}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
