import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok } from '@/lib/api-helpers'
import {
  computePeriodTotals,
  getAnnualReport,
  getLedger,
  getCurrentBalance,
} from '@/lib/services/finance'
import { periodRange } from '@/lib/format'

export async function GET(req: NextRequest) {
  try {
    await requirePermission('report.view')
    const sp = new URL(req.url).searchParams
    const type = sp.get('type') || 'monthly'
    const period = sp.get('period') || ''
    const year = Number(sp.get('year') || new Date().getFullYear())

    if (type === 'monthly') {
      if (!period) return ok({ error: 'Parameter period wajib (YYYY-MM)' })
      const { start, end } = periodRange(period)
      const totals = await computePeriodTotals(start, end, period)

      // Rincian transaksi periode
      const transactions = await db.transaction.findMany({
        where: {
          status: 'POSTED',
          isTransfer: false,
          transactionDate: { gte: start, lte: end },
        },
        include: { cashAccount: { select: { name: true } } },
        orderBy: { transactionDate: 'asc' },
      })
      return ok({ type: 'monthly', period, totals, transactions })
    }

    if (type === 'annual') {
      const report = await getAnnualReport(year)
      return ok({ type: 'annual', ...report })
    }

    if (type === 'ledger') {
      const from = sp.get('from')
      const to = sp.get('to')
      const accountId = sp.get('account') || undefined
      const ledger = await getLedger({
        fromDate: from ? new Date(from) : undefined,
        toDate: to ? new Date(to) : undefined,
        cashAccountId: accountId || undefined,
      })
      return ok(ledger)
    }

    return ok({ error: 'Tipe laporan tidak dikenal' })
  } catch (err) {
    return handleApiError(err)
  }
}

void getCurrentBalance
void db
