import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { can, type Role } from '@/lib/permissions'

/** GET: daftar peserta + rekap konfirmasi/kehadiran */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requireAuth()
    const isPengurus = can(session.role as Role, 'meeting_attendance.view')

    const meeting = await db.meeting.findUnique({
      where: { id },
      include: {
        invitation: { select: { responseDeadline: true, status: true } },
      },
    })
    if (!meeting) throw new ApiError('Rapat tidak ditemukan.', 404)

    const rows = await db.meetingAttendance.findMany({
      where: { meetingId: id },
      include: {
        resident: {
          select: { id: true, fullName: true, houseNumber: true, isHeadOfFamily: true, user: { select: { id: true } } },
        },
        verifiedBy: { select: { name: true } },
      },
      orderBy: [{ resident: { houseNumber: 'asc' } }],
    })

    if (!isPengurus) {
      // Warga hanya melihat baris miliknya (data pribadi peserta lain terlindungi)
      const mine = rows.filter((r) => r.residentId === session.residentId)
      const rekap = {
        invited: rows.length,
        confirmed: rows.filter((r) => ['HADIR', 'TIDAK_HADIR', 'BELUM_PASTI'].includes(r.responseStatus)).length,
        attended: 0, // tidak ditampilkan ke warga
        absent: 0,
      }
      return ok({ rows: mine, rekap, deadline: meeting.invitation?.responseDeadline ?? null })
    }

    const rekap = {
      invited: rows.length,
      confirmed: rows.filter((r) => ['HADIR', 'TIDAK_HADIR', 'BELUM_PASTI'].includes(r.responseStatus)).length,
      attended: rows.filter((r) => r.attendanceStatus === 'HADIR').length,
      absent: rows.filter((r) => r.attendanceStatus === 'TIDAK_HADIR' || r.attendanceStatus === 'IZIN').length,
      belumRespons: rows.filter((r) => r.responseStatus === 'BELUM_MERESPONS').length,
    }
    return ok({ rows, rekap, deadline: meeting.invitation?.responseDeadline ?? null })
  } catch (err) {
    return handleApiError(err)
  }
}

/**
 * PUT: pengelolaan oleh petugas berwenang (sekretaris)
 * - catat kehadiran aktual (konfirmasi HADIR tidak otomatis dianggap hadir aktual)
 * - tambah peserta hadir langsung
 * - catat izin
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_attendance.manage')
    const body = (await req.json()) as {
      action: 'record' | 'add-walk-in'
      attendanceId?: string
      residentId?: string
      attendanceStatus?: 'HADIR' | 'TIDAK_HADIR' | 'IZIN'
      responseStatus?: 'HADIR' | 'TIDAK_HADIR' | 'BELUM_PASTI'
      notes?: string
      attendanceMethod?: string
    }

    if (body.action === 'add-walk-in') {
      if (!body.residentId) throw new ApiError('Pilih warga yang hadir langsung.', 422)
      const existing = await db.meetingAttendance.findUnique({
        where: { meetingId_residentId: { meetingId: id, residentId: body.residentId } },
      })
      if (existing) throw new ApiError('Warga sudah terdaftar sebagai peserta rapat ini.', 409)
      const row = await db.meetingAttendance.create({
        data: {
          meetingId: id,
          residentId: body.residentId,
          responseStatus: 'HADIR',
          responseAt: new Date(),
          attendanceStatus: body.attendanceStatus || 'HADIR',
          attendanceTime: body.attendanceStatus === 'HADIR' ? new Date() : null,
          attendanceMethod: body.attendanceMethod || 'MANUAL',
          notes: body.notes || null,
          verifiedById: session.uid,
        },
      })
      await logAudit({
        userId: session.uid, userName: session.name, action: 'CREATE',
        objectType: 'MEETING_ATTENDANCE', objectId: row.id,
        description: `Menambah peserta hadir langsung pada rapat (dicatat oleh ${session.name})`,
        after: { residentId: body.residentId, attendanceStatus: body.attendanceStatus },
      })
      return ok(row, { status: 201 })
    }

    // record — catat kehadiran aktual
    if (!body.attendanceId) throw new ApiError('Parameter attendanceId wajib.', 422)
    const row = await db.meetingAttendance.findUnique({
      where: { id: body.attendanceId },
      include: { resident: { select: { fullName: true } } },
    })
    if (!row || row.meetingId !== id) throw new ApiError('Data peserta tidak ditemukan.', 404)

    const before = { responseStatus: row.responseStatus, attendanceStatus: row.attendanceStatus, notes: row.notes }
    const updated = await db.meetingAttendance.update({
      where: { id: row.id },
      data: {
        ...(body.responseStatus ? { responseStatus: body.responseStatus, responseAt: new Date() } : {}),
        ...(body.attendanceStatus ? { attendanceStatus: body.attendanceStatus } : {}),
        ...(body.attendanceStatus === 'HADIR' ? { attendanceTime: new Date() } : {}),
        ...(body.attendanceMethod ? { attendanceMethod: body.attendanceMethod } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        verifiedById: session.uid,
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'UPDATE',
      objectType: 'MEETING_ATTENDANCE', objectId: row.id,
      description: `Mengubah konfirmasi/kehadiran ${row.resident.fullName} oleh petugas`,
      before, after: { responseStatus: updated.responseStatus, attendanceStatus: updated.attendanceStatus, notes: updated.notes },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}

/**
 * POST: warga mengubah konfirmasi miliknya sendiri, sesuai batas waktu.
 * Konfirmasi HADIR tidak otomatis dianggap kehadiran aktual.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_attendance.confirm_own')
    if (!session.residentId)
      throw new ApiError('Akun Anda tidak terhubung dengan data warga. Hubungi Admin RT.', 422)
    const body = (await req.json()) as { responseStatus: 'HADIR' | 'TIDAK_HADIR' | 'BELUM_PASTI' }

    const meeting = await db.meeting.findUnique({
      where: { id },
      include: { invitation: { select: { responseDeadline: true, status: true } } },
    })
    if (!meeting) throw new ApiError('Rapat tidak ditemukan.', 404)
    if (meeting.invitation?.status !== 'PUBLISHED')
      throw new ApiError('Konfirmasi hanya dapat dilakukan pada undangan yang telah diterbitkan.', 422)
    if (
      meeting.invitation.responseDeadline &&
      new Date() > meeting.invitation.responseDeadline
    )
      throw new ApiError('Batas waktu konfirmasi kehadiran telah lewat.', 422)

    const row = await db.meetingAttendance.findUnique({
      where: { meetingId_residentId: { meetingId: id, residentId: session.residentId } },
    })
    if (!row)
      throw new ApiError('Anda tidak terdaftar sebagai peserta rapat ini.', 403)

    const updated = await db.meetingAttendance.update({
      where: { id: row.id },
      data: { responseStatus: body.responseStatus, responseAt: new Date() },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'UPDATE',
      objectType: 'MEETING_ATTENDANCE', objectId: row.id,
      description: `Warga mengubah konfirmasi kehadirannya menjadi ${body.responseStatus}`,
      before: { responseStatus: row.responseStatus },
      after: { responseStatus: body.responseStatus },
    })
    return ok(updated)
  } catch (err) {
    return handleApiError(err)
  }
}
