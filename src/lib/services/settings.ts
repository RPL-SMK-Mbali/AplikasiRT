// ============================================================
// Service Pengaturan — Identitas RT (singleton)
// Nama pejabat, nomor RT/RW, dan identitas lain berasal dari sini,
// dipakai pada template undangan, notulen, dan dokumen cetak.
// ============================================================

import { db } from '@/lib/db'

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

export const DEFAULT_SETTINGS: RTSettings = {
  namaRT: 'Kas RT 05',
  nomorRT: '05',
  nomorRW: '02',
  desa: 'Kelurahan Sukamaju',
  ketuaName: 'Ahmad Wijaya',
  sekretarisName: 'Budi Santoso',
  bendaharaName: 'Siti Rahayu',
  alamat: 'Jl. Melati No. 5, Sukamaju',
  contactEmail: 'rt05@sukamaju.id',
  contactPhone: '0812-3456-7890',
}

export async function getSettings(): Promise<RTSettings> {
  const row = await db.appSetting.findUnique({ where: { id: 'singleton' } })
  if (!row) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.data) as RTSettings) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(data: Partial<RTSettings>): Promise<RTSettings> {
  const current = await getSettings()
  const next: RTSettings = { ...current, ...data }
  await db.appSetting.upsert({
    where: { id: 'singleton' },
    update: { data: JSON.stringify(next) },
    create: { id: 'singleton', data: JSON.stringify(next) },
  })
  return next
}
