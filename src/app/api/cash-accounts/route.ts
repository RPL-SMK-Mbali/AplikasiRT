import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'

const createSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['KAS', 'BANK']),
})

export async function GET() {
  try {
    await requirePermission('transaction.view')
    const accounts = await db.cashAccount.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    return ok(accounts)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('transfer.manage')
    const parsed = createSchema.parse(await req.json())
    const account = await db.cashAccount.create({ data: parsed })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'CASH_ACCOUNT', objectId: account.id,
      description: `Menambah akun kas ${account.name} (${account.type})`,
      after: parsed,
    })
    return ok(account, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
