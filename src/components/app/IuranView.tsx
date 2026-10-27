'use client'

// ============================================================
// Iuran & Pembayaran — jenis iuran + pembayaran tertaut ledger
// Pembayaran otomatis membuat transaksi pemasukan POSTED
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Plus, Download } from 'lucide-react'
import { useApp, useCan, PageHeader, LoadingBox, ErrorBox, EmptyState, Field } from './shared'
import type { FeeTypeRow, PaymentRow, ResidentRow } from './types'
import { apiGet, apiPost, downloadCsv } from '@/lib/api-client'
import { formatRupiah, formatDateShort } from '@/lib/format'
import { toast } from '@/hooks/use-toast'

interface IuranData {
  feeTypes: FeeTypeRow[]
  payments: PaymentRow[]
  residents: ResidentRow[]
  period: string
}

function currentPeriodCode(): string {
  const now = new Date(new Date().getTime() + 7 * 3600 * 1000)
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function IuranView() {
  const can = useCan()
  const { settings } = useApp()
  const [period, setPeriod] = useState(currentPeriodCode())
  const [feeOpen, setFeeOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['iuran', period],
    queryFn: () => apiGet<IuranData>(`/api/iuran?period=${period}`),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  if (!data) return null

  const totalPaid = data.payments.reduce((s, p) => s + p.amount, 0)

  function exportExcel() {
    downloadCsv(`pembayaran-iuran-${period}.csv`, [
      ['Laporan Pembayaran Iuran', `RT ${settings.nomorRT}/RW ${settings.nomorRW}`, data.period],
      [],
      ['Tanggal Bayar', 'Warga', 'Rumah', 'Jenis Iuran', 'Periode', 'Nominal', 'No. Transaksi', 'Dicatat Oleh'],
      ...data.payments.map((p) => [
        formatDateShort(p.paidAt),
        p.resident?.fullName ?? '',
        p.resident?.houseNumber ?? '',
        p.feeType?.name ?? '',
        p.periodCode,
        p.amount,
        p.transaction?.trxNumber ?? '',
        p.recordedBy?.name ?? '',
      ]),
      [],
      ['Total', '', '', '', '', totalPaid],
    ])
  }

  return (
    <div>
      <PageHeader
        title="Iuran & Pembayaran"
        description="Pembayaran iuran yang dicatat otomatis membuat transaksi pemasukan POSTED yang tertaut — pembayaran iuran selalu terhubung ke ledger."
        actions={
          <div className="flex flex-wrap gap-2">
            <Input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-40"
            />
            <Button variant="outline" onClick={exportExcel}>
              <Download className="mr-2 h-4 w-4" /> Excel
            </Button>
            {can('iuran.manage') ? (
              <Button variant="outline" onClick={() => setFeeOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Jenis Iuran
              </Button>
            ) : null}
            {can('payment.manage') ? (
              <Button onClick={() => setPayOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Catat Pembayaran
              </Button>
            ) : null}
          </div>
        }
      />

      <Tabs defaultValue="pembayaran">
        <TabsList>
          <TabsTrigger value="pembayaran">Pembayaran ({data.payments.length})</TabsTrigger>
          <TabsTrigger value="jenis">Jenis Iuran ({data.feeTypes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pembayaran">
          {data.payments.length === 0 ? (
            <EmptyState title="Belum ada pembayaran pada periode ini" hint="Pilih periode lain atau catat pembayaran iuran warga." />
          ) : (
            <div className="rounded-lg border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Warga</TableHead>
                    <TableHead>Jenis Iuran</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>No. Transaksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{formatDateShort(p.paidAt)}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{p.resident?.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">Rumah {p.resident?.houseNumber}</p>
                      </TableCell>
                      <TableCell className="text-sm">{p.feeType?.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.periodCode}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-700">{formatRupiah(p.amount)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.transaction?.trxNumber ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">Total</TableCell>
                    <TableCell className="text-right font-bold text-emerald-700">{formatRupiah(totalPaid)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="jenis">
          {data.feeTypes.length === 0 ? (
            <EmptyState title="Belum ada jenis iuran" hint="Buat jenis iuran seperti Iuran Bulanan, Iuran Keamanan, atau Iuran Kebersihan." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.feeTypes.map((f) => (
                <Card key={f.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm font-semibold">
                      {f.name}
                      {f.isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Aktif</Badge>
                      ) : (
                        <Badge variant="secondary">Nonaktif</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold">{formatRupiah(f.amount)}</p>
                    <p className="text-xs text-muted-foreground">per {f.frequency.toLowerCase()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <FeeTypeDialog open={feeOpen} onClose={() => setFeeOpen(false)} />
      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} data={data} period={period} />
    </div>
  )
}

function FeeTypeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('BULANAN')

  const mut = useMutation({
    mutationFn: () => apiPost('/api/iuran', { kind: 'feeType', name, amount: Number(amount), frequency }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iuran'] })
      toast({ title: 'Jenis iuran dibuat' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal membuat jenis iuran', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat Jenis Iuran</DialogTitle>
          <DialogDescription>Contoh: Iuran Bulanan Rp25.000 per bulan, Iuran Keamanan Rp15.000 per bulan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nama Iuran" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Iuran Bulanan" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nominal (Rp)" required>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Frekuensi">
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BULANAN">Bulanan</SelectItem>
                  <SelectItem value="TAHUNAN">Tahunan</SelectItem>
                  <SelectItem value="SEKALI">Sekali</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={name.trim().length < 2 || !amount || Number(amount) <= 0 || mut.isPending} onClick={() => mut.mutate()}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaymentDialog({
  open, onClose, data, period,
}: {
  open: boolean
  onClose: () => void
  data: IuranData
  period: string
}) {
  const qc = useQueryClient()
  const [residentId, setResidentId] = useState('')
  const [feeTypeId, setFeeTypeId] = useState('')
  const [periodCode, setPeriodCode] = useState(period)
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))

  const selectedFee = data.feeTypes.find((f) => f.id === feeTypeId)

  const mut = useMutation({
    mutationFn: () =>
      apiPost('/api/iuran', {
        kind: 'payment',
        residentId,
        feeTypeId,
        periodCode,
        amount: Number(amount),
        paidAt,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iuran'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast({ title: 'Pembayaran tercatat', description: 'Transaksi pemasukan otomatis dibuat dan diposting ke ledger.' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal mencatat pembayaran', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catat Pembayaran Iuran</DialogTitle>
          <DialogDescription>
            Satu warga hanya dapat tercatat sekali per jenis iuran per periode. Pembayaran langsung memengaruhi saldo kas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Warga" required>
            <Select value={residentId} onValueChange={setResidentId}>
              <SelectTrigger><SelectValue placeholder="Pilih warga" /></SelectTrigger>
              <SelectContent>
                {data.residents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.fullName} — Rumah {r.houseNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Jenis Iuran" required>
            <Select
              value={feeTypeId}
              onValueChange={(v) => {
                setFeeTypeId(v)
                const f = data.feeTypes.find((x) => x.id === v)
                if (f) setAmount(String(f.amount))
              }}
            >
              <SelectTrigger><SelectValue placeholder="Pilih jenis iuran" /></SelectTrigger>
              <SelectContent>
                {data.feeTypes.filter((f) => f.isActive).map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name} ({formatRupiah(f.amount)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Periode Iuran" required>
              <Input type="month" value={periodCode} onChange={(e) => setPeriodCode(e.target.value)} />
            </Field>
            <Field label="Nominal (Rp)" required>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
          <Field label="Tanggal Bayar" required>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          {selectedFee ? (
            <p className="text-xs text-muted-foreground">
              Nominal standar {selectedFee.name}: {formatRupiah(selectedFee.amount)} per {selectedFee.frequency.toLowerCase()}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={!residentId || !feeTypeId || !periodCode || !amount || Number(amount) <= 0 || !paidAt || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? 'Menyimpan...' : 'Catat & Posting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
