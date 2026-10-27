'use client'

// ============================================================
// Transaksi — pemasukan/pengeluaran dengan workflow
// DRAFT → POSTED; CANCELLED; REVERSED (dengan transaksi pembalik)
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Send, Ban, Undo2, AlertTriangle } from 'lucide-react'
import { useApp, useCan, PageHeader, StatusBadge, LoadingBox, ErrorBox, EmptyState, Field } from './shared'
import type { TransactionRow, CashAccountRow } from './types'
import { apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatRupiah, formatDateShort, formatDateTime } from '@/lib/format'
import { TX_STATUS, TX_TYPE, TRX_CATEGORY } from '@/lib/labels'
import { toast } from '@/hooks/use-toast'

export default function TransactionsView() {
  const can = useCan()
  const qc = useQueryClient()
  const [tab, setTab] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [reverseRow, setReverseRow] = useState<TransactionRow | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', tab],
    queryFn: () => apiGet<TransactionRow[]>(`/api/transactions${tab === 'ALL' ? '' : `?status=${tab}`}`),
  })

  const actMut = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: string; reason?: string }) =>
      apiPut('/api/transactions', { id, action, reason }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['ledger'] })
      toast({
        title:
          vars.action === 'post' ? 'Transaksi diposting'
          : vars.action === 'cancel' ? 'Draft dibatalkan'
          : 'Transaksi dibalik (REVERSED)',
        description:
          vars.action === 'post' ? 'Transaksi kini memengaruhi saldo resmi sesuai tanggal transaksinya.'
          : vars.action === 'reverse' ? 'Histori tetap terjaga; transaksi pembalik telah dibuat.'
          : undefined,
      })
    },
    onError: (e: Error) => toast({ title: 'Gagal memproses transaksi', description: e.message, variant: 'destructive' }),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  const rows = data ?? []

  return (
    <div>
      <PageHeader
        title="Transaksi Keuangan"
        description="Hanya transaksi POSTED yang memengaruhi saldo. Transaksi bertanggal dalam periode CLOSED/LOCKED ditolak saat posting melalui prosedur normal."
        actions={
          can('transaction.create') ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Catat Transaksi
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="ALL">Semua</TabsTrigger>
          <TabsTrigger value="DRAFT">Draft</TabsTrigger>
          <TabsTrigger value="POSTED">Terposting</TabsTrigger>
          <TabsTrigger value="REVERSED">Dibalik</TabsTrigger>
          <TabsTrigger value="CANCELLED">Dibatalkan</TabsTrigger>
        </TabsList>
      </Tabs>

      {rows.length === 0 ? (
        <EmptyState title="Belum ada transaksi" hint="Catat pemasukan atau pengeluaran pertama Anda. Pembayaran iuran otomatis tercatat di menu Iuran." />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor / Tanggal</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="font-mono text-xs">{t.trxNumber}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDateShort(t.transactionDate)}</p>
                  </TableCell>
                  <TableCell>
                    <p className={`text-sm font-medium ${t.type === 'INCOME' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {TX_TYPE[t.type] ?? t.type}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{TRX_CATEGORY[t.category ?? ''] ?? t.category ?? '-'}</p>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate text-sm">{t.description}</p>
                    {t.reversalReason ? (
                      <p className="text-[10px] text-rose-700">Alasan pembalikan: {t.reversalReason}</p>
                    ) : null}
                    {t.reversalOf ? (
                      <p className="text-[10px] text-muted-foreground">Pembalikan dari {t.reversalOf.trxNumber}</p>
                    ) : null}
                    {t.postedAt ? (
                      <p className="text-[10px] text-muted-foreground">Diposting {formatDateTime(t.postedAt)}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${t.type === 'INCOME' || t.type === 'TRANSFER_IN' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatRupiah(t.amount)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={TX_STATUS[t.status]?.label ?? t.status} color={TX_STATUS[t.status]?.color ?? ''} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {can('transaction.post') && t.status === 'DRAFT' ? (
                        <Button variant="outline" size="sm" disabled={actMut.isPending} onClick={() => actMut.mutate({ id: t.id, action: 'post' })}>
                          <Send className="mr-1 h-3.5 w-3.5" /> Posting
                        </Button>
                      ) : null}
                      {can('transaction.cancel') && t.status === 'DRAFT' ? (
                        <Button variant="ghost" size="sm" disabled={actMut.isPending} onClick={() => actMut.mutate({ id: t.id, action: 'cancel' })}>
                          <Ban className="mr-1 h-3.5 w-3.5" /> Batalkan
                        </Button>
                      ) : null}
                      {can('transaction.reverse') && t.status === 'POSTED' ? (
                        <Button variant="ghost" size="sm" onClick={() => setReverseRow(t)} title="Balik transaksi">
                          <Undo2 className="h-3.5 w-3.5" />
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

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ReverseDialog
        row={reverseRow}
        onClose={() => setReverseRow(null)}
        onSubmit={(reason) => {
          actMut.mutate({ id: reverseRow!.id, action: 'reverse', reason })
          setReverseRow(null)
        }}
      />
    </div>
  )
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { settings } = useApp()
  const [type, setType] = useState('INCOME')
  const [category, setCategory] = useState('OPERASIONAL')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState('')
  const [postNow, setPostNow] = useState(true)

  const { data: accounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: () => apiGet<CashAccountRow[]>('/api/cash-accounts'),
  })

  const mut = useMutation({
    mutationFn: () =>
      apiPost('/api/transactions', {
        type,
        category,
        amount: Number(amount),
        transactionDate: date,
        description,
        cashAccountId: accountId,
        postNow,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: postNow ? 'Transaksi terposting' : 'Draft transaksi tersimpan' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal menyimpan transaksi', description: e.message, variant: 'destructive' }),
  })

  const categories =
    type === 'INCOME'
      ? ['IURAN', 'DONASI', 'KEGIATAN', 'LAINNYA']
      : ['OPERASIONAL', 'KEAMANAN', 'KEBERSIHAN', 'SOSIAL', 'KEGIATAN', 'PEMBANGUNAN', 'LAINNYA']

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Catat Transaksi</DialogTitle>
          <DialogDescription>
            Zona waktu: Asia/Jakarta. Saldo awal TIDAK dicatat di sini — gunakan menu Saldo Awal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Jenis" required>
              <Select value={type} onValueChange={(v) => { setType(v); setCategory(v === 'INCOME' ? 'IURAN' : 'OPERASIONAL') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Pemasukan</SelectItem>
                  <SelectItem value="EXPENSE">Pengeluaran</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Kategori" required>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{TRX_CATEGORY[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nominal (Rp)" required>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Tanggal Transaksi" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {accounts && accounts.length > 0 ? (
            <Field label="Akun Kas">
              <Select value={accountId || 'NONE'} onValueChange={(v) => setAccountId(v === 'NONE' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Kas Umum (tanpa akun khusus)</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Keterangan" required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contoh: Pembelian lampu penerangan gang untuk keamanan" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={postNow} onChange={(e) => setPostNow(e.target.checked)} className="h-4 w-4" />
            Langsung posting (memengaruhi saldo)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={!amount || Number(amount) <= 0 || !date || description.trim().length < 3 || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Menyimpan...' : postNow ? 'Simpan & Posting' : 'Simpan Draft'}
          </Button>
        </DialogFooter>
        <p className="text-[11px] text-muted-foreground">
          Identitas RT {settings.nomorRT}/{settings.nomorRW} — {settings.desa}
        </p>
      </DialogContent>
    </Dialog>
  )
}

function ReverseDialog({
  row, onClose, onSubmit,
}: {
  row: TransactionRow | null
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <AlertDialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Balik transaksi {row?.trxNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="mb-2 flex items-center gap-1.5 text-amber-700">
              <AlertTriangle className="h-4 w-4" /> Histori tidak dihapus.
            </span>
            Sistem akan membuat transaksi pembalik (POSTED) dengan nominal {row ? formatRupiah(row.amount) : ''} sehingga dampak bersih menjadi nol.
            Alasan wajib dicantumkan dan seluruh proses tercatat dalam audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wajib: alasan pembalikan. Contoh: salah input nominal, seharusnya Rp150.000" />
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            disabled={reason.trim().length < 5}
            onClick={(e) => {
              e.preventDefault()
              onSubmit(reason)
            }}
          >
            Balik Transaksi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
