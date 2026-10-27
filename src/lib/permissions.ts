// ============================================================
// RBAC — Daftar permission per role
// Prinsip: hak akses ditentukan lewat permission, bukan hanya nama role.
// ============================================================

export type Role = 'ADMIN' | 'KETUA' | 'SEKRETARIS' | 'BENDAHARA' | 'WARGA'

export const ROLES: Role[] = ['ADMIN', 'KETUA', 'SEKRETARIS', 'BENDAHARA', 'WARGA']

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin RT',
  KETUA: 'Ketua RT',
  SEKRETARIS: 'Sekretaris RT',
  BENDAHARA: 'Bendahara RT',
  WARGA: 'Warga',
}

// Semua permission yang dikenal sistem
export const PERMISSIONS = {
  // Core
  USER_MANAGE: 'user.manage',
  RESIDENT_MANAGE: 'resident.manage',
  RESIDENT_VIEW: 'resident.view',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_VIEW: 'audit.view',
  NOTIFICATION_VIEW: 'notification.view',

  // Keuangan — saldo awal
  OPENING_BALANCE_VIEW: 'opening_balance.view',
  OPENING_BALANCE_CREATE: 'opening_balance.create',
  OPENING_BALANCE_APPROVE: 'opening_balance.approve',
  OPENING_BALANCE_LOCK: 'opening_balance.lock',
  OPENING_BALANCE_CORRECT: 'opening_balance.correct',

  // Keuangan — periode akuntansi
  PERIOD_VIEW: 'accounting_period.view',
  PERIOD_CREATE: 'accounting_period.create',
  PERIOD_REVIEW: 'accounting_period.review',
  PERIOD_CLOSE: 'accounting_period.close',
  PERIOD_LOCK: 'accounting_period.lock',
  PERIOD_REOPEN: 'accounting_period.reopen',
  PERIOD_ADJUST: 'accounting_period.adjust',

  // Keuangan — transaksi
  TRANSACTION_VIEW: 'transaction.view',
  TRANSACTION_CREATE: 'transaction.create',
  TRANSACTION_POST: 'transaction.post',
  TRANSACTION_CANCEL: 'transaction.cancel',
  TRANSACTION_REVERSE: 'transaction.reverse',

  // Keuangan — lainnya
  TRANSFER_MANAGE: 'transfer.manage',
  IURAN_MANAGE: 'iuran.manage',
  PAYMENT_MANAGE: 'payment.manage',
  LEDGER_VIEW: 'ledger.view',
  RECONCILIATION_VIEW: 'reconciliation.view',
  RECONCILIATION_MANAGE: 'reconciliation.manage',
  REPORT_VIEW: 'report.view',

  // Rapat
  MEETING_VIEW: 'meeting.view',
  MEETING_VIEW_ALL: 'meeting.view_all',
  MEETING_CREATE: 'meeting.create',
  MEETING_UPDATE: 'meeting.update',
  MEETING_CANCEL: 'meeting.cancel',
  MEETING_PUBLISH: 'meeting.publish',
  MEETING_APPROVE: 'meeting.approve',

  MEETING_PARTICIPANT_VIEW: 'meeting_participant.view',
  MEETING_PARTICIPANT_MANAGE: 'meeting_participant.manage',

  MEETING_ATTENDANCE_VIEW: 'meeting_attendance.view',
  MEETING_ATTENDANCE_MANAGE: 'meeting_attendance.manage',
  MEETING_ATTENDANCE_CONFIRM_OWN: 'meeting_attendance.confirm_own',
  MEETING_ATTENDANCE_EXPORT: 'meeting_attendance.export',

  MEETING_MINUTES_VIEW: 'meeting_minutes.view',
  MEETING_MINUTES_VIEW_PUBLIC: 'meeting_minutes.view_public',
  MEETING_MINUTES_CREATE: 'meeting_minutes.create',
  MEETING_MINUTES_UPDATE: 'meeting_minutes.update',
  MEETING_MINUTES_REVIEW: 'meeting_minutes.review',
  MEETING_MINUTES_APPROVE: 'meeting_minutes.approve',
  MEETING_MINUTES_PUBLISH: 'meeting_minutes.publish',
  MEETING_MINUTES_ARCHIVE: 'meeting_minutes.archive',

  MEETING_DECISION_VIEW: 'meeting_decision.view',
  MEETING_DECISION_MANAGE: 'meeting_decision.manage',

  MEETING_ACTION_VIEW: 'meeting_action_item.view',
  MEETING_ACTION_CREATE: 'meeting_action_item.create',
  MEETING_ACTION_UPDATE: 'meeting_action_item.update',
  MEETING_ACTION_ASSIGN: 'meeting_action_item.assign',
  MEETING_ACTION_COMPLETE: 'meeting_action_item.complete',
  MEETING_ACTION_VERIFY: 'meeting_action_item.verify',

  MEETING_ATTACHMENT_UPLOAD: 'meeting_attachment.upload',
  MEETING_ATTACHMENT_DOWNLOAD: 'meeting_attachment.download',
  MEETING_DOCUMENT_EXPORT: 'meeting_document.export',
} as const

