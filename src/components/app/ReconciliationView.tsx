'use client'

// ============================================================
// Rekonsiliasi Kas — bandingkan saldo sistem vs aktual
// Selisih = Saldo Aktual − Saldo Sistem. Dilarang transaksi fiktif.
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PageHeader, StatusBadge, LoadingBox, ErrorBox, EmptyState, Field } from './shared'
import type { ReconciliationRow, CashAccountRow } from './types'
import { apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatRupiah, formatDateShort, formatDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  COCOK: { label: 'Cocok', color: 'bg-emerald-100 text-emerald-800' },
  SELISIH: { label: 'Selisih', color: 'bg-rose-100 text-rose-700' },
  PERLU_PENJELASAN: { label: 'Perlu Penjelasan', color: 'bg-amber-100 text-amber-800' },
  SELESAI: { label: 'Selesai', color: 'bg-teal-100 text-teal-800' },
}

export default function ReconciliationView() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['reconciliations'],
    queryFn: () =>
      apiGet<{ rows: ReconciliationRow[]; accounts: CashAccountRow[]; systemBalances: { id: string; balance: number }[] }>(
        '/api/reconciliations'
      ),
  })

  const resolveMut = useMutation({
    mutationFn: (id: string) => apiPut('/api/reconciliations', { id, approve: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliations'] })
      toast({ title: 'Rekonsiliasi diselesaikan', description: 'Pengecualian selisih disetujui dan tercatat dalam audit log.' })
    },
    onError: (e: Error) => toast({ title: 'Gagal', description: e.message, variant: 'destructive' }),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  const rows = data?.rows ?? []

  return (
    <div>
      <PageHeader
        title="Rekonsiliasi Kas"
        description="Bandingkan saldo sistem dengan uang kas aktual. Jika terdapat selisih, sistem meminta penjelasan. Dilarang membuat transaksi fiktif untuk memaksa saldo sama."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Rekonsiliasi Baru
          </Button>
        }
      />

      {rows.some((r) => r.status === 'SELISIH') ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Terdapat selisih kas belum terselesaikan</AlertTitle>
          <AlertDescription>
            Selisih harus dijelaskan sebelum periode terkait dapat ditutup. Periksa catatan pada baris berselisih.
          </AlertDescription>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Belum ada rekonsiliasi" hint="Lakukan rekonsiliasi rutin, terutama sebelum menutup periode akuntansi." />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Akun</TableHead>
                <TableHead className="text-right">Saldo Sistem</TableHead>
                <TableHead className="text-right">Saldo Aktual</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{formatDateShort(r.reconcileDate)}</TableCell>
                  <TableCell className="text-sm">{r.cashAccount?.name ?? '-'}</TableCell>
                  <TableCell className="text-right text-sm">{formatRupiah(r.systemBalance)}</TableCell>
                  <TableCell className="text-right text-sm">{formatRupiah(r.actualBalance)}</TableCell>
                  <TableCell className={`text-right text-sm font-medium ${Math.abs(r.difference) > 0.01 ? 'text-destructive' : 'text-emerald-700'}`}>
                    {formatRupiah(r.difference)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={STATUS_MAP[r.status]?.label ?? r.status} color={STATUS_MAP[r.status]?.color ?? ''} />
                    {r.approvedBy ? <p className="mt-1 text-[10px] text-muted-foreground">Disetujui {r.approvedBy.name}</p> : null}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate text-xs text-muted-foreground" title={r.notes ?? ''}>{r.notes ?? '-'}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {(r.status === 'SELISIH' || r.status === 'PERLU_PENJELASAN') ? (
                      <Button
                        variant="outline" size="sm"
                        disabled={resolveMut.isPending}
                        onClick={() => resolveMut.mutate(r.id)}
                        title="Setujui pengecualian & selesaikan"
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Selesaikan
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{r.resolvedAt ? formatDateTime(r.resolvedAt) : ''}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateDialog open={open} onClose={() => setOpen(false)} accounts={data?.accounts ?? []} balances={data?.systemBalances ?? []} />
    </div>
  )
}

function CreateDialog({
  open, onClose, accounts, balances,
}: {
  open: boolean
  onClose: () => void
  accounts: CashAccountRow[]
  balances: { id: string; balance: number }[]
}) {
  const qc = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [actual, setActual] = useState('')
  const [notes, setNotes] = useState('')

  const systemBalance = balances.find((b) => b.id === accountId)?.balance ?? 0
  const difference = actual ? Number(actual) - systemBalance : null

  const mut = useMutation({
    mutationFn: () =>
      apiPost('/api/reconciliations', { reconcileDate: date, cashAccountId: accountId, actualBalance: Number(actual), notes }),
    onSuccess: (_d) => {
      qc.invalidateQueries({ queryKey: ['reconciliations'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Rekonsiliasi tercatat' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal menyimpan rekonsiliasi', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rekonsiliasi Kas Baru</DialogTitle>
          <DialogDescription>
            Saldo sistem dihitung otomatis dari ledger pada tanggal yang dipilih. Selisih = Saldo Aktual − Saldo Sistem.
          </DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada akun kas. Pembukuan menggunakan kas konsolidasi — pilih tanggal dan isi saldo aktual fisal.</p>
        ) : null}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tanggal" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {accounts.length > 0 ? (
              <Field label="Akun Kas" required>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-xs font-medium text-muted-foreground">Saldo Sistem (otomatis dari ledger)</CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <p className="text-lg font-bold">{formatRupiah(systemBalance)}</p>
            </CardContent>
          </Card>
          <Field label="Saldo Aktual (hitung fisal)" required>
            <Input type="number" step="0.01" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" />
          </Field>
          {difference !== null ? (
            <Alert className={Math.abs(difference) > 0.01 ? 'border-destructive/40 text-destructive' : 'border-emerald-500/40 text-emerald-700'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">
                {Math.abs(difference) > 0.01
                  ? `Selisih terdeteksi: ${formatRupiah(difference)}`
                  : 'Saldo cocok'}
              </AlertTitle>
              <AlertDescription className="text-xs">
                {Math.abs(difference) > 0.01
                  ? 'Wajib mencantumkan penjelasan. Jangan membuat transaksi fiktif untuk menutup selisih.'
                  : 'Rekonsiliasi akan tercatat berstatus COCOK.'}
              </AlertDescription>
            </Alert>
          ) : null}
          <Field label="Catatan / Penjelasan">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: selisih karena pengeluaran darurat 12 Okt belum tercatat; akan dibuatkan transaksi koreksi" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!date || actual === '' || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? 'Menyimpan...' : 'Simpan Rekonsiliasi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
