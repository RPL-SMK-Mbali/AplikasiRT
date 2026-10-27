import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit, notifyRoleUsers } from '@/lib/audit'
import { computePeriodTotals, assertPeriodAllowsPosting } from '@/lib/services/finance'
import { periodCodeOf, periodNameOf, toISODate } from '@/lib/format'

const createSchema = z.object({
  periodCode: z.string().regex(/^\d{4}-\d{2}$/, 'Format kode periode: YYYY-MM'),
})

const actionSchema = z.object({
  id: z.string(),
  action: z.enum(['review', 'close', 'lock', 'reopen']),
  reason: z.string().optional(),
})

export async function GET() {
  try {
    await requirePermission('accounting_period.view')
    const periods = await db.accountingPeriod.findMany({
      include: {
        createdBy: { select: { name: true } },
        lockedBy: { select: { name: true } },
        reopenedBy: { select: { name: true } },
        snapshots: { orderBy: { snapshotAt: 'desc' }, take: 1 },
      },
      orderBy: { startDate: 'desc' },
    })
    // Hitung ulang total live dari ledger untuk ditampilkan berdampingan dengan snapshot
    const result = await Promise.all(
      periods.map(async (p) => {
        const totals = await computePeriodTotals(p.startDate, p.endDate, p.periodCode)
        return {
          ...p,
          live: totals,
          isConsistent:
            p.status === 'CLOSED' || p.status === 'LOCKED'
              ? Math.abs(totals.opening - p.openingBalance) < 0.01 &&
                Math.abs(totals.closing - p.closingBalance) < 0.01
              : true, // snapshot belum dibuat untuk periode OPEN/REVIEW
        }
      })
    )
    return ok(result)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('accounting_period.create')
    const parsed = createSchema.parse(await req.json())
    const code = parsed.periodCode
    const [year, month] = code.split('-').map(Number)

    const start = new Date(Date.UTC(year, month - 1, 1, -7))
    const end = new Date(Date.UTC(year, month, 0, 16, 59, 59, 999))

    const dup = await db.accountingPeriod.findUnique({ where: { periodCode: code } })
    if (dup) throw new ApiError(`Periode ${periodNameOf(code)} sudah ada.`, 409)
    const overlap = await db.accountingPeriod.findFirst({
      where: { startDate: { lte: end }, endDate: { gte: start } },
    })
    if (overlap)
      throw new ApiError(`Periode tumpang tindih dengan ${overlap.periodName}. Periode tidak boleh tumpang tindih.`, 422)

    const period = await db.accountingPeriod.create({
      data: {
        periodCode: code,
        periodName: periodNameOf(code),
        startDate: start,
        endDate: end,
        status: 'OPEN',
        createdById: session.uid,
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'ACCOUNTING_PERIOD', objectId: period.id,
      description: `Membuka periode akuntansi ${period.periodName}`,
      after: { periodCode: code },
    })
    return ok(period, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = actionSchema.parse(body)
    const period = await db.accountingPeriod.findUnique({ where: { id: parsed.id } })
    if (!period) throw new ApiError('Periode tidak ditemukan.', 404)

    if (parsed.action === 'review') {
      const session = await requirePermission('accounting_period.review')
      if (period.status !== 'OPEN')
        throw new ApiError('Hanya periode OPEN yang dapat masuk tahap REVIEW.', 422)
      const updated = await db.accountingPeriod.update({
        where: { id: period.id }, data: { status: 'REVIEW' },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'REVIEW',
        objectType: 'ACCOUNTING_PERIOD', objectId: period.id,
        description: `Periode ${period.periodName} masuk tahap pemeriksaan (REVIEW)`,
        before: { status: period.status }, after: { status: 'REVIEW' },
      })
      return ok(updated)
    }

    if (parsed.action === 'close') {
      const session = await requirePermission('accounting_period.close')
      if (period.status !== 'REVIEW' && period.status !== 'OPEN')
        throw new ApiError('Penutupan hanya dilakukan dari status OPEN/REVIEW.', 422)

      // Pemeriksaan wajib sebelum penutupan
      const draftCount = await db.transaction.count({
        where: {
          status: 'DRAFT',
          transactionDate: { gte: period.startDate, lte: period.endDate },
        },
      })
      if (draftCount > 0)
        throw new ApiError(
          `Penutupan ditolak: masih ada ${draftCount} transaksi DRAFT pada periode ini. Selesaikan (posting/batalkan) terlebih dahulu.`,
          422
        )
      const unreconciled = await db.cashReconciliation.count({
        where: {
          reconcileDate: { gte: period.startDate, lte: period.endDate },
          status: { in: ['PERLU_PENJELASAN', 'SELISIH'] },
        },
      })
      if (unreconciled > 0)
        throw new ApiError(
          `Penutupan ditolak: masih ada ${unreconciled} rekonsiliasi dengan selisih yang belum diselesaikan.`,
          422
        )

      const totals = await computePeriodTotals(period.startDate, period.endDate, period.periodCode)
      const [updated] = await db.$transaction([
        db.accountingPeriod.update({
          where: { id: period.id },
          data: {
            status: 'CLOSED',
            openingBalance: totals.opening,
            totalIncome: totals.income,
            totalExpense: totals.expense,
            closingBalance: totals.closing,
          },
        }),
        db.accountingPeriodSnapshot.create({
          data: {
            periodId: period.id,
            data: JSON.stringify({ ...totals, closedAt: new Date().toISOString(), closedBy: session.name }),
            createdById: session.uid,
          },
        }),
      ])
      await logAudit({
        userId: session.uid, userName: session.name, action: 'CLOSE',
        objectType: 'ACCOUNTING_PERIOD', objectId: period.id,
        description: `Menutup periode ${period.periodName}. Saldo akhir: Rp${totals.closing.toLocaleString('id-ID')}`,
        before: { status: period.status }, after: { status: 'CLOSED', totals },
      })
      await notifyRoleUsers('ADMIN', {
        type: 'PERIODE_INFO',
        title: `Periode ${period.periodName} telah ditutup`,
        body: `Snapshot periode tersimpan. Saldo akhir Rp${totals.closing.toLocaleString('id-ID')}. Periode dapat dikunci untuk finalisasi.`,
        link: 'periode-akuntansi',
      })
      return ok(updated)
    }

    if (parsed.action === 'lock') {
      const session = await requirePermission('accounting_period.lock')
      if (period.status !== 'CLOSED')
        throw new ApiError('Hanya periode CLOSED yang dapat dikunci final.', 422)
      const updated = await db.accountingPeriod.update({
        where: { id: period.id },
        data: { status: 'LOCKED', lockedAt: new Date(), lockedById: session.uid },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'LOCK',
        objectType: 'ACCOUNTING_PERIOD', objectId: period.id,
        description: `Mengunci final periode ${period.periodName} — tidak dapat diubah melalui prosedur normal`,
        before: { status: period.status }, after: { status: 'LOCKED' },
      })
      return ok(updated)
    }

    // reopen
    const session = await requirePermission('accounting_period.reopen')
    if (period.status !== 'CLOSED' && period.status !== 'LOCKED')
      throw new ApiError('Hanya periode CLOSED/LOCKED yang dapat dibuka kembali.', 422)
    if (!parsed.reason?.trim())
      throw new ApiError('Pembukaan kembali periode wajib mencantumkan alasan tertulis.', 422)

    const updated = await db.accountingPeriod.update({
      where: { id: period.id },
      data: { status: 'OPEN', reopenedAt: new Date(), reopenedById: session.uid, reopenReason: parsed.reason },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'REOPEN',
      objectType: 'ACCOUNTING_PERIOD', objectId: period.id,
      description: `MEMBUKA KEMBALI periode ${period.periodName}. Alasan: ${parsed.reason}`,
      before: { status: period.status }, after: { status: 'OPEN', reason: parsed.reason },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}

// Cek apakah tanggal tertentu boleh diposting (dipakai UI untuk peringatan)
export async function PATCH(req: NextRequest) {
  try {
    await requirePermission('transaction.view')
    const { date } = (await req.json()) as { date: string }
    const result = await assertPeriodAllowsPosting(new Date(date))
    return ok(result ?? {})
  } catch (err) {
    return handleApiError(err)
  }
}

void periodCodeOf
void toISODate
