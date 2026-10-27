import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError, round2 } from '@/lib/api-helpers'
import { logAudit, notifyRoleUsers } from '@/lib/audit'
import { officialBalanceAt } from '@/lib/services/finance'

export async function GET() {
  try {
    await requirePermission('reconciliation.view')
    const rows = await db.cashReconciliation.findMany({
      include: {
        cashAccount: { select: { id: true, name: true, type: true } },
        checkedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { reconcileDate: 'desc' },
      take: 100,
    })
    const accounts = await db.cashAccount.findMany({ orderBy: { name: 'asc' } })
    // Saldo sistem terkini per akun untuk membantu pengisian form
    const systemBalances = await Promise.all(
      accounts.map(async (a) => ({ id: a.id, balance: await officialBalanceAt({ atDate: new Date(), cashAccountId: a.id }) }))
    )
    return ok({ rows, accounts, systemBalances })
  } catch (err) {
    return handleApiError(err)
  }
}

const createSchema = z.object({
  reconcileDate: z.string().min(1),
  cashAccountId: z.string().min(1),
  actualBalance: z.number(),
  notes: z.string().optional().or(z.literal('')),
})

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('reconciliation.manage')
    const parsed = createSchema.parse(await req.json())
    const date = new Date(parsed.reconcileDate)

    const systemBalance = await officialBalanceAt({
      atDate: date,
      cashAccountId: parsed.cashAccountId,
    })
    const actualBalance = round2(parsed.actualBalance)
    const difference = round2(actualBalance - systemBalance)

    // DILARANG membuat transaksi fiktif untuk memaksa saldo sama
    const status = Math.abs(difference) < 0.01 ? 'COCOK' : 'SELISIH'

    const row = await db.cashReconciliation.create({
      data: {
        reconcileDate: date,
        cashAccountId: parsed.cashAccountId,
        systemBalance,
        actualBalance,
        difference,
        notes: parsed.notes || null,
        checkedById: session.uid,
        status,
      },
    })

    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'RECONCILIATION', objectId: row.id,
      description:
        status === 'COCOK'
          ? `Rekonsiliasi kas ${date.toISOString().slice(0, 10)}: saldo cocok Rp${systemBalance.toLocaleString('id-ID')}`
          : `Rekonsiliasi kas ${date.toISOString().slice(0, 10)}: SELISIH Rp${difference.toLocaleString('id-ID')} (sistem Rp${systemBalance.toLocaleString('id-ID')} vs aktual Rp${actualBalance.toLocaleString('id-ID')})`,
      after: { systemBalance, actualBalance, difference, status },
    })

    if (status === 'SELISIH') {
      await notifyRoleUsers('ADMIN', {
        type: 'REKONSILIASI_SELISIH',
        title: 'Rekonsiliasi menemukan selisih kas',
        body: `Selisih Rp${difference.toLocaleString('id-ID')} pada rekonsiliasi ${date.toISOString().slice(0, 10)}. Penjelasan wajib diberikan; dilarang membuat transaksi fiktif.`,
        link: 'rekonsiliasi',
      })
    }

    return ok(row, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

// Selesaikan rekonsiliasi dengan penjelasan selisih
export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission('reconciliation.manage')
    const { id, notes, approve } = (await req.json()) as { id: string; notes?: string; approve?: boolean }
    const row = await db.cashReconciliation.findUnique({ where: { id } })
    if (!row) throw new ApiError('Data rekonsiliasi tidak ditemukan.', 404)

    if (approve) {
      const updated = await db.cashReconciliation.update({
        where: { id },
        data: { status: 'SELESAI', approvedById: session.uid, resolvedAt: new Date() },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'APPROVE',
        objectType: 'RECONCILIATION', objectId: id,
        description: `Menyetujui/menyelesaikan rekonsiliasi dengan selisih Rp${row.difference.toLocaleString('id-ID')} (pengecualian disetujui)`,
        before: { status: row.status }, after: { status: 'SELESAI' },
      })
      return ok(updated)
    }

    const updated = await db.cashReconciliation.update({
      where: { id },
      data: { notes: notes ?? row.notes },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'UPDATE',
      objectType: 'RECONCILIATION', objectId: id,
      description: 'Menambahkan catatan penjelasan pada rekonsiliasi',
      after: { notes },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}
