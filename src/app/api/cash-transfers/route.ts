import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError, round2 } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { generateNumber } from '@/lib/services/numbering'
import { assertPeriodAllowsPosting } from '@/lib/services/finance'

const createSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().positive(),
  transferDate: z.string().min(1),
  description: z.string().min(3),
})
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    message: 'Akun asal dan tujuan tidak boleh sama',
    path: ['toAccountId'],
  })

export async function GET() {
  try {
    await requirePermission('transaction.view')
    const transfers = await db.cashTransfer.findMany({
      include: {
        fromAccount: { select: { name: true } },
        toAccount: { select: { name: true } },
      },
      orderBy: { transferDate: 'desc' },
      take: 100,
    })
    return ok(transfers)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('transfer.manage')
    const parsed = createSchema.parse(await req.json())
    const date = new Date(parsed.transferDate)

    // Validasi periode tanggal transfer
    await assertPeriodAllowsPosting(date)

    const outNumber = await generateNumber('trx')
    const inNumber = await generateNumber('trx')

    const [, , transfer] = await db.$transaction(async (tx) => {
      const trxOut = await tx.transaction.create({
        data: {
          trxNumber: outNumber,
          type: 'TRANSFER_OUT',
          category: 'TRANSFER_INTERNAL',
          amount: round2(parsed.amount),
          transactionDate: date,
          description: `Transfer keluar ke akun lain: ${parsed.description}`,
          cashAccountId: parsed.fromAccountId,
          status: 'POSTED',
          isTransfer: true,
          postedAt: new Date(),
          postedById: session.uid,
          createdById: session.uid,
        },
      })
      const trxIn = await tx.transaction.create({
        data: {
          trxNumber: inNumber,
          type: 'TRANSFER_IN',
          category: 'TRANSFER_INTERNAL',
          amount: round2(parsed.amount),
          transactionDate: date,
          description: `Transfer masuk dari akun lain: ${parsed.description}`,
          cashAccountId: parsed.toAccountId,
          status: 'POSTED',
          isTransfer: true,
          postedAt: new Date(),
          postedById: session.uid,
          createdById: session.uid,
        },
      })
      const t = await tx.cashTransfer.create({
        data: {
          fromAccountId: parsed.fromAccountId,
          toAccountId: parsed.toAccountId,
          amount: round2(parsed.amount),
          transferDate: date,
          description: parsed.description,
          trxOutId: trxOut.id,
          trxInId: trxIn.id,
          createdById: session.uid,
        },
      })
      return [trxOut, trxIn, t]
    })

    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'CASH_TRANSFER', objectId: transfer.id,
      description: `Transfer internal Rp${parsed.amount.toLocaleString('id-ID')} (${outNumber} → ${inNumber}). Tidak dihitung sebagai pemasukan/pengeluaran baru.`,
      after: parsed,
    })
    return ok(transfer, { status: 201 })
  } catch (err) {
    if (err instanceof ApiError) return handleApiError(err)
    return handleApiError(err)
  }
}
