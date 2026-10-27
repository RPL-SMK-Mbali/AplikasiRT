// ============================================================
// Tipe data bersama untuk SPA Kas RT Online
// ============================================================

import type { Role } from '@/lib/permissions'

export interface SessionUser {
  id: string
  username: string
  name: string
  role: Role
  residentId?: string | null
  resident?: { id: string; fullName: string; houseNumber: string } | null
}

export interface RTSettings {
  namaRT: string
  nomorRT: string
  nomorRW: string
  desa: string
  ketuaName: string
  sekretarisName: string
  bendaharaName?: string
  alamat: string
  contactEmail?: string
  contactPhone?: string
}

export interface OpeningBalance {
  id: string
  openingBalanceNumber: string
  effectiveDate: string
  amount: number
  description: string
  sourceType: string
  supportingDocument?: string | null
  status: string
  createdBy?: { name: string }
  approvedBy?: { name: string } | null
  cashAccount?: { id: string; name: string; type: string } | null
  corrections: { id: string; oldAmount: number; newAmount: number; reason: string; createdAt: string }[]
}

export interface AccountingPeriod {
  id: string
  periodCode: string
  periodName: string
  startDate: string
  endDate: string
  status: string
  openingBalance: number
  totalIncome: number
  totalExpense: number
  closingBalance: number
  lockedAt?: string | null
  lockedBy?: { name: string } | null
  reopenedAt?: string | null
  reopenedBy?: { name: string } | null
  reopenReason?: string | null
  live: { opening: number; income: number; expense: number; closing: number }
  isConsistent: boolean
}

export interface TransactionRow {
  id: string
  trxNumber: string
  type: string
  category: string | null
  amount: number
  transactionDate: string
  description: string
  status: string
  isTransfer: boolean
  reversalReason?: string | null
  postedAt?: string | null
  cashAccount?: { id: string; name: string } | null
  createdBy?: { name: string }
  payment?: { resident?: { fullName: string }; feeType?: { name: string } } | null
  reversalOf?: { trxNumber: string } | null
}

export interface MeetingRow {
  id: string
  meetingNumber: string
  title: string
  meetingType: string
  meetingDate: string
  startTime: string
  endTime?: string | null
  location: string
  meetingMethod: string
  status: string
  cancelReason?: string | null
  invitation?: { id: string; invitationNumber: string; status: string; publishedAt?: string | null; participantScope: string } | null
  minutes?: { id: string; minutesNumber: string; documentStatus: string } | null
  _count?: { attendances: number; decisions: number; actionItems: number }
  attendances?: { responseStatus: string; attendanceStatus: string }[]
}

export interface AttendanceRow {
  id: string
  responseStatus: string
  responseAt?: string | null
  attendanceStatus: string
  attendanceTime?: string | null
  attendanceMethod?: string | null
  notes?: string | null
  resident: { id: string; fullName: string; houseNumber: string; isHeadOfFamily: boolean }
  verifiedBy?: { name: string } | null
}

export interface MeetingDetail extends MeetingRow {
  description?: string | null
  invitation?: {
    id: string
    invitationNumber: string
    invitationContent: string
    participantScope: string
    invitationDate: string
    responseDeadline?: string | null
    status: string
    changeNotes?: string | null
    publishedAt?: string | null
    createdBy?: { name: string } | null
    approvedBy?: { name: string } | null
  } | null
  agendas: { id: string; order: number; title: string; description?: string | null }[]
  attendances: AttendanceRow[]
  minutes?: MinutesRow | null
  decisions: DecisionRow[]
  actionItems: ActionItemRow[]
  attachments: AttachmentRow[]
}

export interface MinutesRow {
  id: string
  minutesNumber: string
  chairperson: string
  minuteTaker: string
  attendeesCount: number
  agendaSummary?: string | null
  discussionSummary?: string | null
  closingNotes?: string | null
  documentStatus: string
  version: number
  publishedAt?: string | null
  approvedAt?: string | null
  preparedBy?: { name: string } | null
  reviewedBy?: { name: string } | null
  approvedBy?: { name: string } | null
  decisions?: DecisionRow[]
  versions?: { id: string; version: number; changeReason?: string | null; createdAt: string }[]
}

export interface DecisionRow {
  id: string
  order: number
  decision: string
  isPublic: boolean
  _count?: { actionItems: number }
}

export interface ActionItemRow {
  id: string
  title: string
  description?: string | null
  priority: string
  status: string
  startDate?: string | null
  dueDate?: string | null
  completionNotes?: string | null
  completedAt?: string | null
  meetingId: string
  meeting?: { id: string; title: string; meetingNumber: string }
  decision?: { id: string; decision: string } | null
  responsibleUser?: { id: string; name: string } | null
  responsibleResident?: { id: string; fullName: string; houseNumber: string } | null
  verifiedBy?: { name: string } | null
}

export interface AttachmentRow {
  id: string
  type: string
  fileName: string
  mimeType: string
  fileSize: number
  isPublic: boolean
  createdAt: string
  uploadedBy?: { name: string } | null
}

export interface ResidentRow {
  id: string
  fullName: string
  houseNumber: string
  noKK?: string | null
  phone?: string | null
  isHeadOfFamily: boolean
  familyRelation?: string | null
  isActive: boolean
  user?: { id: string; username: string; role: string } | null
}

export interface UserRow {
  id: string
  username: string
  name: string
  email?: string | null
  role: string
  isActive: boolean
  residentId?: string | null
  resident?: { id: string; fullName: string; houseNumber: string } | null
}

export interface NotificationRow {
  id: string
  type: string
  title: string
  body: string
  link?: string | null
  isRead: boolean
  createdAt: string
}

export interface AuditRow {
  id: string
  userName?: string | null
  action: string
  objectType: string
  objectId?: string | null
  description: string
  beforeData?: string | null
  afterData?: string | null
  createdAt: string
}

export interface FeeTypeRow {
  id: string
  name: string
  amount: number
  frequency: string
  isActive: boolean
}

export interface PaymentRow {
  id: string
  residentId: string
  feeTypeId: string
  periodCode: string
  amount: number
  paidAt: string
  notes?: string | null
  resident?: { fullName: string; houseNumber: string }
  feeType?: { name: string }
  transaction?: { trxNumber: string } | null
  recordedBy?: { name: string } | null
}

export interface ReconciliationRow {
  id: string
  reconcileDate: string
  systemBalance: number
  actualBalance: number
  difference: number
  notes?: string | null
  status: string
  cashAccount?: { id: string; name: string; type: string }
  checkedBy?: { name: string } | null
  approvedBy?: { name: string } | null
  resolvedAt?: string | null
}

export interface LedgerRow {
  id: string
  date: string
  kind: string
  trxNumber: string
  description: string
  category?: string | null
  cashAccountName?: string | null
  status: string
  in: number
  out: number
  balance: number
}

export interface CashAccountRow {
  id: string
  name: string
  type: string
  isActive: boolean
}