// Kumpulan permission per role (ADMIN memiliki semua via wildcard)
const ROLE_PERMISSIONS: Record<Role, string[]> = {
  ADMIN: ['*'],

  KETUA: [
    PERMISSIONS.RESIDENT_VIEW,
    PERMISSIONS.NOTIFICATION_VIEW,
    // Keuangan: pemantauan + persetujuan
    PERMISSIONS.OPENING_BALANCE_VIEW,
    PERMISSIONS.OPENING_BALANCE_APPROVE,
    PERMISSIONS.PERIOD_VIEW,
    PERMISSIONS.PERIOD_CLOSE,
    PERMISSIONS.TRANSACTION_VIEW,
    PERMISSIONS.LEDGER_VIEW,
    PERMISSIONS.RECONCILIATION_VIEW,
    PERMISSIONS.REPORT_VIEW,
    // Rapat: pemeriksaan & persetujuan
    PERMISSIONS.MEETING_VIEW,
    PERMISSIONS.MEETING_VIEW_ALL,
    PERMISSIONS.MEETING_APPROVE,
    PERMISSIONS.MEETING_PARTICIPANT_VIEW,
    PERMISSIONS.MEETING_ATTENDANCE_VIEW,
    PERMISSIONS.MEETING_ATTENDANCE_EXPORT,
    PERMISSIONS.MEETING_MINUTES_VIEW,
    PERMISSIONS.MEETING_MINUTES_REVIEW,
    PERMISSIONS.MEETING_MINUTES_APPROVE,
    PERMISSIONS.MEETING_DECISION_VIEW,
    PERMISSIONS.MEETING_ACTION_VIEW,
    PERMISSIONS.MEETING_ACTION_VERIFY,
    PERMISSIONS.MEETING_ATTACHMENT_DOWNLOAD,
    PERMISSIONS.MEETING_DOCUMENT_EXPORT,
  ],

  SEKRETARIS: [
    PERMISSIONS.NOTIFICATION_VIEW,
    PERMISSIONS.RESIDENT_VIEW,
    // Keuangan: hanya lihat
    PERMISSIONS.TRANSACTION_VIEW,
    PERMISSIONS.LEDGER_VIEW,
    PERMISSIONS.REPORT_VIEW,
    // Rapat: operasional penuh
    PERMISSIONS.MEETING_VIEW,
    PERMISSIONS.MEETING_VIEW_ALL,
    PERMISSIONS.MEETING_CREATE,
    PERMISSIONS.MEETING_UPDATE,
    PERMISSIONS.MEETING_CANCEL,
    PERMISSIONS.MEETING_PUBLISH,
    PERMISSIONS.MEETING_PARTICIPANT_VIEW,
    PERMISSIONS.MEETING_PARTICIPANT_MANAGE,
    PERMISSIONS.MEETING_ATTENDANCE_VIEW,
    PERMISSIONS.MEETING_ATTENDANCE_MANAGE,
    PERMISSIONS.MEETING_ATTENDANCE_EXPORT,
    PERMISSIONS.MEETING_MINUTES_VIEW,
    PERMISSIONS.MEETING_MINUTES_CREATE,
    PERMISSIONS.MEETING_MINUTES_UPDATE,
    PERMISSIONS.MEETING_MINUTES_PUBLISH,
    PERMISSIONS.MEETING_MINUTES_ARCHIVE,
    PERMISSIONS.MEETING_DECISION_VIEW,
    PERMISSIONS.MEETING_DECISION_MANAGE,
    PERMISSIONS.MEETING_ACTION_VIEW,
    PERMISSIONS.MEETING_ACTION_CREATE,
    PERMISSIONS.MEETING_ACTION_UPDATE,
    PERMISSIONS.MEETING_ACTION_ASSIGN,
    PERMISSIONS.MEETING_ACTION_COMPLETE,
    PERMISSIONS.MEETING_ATTACHMENT_UPLOAD,
    PERMISSIONS.MEETING_ATTACHMENT_DOWNLOAD,
    PERMISSIONS.MEETING_DOCUMENT_EXPORT,
  ],

  BENDAHARA: [
    PERMISSIONS.NOTIFICATION_VIEW,
    PERMISSIONS.RESIDENT_VIEW,
    // Keuangan: operasional penuh
    PERMISSIONS.OPENING_BALANCE_VIEW,
    PERMISSIONS.OPENING_BALANCE_CREATE,
    PERMISSIONS.OPENING_BALANCE_LOCK,
    PERMISSIONS.OPENING_BALANCE_CORRECT,
    PERMISSIONS.PERIOD_VIEW,
    PERMISSIONS.PERIOD_CREATE,
    PERMISSIONS.PERIOD_REVIEW,
    PERMISSIONS.PERIOD_LOCK,
    PERMISSIONS.PERIOD_ADJUST,
    PERMISSIONS.TRANSACTION_VIEW,
    PERMISSIONS.TRANSACTION_CREATE,
    PERMISSIONS.TRANSACTION_POST,
    PERMISSIONS.TRANSACTION_CANCEL,
    PERMISSIONS.TRANSACTION_REVERSE,
    PERMISSIONS.TRANSFER_MANAGE,
    PERMISSIONS.IURAN_MANAGE,
    PERMISSIONS.PAYMENT_MANAGE,
    PERMISSIONS.LEDGER_VIEW,
    PERMISSIONS.RECONCILIATION_VIEW,
    PERMISSIONS.RECONCILIATION_MANAGE,
    PERMISSIONS.REPORT_VIEW,
    // Rapat: sebagaimana warga
    PERMISSIONS.MEETING_VIEW,
    PERMISSIONS.MEETING_ATTENDANCE_CONFIRM_OWN,
    PERMISSIONS.MEETING_MINUTES_VIEW_PUBLIC,
    PERMISSIONS.MEETING_DECISION_VIEW,
    PERMISSIONS.MEETING_ACTION_VIEW,
  ],

  WARGA: [
    PERMISSIONS.NOTIFICATION_VIEW,
    PERMISSIONS.MEETING_VIEW,
    PERMISSIONS.MEETING_ATTENDANCE_CONFIRM_OWN,
    PERMISSIONS.MEETING_MINUTES_VIEW_PUBLIC,
    PERMISSIONS.MEETING_DECISION_VIEW,
    PERMISSIONS.MEETING_ACTION_VIEW,
  ],
}

export function can(role: Role | undefined | null, permission: string): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  if (perms.includes('*')) return true
  return perms.includes(permission)
}

export function canAny(role: Role | undefined | null, permissions: string[]): boolean {
  return permissions.some((p) => can(role, p))
}

export function permissionsOf(role: Role): string[] {
  if (role === 'ADMIN') return ['*']
  return ROLE_PERMISSIONS[role] ?? []
}
