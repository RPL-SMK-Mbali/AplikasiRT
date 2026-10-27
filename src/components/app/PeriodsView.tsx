'use client'

// ============================================================
// Periode Akuntansi — buka, review, tutup, kunci, buka kembali
// Snapshot tersimpan saat penutupan; konsistensi dicek vs ledger
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Eye, Lock, LockOpen, CheckCircle2 } from 'lucide-react'
import { useApp, useCan, PageHeader, StatusBadge, LoadingBox, ErrorBox, EmptyState, Field } from './shared'
import type { AccountingPeriod } from './types'
import { apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatRupiah, formatDateTime } from '@/lib/format'
import { PERIOD_STATUS } from '@/lib/labels'
import { toast } from '@/hooks/use-toast'

export default function PeriodsView() {
  const can = useCan()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [reopenRow, setReopenRow] = useState<AccountingPeriod | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['periods'],
    queryFn: () => apiGet<AccountingPeriod[]>('/api/periods'),
  })

  const actMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => apiPut('/api/periods', { id, action }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({
        title:
          vars.action === 'review' ? 'Periode masuk tahap REVIEW'
          : vars.action === 'close' ? 'Periode ditutup & snapshot tersimpan'
          : vars.action === 'lock' ? 'Periode terkunci final'
          : 'Periode dibuka kembali',
      })
    },
    onError: (e: Error) => toast({ title: 'Gagal memproses periode', description: e.message, variant: 'destructive' }),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />

  const rows = data ?? []

  return (
    <div>
      <PageHeader
        title="Periode Akuntansi"
        description="Periode bulanan (contoh: 2026-10). Saldo akhir = saldo awal + pemasukan POSTED − pengeluaran POSTED. Saldo awal periode berikutnya adalah saldo akhir resmi periode sebelumnya."
        actions={
          can('accounting_period.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Buka Periode Baru
            </Button>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada periode akuntansi"
          hint="Buka periode bulanan agar transaksi, rekonsiliasi, dan laporan bulanan dapat dikelola sesuai alur akuntansi."
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Saldo Awal</TableHead>
                  <TableHead className="text-right">Pemasukan</TableHead>
                  <TableHead className="text-right">Pengeluaran</TableHead>
                  <TableHead className="text-right">Saldo Akhir</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const st = PERIOD_STATUS[p.status]
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.periodName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{p.periodCode}</p>
                        {p.reopenReason ? (
                          <p className="mt-0.5 text-[10px] text-amber-700">Dibuka kembali: {p.reopenReason.slice(0, 60)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={st?.label ?? p.status} color={st?.color ?? ''} />
                        {p.lockedAt ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">Dikunci {formatDateTime(p.lockedAt)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatRupiah(p.live.opening)}</TableCell>
                      <TableCell className="text-right text-sm text-emerald-700">{formatRupiah(p.live.income)}</TableCell>
                      <TableCell className="text-right text-sm text-rose-700">{formatRupiah(p.live.expense)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatRupiah(p.live.closing)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {p.status === 'OPEN' && can('accounting_period.review') ? (
                            <Button
                              variant="outline" size="sm"
                              disabled={actMut.isPending}
                              onClick={() => actMut.mutate({ id: p.id, action: 'review' })}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" /> Review
                            </Button>
                          ) : null}
                          {(p.status === 'OPEN' || p.status === 'REVIEW') && can('accounting_period.close') ? (
                            <Button
                              variant="outline" size="sm"
                              disabled={actMut.isPending}
                              onClick={() => actMut.mutate({ id: p.id, action: 'close' })}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Tutup
                            </Button>
                          ) : null}
                          {p.status === 'CLOSED' && can('accounting_period.lock') ? (
                            <Button
                              variant="outline" size="sm"
                              disabled={actMut.isPending}
                              onClick={() => actMut.mutate({ id: p.id, action: 'lock' })}
                            >
                              <Lock className="mr-1 h-3.5 w-3.5" /> Kunci
                            </Button>
                          ) : null}
                          {(p.status === 'CLOSED' || p.status === 'LOCKED') && can('accounting_period.reopen') ? (
                            <Button variant="outline" size="sm" onClick={() => setReopenRow(p)}>
                              <LockOpen className="mr-1 h-3.5 w-3.5" /> Buka Kembali
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-2">Alur penutupan periode</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                OPEN → periksa transaksi DRAFT → periksa transaksi POSTED → periksa pembayaran iuran → rekonsiliasi → hitung saldo
                akhir → bandingkan dengan saldo aktual → review laporan → persetujuan penutupan → snapshot disimpan → CLOSED/LOCKED
                → laporan terbit. Penutupan otomatis ditolak bila masih ada transaksi DRAFT atau rekonsiliasi berselisih yang belum diselesaikan.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <CreatePeriodDialog open={createOpen} onClose={() => setCreateOpen(false)} existing={rows.map((r) => r.periodCode)} />
      <ReopenDialog row={reopenRow} onClose={() => setReopenRow(null)} />
    </div>
  )
}

function CreatePeriodDialog({
  open, onClose, existing,
}: {
  open: boolean
  onClose: () => void
  existing: string[]
}) {
  const qc = useQueryClient()
  const now = new Date()
  const defaultCode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [code, setCode] = useState(defaultCode)
  const dup = existing.includes(code)

  const mut = useMutation({
    mutationFn: () => apiPost('/api/periods', { periodCode: code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      toast({ title: 'Periode dibuka', description: 'Periode berstatus OPEN — transaksi dapat dicatat.' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal membuka periode', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buka Periode Akuntansi Baru</DialogTitle>
          <DialogDescription>
            Periode bulanan tidak boleh tumpang tindih. Periode berikutnya menggunakan saldo akhir resmi periode sebelumnya.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Kode Periode (YYYY-MM)" required>
            <Input type="month" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          {dup ? (
            <p className="text-sm text-destructive">Periode {code} sudah ada. Pilih periode lain.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Periode yang sudah ada: {existing.length ? existing.join(', ') : 'belum ada'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={!code || dup || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? 'Membuka...' : 'Buka Periode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReopenDialog({ row, onClose }: { row: AccountingPeriod | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')

  const mut = useMutation({
    mutationFn: () => apiPut('/api/periods', { id: row!.id, action: 'reopen', reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      toast({ title: 'Periode dibuka kembali', description: 'Pembukaan kembali tercatat dalam audit log dengan alasan tertulis.' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal membuka kembali', description: e.message, variant: 'destructive' }),
  })

  return (
    <AlertDialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Buka kembali periode {row?.periodName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Pembukaan kembali memerlukan otorisasi khusus, alasan tertulis, dan tercatat dalam audit log.
            Transaksi baru kembali dapat diposting pada periode ini hingga ditutup ulang.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Wajib: alasan pembukaan kembali. Contoh: ditemukan transaksi terlambat dari 12 Oktober yang belum tercatat."
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={reason.trim().length < 5 || mut.isPending}
            onClick={(e) => {
              e.preventDefault()
              mut.mutate()
            }}
          >
            {mut.isPending ? 'Memproses...' : 'Buka Kembali'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
