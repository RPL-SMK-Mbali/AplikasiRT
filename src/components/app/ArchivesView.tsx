'use client'

// ============================================================
// Arsip Rapat — pencarian nomor, judul, tanggal, jenis, status
// ============================================================

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Archive, Eye, FileText, Search } from 'lucide-react'
import { useApp, PageHeader, StatusBadge, LoadingBox, ErrorBox, EmptyState } from './shared'
import type { MeetingRow } from './types'
import { apiGet } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { MINUTES_STATUS, MEETING_TYPE } from '@/lib/labels'

export default function ArchivesView() {
  const { navigate } = useApp()
  const [q, setQ] = useState('')
  const [type, setType] = useState('ALL')

  const { data, isLoading, error } = useQuery({
    queryKey: ['meetings-archive'],
    queryFn: () => apiGet<MeetingRow[]>('/api/meetings?status=COMPLETED'),
  })

  const rows = useMemo(() => {
    let r = data ?? []
    if (type !== 'ALL') r = r.filter((m) => m.meetingType === type)
    const query = q.toLowerCase()
    if (query) {
      r = r.filter(
        (m) =>
          m.title.toLowerCase().includes(query) ||
          (m.invitation?.invitationNumber ?? '').toLowerCase().includes(query) ||
          (m.minutes?.minutesNumber ?? '').toLowerCase().includes(query)
      )
    }
    return r
  }, [data, q, type])

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />

  return (
    <div>
      <PageHeader
        title="Arsip Rapat"
        description="Dokumen rapat yang telah selesai: undangan, daftar hadir, notulen, keputusan, dan tindak lanjut. Pencarian berdasarkan nomor, judul, tanggal, dan jenis rapat."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor/judul/tanggal..." className="pl-8" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Jenis rapat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Jenis</SelectItem>
            {Object.entries(MEETING_TYPE).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">{rows.length} arsip</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Belum ada arsip rapat" hint="Rapat yang ditandai selesai dan notulennya diterbitkan akan masuk arsip." />
      ) : (
        <div className="grid gap-2">
          {rows.map((m) => (
            <Card key={m.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="font-medium">{m.title}</p>
                    {m.minutes ? (
                      <StatusBadge
                        label={MINUTES_STATUS[m.minutes.documentStatus]?.label ?? m.minutes.documentStatus}
                        color={MINUTES_STATUS[m.minutes.documentStatus]?.color ?? ''}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{m.invitation?.invitationNumber ?? m.meetingNumber}</span>
                    {m.minutes ? <> · <span className="font-mono">{m.minutes.minutesNumber}</span></> : null}
                    {' · '}{MEETING_TYPE[m.meetingType] ?? m.meetingType} · {formatDate(m.meetingDate)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => navigate(`rapat-detail:${m.id}`)}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Buka
                  </Button>
                  {m.minutes?.documentStatus === 'PUBLISHED' || m.minutes?.documentStatus === 'ARCHIVED' ? (
                    <Button size="sm" variant="ghost" onClick={() => navigate(`rapat-detail:${m.id}`)}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" /> Notulen
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
