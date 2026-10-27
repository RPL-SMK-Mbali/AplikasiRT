'use client'

// ============================================================
// Saldo Awal — daftar, buat, setujui, kunci, koreksi
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Lock, CheckCircle2, Pencil, History } from 'lucide-react'
import { useApp, useCan, PageHeader, StatusBadge, LoadingBox, ErrorBox, EmptyState, Field } from './shared'
import type { OpeningBalance as OBRow, CashAccountRow } from './types'
import { apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatRupiah, formatDate, formatDateTime } from '@/lib/format'
import { OB_STATUS, SOURCE_TYPE } from '@/lib/labels'
import { toast } from '@/hooks/use-toast'

export default function OpeningBalancesView() {
  const { user } = useApp()
  const can = useCan()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [correctRow, setCorrectRow] = useState<OBRow | null>(null)
  const [lockRow, setLockRow] = useState<OBRow | null>(null)
  const [detailRow, setDetailRow] = useState<OBRow | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['opening-balances'],
    queryFn: () => apiGet<OBRow[]>('/api/opening-balances'),
  })
  const { data: accounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: () => apiGet<CashAccountRow[]>('/api/cash-accounts'),
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => apiPut('/api/opening-balances', { id, action: 'approve' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opening-balances'] })
      toast({ title: 'Saldo awal disetujui', description: 'Saldo awal kini memengaruhi saldo resmi sistem.' })
    },
    onError: (e: Error) => toast({ title: 'Gagal menyetujui', description: e.message, variant: 'destructive' }),
  })
  const lockMut = useMutation({
    mutationFn: (id: string) => apiPut('/api/opening-balances', { id, action: 'lock' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opening-balances'] })
      setLockRow(null)
      toast({ title: 'Saldo awal dikunci', description: 'Saldo awal terkunci tidak dapat diedit atau dihapus langsung.' })
    },
    onError: (e: Error) => toast({ title: 'Gagal mengunci', description: e.message, variant: 'destructive' }),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />

  const rows = data ?? []

  return (
    <div>
      <PageHeader
        title="Saldo Awal"
        description="Saldo awal dicatat saat pertama kali aplikasi digunakan atau migrasi dari pembukuan manual. Saldo awal TIDAK dihitung sebagai pemasukan operasional dan hanya berlaku setelah disetujui."
        actions={
          can('opening_balance.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Buat Saldo Awal
            </Button>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Belum ada saldo awal"
          hint="Buat saldo awal untuk memulai pembukuan, misalnya saldo kas per akhir bulan lalu sebelum aplikasi digunakan."
        />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Tanggal Efektif</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.openingBalanceNumber}</TableCell>
                  <TableCell>{formatDate(r.effectiveDate)}</TableCell>
                  <TableCell className="text-right font-medium">{formatRupiah(r.amount)}</TableCell>
                  <TableCell className="text-xs">{SOURCE_TYPE[r.sourceType] ?? r.sourceType}</TableCell>
                  <TableCell>
                    <StatusBadge label={OB_STATUS[r.status]?.label ?? r.status} color={OB_STATUS[r.status]?.color ?? ''} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDetailRow(r)} title="Riwayat koreksi">
                        <History className="h-4 w-4" />
                      </Button>
                      {can('opening_balance.approve') && r.status === 'DRAFT' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={approveMut.isPending}
                          onClick={() => approveMut.mutate(r.id)}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Setujui
                        </Button>
                      ) : null}
                      {can('opening_balance.lock') && r.status === 'APPROVED' ? (
                        <Button variant="outline" size="sm" onClick={() => setLockRow(r)}>
                          <Lock className="mr-1 h-4 w-4" /> Kunci
                        </Button>
                      ) : null}
                      {can('opening_balance.correct') && (r.status === 'APPROVED' || r.status === 'LOCKED') ? (
                        <Button variant="outline" size="sm" onClick={() => setCorrectRow(r)}>
                          <Pencil className="mr-1 h-4 w-4" /> Koreksi
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} accounts={accounts ?? []} />

      {/* Konfirmasi kunci */}
      <AlertDialog open={!!lockRow} onOpenChange={(o) => !o && setLockRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kunci saldo awal {lockRow?.openingBalanceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Saldo awal yang dikunci menjadi final dan tidak dapat diubah atau dihapus secara langsung.
              Koreksi hanya dapat dilakukan melalui prosedur khusus dengan alasan dan persetujuan, yang tercatat dalam audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => lockRow && lockMut.mutate(lockRow.id)}>Kunci Final</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CorrectDialog row={correctRow} onClose={() => setCorrectRow(null)} />
      <DetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
      <p className="mt-4 text-xs text-muted-foreground">
        Contoh: saldo kas per 30 September Rp5.000.000 menjadi saldo awal 1 Oktober. Pemasukan Oktober Rp2.000.000 dan
        pengeluaran Rp1.250.000 menghasilkan saldo akhir Rp5.750.000 — saldo awal tidak dihitung ulang sebagai pemasukan.
      </p>
    </div>
  )
}

function CreateDialog({
  open, onClose, accounts,
}: {
  open: boolean
  onClose: () => void
  accounts: CashAccountRow[]
}) {
  const qc = useQueryClient()
  const [effectiveDate, setEffectiveDate] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [sourceType, setSourceType] = useState('PEMBUKUAN_SEBELUMNYA')
  const [cashAccountId, setCashAccountId] = useState('')

  const mut = useMutation({
    mutationFn: () =>
      apiPost('/api/opening-balances', {
        effectiveDate,
        amount: Number(amount),
        description,
        sourceType,
        cashAccountId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opening-balances'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Saldo awal dibuat', description: 'Berstatus DRAFT — menunggu persetujuan sebelum memengaruhi saldo resmi.' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal membuat saldo awal', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat Saldo Awal</DialogTitle>
          <DialogDescription>
            Tentukan tanggal efektif dan nominal. Konvensi yang direkomendasikan: saldo awal berlaku sebelum transaksi pada tanggal efektif.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Tanggal Efektif" required hint="Misalnya 1 Oktober 2026 untuk saldo kas per 30 September 2026">
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </Field>
          <Field label="Nominal (Rp)" required>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000000" />
          </Field>
          <Field label="Keterangan Sumber Saldo" required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contoh: Saldo kas fisal per 30 September 2026 hasil pembukuan manual buku kas" />
          </Field>
          <Field label="Jenis Sumber">
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PEMBUKUAN_SEBELUMNYA">Pembukuan Sebelumnya</SelectItem>
                <SelectItem value="MIGRASI_MANUAL">Migrasi Manual</SelectItem>
                <SelectItem value="LAINNYA">Sumber Lain</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {accounts.length > 0 ? (
            <Field label="Akun Kas" hint="Kosongkan untuk kas konsolidasi">
              <Select value={cashAccountId || 'ALL'} onValueChange={(v) => setCashAccountId(v === 'ALL' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Kas Konsolidasi (semua akun)</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={!effectiveDate || !amount || Number(amount) <= 0 || description.length < 3 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Menyimpan...' : 'Simpan (DRAFT)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CorrectDialog({ row, onClose }: { row: OBRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [newAmount, setNewAmount] = useState('')
  const [reason, setReason] = useState('')

  const mut = useMutation({
    mutationFn: () => apiPut('/api/opening-balances', { id: row!.id, action: 'correct', newAmount: Number(newAmount), reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opening-balances'] })
      toast({ title: 'Koreksi tercatat', description: 'Nominal lama, baru, alasan, dan penyetuju disimpan dalam riwayat koreksi.' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal mengoreksi', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Koreksi Saldo Awal {row?.openingBalanceNumber}</DialogTitle>
          <DialogDescription>
            Nominal saat ini: {row ? formatRupiah(row.amount) : '-'}. Koreksi dicatat dengan nominal lama, nominal baru, alasan, waktu, dan pihak penyetuju.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nominal Baru (Rp)" required>
            <Input type="number" min="0" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
          </Field>
          <Field label="Alasan Koreksi" required hint="Wajib dicantumkan, terutama untuk saldo awal yang telah terkunci">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: Perbaikan hasil hitung fisal kas setelah verifikasi ulang" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={!newAmount || Number(newAmount) <= 0 || reason.trim().length < 3 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            Simpan Koreksi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailDialog({ row, onClose }: { row: OBRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Riwayat Koreksi — {row?.openingBalanceNumber}</DialogTitle>
          <DialogDescription>
            Dibuat oleh {row?.createdBy?.name ?? '-'}
            {row?.approvedBy ? `, disetujui oleh ${row.approvedBy.name}` : ''}
          </DialogDescription>
        </DialogHeader>
        {row?.corrections.length ? (
          <div className="space-y-2">
            {row.corrections.map((c) => (
              <div key={c.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {formatRupiah(c.oldAmount)} → {formatRupiah(c.newAmount)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Alasan: {c.reason}</p>
                <p className="text-[10px] text-muted-foreground">{formatDateTime(c.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada koreksi untuk saldo awal ini.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
