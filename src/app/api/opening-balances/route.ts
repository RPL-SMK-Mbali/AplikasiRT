import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit, notifyRoleUsers } from '@/lib/audit'
import { generateNumber } from '@/lib/services/numbering'

const createSchema = z.object({
  effectiveDate: z.string().min(1),
  amount: z.number().positive('Nominal saldo awal harus lebih dari 0'),
  description: z.string().min(3, 'Keterangan sumber saldo minimal 3 karakter'),
  sourceType: z.enum(['PEMBUKUAN_SEBELUMNYA', 'MIGRASI_MANUAL', 'LAINNYA']),
  cashAccountId: z.string().optional().or(z.literal('')),
  supportingDocument: z.string().optional().or(z.literal('')),
})

const actionSchema = z.object({
  id: z.string(),
  action: z.enum(['approve', 'lock', 'correct']),
  reason: z.string().optional(),
  newAmount: z.number().positive().optional(),
})

export async function GET() {
  try {
    await requirePermission('opening_balance.view')
    const rows = await db.openingBalance.findMany({
      include: {
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        cashAccount: { select: { id: true, name: true, type: true } },
        corrections: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { effectiveDate: 'desc' },
    })
    return ok(rows)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('opening_balance.create')
    const parsed = createSchema.parse(await req.json())

    const number = await generateNumber('opening')
    const row = await db.openingBalance.create({
      data: {
        openingBalanceNumber: number,
        effectiveDate: new Date(parsed.effectiveDate),
        amount: Math.round(parsed.amount * 100) / 100,
        description: parsed.description,
        sourceType: parsed.sourceType,
        cashAccountId: parsed.cashAccountId || null,
        supportingDocument: parsed.supportingDocument || null,
        status: 'DRAFT',
        createdById: session.uid,
      },
    })

    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'CREATE',
      objectType: 'OPENING_BALANCE',
      objectId: row.id,
      description: `Membuat saldo awal ${number} sebesar Rp${row.amount.toLocaleString('id-ID')} berlaku ${parsed.effectiveDate}`,
      after: row,
    })
    await notifyRoleUsers('ADMIN', {
      type: 'PERIODE_INFO',
      title: 'Saldo awal baru menunggu persetujuan',
      body: `Saldo awal ${number} sebesar Rp${row.amount.toLocaleString('id-ID')} telah dibuat dan menunggu persetujuan.`,
      link: 'saldo-awal',
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

    const row = await db.openingBalance.findUnique({ where: { id: parsed.id } })
    if (!row) throw new ApiError('Saldo awal tidak ditemukan.', 404)

    if (parsed.action === 'approve') {
      const session = await requirePermission('opening_balance.approve')
      if (row.status !== 'DRAFT')
        throw new ApiError('Hanya saldo awal berstatus DRAFT yang dapat disetujui.', 422)
      const updated = await db.openingBalance.update({
        where: { id: row.id },
        data: { status: 'APPROVED', approvedById: session.uid, approvedAt: new Date() },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'APPROVE',
        objectType: 'OPENING_BALANCE', objectId: row.id,
        description: `Menyetujui saldo awal ${row.openingBalanceNumber}`,
        before: { status: row.status }, after: { status: 'APPROVED' },
      })
      return ok(updated)
    }

    if (parsed.action === 'lock') {
      const session = await requirePermission('opening_balance.lock')
      if (row.status !== 'APPROVED')
        throw new ApiError('Hanya saldo awal berstatus APPROVED yang dapat dikunci.', 422)
      const updated = await db.openingBalance.update({
        where: { id: row.id },
        data: { status: 'LOCKED', lockedAt: new Date() },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'LOCK',
        objectType: 'OPENING_BALANCE', objectId: row.id,
        description: `Mengunci saldo awal ${row.openingBalanceNumber} (final, tidak dapat diubah langsung)`,
        before: { status: row.status }, after: { status: 'LOCKED' },
      })
      return ok(updated)
    }

    // correct — koreksi saldo awal harus melalui prosedur khusus
    const session = await requirePermission('opening_balance.correct')
    if (row.status === 'DRAFT')
      throw new ApiError('Saldo awal DRAFT cukup diedit langsung, tanpa prosedur koreksi.', 422)
    if (row.status === 'LOCKED' && !parsed.reason?.trim())
      throw new ApiError('Koreksi saldo awal terkunci wajib mencantumkan alasan.', 422)
    if (!parsed.newAmount || !parsed.reason?.trim())
      throw new ApiError('Koreksi memerlukan nominal baru dan alasan.', 422)

    const [updated] = await db.$transaction([
      db.openingBalance.update({
        where: { id: row.id },
        data: { amount: Math.round(parsed.newAmount * 100) / 100 },
      }),
      db.openingBalanceCorrection.create({
        data: {
          openingBalanceId: row.id,
          oldAmount: row.amount,
          newAmount: Math.round(parsed.newAmount * 100) / 100,
          reason: parsed.reason,
          approvedById: session.uid,
        },
      }),
    ])

    await logAudit({
      userId: session.uid, userName: session.name, action: 'CORRECT',
      objectType: 'OPENING_BALANCE', objectId: row.id,
      description: `Koreksi saldo awal ${row.openingBalanceNumber}: Rp${row.amount.toLocaleString('id-ID')} → Rp${parsed.newAmount.toLocaleString('id-ID')}. Alasan: ${parsed.reason}`,
      before: { amount: row.amount }, after: { amount: updated.amount, reason: parsed.reason },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}
