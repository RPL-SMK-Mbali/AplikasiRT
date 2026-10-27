'use client'

// ============================================================
// Notulen Publik — warga membaca notulen yang diterbitkan
// ============================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, Search } from 'lucide-react'
import { useApp, PageHeader, LoadingBox, ErrorBox, EmptyState } from './shared'
import type { MeetingRow } from './types'
import { apiGet } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import { toast } from '@/hooks/use-toast'

interface PublicMinutesItem extends MeetingRow {
  minutes?: { id: string; minutesNumber: string; documentStatus: string; discussionSummary?: string | null }
}

export default function PublicMinutesView() {
  const { navigate } = useApp()
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<import('./types').MeetingDetail | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['meetings-public'],
    queryFn: () => apiGet<PublicMinutesItem[]>('/api/meetings'),
  })

  async function openMinutes(id: string) {
    setOpenId(id)
    try {
      const d = await apiGet<import('./types').MeetingDetail>(`/api/meetings/${id}`)
      setDetail(d)
    } catch (e) {
      toast({ title: 'Gagal memuat notulen', description: (e as Error).message, variant: 'destructive' })
    }
  }

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />

  const rows = (data ?? []).filter(
    (m) => m.minutes?.documentStatus === 'PUBLISHED' &&
      (q === '' || m.title.toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div>
      <PageHeader
        title="Notulen Publik"
        description="Hasil rapat yang diumumkan kepada warga: ringkasan pembahasan, keputusan, dan tindak lanjut."
      />

      <div className="relative mb-4 w-full sm:w-72">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul rapat..." className="pl-8" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Belum ada notulen publik" hint="Notulen yang telah diterbitkan Sekretaris RT akan tampil di sini." />
      ) : (
        <div className="grid gap-2">
          {rows.map((m) => (
            <Card key={m.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{m.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{m.minutes?.minutesNumber}</span> · {formatDate(m.meetingDate)} · {m.location}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openMinutes(m.id)}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Baca
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notulen Rapat</DialogTitle>
          </DialogHeader>
          {!detail ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat...</p>
          ) : detail.minutes ? (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="font-semibold">{detail.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {detail.minutes.minutesNumber} · {formatDate(detail.meetingDate)} · {detail.location}
                </p>
              </div>
              <div>
                <p className="font-semibold">Agenda</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {detail.agendas.map((a) => (
                    <li key={a.id}>{a.title}</li>
                  ))}
                </ol>
              </div>
              <div>
                <p className="font-semibold">Ringkasan Pembahasan</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{detail.minutes.discussionSummary || '-'}</p>
              </div>
              <div>
                <p className="font-semibold">Keputusan</p>
                {detail.decisions.filter((d) => d.isPublic).length === 0 ? (
                  <p className="mt-1 text-muted-foreground">-</p>
                ) : (
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    {detail.decisions.filter((d) => d.isPublic).map((d) => (
                      <li key={d.id}>{d.decision}</li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <p className="font-semibold">Tindak Lanjut (untuk warga)</p>
                {detail.actionItems.length === 0 ? (
                  <p className="mt-1 text-muted-foreground">-</p>
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {detail.actionItems.map((a) => (
                      <li key={a.id}>
                        {a.title} — {a.responsibleResident?.fullName ?? a.responsibleUser?.name ?? '-'}
                        {a.dueDate ? ` (tenggat ${formatDate(a.dueDate)})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button variant="outline" onClick={() => navigate(`rapat-detail:${detail.id}`)}>
                Lihat detail rapat
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
