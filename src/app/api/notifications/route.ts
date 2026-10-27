import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, handleApiError, ok, ApiError } from '@/lib/api-helpers'

export async function GET() {
  try {
    const session = await requireAuth()
    const notifications = await db.notification.findMany({
      where: { userId: session.uid },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unread = await db.notification.count({ where: { userId: session.uid, isRead: false } })
    return ok({ notifications, unread })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await req.json().catch(() => ({}))
    const { id, all } = body as { id?: string; all?: boolean }
    if (all) {
      await db.notification.updateMany({ where: { userId: session.uid, isRead: false }, data: { isRead: true } })
    } else if (id) {
      const n = await db.notification.findUnique({ where: { id } })
      if (!n || n.userId !== session.uid) throw new ApiError('Notifikasi tidak ditemukan.', 404)
      await db.notification.update({ where: { id }, data: { isRead: true } })
    }
    return ok({ message: 'Notifikasi diperbarui' })
  } catch (err) {
    return handleApiError(err)
  }
}
