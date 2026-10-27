import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError, round2 } from '@/lib/api-helpers'
import { logAudit, notifyRoleUsers } from '@/lib/audit'
import { generateNumber } from '@/lib/services/numbering'
import { assertPeriodAllowsPosting } from '@/lib/services/finance'

const createSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().min(1, 'Kategori wajib dipilih'),
  amount: z.number().positive('Nominal harus lebih dari 0'),
  transactionDate: z.string().min(1),
  description: z.string().min(3, 'Keterangan minimal 3 karakter'),
  cashAccountId: z.string().optional().or(z.literal('')),
  postNow: z.boolean().optional(),
})

const actionSchema = z.object({
  id: z.string(),
  action: z.enum(['post', 'cancel', 'reverse']),
  reason: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    await requirePermission('transaction.view')
    const sp = new URL(req.url).searchParams
    const status = sp.get('status') || undefined
    const type = sp.get('type') || undefined
    const take = Math.min(Number(sp.get('take') || 200), 500)

    const rows = await db.transaction.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        cashAccount: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        payment: { select: { id: true, resident: { select: { fullName: true } }, feeType: { select: { name: true } } } },
        reversalOf: { select: { trxNumber: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take,
    })
    return ok(rows)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('transaction.create')
    const parsed = createSchema.parse(await req.json())
    const date = new Date(parsed.transactionDate)
    const trxNumber = await generateNumber('trx')
    const postNow = parsed.postNow ?? false

    // Peringatan periode tertutup/terkunci hanya relevan saat langsung posting
    const row = await db.transaction.create({
      data: {
        trxNumber,
        type: parsed.type,
        category: parsed.category,
        amount: round2(parsed.amount),
        transactionDate: date,
        description: parsed.description,
        cashAccountId: parsed.cashAccountId || null,
        status: postNow ? 'POSTED' : 'DRAFT',
        postedAt: postNow ? new Date() : null,
        postedById: postNow ? session.uid : null,
        createdById: session.uid,
      },
    })

    if (postNow) {
      try {
        await assertPeriodAllowsPosting(date)
      } catch (e) {
        // Posting ke periode terkunci ditolak — transaksi dikembalikan ke DRAFT
        await db.transaction.update({ where: { id: row.id }, data: { status: 'DRAFT', postedAt: null, postedById: null } })
        throw e
      }
    }

    await logAudit({
      userId: session.uid, userName: session.name,
      action: postNow ? 'POST' : 'CREATE',
      objectType: 'TRANSACTION', objectId: row.id,
      description: `${postNow ? 'Membuat dan memposting' : 'Membuat draft'} transaksi ${trxNumber} (${parsed.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'}) Rp${row.amount.toLocaleString('id-ID')} — ${parsed.description}`,
      after: row,
    })
    return ok(row, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = actionSchema.parse(body)
    const tx = await db.transaction.findUnique({ where: { id: parsed.id } })
    if (!tx) throw new ApiError('Transaksi tidak ditemukan.', 404)

    if (parsed.action === 'post') {
      const session = await requirePermission('transaction.post')
      if (tx.status !== 'DRAFT')
        throw new ApiError('Hanya transaksi DRAFT yang dapat diposting.', 422)
      await assertPeriodAllowsPosting(tx.transactionDate) // tolak periode CLOSED/LOCKED
      const updated = await db.transaction.update({
        where: { id: tx.id },
        data: { status: 'POSTED', postedAt: new Date(), postedById: session.uid },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'POST',
        objectType: 'TRANSACTION', objectId: tx.id,
        description: `Memposting transaksi ${tx.trxNumber} (${tx.type}) Rp${tx.amount.toLocaleString('id-ID')}`,
        before: { status: tx.status }, after: { status: 'POSTED' },
      })
      return ok(updated)
    }

    if (parsed.action === 'cancel') {
      const session = await requirePermission('transaction.cancel')
      if (tx.status !== 'DRAFT')
        throw new ApiError('Hanya transaksi DRAFT yang dapat dibatalkan. Transaksi POSTED dibalik dengan mekanisme REVERSED.', 422)
      const updated = await db.transaction.update({
        where: { id: tx.id }, data: { status: 'CANCELLED' },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'CANCEL',
        objectType: 'TRANSACTION', objectId: tx.id,
        description: `Membatalkan draft transaksi ${tx.trxNumber}`,
        before: { status: tx.status }, after: { status: 'CANCELLED' },
      })
      return ok(updated)
    }

    // reverse — pembalikan tercatat, histori tidak dihapus
    const session = await requirePermission('transaction.reverse')
    if (tx.status !== 'POSTED')
      throw new ApiError('Hanya transaksi POSTED yang dapat dibalik (REVERSED).', 422)
    if (!parsed.reason?.trim())
      throw new ApiError('Pembalikan transaksi wajib mencantumkan alasan.', 422)
    if (tx.reversedById)
      throw new ApiError('Transaksi ini sudah pernah dibalik.', 422)

    const oppositeType = tx.type === 'INCOME' ? 'EXPENSE' : 'INCOME'
    const revNumber = await generateNumber('trx')

    // 1) Buat transaksi pembalik (POSTED, tipe lawan)
    const reversal = await db.transaction.create({
      data: {
        trxNumber: revNumber,
        type: oppositeType,
        category: tx.category,
        amount: tx.amount,
        transactionDate: new Date(),
        description: `Pembalikan transaksi ${tx.trxNumber}: ${tx.description}`,
        cashAccountId: tx.cashAccountId,
        status: 'POSTED',
        postedAt: new Date(),
        postedById: session.uid,
        createdById: session.uid,
      },
    })
    // 2) Tandai original sebagai REVERSED dan tautkan ke pembaliknya
    const updated = await db.transaction.update({
      where: { id: tx.id },
      data: { status: 'REVERSED', reversalReason: parsed.reason, reversedById: reversal.id },
    })
    void updated

    await logAudit({
      userId: session.uid, userName: session.name, action: 'REVERSE',
      objectType: 'TRANSACTION', objectId: tx.id,
      description: `Membalik transaksi ${tx.trxNumber} (Rp${tx.amount.toLocaleString('id-ID')}). Alasan: ${parsed.reason}`,
      before: { status: 'POSTED', amount: tx.amount },
      after: { status: 'REVERSED', reversalNumber: revNumber, reason: parsed.reason },
    })
    return ok({ message: `Transaksi ${tx.trxNumber} telah dibalik dengan transaksi ${revNumber}` })
  } catch (err) {
    return handleApiError(err)
  }
}
