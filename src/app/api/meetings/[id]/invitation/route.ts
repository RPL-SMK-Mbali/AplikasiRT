import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit, notifyUsers } from '@/lib/audit'

/**
 * Workflow undangan:
 * DRAFT → (submit-approval) → PENDING_APPROVAL → (approve) → PUBLISH siap
 * DRAFT/PENDING_APPROVAL → (publish) → PUBLISHED → (setelah rapat tuntas) COMPLETED → (archive) → ARCHIVED
 * Undangan diterbitkan tidak boleh dihapus permanen & tidak boleh diubah diam-diam.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as {
      action: 'submit-approval' | 'approve' | 'reject' | 'publish' | 'complete' | 'archive'
      changeNotes?: string
    }
    const meeting = await db.meeting.findUnique({
      where: { id },
      include: { invitation: { include: { createdBy: true } }, attendances: { include: { resident: { include: { user: true } } } } },
    })
    if (!meeting || !meeting.invitation)
      throw new ApiError('Rapat atau undangan tidak ditemukan.', 404)
    const inv = meeting.invitation

    if (body.action === 'submit-approval') {
      const session = await requirePermission('meeting.update')
      if (inv.status !== 'DRAFT')
        throw new ApiError('Hanya undangan DRAFT yang dapat diajukan untuk persetujuan.', 422)
      const updated = await db.meetingInvitation.update({
        where: { id: inv.id }, data: { status: 'PENDING_APPROVAL' },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'SUBMIT_APPROVAL',
        objectType: 'MEETING_INVITATION', objectId: inv.id,
        description: `Mengajukan undangan ${inv.invitationNumber} untuk persetujuan Ketua/Admin`,
        before: { status: inv.status }, after: { status: 'PENDING_APPROVAL' },
      })
      return ok(updated)
    }

    if (body.action === 'approve' || body.action === 'reject') {
      const session = await requirePermission('meeting.approve')
      if (inv.status !== 'PENDING_APPROVAL')
        throw new ApiError('Hanya undangan PENDING_APPROVAL yang dapat diperiksa.', 422)
      const status = body.action === 'approve' ? 'DRAFT' : 'DRAFT'
      // approve → kembali ke DRAFT dengan catatan disetujui (siap diterbitkan)
      const updated = await db.meetingInvitation.update({
        where: { id: inv.id },
        data: {
          status,
          approvedById: body.action === 'approve' ? session.uid : null,
          approvedAt: body.action === 'approve' ? new Date() : null,
        },
      })
      await logAudit({
        userId: session.uid, userName: session.name,
        action: body.action === 'approve' ? 'APPROVE' : 'REJECT',
        objectType: 'MEETING_INVITATION', objectId: inv.id,
        description:
          body.action === 'approve'
            ? `Menyetujui undangan ${inv.invitationNumber} — siap diterbitkan`
            : `Mengembalikan undangan ${inv.invitationNumber} ke pembuat untuk diperbaiki`,
        before: { status: 'PENDING_APPROVAL' }, after: { status },
      })
      if (inv.createdBy?.id) {
        await notifyUsers({
          userIds: [inv.createdBy.id],
          type: 'INFO',
          title: body.action === 'approve' ? 'Undangan disetujui' : 'Undangan dikembalikan',
          body:
            body.action === 'approve'
              ? `Undangan ${inv.invitationNumber} telah disetujui dan siap diterbitkan.`
              : `Undangan ${inv.invitationNumber} dikembalikan untuk diperbaiki.`,
          link: `rapat/${id}`,
        })
      }
      return ok(updated)
    }

    if (body.action === 'publish') {
      const session = await requirePermission('meeting.publish')
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(inv.status))
        throw new ApiError('Hanya undangan DRAFT/PENDING_APPROVAL yang dapat diterbitkan.', 422)

      const updated = await db.meetingInvitation.update({
        where: { id: inv.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      })

      // Notifikasi peserta (in-app) — pesan WhatsApp hanya via tombol berbagi perangkat
      const attendeeUserIds = meeting.attendances
        .map((a) => a.resident.user?.id)
        .filter((v): v is string => Boolean(v))
      await notifyUsers({
        userIds: attendeeUserIds,
        type: 'UNDANGAN_BARU',
        title: 'Undangan rapat diterbitkan',
        body: `Undangan ${inv.invitationNumber}: "${meeting.title}" — ${meeting.startTime} WIB, ${meeting.location}. Silakan buka aplikasi untuk melihat jadwal, lokasi, agenda, dan melakukan konfirmasi kehadiran.`,
        link: `rapat/${id}`,
      })

      await logAudit({
        userId: session.uid, userName: session.name, action: 'PUBLISH',
        objectType: 'MEETING_INVITATION', objectId: inv.id,
        description: `Menerbitkan undangan ${inv.invitationNumber} untuk rapat "${meeting.title}" (${meeting.attendances.length} peserta)`,
        before: { status: inv.status }, after: { status: 'PUBLISHED' },
      })
      return ok(updated)
    }

    if (body.action === 'complete') {
      const session = await requirePermission('meeting.update')
      if (inv.status !== 'PUBLISHED')
        throw new ApiError('Hanya undangan PUBLISHED yang dapat ditandai selesai.', 422)
      const [updated, m] = await db.$transaction([
        db.meetingInvitation.update({ where: { id: inv.id }, data: { status: 'COMPLETED' } }),
        db.meeting.update({ where: { id }, data: { status: 'COMPLETED' } }),
      ])
      void m
      await logAudit({
        userId: session.uid, userName: session.name, action: 'UPDATE',
        objectType: 'MEETING_INVITATION', objectId: inv.id,
        description: `Rapat "${meeting.title}" dilaksanakan — undangan ditandai COMPLETED, siap dibuat notulen`,
        before: { status: inv.status }, after: { status: 'COMPLETED' },
      })
      return ok(updated)
    }

    // archive
    const session = await requirePermission('meeting_minutes.archive')
    if (inv.status !== 'COMPLETED')
      throw new ApiError('Arsip dilakukan setelah rapat COMPLETED (notulen diterbitkan).', 422)
    const updated = await db.meetingInvitation.update({
      where: { id: inv.id }, data: { status: 'ARCHIVED' },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'ARCHIVE',
      objectType: 'MEETING_INVITATION', objectId: inv.id,
      description: `Mengarsipkan dokumen rapat "${meeting.title}"`,
      before: { status: inv.status }, after: { status: 'ARCHIVED' },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}
