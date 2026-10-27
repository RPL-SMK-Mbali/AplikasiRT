'use client'

// ============================================================
// Laporan — bulanan & tahunan, konsisten dengan ledger
// Format cetak A4 dengan identitas RT
// ============================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Download, Printer } from 'lucide-react'
import { useApp, PageHeader, LoadingBox, ErrorBox } from './shared'
import type { TransactionRow } from './types'
import { apiGet, downloadCsv } from '@/lib/api-client'
import { formatRupiah, formatDateShort, periodNameOf } from '@/lib/format'
import { TX_TYPE } from '@/lib/labels'

interface MonthlyData {
  type: 'monthly'
  period: string
  totals: { opening: number; income: number; expense: number; closing: number }
  transactions: TransactionRow[]
}

interface AnnualData {
  type: 'annual'
  year: number
  opening: number
  months: { month: string; income: number; expense: number; net: number }[]
  totalIncome: number
  totalExpense: number
  closing: number
}

export default function ReportsView() {
  const { settings } = useApp()
  const now = new Date(new Date().getTime() + 7 * 3600 * 1000)
  const [tab, setTab] = useState('monthly')
  const [period, setPeriod] = useState(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`)
  const [year, setYear] = useState(String(now.getUTCFullYear()))

  const monthly = useQuery({
    queryKey: ['report-monthly', period],
    queryFn: () => apiGet<MonthlyData>(`/api/reports?type=monthly&period=${period}`),
    enabled: tab === 'monthly',
  })
  const annual = useQuery({
    queryKey: ['report-annual', year],
    queryFn: () => apiGet<AnnualData>(`/api/reports?type=annual&year=${year}`),
    enabled: tab === 'annual',
  })

  const years = Array.from({ length: 5 }, (_, i) => String(now.getUTCFullYear() - i))

  function exportMonthly(m: MonthlyData) {
    downloadCsv(`laporan-bulanan-${m.period}.csv`, [
      [`Laporan Keuangan Bulanan — ${periodNameOf(m.period)}`],
      [`RT ${settings.nomorRT} / RW ${settings.nomorRW} — ${settings.desa}`],
      [],
      ['Saldo Awal', m.totals.opening],
      ['Total Pemasukan', m.totals.income],
      ['Total Pengeluaran', m.totals.expense],
      ['Saldo Akhir', m.totals.closing],
      [],
      ['Tanggal', 'No. Transaksi', 'Jenis', 'Kategori', 'Keterangan', 'Masuk', 'Keluar'],
      ...m.transactions.map((t) => [
        formatDateShort(t.transactionDate),
        t.trxNumber,
        TX_TYPE[t.type] ?? t.type,
        t.category ?? '',
        t.description,
        t.type === 'INCOME' ? t.amount : '',
        t.type === 'EXPENSE' ? t.amount : '',
      ]),
    ])
  }

  function exportAnnual(a: AnnualData) {
    downloadCsv(`laporan-tahunan-${a.year}.csv`, [
      [`Laporan Keuangan Tahunan ${a.year}`],
      [`RT ${settings.nomorRT} / RW ${settings.nomorRW} — ${settings.desa}`],
      [],
      ['Saldo Awal Tahun', a.opening],
      [],
      ['Bulan', 'Pemasukan', 'Pengeluaran', 'Selisih'],
      ...a.months.map((m) => [m.month, m.income, m.expense, m.net]),
      [],
      ['Total Pemasukan', a.totalIncome],
      ['Total Pengeluaran', a.totalExpense],
      ['Saldo Akhir Tahun', a.closing],
    ])
  }

  function printReport() {
    window.print()
  }

  return (
    <div>
      <PageHeader
        title="Laporan Keuangan"
        description="Laporan bulanan dan tahunan dihitung langsung dari ledger — konsisten dengan saldo dashboard, transparansi, dan periode akuntansi."
        actions={
          <Button variant="outline" onClick={printReport} className="print:hidden">
            <Printer className="mr-2 h-4 w-4" /> Cetak / Simpan PDF
          </Button>
        }
      />

      <div className="print:hidden">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="monthly">Laporan Bulanan</TabsTrigger>
            <TabsTrigger value="annual">Laporan Tahunan</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
              {monthly.data ? (
                <Button variant="outline" size="sm" onClick={() => exportMonthly(monthly.data!)}>
                  <Download className="mr-2 h-4 w-4" /> Excel
                </Button>
              ) : null}
            </div>
            {monthly.isLoading ? <LoadingBox /> : monthly.error ? <ErrorBox message={(monthly.error as Error).message} /> : monthly.data ? (
              <MonthlyReport m={monthly.data} />
            ) : null}
          </TabsContent>

          <TabsContent value="annual">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {annual.data ? (
                <Button variant="outline" size="sm" onClick={() => exportAnnual(annual.data!)}>
                  <Download className="mr-2 h-4 w-4" /> Excel
                </Button>
              ) : null}
            </div>
            {annual.isLoading ? <LoadingBox /> : annual.error ? <ErrorBox message={(annual.error as Error).message} /> : annual.data ? (
              <AnnualReport a={annual.data} />
            ) : null}
          </TabsContent>
        </Tabs>
      </div>

      {/* Versi cetak */}
      <div className="hidden print:block">
        {tab === 'monthly' && monthly.data ? (
          <MonthlyReport m={monthly.data} printMode />
        ) : tab === 'annual' && annual.data ? (
          <AnnualReport a={annual.data} printMode />
        ) : null}
      </div>
    </div>
  )
}

function ReportHeader({ title }: { title: string }) {
  const { settings } = useApp()
  return (
    <div className="mb-4 text-center">
      <p className="text-lg font-bold uppercase">Laporan Keuangan {settings.namaRT}</p>
      <p className="text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">
        RT {settings.nomorRT} / RW {settings.nomorRW} — {settings.desa} · Dicetak {formatDateShort(new Date())}
      </p>
    </div>
  )
}

function MonthlyReport({ m, printMode }: { m: MonthlyData; printMode?: boolean }) {
  return (
    <div className="space-y-4">
      {!printMode ? <ReportHeader title={`Bulanan — ${periodNameOf(m.period)}`} /> : (
        <div className="mb-4 text-center">
          <p className="text-lg font-bold uppercase">Laporan Keuangan Bulanan</p>
          <p className="text-sm">{periodNameOf(m.period)}</p>
        </div>
      )}
      <div className={`grid gap-3 ${printMode ? 'grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'}`}>
        <SummaryBox label="Saldo Awal" value={m.totals.opening} />
        <SummaryBox label="Total Pemasukan" value={m.totals.income} tone="in" />
        <SummaryBox label="Total Pengeluaran" value={m.totals.expense} tone="out" />
        <SummaryBox label="Saldo Akhir" value={m.totals.closing} strong />
      </div>
      <Card>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>No.</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Masuk</TableHead>
                <TableHead className="text-right">Keluar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Tidak ada transaksi POSTED pada periode ini
                  </TableCell>
                </TableRow>
              ) : (
                m.transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDateShort(t.transactionDate)}</TableCell>
                    <TableCell className="font-mono text-[11px]">{t.trxNumber}</TableCell>
                    <TableCell className="text-sm">{t.description}</TableCell>
                    <TableCell className="text-right text-sm text-emerald-700">{t.type === 'INCOME' ? formatRupiah(t.amount) : ''}</TableCell>
                    <TableCell className="text-right text-sm text-rose-700">{t.type === 'EXPENSE' ? formatRupiah(t.amount) : ''}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Rumus: Saldo Akhir = Saldo Awal + Pemasukan POSTED − Pengeluaran POSTED. Transfer internal tidak dihitung sebagai pemasukan/pengeluaran baru.
      </p>
    </div>
  )
}

function AnnualReport({ a, printMode }: { a: AnnualData; printMode?: boolean }) {
  return (
    <div className="space-y-4">
      {!printMode ? <ReportHeader title={`Tahunan — ${a.year}`} /> : (
        <div className="mb-4 text-center">
          <p className="text-lg font-bold uppercase">Laporan Keuangan Tahunan</p>
          <p className="text-sm">{a.year}</p>
        </div>
      )}
      <div className={`grid gap-3 ${printMode ? 'grid-cols-4' : 'grid-cols-2 lg:grid-cols-4'}`}>
        <SummaryBox label="Saldo Awal Tahun" value={a.opening} />
        <SummaryBox label="Total Pemasukan" value={a.totalIncome} tone="in" />
        <SummaryBox label="Total Pengeluaran" value={a.totalExpense} tone="out" />
        <SummaryBox label="Saldo Akhir Tahun" value={a.closing} strong />
      </div>
      <Card>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bulan</TableHead>
                <TableHead className="text-right">Pemasukan</TableHead>
                <TableHead className="text-right">Pengeluaran</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {a.months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="text-sm">{m.month}</TableCell>
                  <TableCell className="text-right text-sm text-emerald-700">{formatRupiah(m.income)}</TableCell>
                  <TableCell className="text-right text-sm text-rose-700">{formatRupiah(m.expense)}</TableCell>
                  <TableCell className={`text-right text-sm font-medium ${m.net < 0 ? 'text-rose-700' : ''}`}>{formatRupiah(m.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryBox({ label, value, tone, strong }: { label: string; value: number; tone?: 'in' | 'out'; strong?: boolean }) {
  return (
    <Card className={strong ? 'border-primary/40' : ''}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 font-bold ${tone === 'in' ? 'text-emerald-700' : tone === 'out' ? 'text-rose-700' : ''} ${strong ? 'text-lg' : 'text-base'}`}>
          {formatRupiah(value)}
        </p>
      </CardContent>
    </Card>
  )
}
