import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { hashPassword } from '@/lib/auth'
import { ROLES, type Role } from '@/lib/permissions'

const createSchema = z.object({
  username: z.string().min(3).regex(/^[a-z0-9._-]+$/, 'Hanya huruf kecil, angka, titik, garis bawah'),
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6),
  role: z.enum(ROLES as [Role, ...Role[]]),
  residentId: z.string().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
})

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(6).optional().or(z.literal('')),
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
  residentId: z.string().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
})

export async function GET() {
  try {
    await requirePermission('resident.view')
    const users = await db.user.findMany({
      include: { resident: { select: { id: true, fullName: true, houseNumber: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return ok(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        residentId: u.residentId,
        resident: u.resident,
        createdAt: u.createdAt,
      }))
    )
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('user.manage')
    const parsed = createSchema.parse(await req.json())
    const exists = await db.user.findUnique({ where: { username: parsed.username } })
    if (exists) throw new ApiError('Nama pengguna sudah digunakan.', 409)

    const user = await db.user.create({
      data: {
        username: parsed.username,
        name: parsed.name,
        email: parsed.email || null,
        passwordHash: hashPassword(parsed.password),
        role: parsed.role,
        residentId: parsed.residentId || null,
        isActive: parsed.isActive ?? true,
      },
    })
    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'CREATE',
      objectType: 'USER',
      objectId: user.id,
      description: `Membuat pengguna baru ${user.name} (${user.role})`,
      after: { username: user.username, role: user.role },
    })
    return ok({ id: user.id }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission('user.manage')
    const parsed = updateSchema.parse(await req.json())
    const before = await db.user.findUnique({ where: { id: parsed.id } })
    if (!before) throw new ApiError('Pengguna tidak ditemukan.', 404)

    const user = await db.user.update({
      where: { id: parsed.id },
      data: {
        name: parsed.name ?? before.name,
        email: parsed.email !== undefined ? parsed.email || null : before.email,
        role: parsed.role ?? before.role,
        residentId: parsed.residentId !== undefined ? parsed.residentId || null : before.residentId,
        isActive: parsed.isActive ?? before.isActive,
        ...(parsed.password ? { passwordHash: hashPassword(parsed.password) } : {}),
      },
    })
    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'UPDATE',
      objectType: 'USER',
      objectId: user.id,
      description: `Memperbarui pengguna ${user.name}`,
      before: { role: before.role, isActive: before.isActive, residentId: before.residentId },
      after: { role: user.role, isActive: user.isActive, residentId: user.residentId },
    })
    return ok({ id: user.id })
  } catch (err) {
    return handleApiError(err)
  }
}
