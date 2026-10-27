// ============================================================
// Klien API untuk SPA — pembungkus fetch dengan penanganan error
// ============================================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export async function api<T = unknown>(
  path: string,
  options?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = options ?? {}
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as ApiResponse<T>
  if (!res.ok || !body.success) {
    throw new Error(body.error || `Permintaan gagal (${res.status})`)
  }
  return body.data as T
}

export const apiGet = <T = unknown>(path: string) => api<T>(path)
export const apiPost = <T = unknown>(path: string, json?: unknown) =>
  api<T>(path, { method: 'POST', json })
export const apiPut = <T = unknown>(path: string, json?: unknown) =>
  api<T>(path, { method: 'PUT', json })
export const apiDelete = <T = unknown>(path: string) =>
  api<T>(path, { method: 'DELETE' })

/** Unduh CSV (kompatibel Excel) di sisi klien */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  const csv = '\uFEFF' + rows.map((r) => r.map(escape).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
