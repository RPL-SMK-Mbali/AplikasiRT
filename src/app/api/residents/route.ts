import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'

const createSchema = z.object({
  fullName: z.string().min(2),
  houseNumber: z.string().min(1),
  noKK: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  isHeadOfFamily: z.boolean().optional(),
  familyRelation: z.string().optional().or(z.literal('')),
})

const updateSchema = createSchema.partial().extend({ id: z.string() })

export async function GET() {
  try {
    await requirePermission('resident.view')
    const residents = await db.resident.findMany({
      include: { user: { select: { id: true, username: true, role: true } } },
      orderBy: [{ houseNumber: 'asc' }, { fullName: 'asc' }],
    })
    return ok(residents)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('resident.manage')
    const parsed = createSchema.parse(await req.json())
    const resident = await db.resident.create({
      data: {
        fullName: parsed.fullName,
        houseNumber: parsed.houseNumber,
        noKK: parsed.noKK || null,
        phone: parsed.phone || null,
        isHeadOfFamily: parsed.isHeadOfFamily ?? true,
        familyRelation: parsed.familyRelation || null,
      },
    })
    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'CREATE',
      objectType: 'RESIDENT',
      objectId: resident.id,
      description: `Menambah data warga ${resident.fullName} (Rumah ${resident.houseNumber})`,
      after: { fullName: resident.fullName, houseNumber: resident.houseNumber },
    })
    return ok(resident, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission('resident.manage')
    const parsed = updateSchema.parse(await req.json())
    const before = await db.resident.findUnique({ where: { id: parsed.id } })
    if (!before) throw new ApiError('Data warga tidak ditemukan.', 404)

    const resident = await db.resident.update({
      where: { id: parsed.id },
      data: {
        fullName: parsed.fullName ?? before.fullName,
        houseNumber: parsed.houseNumber ?? before.houseNumber,
        noKK: parsed.noKK !== undefined ? parsed.noKK || null : before.noKK,
        phone: parsed.phone !== undefined ? parsed.phone || null : before.phone,
        isHeadOfFamily: parsed.isHeadOfFamily ?? before.isHeadOfFamily,
        familyRelation: parsed.familyRelation !== undefined ? parsed.familyRelation || null : before.familyRelation,
      },
    })
    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'UPDATE',
      objectType: 'RESIDENT',
      objectId: resident.id,
      description: `Memperbarui data warga ${resident.fullName}`,
      before: { fullName: before.fullName, houseNumber: before.houseNumber },
      after: { fullName: resident.fullName, houseNumber: resident.houseNumber },
    })
    return ok(resident)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requirePermission('resident.manage')
    const id = new URL(req.url).searchParams.get('id')
    if (!id) throw new ApiError('Parameter id wajib diisi.', 422)
    const before = await db.resident.findUnique({ where: { id } })
    if (!before) throw new ApiError('Data warga tidak ditemukan.', 404)
    await db.resident.update({ where: { id }, data: { isActive: false } })
    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'DEACTIVATE',
      objectType: 'RESIDENT',
      objectId: id,
      description: `Menonaktifkan data warga ${before.fullName}`,
      before: { isActive: true },
      after: { isActive: false },
    })
    return ok({ message: 'Data warga dinonaktifkan' })
  } catch (err) {
    return handleApiError(err)
  }
}
