// ============================================================
// Autentikasi — hashing password (scrypt) + session cookie
// yang ditandatangani HMAC-SHA256 (httpOnly).
// ============================================================

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { Role } from './permissions'

const SESSION_COOKIE = 'kasrt_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7 // 7 hari

function getSecret(): string {
  return process.env.SESSION_SECRET || 'kas-rt-online-dev-secret-2026'
}

// ---------- Password ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    if (candidate.length !== expected.length) return false
    return timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

// ---------- Session token ----------

export interface SessionPayload {
  uid: string
  username: string
  name: string
  role: Role
  residentId?: string | null
  exp: number
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url')
}

export function createSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const full: SessionPayload = { ...payload, exp: Date.now() + SESSION_TTL_MS }
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function parseSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = sign(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// ---------- Cookie helpers (Server) ----------

export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // sandbox preview berjalan di belakang proxy https
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  return parseSessionToken(store.get(SESSION_COOKIE)?.value)
}
