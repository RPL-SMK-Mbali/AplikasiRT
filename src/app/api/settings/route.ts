import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requirePermission, handleApiError, ok, ApiError } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { getSettings, saveSettings, type RTSettings } from '@/lib/services/settings'

const settingsSchema = z.object({
  namaRT: z.string().min(1),
  nomorRT: z.string().min(1),
  nomorRW: z.string().min(1),
  desa: z.string().min(1),
  ketuaName: z.string().min(1),
  sekretarisName: z.string().min(1),
  bendaharaName: z.string().optional(),
  alamat: z.string().min(1),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
})

export async function GET() {
  try {
    await requirePermission('notification.view')
    return ok(await getSettings())
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission('settings.manage')
    const body = await req.json()
    const parsed = settingsSchema.parse(body)
    const before = await getSettings()
    const next = await saveSettings(parsed as Partial<RTSettings>)
    await logAudit({
      userId: session.uid,
      userName: session.name,
      action: 'UPDATE',
      objectType: 'APP_SETTINGS',
      objectId: 'singleton',
      description: 'Memperbarui identitas RT pada pengaturan aplikasi',
      before,
      after: next,
    })
    return ok(next)
  } catch (err) {
    if (err instanceof ApiError) return handleApiError(err)
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  return PUT(req)
}

void db
