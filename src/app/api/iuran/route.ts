import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError, round2 } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { generateNumber } from '@/lib/services/numbering'
import { assertPeriodAllowsPosting } from '@/lib/services/finance'
import { periodCodeOf, periodNameOf } from '@/lib/format'

// GET: daftar jenis iuran + pembayaran
export async function GET(req: NextRequest) {
  try {
    await requirePermission('transaction.view')
    const sp = new URL(req.url).searchParams
    const period = sp.get('period') || periodCodeOf(new Date())

    const feeTypes = await db.feeType.findMany({ orderBy: { name: 'asc' } })
    const payments = await db.payment.findMany({
      where: period === 'ALL' ? {} : { periodCode: period },
      include: {
        resident: { select: { id: true, fullName: true, houseNumber: true } },
        feeType: { select: { id: true, name: true } },
        transaction: { select: { trxNumber: true } },
        recordedBy: { select: { name: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 300,
    })
    const residents = await db.resident.findMany({
      where: { isActive: true },
      orderBy: [{ houseNumber: 'asc' }, { fullName: 'asc' }],
    })
    return ok({ feeTypes, payments, residents, period })
  } catch (err) {
    return handleApiError(err)
  }
}

const feeTypeSchema = z.object({
  kind: z.literal('feeType'),
  name: z.string().min(2),
  amount: z.number().positive(),
  frequency: z.enum(['BULANAN', 'TAHUNAN', 'SEKALI']),
  isActive: z.boolean().optional(),
})

const paymentSchema = z.object({
  kind: z.literal('payment'),
  residentId: z.string().min(1),
  feeTypeId: z.string().min(1),
  periodCode: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().positive(),
  paidAt: z.string().min(1),
  notes: z.string().optional().or(z.literal('')),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (body?.kind === 'feeType') {
      const session = await requirePermission('iuran.manage')
      const parsed = feeTypeSchema.parse(body)
      const feeType = await db.feeType.create({
        data: {
          name: parsed.name,
          amount: round2(parsed.amount),
          frequency: parsed.frequency,
          isActive: parsed.isActive ?? true,
        },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'CREATE',
        objectType: 'FEE_TYPE', objectId: feeType.id,
        description: `Membuat jenis iuran ${feeType.name} (Rp${feeType.amount.toLocaleString('id-ID')}/${feeType.frequency.toLowerCase()})`,
        after: parsed,
      })
      return ok(feeType, { status: 201 })
    }

    // Pembayaran iuran → otomatis membuat transaksi pemasukan POSTED yang tertaut
    const session = await requirePermission('payment.manage')
    const parsed = paymentSchema.parse(body)
    const paidDate = new Date(parsed.paidAt)

    const resident = await db.resident.findUnique({ where: { id: parsed.residentId } })
    const feeType = await db.feeType.findUnique({ where: { id: parsed.feeTypeId } })
    if (!resident) throw new ApiError('Warga tidak ditemukan.', 404)
    if (!feeType) throw new ApiError('Jenis iuran tidak ditemukan.', 404)

    const dup = await db.payment.findUnique({
      where: { residentId_feeTypeId_periodCode: { residentId: parsed.residentId, feeTypeId: parsed.feeTypeId, periodCode: parsed.periodCode } },
    })
    if (dup)
      throw new ApiError(
        `Warga ${resident.fullName} sudah tercatat membayar ${feeType.name} periode ${periodNameOf(parsed.periodCode)}.`,
        409
      )

    await assertPeriodAllowsPosting(paidDate)

    const trxNumber = await generateNumber('trx')
    const result = await db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          residentId: parsed.residentId,
          feeTypeId: parsed.feeTypeId,
          periodCode: parsed.periodCode,
          amount: round2(parsed.amount),
          paidAt: paidDate,
          notes: parsed.notes || null,
          recordedById: session.uid,
          status: 'PAID',
        },
      })
      const transaction = await tx.transaction.create({
        data: {
          trxNumber,
          type: 'INCOME',
          category: 'IURAN',
          amount: round2(parsed.amount),
          transactionDate: paidDate,
          description: `Pembayaran ${feeType.name} ${periodNameOf(parsed.periodCode)} — ${resident.fullName} (Rumah ${resident.houseNumber})`,
          status: 'POSTED',
          paymentId: payment.id,
          postedAt: new Date(),
          postedById: session.uid,
          createdById: session.uid,
        },
      })
      return { payment, transaction }
    })

    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'PAYMENT', objectId: result.payment.id,
      description: `Mencatat pembayaran iuran ${feeType.name} (${periodNameOf(parsed.periodCode)}) oleh ${resident.fullName} — Rp${parsed.amount.toLocaleString('id-ID')}, tertaut transaksi ${trxNumber}`,
      after: { paymentId: result.payment.id, trxNumber },
    })
    return ok(result, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

// Nonaktifkan jenis iuran
export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission('iuran.manage')
    const { id, isActive, amount } = (await req.json()) as { id: string; isActive?: boolean; amount?: number }
    const before = await db.feeType.findUnique({ where: { id } })
    if (!before) throw new ApiError('Jenis iuran tidak ditemukan.', 404)
    const feeType = await db.feeType.update({
      where: { id },
      data: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(amount !== undefined ? { amount: round2(amount) } : {}),
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'UPDATE',
      objectType: 'FEE_TYPE', objectId: id,
      description: `Memperbarui jenis iuran ${feeType.name}`,
      before: { amount: before.amount, isActive: before.isActive },
      after: { amount: feeType.amount, isActive: feeType.isActive },
    })
    return ok(feeType)
  } catch (err) {
    return handleApiError(err)
  }
}

void periodCodeOf
