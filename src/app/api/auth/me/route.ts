import { db } from '@/lib/db'
import { requireAuth, handleApiError, ok } from '@/lib/api-helpers'
import { permissionsOf, type Role } from '@/lib/permissions'
import { getSettings } from '@/lib/services/settings'

export async function GET() {
  try {
    const session = await requireAuth()
    const user = await db.user.findUnique({
      where: { id: session.uid },
      include: { resident: true },
    })
    if (!user) return handleApiError(new Error('Pengguna tidak ditemukan'))
    const settings = await getSettings()
    return ok({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        residentId: user.residentId,
        resident: user.resident,
      },
      permissions: permissionsOf(user.role as Role),
      settings,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
