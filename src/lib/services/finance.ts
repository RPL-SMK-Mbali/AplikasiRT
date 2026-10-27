// ============================================================
// Service Keuangan — kalkulasi saldo resmi berbasis ledger
//
// Rumus wajib:
//   Saldo Akhir = Saldo Awal + Total Pemasukan POSTED - Total Pengeluaran POSTED
//   Saldo Awal Periode Berikutnya = Saldo Akhir Resmi Periode Sebelumnya
//
// Aturan:
// - Hanya transaksi POSTED yang memengaruhi saldo.
// - DRAFT / CANCELLED tidak memengaruhi saldo.
// - REVERSED tidak dihitung; pembaliknya (transaksi lawan POSTED) yang dihitung,
//   sehingga dampak bersih nol dan histori tetap terjaga.
// - Saldo awal berasal dari tabel OpeningBalance (APPROVED/LOCKED), TIDAK dihitung
//   sebagai pemasukan operasional. Dalam ledger ditampilkan sebagai opening entry.
// - Transfer internal antar akun tidak dihitung sebagai pemasukan/pengeluaran
//   pada total kas konsolidasi.
// - Snapshot pada tabel AccountingPeriod hanyalah salinan hasil kalkulasi;
//   sumber kebenaran tetap transaksi + saldo awal.
// ============================================================

import { db } from '@/lib/db'

interface BalanceOpts {
  atDate: Date
  /**
   * Batas inklusif untuk saldo awal (opening balance).
   * Dipakai saat menghitung saldo awal periode: opening balance yang
   * berlaku TEPAT pada tanggal mulai periode tetap dihitung sebagai
   * bagian dari saldo awal periode (konvensi: berlaku sebelum transaksi
   * pada tanggal efektif). Default: sama dengan atDate.
   */
  openingAsOf?: Date
  cashAccountId?: string | null
}

/**
 * Saldo resmi sistem pada titik waktu tertentu (inklusif atDate).
 * Basis = saldo awal APPROVED/LOCKED dengan tanggal efektif terbaru <= atDate.
 * Transaksi dihitung mulai SETELAH tanggal efektif saldo awal tersebut.
 */
export async function officialBalanceAt(opts: BalanceOpts): Promise<number> {
  const { atDate, cashAccountId, openingAsOf } = opts
  const openingCutoff = openingAsOf ?? atDate

  const opening = await db.openingBalance.findFirst({
    where: {
      status: { in: ['APPROVED', 'LOCKED'] },
      effectiveDate: { lte: openingCutoff },
      ...(cashAccountId ? { cashAccountId } : {}),
    },
    orderBy: { effectiveDate: 'desc' },
  })

  let balance = opening ? opening.amount : 0
  // Transaksi dihitung SETELAH tanggal efektif saldo awal, sampai atDate
  const from = opening
    ? new Date(opening.effectiveDate.getTime() + 1)
    : new Date(0)

  const grouped = await db.transaction.groupBy({
    by: ['type'],
    where: {
      status: 'POSTED',
      transactionDate: { gte: from, lte: atDate },
      ...(cashAccountId ? { cashAccountId } : { isTransfer: false }),
    },
    _sum: { amount: true },
  })

  const sumOf = (t: string) =>
    grouped.find((g) => g.type === t)?._sum.amount ?? 0

  if (cashAccountId) {
    // Per akun: transfer masuk/keluar memengaruhi saldo akun masing-masing
    balance += sumOf('INCOME') - sumOf('EXPENSE') + sumOf('TRANSFER_IN') - sumOf('TRANSFER_OUT')
  } else {
    // Konsolidasi: transfer internal saling menghapus, tidak dihitung
    balance += sumOf('INCOME') - sumOf('EXPENSE')
  }

  return Math.round(balance * 100) / 100
}

/** Saldo kas konsolidasi saat ini (dashboard). */
export async function getCurrentBalance(cashAccountId?: string | null): Promise<number> {
  return officialBalanceAt({ atDate: new Date(), cashAccountId })
}

export interface PeriodTotals {
  periodCode: string
  opening: number
  income: number
  expense: number
  closing: number
}

