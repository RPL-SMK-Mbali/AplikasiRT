import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  try {
    await requirePermission('audit.view')
    const sp = new URL(req.url).searchParams
    const objectType = sp.get('objectType') || undefined
    const action = sp.get('action') || undefined
    const take = Math.min(Number(sp.get('take') || 100), 500)

    const logs = await db.auditLog.findMany({
      where: {
        ...(objectType ? { objectType } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
    })
    return ok(logs)
  } catch (err) {
    return handleApiError(err)
  }
}
