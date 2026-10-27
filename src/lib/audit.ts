// ============================================================
// Audit Log & Notifikasi — helper terpusat
// Audit log tidak boleh dapat diubah/dihapus oleh pengguna mana pun
// (tidak tersedia endpoint edit/delete).
// ============================================================

import { db } from '@/lib/db'

export interface AuditEntry {
  userId?: string | null
  userName?: string | null
  action: string
  objectType: string
  objectId?: string | null
  description: string
  before?: unknown
  after?: unknown
}

export async function logAudit(entry: AuditEntry) {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        userName: entry.userName ?? null,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId ?? null,
        description: entry.description,
        beforeData: entry.before !== undefined ? JSON.stringify(entry.before) : null,
        afterData: entry.after !== undefined ? JSON.stringify(entry.after) : null,
      },
    })
  } catch (e) {
    // Audit tidak boleh menggagalkan operasi utama, tapi dicatat ke log server
    console.error('[AUDIT] gagal mencatat audit log', e)
  }
}

export interface NotifyInput {
  userIds: string[]
  type: string
  title: string
  body: string
  link?: string
}

export async function notifyUsers(input: NotifyInput) {
  const unique = Array.from(new Set(input.userIds.filter(Boolean)))
  if (unique.length === 0) return
  try {
    await db.notification.createMany({
      data: unique.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      })),
    })
  } catch (e) {
    console.error('[NOTIFY] gagal mengirim notifikasi', e)
  }
}

export async function notifyRoleUsers(role: string, input: Omit<NotifyInput, 'userIds'>) {
  const users = await db.user.findMany({ where: { role, isActive: true }, select: { id: true } })
  await notifyUsers({ ...input, userIds: users.map((u) => u.id) })
}
