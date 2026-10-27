import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth, requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit, notifyUsers } from '@/lib/audit'
import { can, type Role } from '@/lib/permissions'

const createSchema = z.object({
  meetingId: z.string().min(1),
  decisionId: z.string().optional().or(z.literal('')),
  title: z.string().min(3, 'Judul tugas minimal 3 karakter'),
  description: z.string().optional().or(z.literal('')),
  responsibleUserId: z.string().optional().or(z.literal('')),
  responsibleResidentId: z.string().optional().or(z.literal('')),
  startDate: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
})

const updateSchema = z.object({
  id: z.string(),
  title: z.string().min(3).optional(),
  description: z.string().optional().or(z.literal('')),
  responsibleUserId: z.string().optional().or(z.literal('')),
  responsibleResidentId: z.string().optional().or(z.literal('')),
  dueDate: z.string().optional().or(z.literal('')),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  completionNotes: z.string().optional().or(z.literal('')),
  verify: z.boolean().optional(),
  changeReason: z.string().optional().or(z.literal('')),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const sp = new URL(req.url).searchParams
    const status = sp.get('status') || undefined
    const meetingId = sp.get('meetingId') || undefined
    const mine = sp.get('mine') === '1'
    const role = session.role as Role
    const isPengurus = can(role, 'meeting_action_view') || can(role, 'meeting_action_item.view')

    const rows = await db.meetingActionItem.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(meetingId ? { meetingId } : {}),
        ...(mine || !isPengurus
          ? {
              OR: [
                { responsibleResidentId: session.residentId ?? '__none__' },
                { responsibleUserId: session.uid },
              ],
            }
          : {}),
      },
      include: {
        meeting: { select: { id: true, title: true, meetingNumber: true } },
        decision: { select: { id: true, decision: true } },
        responsibleUser: { select: { id: true, name: true } },
        responsibleResident: { select: { id: true, fullName: true, houseNumber: true } },
        verifiedBy: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 200,
    })
    return ok(rows)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('meeting_action_item.create')
    const parsed = createSchema.parse(await req.json())
    if (!parsed.responsibleUserId && !parsed.responsibleResidentId)
      throw new ApiError('Tentukan penanggung jawab (pengurus atau warga).', 422)

    const meeting = await db.meeting.findUnique({ where: { id: parsed.meetingId } })
    if (!meeting) throw new ApiError('Rapat tidak ditemukan.', 404)

    const item = await db.meetingActionItem.create({
      data: {
        meetingId: parsed.meetingId,
        decisionId: parsed.decisionId || null,
        title: parsed.title,
        description: parsed.description || null,
        responsibleUserId: parsed.responsibleUserId || null,
        responsibleResidentId: parsed.responsibleResidentId || null,
        startDate: parsed.startDate ? new Date(parsed.startDate) : null,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        priority: parsed.priority,
        status: 'NOT_STARTED',
        createdById: session.uid,
      },
    })

    // Notifikasi penanggung jawab
    const targetUserIds: string[] = []
    if (parsed.responsibleUserId) targetUserIds.push(parsed.responsibleUserId)
    if (parsed.responsibleResidentId) {
      const res = await db.resident.findUnique({
        where: { id: parsed.responsibleResidentId },
        include: { user: true },
      })
      if (res?.user?.id) targetUserIds.push(res.user.id)
    }
    await notifyUsers({
      userIds: targetUserIds,
      type: 'TUGAS_BARU',
      title: 'Tugas tindak lanjut diberikan',
      body: `Anda ditetapkan sebagai penanggung jawab tugas "${parsed.title}" dari rapat "${meeting.title}". Tenggat: ${parsed.dueDate ? new Date(parsed.dueDate).toLocaleDateString('id-ID') : '-'}.`,
      link: `rapat/${parsed.meetingId}`,
    })

    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'MEETING_ACTION_ITEM', objectId: item.id,
      description: `Menetapkan tindak lanjut "${parsed.title}" (prioritas ${parsed.priority})`,
      after: parsed,
    })
    return ok(item, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = updateSchema.parse(body)
    const before = await db.meetingActionItem.findUnique({
      where: { id: parsed.id },
      include: { meeting: { select: { title: true } } },
    })
    if (!before) throw new ApiError('Tugas tidak ditemukan.', 404)

    // Verifikasi penyelesaian oleh pihak berwenang
    if (parsed.verify) {
      const session = await requirePermission('meeting_action_item.verify')
      if (before.status !== 'COMPLETED')
        throw new ApiError('Hanya tugas COMPLETED yang dapat diverifikasi.', 422)
      const updated = await db.meetingActionItem.update({
        where: { id: parsed.id }, data: { verifiedById: session.uid },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'VERIFY',
        objectType: 'MEETING_ACTION_ITEM', objectId: parsed.id,
        description: `Memverifikasi penyelesaian tugas "${before.title}"`,
        before: { verified: false }, after: { verified: true },
      })
      return ok(updated)
    }

    // Pembaruan status — tugas tidak otomatis selesai karena tenggat lewat
    const isAssignee =
      (session.residentId && before.responsibleResidentId === session.residentId) ||
      before.responsibleUserId === session.uid
    const isOwner = before.createdById === session.uid

    if (parsed.status === 'COMPLETED') {
      const session = await requirePermission('meeting_action_item.complete')
      if (before.status === 'COMPLETED')
        throw new ApiError('Tugas sudah ditandai selesai.', 422)
      if (!parsed.completionNotes?.trim() && !before.completionNotes)
        throw new ApiError('Selesaikan tugas dengan mencantumkan catatan perkembangan/bukti penyelesaian.', 422)
      const updated = await db.meetingActionItem.update({
        where: { id: parsed.id },
        data: {
          status: 'COMPLETED',
          completionNotes: parsed.completionNotes || before.completionNotes,
          completedAt: new Date(),
        },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'COMPLETE',
        objectType: 'MEETING_ACTION_ITEM', objectId: parsed.id,
        description: `Menyelesaikan tugas "${before.title}" dari rapat "${before.meeting.title}"`,
        before: { status: before.status }, after: { status: 'COMPLETED', notes: updated.completionNotes },
      })
      return ok(updated)
    }

    // Update umum (pengurus berwenang, penanggung jawab boleh update status progress miliknya)
    if (isAssignee && !can(session.role as Role, 'meeting_action_item.update')) {
      // penanggung jawab hanya boleh mengubah status IN_PROGRESS/NOT_STARTED + catatan
      if (parsed.title || parsed.responsibleUserId || parsed.responsibleResidentId || parsed.dueDate)
        throw new ApiError('Penanggung jawab hanya dapat mengubah status dan catatan perkembangan.', 403)
      const session = await requireAuth()
      const updated = await db.meetingActionItem.update({
        where: { id: parsed.id },
        data: {
          ...(parsed.status ? { status: parsed.status } : {}),
          ...(parsed.completionNotes !== undefined ? { completionNotes: parsed.completionNotes } : {}),
        },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'UPDATE',
        objectType: 'MEETING_ACTION_ITEM', objectId: parsed.id,
        description: `Penanggung jawab memperbarui progres tugas "${before.title}"`,
        before: { status: before.status }, after: { status: updated.status },
      })
      void isOwner
      return ok(updated)
    }

    const session = await requirePermission('meeting_action_item.update')
    const updated = await db.meetingActionItem.update({
      where: { id: parsed.id },
      data: {
        ...(parsed.title ? { title: parsed.title } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description || null } : {}),
        ...(parsed.responsibleUserId !== undefined ? { responsibleUserId: parsed.responsibleUserId || null } : {}),
        ...(parsed.responsibleResidentId !== undefined ? { responsibleResidentId: parsed.responsibleResidentId || null } : {}),
        ...(parsed.dueDate !== undefined ? { dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null } : {}),
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parsed.status && parsed.status !== 'COMPLETED' ? { status: parsed.status } : {}),
        ...(parsed.completionNotes !== undefined ? { completionNotes: parsed.completionNotes || null } : {}),
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'UPDATE',
      objectType: 'MEETING_ACTION_ITEM', objectId: parsed.id,
      description: `Memperbarui tindak lanjut "${before.title}"`,
      before: { status: before.status, priority: before.priority, dueDate: before.dueDate },
      after: { status: updated.status, priority: updated.priority, dueDate: updated.dueDate },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}
