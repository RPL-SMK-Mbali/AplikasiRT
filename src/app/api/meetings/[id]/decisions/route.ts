import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { can, type Role } from '@/lib/permissions'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requireAuth()
    const isPengurus = can(session.role as Role, 'meeting_decision.view') && session.role !== 'WARGA'
    const decisions = await db.meetingDecision.findMany({
      where: { meetingId: id, ...(isPengurus ? {} : { isPublic: true }) },
      orderBy: { order: 'asc' },
      include: { _count: { select: { actionItems: true } } },
    })
    return ok(decisions)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_decision.manage')
    const body = (await req.json()) as { decision: string; isPublic?: boolean }
    if (!body.decision?.trim() || body.decision.trim().length < 3)
      throw new ApiError('Isi keputusan rapat minimal 3 karakter.', 422)

    const count = await db.meetingDecision.count({ where: { meetingId: id } })
    const meeting = await db.meeting.findUnique({ where: { id } })
    if (!meeting) throw new ApiError('Rapat tidak ditemukan.', 404)

    const decision = await db.meetingDecision.create({
      data: {
        meetingId: id,
        order: count + 1,
        decision: body.decision.trim(),
        isPublic: body.isPublic ?? true,
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'CREATE',
      objectType: 'MEETING_DECISION', objectId: decision.id,
      description: `Mencatat keputusan rapat "${meeting.title}": ${body.decision.trim().slice(0, 100)}`,
      after: decision,
    })
    return ok(decision, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_decision.manage')
    const body = (await req.json()) as { decisionId: string; decision?: string; isPublic?: boolean }
    const before = await db.meetingDecision.findUnique({ where: { id: body.decisionId } })
    if (!before || before.meetingId !== id) throw new ApiError('Keputusan tidak ditemukan.', 404)

    const decision = await db.meetingDecision.update({
      where: { id: body.decisionId },
      data: {
        ...(body.decision ? { decision: body.decision.trim() } : {}),
        ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'UPDATE',
      objectType: 'MEETING_DECISION', objectId: decision.id,
      description: 'Memperbarui keputusan rapat',
      before: { decision: before.decision, isPublic: before.isPublic },
      after: { decision: decision.decision, isPublic: decision.isPublic },
    })
    return ok(decision)
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_decision.manage')
    const decisionId = new URL(req.url).searchParams.get('decisionId')
    if (!decisionId) throw new ApiError('Parameter decisionId wajib.', 422)
    const before = await db.meetingDecision.findUnique({
      where: { id: decisionId },
      include: { _count: { select: { actionItems: true } } },
    })
    if (!before || before.meetingId !== id) throw new ApiError('Keputusan tidak ditemukan.', 404)
    if (before._count.actionItems > 0)
      throw new ApiError('Keputusan memiliki tugas tindak lanjut; hapus/dahului tugasnya terlebih dahulu.', 422)

    await db.meetingDecision.delete({ where: { id: decisionId } })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'DELETE',
      objectType: 'MEETING_DECISION', objectId: decisionId,
      description: `Menghapus keputusan rapat: ${before.decision.slice(0, 100)}`,
      before: before,
    })
    return ok({ message: 'Keputusan dihapus' })
  } catch (err) {
    return handleApiError(err)
  }
}
