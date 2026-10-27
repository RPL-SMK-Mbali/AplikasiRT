import { db } from '@/lib/db'
import { requireAuth, handleApiError, ok } from '@/lib/api-helpers'
import { getCurrentBalance } from '@/lib/services/finance'
import { can, type Role } from '@/lib/permissions'

/** Dashboard role-aware — data internal tidak ditampilkan kepada warga. */
export async function GET() {
  try {
    const session = await requireAuth()
    const role = session.role as Role

    // Data yang boleh dilihat semua role (termasuk warga)
    const upcomingMeetings = await db.meeting.findMany({
      where: {
        status: 'SCHEDULED',
        meetingDate: { gte: new Date() },
        // Warga hanya melihat rapat berundangan PUBLISHED; pengurus melihat semua
        ...(role === 'WARGA' ? { invitation: { status: 'PUBLISHED' } } : {}),
      },
      include: { invitation: { select: { status: true, invitationNumber: true } } },
      orderBy: { meetingDate: 'asc' },
      take: 5,
    })

    if (role === 'WARGA') {
      // Portal warga: undangan mendatang + notulen publik terbaru
      const publicMinutes = await db.meetingMinutes.findMany({
        where: { documentStatus: 'PUBLISHED' },
        include: { meeting: { select: { id: true, title: true, meetingDate: true } } },
        orderBy: { publishedAt: 'desc' },
        take: 5,
      })
      const publicDecisions = await db.meetingDecision.findMany({
        where: { isPublic: true, meeting: { status: { in: ['SCHEDULED', 'COMPLETED'] } } },
        include: { meeting: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      })
      const myAttendance = session.residentId
        ? await db.meetingAttendance.findMany({
            where: { residentId: session.residentId },
            include: { meeting: { select: { id: true, title: true, meetingDate: true, status: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        : []
      const myActionItems = session.residentId
        ? await db.meetingActionItem.findMany({
            where: {
              OR: [{ responsibleResidentId: session.residentId }, { responsibleUser: { id: session.uid } }],
            },
            include: { meeting: { select: { title: true } } },
            orderBy: { dueDate: 'asc' },
            take: 10,
          })
        : []
      return ok({
        role: 'WARGA',
        upcomingMeetings,
        publicMinutes,
        publicDecisions,
        myAttendance,
        myActionItems,
      })
    }

    // ===== Dashboard pengurus =====
    const balance = await getCurrentBalance()
    const currentPeriod = await db.accountingPeriod.findFirst({
      where: { startDate: { lte: new Date() }, endDate: { gte: new Date() } },
    })

    const invitationStats = {
      draft: await db.meetingInvitation.count({ where: { status: 'DRAFT' } }),
      pendingApproval: await db.meetingInvitation.count({ where: { status: 'PENDING_APPROVAL' } }),
      published: await db.meetingInvitation.count({ where: { status: 'PUBLISHED' } }),
    }
    const minutesStats = {
      draft: await db.meetingMinutes.count({ where: { documentStatus: 'DRAFT' } }),
      pendingReview: await db.meetingMinutes.count({ where: { documentStatus: 'PENDING_REVIEW' } }),
      published: await db.meetingMinutes.count({ where: { documentStatus: 'PUBLISHED' } }),
    }
    const actionStats = {
      notStarted: await db.meetingActionItem.count({ where: { status: 'NOT_STARTED' } }),
      inProgress: await db.meetingActionItem.count({ where: { status: 'IN_PROGRESS' } }),
      completed: await db.meetingActionItem.count({ where: { status: 'COMPLETED' } }),
      overdue: await db.meetingActionItem.count({
        where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }, dueDate: { lt: new Date() } },
      }),
    }

    const recentTransactions = await db.transaction.findMany({
      where: { status: 'POSTED', isTransfer: false },
      orderBy: [{ transactionDate: 'desc' }],
      take: 8,
    })

    const unreconciled = await db.cashReconciliation.count({
      where: { status: { in: ['PERLU_PENJELASAN', 'SELISIH'] } },
    })

    const draftTxCount = await db.transaction.count({ where: { status: 'DRAFT' } })

    const recentArchives = await db.meeting.findMany({
      where: { status: 'COMPLETED' },
      include: { minutes: { select: { documentStatus: true, minutesNumber: true } } },
      orderBy: { meetingDate: 'desc' },
      take: 5,
    })

    // Undangan yang belum direspons (untuk rapat mendatang)
    const pendingResponses = await db.meetingAttendance.count({
      where: {
        responseStatus: 'BELUM_MERESPONS',
        meeting: { status: 'SCHEDULED', meetingDate: { gte: new Date() } },
      },
    })

    return ok({
      role: 'PENGURUS',
      balance,
      currentPeriod: currentPeriod
        ? { id: currentPeriod.id, code: currentPeriod.periodCode, name: currentPeriod.periodName, status: currentPeriod.status }
        : null,
      draftTxCount,
      unreconciled,
      invitationStats,
      minutesStats,
      actionStats,
      pendingResponses,
      upcomingMeetings,
      recentTransactions,
      recentArchives,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

void can