/** Rekap satu periode bulanan — dihitung langsung dari ledger (bukan snapshot). */
export async function computePeriodTotals(
  startDate: Date,
  endDate: Date,
  periodCode: string
): Promise<PeriodTotals> {
  const opening = await officialBalanceAt({
    atDate: new Date(startDate.getTime() - 1), // sebelum hari pertama periode
    openingAsOf: startDate, // saldo awal yang berlaku mulai tanggal ini ikut dihitung
  })

  const grouped = await db.transaction.groupBy({
    by: ['type'],
    where: {
      status: 'POSTED',
      isTransfer: false,
      transactionDate: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
  })

  const income = grouped.find((g) => g.type === 'INCOME')?._sum.amount ?? 0
  const expense = grouped.find((g) => g.type === 'EXPENSE')?._sum.amount ?? 0

  const r = (n: number) => Math.round(n * 100) / 100
  return {
    periodCode,
    opening: r(opening),
    income: r(income),
    expense: r(expense),
    closing: r(opening + income - expense),
  }
}

/**
 * Validasi periode transaksi saat akan diposting.
 * - Transaksi bertanggal dalam periode LOCKED/CLOSED ditolak melalui prosedur normal.
 * - REVIEW/OPEN diizinkan.
 * - Jika belum ada periode, transaksi tetap boleh diposting (dihitung berdasar tanggal).
 */
export async function assertPeriodAllowsPosting(transactionDate: Date): Promise<{
  periodId: string | null
  periodCode: string | null
}> {
  const period = await db.accountingPeriod.findFirst({
    where: { startDate: { lte: transactionDate }, endDate: { gte: transactionDate } },
  })
  if (!period) return { periodId: null, periodCode: null }

  if (period.status === 'LOCKED') {
    throw new Error(
      `Transaksi bertanggal dalam periode ${period.periodName} yang sudah TERKUNCI. ` +
        `Posting melalui prosedur normal ditolak. Ajukan pembukaan kembali periode atau catat koreksi pada periode berjalan.`
    )
  }
  if (period.status === 'CLOSED') {
    throw new Error(
      `Transaksi bertanggal dalam periode ${period.periodName} yang sudah DITUTUP. ` +
        `Pembukaan kembali periode memerlukan otorisasi khusus dan alasan tertulis.`
    )
  }
  return { periodId: period.id, periodCode: period.periodCode }
}

/** Baris ledger dengan saldo berjalan, termasuk opening entry saldo awal. */
export interface LedgerRow {
  id: string
  date: Date
  kind: 'OPENING' | 'INCOME' | 'EXPENSE' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  trxNumber: string
  description: string
  category: string | null
  cashAccountId: string | null
  cashAccountName: string | null
  status: string
  in: number
  out: number
  balance: number
}

export async function getLedger(opts: {
  fromDate?: Date
  toDate?: Date
  cashAccountId?: string | null
}): Promise<{ openingEntry: { date: Date; amount: number } | null; rows: LedgerRow[] }> {
  const toDate = opts.toDate ?? new Date()
  const fromDate = opts.fromDate

  // 1. Saldo resmi sebelum fromDate (untuk saldo awal tampilan)
  let startBalance = 0
  let openingEntry: { date: Date; amount: number } | null = null

  if (fromDate) {
    startBalance = await officialBalanceAt({
      atDate: new Date(fromDate.getTime() - 1),
      openingAsOf: fromDate,
      cashAccountId: opts.cashAccountId,
    })
  } else {
    // Tampilkan opening entry saldo awal resmi pertama
    const ob = await db.openingBalance.findFirst({
      where: {
        status: { in: ['APPROVED', 'LOCKED'] },
        ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : {}),
      },
      orderBy: { effectiveDate: 'asc' },
    })
    if (ob) {
      openingEntry = { date: ob.effectiveDate, amount: ob.amount }
      startBalance = 0 // saldo akan dimulai dari opening entry
    }
  }

  // 2. Ambil transaksi POSTED dalam rentang
  const txs = await db.transaction.findMany({
    where: {
      status: 'POSTED',
      transactionDate: { gte: fromDate ?? (openingEntry ? openingEntry.date : new Date(0)), lte: toDate },
      ...(opts.cashAccountId ? { cashAccountId: opts.cashAccountId } : { isTransfer: false }),
    },
    include: { cashAccount: { select: { name: true } } },
    orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
  })

  const rows: LedgerRow[] = []
  let running = startBalance

  if (!fromDate && openingEntry) {
    rows.push({
      id: 'opening-entry',
      date: openingEntry.date,
      kind: 'OPENING',
      trxNumber: '—',
      description: 'Saldo awal aplikasi (opening entry)',
      category: null,
      cashAccountId: opts.cashAccountId ?? null,
      cashAccountName: null,
      status: 'POSTED',
      in: openingEntry.amount,
      out: 0,
      balance: Math.round((running + openingEntry.amount) * 100) / 100,
    })
    running += openingEntry.amount
  } else if (fromDate && startBalance !== 0) {
    rows.push({
      id: 'opening-balance',
      date: fromDate,
      kind: 'OPENING',
      trxNumber: '—',
      description: 'Saldo awal periode tampilan',
      category: null,
      cashAccountId: opts.cashAccountId ?? null,
      cashAccountName: null,
      status: 'POSTED',
      in: startBalance > 0 ? startBalance : 0,
      out: startBalance < 0 ? -startBalance : 0,
      balance: startBalance,
    })
  }

  for (const tx of txs) {
    const isIn = tx.type === 'INCOME' || tx.type === 'TRANSFER_IN'
    const amount = Math.round(tx.amount * 100) / 100
    running += isIn ? amount : -amount
    rows.push({
      id: tx.id,
      date: tx.transactionDate,
      kind: tx.type as LedgerRow['kind'],
      trxNumber: tx.trxNumber,
      description: tx.description,
      category: tx.category,
      cashAccountId: tx.cashAccountId,
      cashAccountName: tx.cashAccount?.name ?? null,
      status: tx.status,
      in: isIn ? amount : 0,
      out: isIn ? 0 : amount,
      balance: Math.round(running * 100) / 100,
    })
  }

  return { openingEntry, rows }
}

