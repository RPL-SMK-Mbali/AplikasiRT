import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth, requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { generateNumber } from '@/lib/services/numbering'
import { can, type Role } from '@/lib/permissions'
import { getSettings } from '@/lib/services/settings'

const MEETING_TYPES = [
  'RUTIN', 'PENGURUS', 'WARGA', 'PERSIAPAN_KEGIATAN',
  'KEAMANAN_KEBERSIHAN', 'PEMBANGUNAN', 'SOSIAL', 'KHUSUS', 'LAINNYA',
] as const

const createSchema = z.object({
  title: z.string().min(3, 'Judul rapat minimal 3 karakter'),
  meetingType: z.enum(MEETING_TYPES),
  meetingDate: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().optional().or(z.literal('')),
  location: z.string().min(2, 'Tempat wajib diisi'),
  meetingMethod: z.enum(['LURING', 'DARING', 'HYBRID']),
  description: z.string().optional().or(z.literal('')),
  agendas: z.array(z.object({ title: z.string().min(1), description: z.string().optional() })).optional(),
  // Undangan
  invitationContent: z.string().min(10, 'Isi undangan minimal 10 karakter'),
  participantScope: z.enum(['SEMUA_WARGA', 'SEMUA_KK', 'PENGURUS', 'PILIHAN']),
  scopeResidents: z.array(z.string()).optional(),
  invitationDate: z.string().min(1),
  responseDeadline: z.string().optional().or(z.literal('')),
})

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const role = session.role as Role
    const sp = new URL(req.url).searchParams
    const status = sp.get('status') || undefined
    const q = sp.get('q') || undefined

    const isPengurus = can(role, 'meeting.view_all')

    const meetings = await db.meeting.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { meetingNumber: { contains: q } }] } : {}),
      },
      include: {
        invitation: {
          select: { id: true, invitationNumber: true, status: true, publishedAt: true, participantScope: true },
        },
        minutes: { select: { id: true, minutesNumber: true, documentStatus: true } },
        _count: { select: { attendances: true, decisions: true, actionItems: true } },
        attendances: session.residentId
          ? { where: { residentId: session.residentId }, select: { responseStatus: true, attendanceStatus: true } }
          : false,
      },
      orderBy: { meetingDate: 'desc' },
      take: 100,
    })

    // Warga hanya melihat rapat yang undangannya PUBLISHED dan menyasar dirinya
    const visible = isPengurus
      ? meetings
      : meetings.filter(
          (m) =>
            m.invitation?.status === 'PUBLISHED' ||
            m.invitation?.status === 'COMPLETED' ||
            (m.minutes?.documentStatus === 'PUBLISHED')
        )
    return ok(visible)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('meeting.create')
    const parsed = createSchema.parse(await req.json())

    // Susun daftar peserta berdasarkan sasaran
    let residentIds: string[] = []
    if (parsed.participantScope === 'SEMUA_WARGA') {
      residentIds = (await db.resident.findMany({ where: { isActive: true }, select: { id: true } })).map((r) => r.id)
    } else if (parsed.participantScope === 'SEMUA_KK') {
      residentIds = (await db.resident.findMany({ where: { isActive: true, isHeadOfFamily: true }, select: { id: true } })).map((r) => r.id)
    } else if (parsed.participantScope === 'PENGURUS') {
      const pengurus = await db.user.findMany({
        where: { role: { in: ['ADMIN', 'KETUA', 'SEKRETARIS', 'BENDAHARA'] }, isActive: true, residentId: { not: null } },
        select: { residentId: true },
      })
      residentIds = pengurus.map((u) => u.residentId!).filter(Boolean)
    } else {
      residentIds = Array.from(new Set(parsed.scopeResidents ?? []))
    }
    if (residentIds.length === 0)
      throw new ApiError('Sasaran peserta kosong. Pilih cakupan peserta atau tentukan warga minimal satu orang.', 422)

    const meetingNumber = await generateNumber('meeting')
    const invitationNumber = await generateNumber('invitation')

    const meeting = await db.$transaction(async (tx) => {
      const m = await tx.meeting.create({
        data: {
          meetingNumber,
          title: parsed.title,
          meetingType: parsed.meetingType,
          meetingDate: new Date(parsed.meetingDate),
          startTime: parsed.startTime,
          endTime: parsed.endTime || null,
          location: parsed.location,
          meetingMethod: parsed.meetingMethod,
          description: parsed.description || null,
          status: 'SCHEDULED',
          createdById: session.uid,
        },
      })
      if (parsed.agendas?.length) {
        await tx.meetingAgenda.createMany({
          data: parsed.agendas.map((a, i) => ({
            meetingId: m.id,
            order: i + 1,
            title: a.title,
            description: a.description || null,
          })),
        })
      }
      await tx.meetingInvitation.create({
        data: {
          meetingId: m.id,
          invitationNumber,
          invitationContent: parsed.invitationContent,
          participantScope: parsed.participantScope,
          invitationDate: new Date(parsed.invitationDate),
          responseDeadline: parsed.responseDeadline ? new Date(parsed.responseDeadline) : null,
          status: 'DRAFT',
          createdById: session.uid,
        },
      })
      await tx.meetingAttendance.createMany({
        data: residentIds.map((rid) => ({ meetingId: m.id, residentId: rid })),
      })
      return m
    })

    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'MEETING', objectId: meeting.id,
      description: `Membuat rapat "${parsed.title}" (${meetingNumber}) dengan draft undangan ${invitationNumber}, sasaran ${residentIds.length} warga`,
      after: { meetingNumber, invitationNumber, participantScope: parsed.participantScope },
    })

    return ok(meeting, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

// Data pendukung form rapat (warga, pengaturan identitas)
export async function OPTIONS() {
  try {
    await requirePermission('meeting.create')
    const settings = await getSettings()
    const residents = await db.resident.findMany({
      where: { isActive: true },
      orderBy: [{ houseNumber: 'asc' }],
    })
    return ok({ settings, residents })
  } catch (err) {
    return handleApiError(err)
  }
}
