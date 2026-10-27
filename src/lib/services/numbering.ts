// ============================================================
// Service Penomoran Dokumen — aman dari duplikasi
// Mekanisme: hitung existing dengan prefix, naikkan hingga slot kosong,
// lalu create; bila terjadi tabrakan unique constraint, coba lagi (retry).
// ============================================================

import { db } from '@/lib/db'
import { getSettings } from './settings'

function pad(n: number): string {
  return String(n).padStart(3, '0')
}

export type NumberKind = 'invitation' | 'minutes' | 'meeting' | 'opening' | 'trx'

async function countUsed(kind: NumberKind, prefix: string): Promise<number> {
  switch (kind) {
    case 'invitation':
      return db.meetingInvitation.count({ where: { invitationNumber: { startsWith: `${prefix}/` } } })
    case 'minutes':
      return db.meetingMinutes.count({ where: { minutesNumber: { startsWith: `${prefix}/` } } })
    case 'meeting':
      return db.meeting.count({ where: { meetingNumber: { startsWith: `${prefix}/` } } })
    case 'opening':
      return db.openingBalance.count({ where: { openingBalanceNumber: { startsWith: `${prefix}/` } } })
    case 'trx':
      return db.transaction.count({ where: { trxNumber: { startsWith: `${prefix}/` } } })
  }
}

async function existsNumber(kind: NumberKind, number: string): Promise<boolean> {
  switch (kind) {
    case 'invitation':
      return (await db.meetingInvitation.findUnique({ where: { invitationNumber: number } })) !== null
    case 'minutes':
      return (await db.meetingMinutes.findUnique({ where: { minutesNumber: number } })) !== null
    case 'meeting':
      return (await db.meeting.findUnique({ where: { meetingNumber: number } })) !== null
    case 'opening':
      return (await db.openingBalance.findUnique({ where: { openingBalanceNumber: number } })) !== null
    case 'trx':
      return (await db.transaction.findUnique({ where: { trxNumber: number } })) !== null
  }
}

/**
 * Nomor unik dengan format PREFIX/YYYY/NNN (contoh: UND/RT05/2026/001).
 * Mekanisme cek-then-create dengan retry untuk mencegah duplikasi
 * ketika beberapa pengguna membuat dokumen bersamaan.
 */
export async function generateNumber(kind: NumberKind, prefix?: string): Promise<string> {
  const year = new Date(
    new Date().getTime() + 7 * 60 * 60 * 1000
  ).getUTCFullYear()

  let base: string
  if (kind === 'invitation' || kind === 'minutes') {
    const settings = await getSettings()
    const rtCode = `RT${settings.nomorRT}`
    base = kind === 'invitation' ? `UND/${rtCode}` : `NTR/${rtCode}`
  } else if (kind === 'meeting') {
    base = 'RTM'
  } else if (kind === 'opening') {
    base = 'SA'
  } else {
    const wib = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
    base = `TRX/${wib.getUTCFullYear()}${pad(wib.getUTCMonth() + 1)}`
  }
  if (prefix) base = prefix

  // Untuk transaksi, base sudah memuat tahun+bulan (TRX/202610), tanpa suffix tahun
  const fullPrefix = kind === 'trx' ? base : `${base}/${year}`
  const used = await countUsed(kind, fullPrefix)

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = `${fullPrefix}/${pad(used + 1 + attempt)}`
    if (!(await existsNumber(kind, candidate))) return candidate
  }
  throw new Error(`Gagal menghasilkan nomor dokumen untuk ${fullPrefix}`)
}
