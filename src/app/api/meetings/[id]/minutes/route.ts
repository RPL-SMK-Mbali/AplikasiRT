import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit, notifyUsers, notifyRoleUsers } from '@/lib/audit'
import { generateNumber } from '@/lib/services/numbering'
import { getSettings } from '@/lib/services/settings'
import { can, type Role } from '@/lib/permissions'

/** GET: notulen rapat (warga hanya yang PUBLISHED) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requireAuth()
    const minutes = await db.meetingMinutes.findUnique({
      where: { meetingId: id },
      include: {
        preparedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        decisions: { orderBy: { order: 'asc' } },
        versions: { orderBy: { version: 'desc' }, take: 10 },
      },
    })
    if (!minutes) return ok(null)
    const isPengurus = can(session.role as Role, 'meeting_minutes.view')
    if (!isPengurus && minutes.documentStatus !== 'PUBLISHED')
      throw new ApiError('Notulen belum diterbitkan.', 403)
    return ok(minutes)
  } catch (err) {
    return handleApiError(err)
  }
}

/** POST: buat notulen untuk rapat yang telah dilaksanakan */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_minutes.create')
    const meeting = await db.meeting.findUnique({
      where: { id },
      include: { minutes: true },
    })
    if (!meeting) throw new ApiError('Rapat tidak ditemukan.', 404)
    if (meeting.minutes) throw new ApiError('Notulen untuk rapat ini sudah ada.', 409)

    const settings = await getSettings()
    const minutesNumber = await generateNumber('minutes')
    const attendeesCount = await db.meetingAttendance.count({
      where: { meetingId: id, attendanceStatus: 'HADIR' },
    })

    const minutes = await db.meetingMinutes.create({
      data: {
        meetingId: id,
        minutesNumber,
        chairperson: settings.ketuaName,
        minuteTaker: settings.sekretarisName,
        attendeesCount,
        documentStatus: 'DRAFT',
        preparedById: session.uid,
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'MEETING_MINUTES', objectId: minutes.id,
      description: `Membuat draft notulen ${minutesNumber} untuk rapat "${meeting.title}"`,
      after: { minutesNumber },
    })
    return ok(minutes, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

/**
 * PUT: simpan isi / alur persetujuan notulen
 * DRAFT → (submit) → PENDING_REVIEW → (approve: Ketua) → APPROVED → (publish: Sekretaris) → PUBLISHED → (archive) → ARCHIVED
 * Notulen PUBLISHED tidak boleh diubah diam-diam: koreksi mencatat versi + alasan.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as {
      action: 'save' | 'submit' | 'review-approve' | 'review-reject' | 'publish' | 'archive'
      chairperson?: string
      minuteTaker?: string
      attendeesCount?: number
      agendaSummary?: string
      discussionSummary?: string
      closingNotes?: string
      changeReason?: string
    }

    const meeting = await db.meeting.findUnique({
      where: { id },
      include: { minutes: true },
    })
    if (!meeting || !meeting.minutes) throw new ApiError('Notulen tidak ditemukan.', 404)
    const minutes = meeting.minutes

    if (body.action === 'save') {
      const session = await requirePermission('meeting_minutes.update')
      if (!['DRAFT', 'PENDING_REVIEW'].includes(minutes.documentStatus))
        throw new ApiError(
          'Notulen yang telah disetujui/diterbitkan tidak dapat diubah langsung. Gunakan koreksi dengan alasan (versi tersimpan).',
          422
        )

      const needsVersion = minutes.documentStatus === 'PENDING_REVIEW'
      const updated = await db.$transaction(async (tx) => {
        if (needsVersion) {
          await tx.meetingDocumentVersion.create({
            data: {
              minutesId: minutes.id,
              version: minutes.version,
              data: JSON.stringify({
                chairperson: minutes.chairperson,
                minuteTaker: minutes.minuteTaker,
                attendeesCount: minutes.attendeesCount,
                agendaSummary: minutes.agendaSummary,
                discussionSummary: minutes.discussionSummary,
                closingNotes: minutes.closingNotes,
              }),
              changeReason: body.changeReason || 'Revisi notulen',
              changedById: session.uid,
            },
          })
        }
        return tx.meetingMinutes.update({
          where: { id: minutes.id },
          data: {
            ...(body.chairperson ? { chairperson: body.chairperson } : {}),
            ...(body.minuteTaker ? { minuteTaker: body.minuteTaker } : {}),
            ...(body.attendeesCount !== undefined ? { attendeesCount: body.attendeesCount } : {}),
            ...(body.agendaSummary !== undefined ? { agendaSummary: body.agendaSummary } : {}),
            ...(body.discussionSummary !== undefined ? { discussionSummary: body.discussionSummary } : {}),
            ...(body.closingNotes !== undefined ? { closingNotes: body.closingNotes } : {}),
            ...(needsVersion ? { version: minutes.version + 1 } : {}),
          },
        })
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'UPDATE',
        objectType: 'MEETING_MINUTES', objectId: minutes.id,
        description: `Menyimpan isi notulen ${minutes.minutesNumber}${needsVersion ? ` (versi ${updated.version}, revisi dengan alasan)` : ''}`,
        before: { version: minutes.version }, after: { version: updated.version, reason: body.changeReason || null },
      })
      return ok(updated)
    }

    if (body.action === 'submit') {
      const session = await requirePermission('meeting_minutes.update')
      if (minutes.documentStatus !== 'DRAFT')
        throw new ApiError('Hanya notulen DRAFT yang dapat diajukan untuk pemeriksaan.', 422)
      const updated = await db.meetingMinutes.update({
        where: { id: minutes.id }, data: { documentStatus: 'PENDING_REVIEW' },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'SUBMIT_REVIEW',
        objectType: 'MEETING_MINUTES', objectId: minutes.id,
        description: `Mengajukan notulen ${minutes.minutesNumber} untuk pemeriksaan Ketua RT`,
        before: { status: 'DRAFT' }, after: { status: 'PENDING_REVIEW' },
      })
      await notifyRoleUsers('KETUA', {
        type: 'INFO',
        title: 'Notulen menunggu pemeriksaan',
        body: `Notulen ${minutes.minutesNumber} untuk rapat "${meeting.title}" menunggu pemeriksaan Anda.`,
        link: `rapat/${id}`,
      })
      return ok(updated)
    }

    if (body.action === 'review-approve' || body.action === 'review-reject') {
      const session = await requirePermission('meeting_minutes.review')
      if (minutes.documentStatus !== 'PENDING_REVIEW')
        throw new ApiError('Hanya notulen PENDING_REVIEW yang dapat diperiksa.', 422)
      const status = body.action === 'review-approve' ? 'APPROVED' : 'DRAFT'
      const updated = await db.meetingMinutes.update({
        where: { id: minutes.id },
        data: {
          documentStatus: status,
          ...(body.action === 'review-approve' ? { reviewedById: session.uid } : {}),
        },
      })
      await logAudit({
        userId: session.uid, userName: session.name,
        action: body.action === 'review-approve' ? 'APPROVE' : 'REJECT',
        objectType: 'MEETING_MINUTES', objectId: minutes.id,
        description:
          body.action === 'review-approve'
            ? `Menyetujui notulen ${minutes.minutesNumber}`
            : `Mengembalikan notulen ${minutes.minutesNumber} ke notulis untuk diperbaiki`,
        before: { status: 'PENDING_REVIEW' }, after: { status },
      })
      return ok(updated)
    }

    if (body.action === 'publish') {
      const session = await requirePermission('meeting_minutes.publish')
      if (minutes.documentStatus !== 'APPROVED')
        throw new ApiError('Hanya notulen APPROVED yang dapat diterbitkan (perlu persetujuan Ketua RT).', 422)
      const updated = await db.meetingMinutes.update({
        where: { id: minutes.id },
        data: { documentStatus: 'PUBLISHED', publishedAt: new Date(), approvedById: session.uid, approvedAt: new Date() },
      })

      // Notifikasi seluruh warga terkait rapat + pengurus
      const attendances = await db.meetingAttendance.findMany({
        where: { meetingId: id },
        include: { resident: { include: { user: true } } },
      })
      const userIds = attendances.map((a) => a.resident.user?.id).filter((v): v is string => Boolean(v))
      await notifyUsers({
        userIds,
        type: 'NOTULEN_DITERBITKAN',
        title: 'Notulen rapat diterbitkan',
        body: `Notulen ${minutes.minutesNumber} untuk rapat "${meeting.title}" telah diterbitkan dan dapat dibaca di aplikasi.`,
        link: `rapat/${id}`,
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'PUBLISH',
        objectType: 'MEETING_MINUTES', objectId: minutes.id,
        description: `Menerbitkan notulen ${minutes.minutesNumber} untuk rapat "${meeting.title}"`,
        before: { status: 'APPROVED' }, after: { status: 'PUBLISHED' },
      })
      return ok(updated)
    }

    // archive
    const session = await requirePermission('meeting_minutes.archive')
    if (minutes.documentStatus !== 'PUBLISHED')
      throw new ApiError('Hanya notulen PUBLISHED yang dapat diarsipkan.', 422)
    const updated = await db.meetingMinutes.update({
      where: { id: minutes.id }, data: { documentStatus: 'ARCHIVED' },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'ARCHIVE',
      objectType: 'MEETING_MINUTES', objectId: minutes.id,
      description: `Mengarsipkan notulen ${minutes.minutesNumber}`,
      before: { status: 'PUBLISHED' }, after: { status: 'ARCHIVED' },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}
