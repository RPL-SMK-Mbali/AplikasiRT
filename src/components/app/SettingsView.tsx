'use client'

// ============================================================
// Pengaturan RT — identitas untuk template dokumen resmi
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, LoadingBox, ErrorBox } from './shared'
import type { RTSettings } from './types'
import { apiGet, apiPut } from '@/lib/api-client'
import { toast } from '@/hooks/use-toast'

export default function SettingsView() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<RTSettings>('/api/settings'),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  if (!data) return null

  // key memastikan form re-init saat data pengaturan berubah dari server
  return <SettingsForm key={JSON.stringify(data)} initial={data} />
}

function SettingsForm({ initial }: { initial: RTSettings }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<RTSettings>(initial)

  const mut = useMutation({
    mutationFn: () => apiPut('/api/settings', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['me'] })
      toast({ title: 'Pengaturan tersimpan', description: 'Identitas RT pada undangan, notulen, dan laporan diperbarui.' })
    },
    onError: (e: Error) => toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' }),
  })

  function set<K extends keyof RTSettings>(key: K, value: RTSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Pengaturan RT</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
        Identitas ini dipakai pada template undangan, notulen, daftar hadir, dan laporan. Nama pejabat berasal dari data nyata — tidak dibuat-buat.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identitas RT</CardTitle>
            <CardDescription>Nama dan wilayah kerja RT</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Nama Aplikasi / RT" required>
              <Input value={form.namaRT} onChange={(e) => set('namaRT', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nomor RT" required hint="Dipakai penomoran: UND/RT05/...">
                <Input value={form.nomorRT} onChange={(e) => set('nomorRT', e.target.value)} />
              </Field>
              <Field label="Nomor RW" required>
                <Input value={form.nomorRW} onChange={(e) => set('nomorRW', e.target.value)} />
              </Field>
            </div>
            <Field label="Desa / Kelurahan" required>
              <Input value={form.desa} onChange={(e) => set('desa', e.target.value)} />
            </Field>
            <Field label="Alamat Sekretariat" required>
              <Input value={form.alamat} onChange={(e) => set('alamat', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pejabat &amp; Kontak</CardTitle>
            <CardDescription>Tampil pada blok tanda tangan dokumen</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Nama Ketua RT" required>
              <Input value={form.ketuaName} onChange={(e) => set('ketuaName', e.target.value)} />
            </Field>
            <Field label="Nama Sekretaris RT" required>
              <Input value={form.sekretarisName} onChange={(e) => set('sekretarisName', e.target.value)} />
            </Field>
            <Field label="Nama Bendahara">
              <Input value={form.bendaharaName ?? ''} onChange={(e) => set('bendaharaName', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email">
                <Input value={form.contactEmail ?? ''} onChange={(e) => set('contactEmail', e.target.value)} />
              </Field>
              <Field label="Telepon">
                <Input value={form.contactPhone ?? ''} onChange={(e) => set('contactPhone', e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </Button>
      </div>
    </div>
  )
}
