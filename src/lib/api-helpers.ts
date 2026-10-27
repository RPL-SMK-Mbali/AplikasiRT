// ============================================================
// Helper API — respons standar, pembungkus error, guard auth/permission
// ============================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { db } from '@/lib/db'
import { getSession, type SessionPayload } from './auth'
import { can, type Role } from './permissions'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init)
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) throw new ApiError('Anda belum masuk. Silakan login terlebih dahulu.', 401)
  // Validasi pengguna masih ada & aktif (revokasi segera saat dinonaktifkan)
  const user = await db.user.findUnique({ where: { id: session.uid }, select: { isActive: true } })
  if (!user || !user.isActive) {
    throw new ApiError('Sesi tidak valid atau akun dinonaktifkan. Silakan login kembali.', 401)
  }
  return session
}

export async function requirePermission(permission: string): Promise<SessionPayload> {
  const session = await requireAuth()
  if (!can(session.role as Role, permission)) {
    throw new ApiError('Anda tidak memiliki hak akses untuk operasi ini.', 403)
  }
  return session
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) return fail(err.message, err.status)
  if (err instanceof ZodError) {
    const first = err.issues[0]
    const msg = first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Data tidak valid'
    return fail(`Validasi gagal — ${msg}`, 422)
  }
  const message = err instanceof Error ? err.message : 'Terjadi kesalahan internal'
  // Prisma unique constraint
  if (typeof message === 'string' && message.includes('Unique constraint')) {
    return fail('Data sudah ada (duplikat). Periksa kembali nomor/identitas yang dimasukkan.', 409)
  }
  console.error('[API Error]', err)
  return fail(message, 500)
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