/** Rekap laporan tahunan: baris per bulan + total. */
export async function getAnnualReport(year: number): Promise<{
  year: number
  opening: number
  months: { month: string; income: number; expense: number; net: number }[]
  totalIncome: number
  totalExpense: number
  closing: number
}> {
  const months: { month: string; income: number; expense: number; net: number }[] = []
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ]

  const monthly: number[][] = Array.from({ length: 12 }, () => [0, 0]) // [income, expense]
  const txs = await db.transaction.findMany({
    where: {
      status: 'POSTED',
      isTransfer: false,
      type: { in: ['INCOME', 'EXPENSE'] },
      transactionDate: {
        gte: new Date(Date.UTC(year, 0, 1, -7)),
        lte: new Date(Date.UTC(year, 11, 31, 16, 59, 59)),
      },
    },
    select: { type: true, amount: true, transactionDate: true },
  })
  for (const tx of txs) {
    const wib = new Date(tx.transactionDate.getTime() + 7 * 60 * 60 * 1000)
    const m = wib.getUTCMonth()
    if (tx.type === 'INCOME') monthly[m][0] += tx.amount
    else monthly[m][1] += tx.amount
  }

  const opening = await officialBalanceAt({
    atDate: new Date(Date.UTC(year, 0, 1, -7, 0, 0, 0) - 1),
    openingAsOf: new Date(Date.UTC(year, 0, 1, -7, 0, 0, 0)),
  })

  let running = opening
  let totalIncome = 0
  let totalExpense = 0
  for (let i = 0; i < 12; i++) {
    const income = Math.round(monthly[i][0] * 100) / 100
    const expense = Math.round(monthly[i][1] * 100) / 100
    running += income - expense
    totalIncome += income
    totalExpense += expense
    months.push({
      month: names[i],
      income,
      expense,
      net: Math.round((income - expense) * 100) / 100,
    })
  }

  return {
    year,
    opening: Math.round(opening * 100) / 100,
    months,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    closing: Math.round(running * 100) / 100,
  }
}
