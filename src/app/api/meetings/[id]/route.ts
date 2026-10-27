import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit, notifyUsers, notifyRoleUsers } from '@/lib/audit'
import { can, type Role } from '@/lib/permissions'

async function getMeetingOr404(id: string) {
  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      invitation: {
        include: {
          createdBy: { select: { id: true, name: true } },
          approvedBy: { select: { id: true, name: true } },
        },
      },
      agendas: { orderBy: { order: 'asc' } },
      attendances: {
        include: {
          resident: { select: { id: true, fullName: true, houseNumber: true, user: { select: { id: true } } } },
          verifiedBy: { select: { name: true } },
        },
        orderBy: [{ resident: { houseNumber: 'asc' } }],
      },
      minutes: {
        include: {
          preparedBy: { select: { name: true } },
          reviewedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          decisions: true,
          versions: { orderBy: { version: 'desc' }, take: 5 },
        },
      },
      decisions: { orderBy: { order: 'asc' } },
      actionItems: {
        include: {
          responsibleUser: { select: { id: true, name: true } },
          responsibleResident: { select: { id: true, fullName: true, houseNumber: true } },
          verifiedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      attachments: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      createdBy: { select: { id: true, name: true } },
    },
  })
  if (!meeting) throw new ApiError('Rapat tidak ditemukan.', 404)
  return meeting
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requireAuth()
    const meeting = await getMeetingOr404(id)

    const isPengurus = can(session.role as Role, 'meeting.view_all')
    if (!isPengurus) {
      // Warga hanya boleh melihat rapat dengan undangan diterbitkan / notulen publik
      const allowed =
        meeting.invitation?.status === 'PUBLISHED' ||
        meeting.invitation?.status === 'COMPLETED' ||
        meeting.minutes?.documentStatus === 'PUBLISHED'
      if (!allowed) throw new ApiError('Rapat ini belum diterbitkan untuk warga.', 403)
      // Sembunyikan data pribadi peserta lain dari warga
      meeting.attendances = meeting.attendances.filter((a) => a.residentId === session.residentId)
    }
    return ok(meeting)
  } catch (err) {
    return handleApiError(err)
  }
}

// Perubahan data rapat setelah undangan diterbitkan → audit + notifikasi peserta
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting.update')
    const body = (await req.json()) as {
      title?: string
      meetingDate?: string
      startTime?: string
      endTime?: string
      location?: string
      meetingMethod?: string
      description?: string
      agendas?: { title: string; description?: string }[]
      changeNotes?: string
    }
    const before = await getMeetingOr404(id)

    const materialChange =
      (body.meetingDate && new Date(body.meetingDate).getTime() !== before.meetingDate.getTime()) ||
      (body.startTime && body.startTime !== before.startTime) ||
      (body.location && body.location !== before.location)

    const meeting = await db.meeting.update({
      where: { id },
      data: {
        ...(body.title ? { title: body.title } : {}),
        ...(body.meetingDate ? { meetingDate: new Date(body.meetingDate) } : {}),
        ...(body.startTime ? { startTime: body.startTime } : {}),
        ...(body.endTime !== undefined ? { endTime: body.endTime || null } : {}),
        ...(body.location ? { location: body.location } : {}),
        ...(body.meetingMethod ? { meetingMethod: body.meetingMethod } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      },
    })

    if (body.agendas) {
      await db.meetingAgenda.deleteMany({ where: { meetingId: id } })
      await db.meetingAgenda.createMany({
        data: body.agendas.map((a, i) => ({
          meetingId: id,
          order: i + 1,
          title: a.title,
          description: a.description || null,
        })),
      })
    }

    // Jika undangan sudah diterbitkan dan ada perubahan material → catat + beri tahu peserta
    if (before.invitation?.status === 'PUBLISHED' && materialChange) {
      await db.meetingInvitation.update({
        where: { id: before.invitation.id },
        data: { changeNotes: body.changeNotes || 'Perubahan jadwal/tempat rapat' },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'UPDATE_PUBLISHED',
        objectType: 'MEETING', objectId: id,
        description: `PERUBAHAN undangan yang telah diterbitkan pada rapat "${meeting.title}". ${body.changeNotes || ''}`,
        before: {
          meetingDate: before.meetingDate, startTime: before.startTime, location: before.location,
        },
        after: {
          meetingDate: meeting.meetingDate, startTime: meeting.startTime, location: meeting.location,
        },
      })
      const attendeeUserIds = before.attendances
        .map((a) => a.resident.user?.id)
        .filter((v): v is string => Boolean(v))
      await notifyUsers({
        userIds: attendeeUserIds,
        type: 'PERUBAHAN_JADWAL',
        title: 'Perubahan jadwal rapat',
        body: `Rapat "${meeting.title}" mengalami perubahan jadwal/tempat. Silakan buka aplikasi untuk melihat detail terbaru.`,
        link: `rapat/${id}`,
      })
    } else {
      await logAudit({
        userId: session.uid, userName: session.name, action: 'UPDATE',
        objectType: 'MEETING', objectId: id,
        description: `Memperbarui data rapat "${meeting.title}"`,
        after: body,
      })
    }

    return ok(meeting)
  } catch (err) {
    return handleApiError(err)
  }
}

// Batalkan rapat → notifikasi pembatalan
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting.cancel')
    const { reason } = (await req.json().catch(() => ({}))) as { reason?: string }
    const before = await getMeetingOr404(id)

    if (before.invitation?.status === 'ARCHIVED')
      throw new ApiError('Rapat yang sudah diarsipkan tidak dapat dibatalkan.', 422)

    const meeting = await db.meeting.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason || null },
    })
    if (before.invitation && ['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED'].includes(before.invitation.status)) {
      await db.meetingInvitation.update({ where: { id: before.invitation.id }, data: { status: 'CANCELLED' } })
    }

    await logAudit({
      userId: session.uid, userName: session.name, action: 'CANCEL',
      objectType: 'MEETING', objectId: id,
      description: `Membatalkan rapat "${before.title}". Alasan: ${reason || '-'}`,
      before: { status: before.status }, after: { status: 'CANCELLED' },
    })

    const attendeeUserIds = before.attendances
      .map((a) => a.resident.user?.id)
      .filter((v): v is string => Boolean(v))
    await notifyUsers({
      userIds: attendeeUserIds,
      type: 'PEMBATALAN_RAPAT',
      title: 'Rapat dibatalkan',
      body: `Rapat "${before.title}" yang dijadwalkan telah dibatalkan. ${reason || ''}`,
      link: `rapat/${id}`,
    })
    void notifyRoleUsers
    return ok(meeting)
  } catch (err) {
    return handleApiError(err)
  }
}
