'use client'

// ============================================================
// Ledger — buku besar dengan saldo berjalan + opening entry
// ============================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Download } from 'lucide-react'
import { useApp, PageHeader, LoadingBox, ErrorBox } from './shared'
import type { LedgerRow, CashAccountRow } from './types'
import { apiGet, downloadCsv } from '@/lib/api-client'
import { formatRupiah, formatDateShort } from '@/lib/format'

export default function LedgerView() {
  const { settings } = useApp()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [account, setAccount] = useState('ALL')

  const params = new URLSearchParams()
  if (from) params.set('from', new Date(from).toISOString())
  if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString())
  if (account !== 'ALL') params.set('account', account)
  const qs = params.toString()

  const { data, isLoading, error } = useQuery({
    queryKey: ['ledger', from, to, account],
    queryFn: () => apiGet<{ openingEntry: { date: string; amount: number } | null; rows: LedgerRow[] }>(`/api/reports?type=ledger${qs ? `&${qs}` : ''}`),
  })
  const { data: accounts } = useQuery({
    queryKey: ['cash-accounts'],
    queryFn: () => apiGet<CashAccountRow[]>('/api/cash-accounts'),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  const rows = data?.rows ?? []
  const finalBalance = rows.length ? rows[rows.length - 1].balance : 0

  function exportExcel() {
    downloadCsv(`ledger-rt${settings.nomorRT}.csv`, [
      [`Ledger Kas RT ${settings.nomorRT} / RW ${settings.nomorRW} — ${settings.desa}`],
      [],
      ['Tanggal', 'No. Transaksi', 'Jenis', 'Keterangan', 'Kategori', 'Masuk', 'Keluar', 'Saldo'],
      ...rows.map((r) => [
        formatDateShort(r.date),
        r.trxNumber,
        r.kind,
        r.description,
        r.category ?? '',
        r.in || '',
        r.out || '',
        r.balance,
      ]),
    ])
  }

  return (
    <div>
      <PageHeader
        title="Ledger Kas"
        description="Buku besar dengan saldo berjalan. Saldo awal aplikasi muncul sebagai opening entry khusus — terpisah dari pemasukan operasional."
        actions={
          <Button variant="outline" onClick={exportExcel} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Unduh Excel
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Dari Tanggal</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Sampai Tanggal</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Akun Kas</label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Kas Konsolidasi (semua akun)</SelectItem>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground">Saldo akhir tampilan</p>
            <p className="text-lg font-bold">{formatRupiah(finalBalance)}</p>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Belum ada transaksi pada rentang ini.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <div className="max-h-[32rem] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No. Transaksi</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Masuk</TableHead>
                  <TableHead className="text-right">Keluar</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.kind === 'OPENING' ? 'bg-muted/50' : ''}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateShort(r.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.trxNumber}</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="truncate text-sm">{r.description}</p>
                      {r.kind === 'OPENING' ? (
                        <p className="text-[10px] text-muted-foreground">Opening entry — bukan pemasukan operasional</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-sm text-emerald-700">{r.in ? formatRupiah(r.in) : ''}</TableCell>
                    <TableCell className="text-right text-sm text-rose-700">{r.out ? formatRupiah(r.out) : ''}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatRupiah(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
