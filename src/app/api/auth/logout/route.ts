import { getSession, clearSessionCookie } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { ok } from '@/lib/api-helpers'

export async function POST() {
  const session = await getSession()
  if (session) {
    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'LOGOUT',
      objectType: 'USER',
      objectId: session.uid,
      description: `Pengguna ${session.name} keluar dari aplikasi`,
    })
  }
  await clearSessionCookie()
  return ok({ message: 'Berhasil keluar' })
}
