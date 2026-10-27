'use client'

// ============================================================
// Tindak Lanjut — daftar tugas lintas rapat + filter
// ============================================================

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Search } from 'lucide-react'
import { PageHeader, LoadingBox, ErrorBox, EmptyState } from './shared'
import { ActionItemCard } from './MeetingDetailView'
import type { ActionItemRow } from './types'
import { apiGet } from '@/lib/api-client'
import { ACTION_STATUS } from '@/lib/labels'

export default function ActionItemsView() {
  const [status, setStatus] = useState('ALL')
  const [mine, setMine] = useState(false)
  const [q, setQ] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['action-items', status, mine],
    queryFn: () =>
      apiGet<ActionItemRow[]>(`/api/action-items?${status !== 'ALL' ? `status=${status}&` : ''}${mine ? 'mine=1' : ''}`),
  })

  const rows = useMemo(() => data ?? [], [data])
  const overdue = rows.filter(
    (r) => r.dueDate && new Date(r.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(r.status)
  )
  const filtered = rows.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()))

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />

  return (
    <div>
      <PageHeader
        title="Tindak Lanjut Rapat"
        description="Pantau tugas dari keputusan rapat hingga selesai dan terverifikasi. Tugas tidak otomatis dianggap selesai hanya karena tenggat telah lewat."
      />

      {overdue.length > 0 ? (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {overdue.length} tugas melewati tenggat dan memerlukan perhatian.
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Status</SelectItem>
            {Object.entries(ACTION_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4" />
          Hanya tugas milik saya
        </label>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul tugas..." className="pl-8" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Tidak ada tugas tindak lanjut" hint="Tugas dibuat dari tab Keputusan & Tindak Lanjut pada detail rapat." />
      ) : (
        <div className="grid gap-2">
          {filtered.map((a) => (
            <ActionItemCard key={a.id} item={a} />
          ))}
        </div>
      )}
    </div>
  )
}
