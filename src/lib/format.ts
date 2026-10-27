// ============================================================
// Format — Rupiah, tanggal Indonesia, zona waktu Asia/Jakarta
// ============================================================

const TZ = 'Asia/Jakarta'

export function formatRupiah(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && isFinite(amount) ? amount : 0
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatRupiahPlain(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && isFinite(amount) ? amount : 0
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(date)
}

export function formatDateShort(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ,
  }).format(date)
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  }).format(date)
}

export function dayName(d: Date | string | null | undefined): string {
  if (!d) return '-'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: TZ }).format(date)
}

// Konversi tanggal ke "yyyy-MM-dd" dalam zona Asia/Jakarta
export function toISODate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TZ,
  }).format(date)
}

// Kode periode akuntansi bulanan: 2026-10
export function periodCodeOf(d: Date | string): string {
  return toISODate(d).slice(0, 7)
}

export function periodNameOf(code: string): string {
  const [year, month] = code.split('-').map(Number)
  const names = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ]
  return `${names[(month || 1) - 1]} ${year}`
}

export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

// Batas tanggal periode dalam UTC-safe (tanggal dihitung di Asia/Jakarta)
export function periodRange(code: string): { start: Date; end: Date } {
  const [year, month] = code.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  // Geser sesuai offset Asia/Jakarta (UTC+7): batas lokal 00:00 WIB = 17:00 UTC hari sebelumnya
  const startWIB = new Date(start.getTime() - 7 * 60 * 60 * 1000)
  const endWIB = new Date(end.getTime() - 7 * 60 * 60 * 1000)
  return { start: startWIB, end: endWIB }
}

export function label(value: string | null | undefined, map: Record<string, string>): string {
  if (!value) return '-'
  return map[value] ?? value
}
