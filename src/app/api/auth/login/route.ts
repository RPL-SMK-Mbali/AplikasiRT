import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSessionToken, setSessionCookie, clearSessionCookie } from '@/lib/auth'
import { handleApiError, fail, ok } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { permissionsOf, type Role } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password } = body as { username?: string; password?: string }
    if (!username || !password) return fail('Nama pengguna dan kata sandi wajib diisi.', 422)

    const user = await db.user.findFirst({
      where: {
        OR: [{ username: username.toLowerCase().trim() }, { email: username.toLowerCase().trim() }],
      },
      include: { resident: { select: { id: true, fullName: true, houseNumber: true } } },
    })

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail('Nama pengguna atau kata sandi salah.', 401)
    }
    if (!user.isActive) return fail('Akun Anda tidak aktif. Hubungi Admin RT.', 403)

    const token = createSessionToken({
      uid: user.id,
      username: user.username,
      name: user.name,
      role: user.role as Role,
      residentId: user.residentId,
    })
    await setSessionCookie(token)

    await logAudit({
      userId: user.id,
      userName: user.name,
      action: 'LOGIN',
      objectType: 'USER',
      objectId: user.id,
      description: `Pengguna ${user.name} (${user.role}) masuk ke aplikasi`,
    })

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
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE() {
  await clearSessionCookie()
  return ok({ message: 'Sesi diakhiri' })
}
