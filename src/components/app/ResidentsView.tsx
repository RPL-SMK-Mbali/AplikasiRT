'use client'

// ============================================================
// Data Warga — CRUD untuk administrasi RT
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Pencil, UserCheck } from 'lucide-react'
import { useCan, PageHeader, LoadingBox, ErrorBox, EmptyState, Field } from './shared'
import type { ResidentRow } from './types'
import { apiGet, apiPost, apiPut, downloadCsv } from '@/lib/api-client'
import { toast } from '@/hooks/use-toast'

export default function ResidentsView() {
  const can = useCan()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [editRow, setEditRow] = useState<ResidentRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['residents'],
    queryFn: () => apiGet<ResidentRow[]>('/api/residents'),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  const rows = (data ?? []).filter((r) => r.isActive)
  const filtered = rows.filter(
    (r) => q === '' || r.fullName.toLowerCase().includes(q.toLowerCase()) || r.houseNumber.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      <PageHeader
        title="Data Warga"
        description="Sumber data peserta rapat, pembayaran iuran, dan penanggung jawab tindak lanjut."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv('data-warga.csv', [
                  ['Nama', 'Rumah', 'No. KK', 'Telepon', 'Kepala Keluarga'],
                  ...rows.map((r) => [r.fullName, r.houseNumber, r.noKK ?? '', r.phone ?? '', r.isHeadOfFamily ? 'Ya' : 'Tidak']),
                ])
              }
            >
              Unduh Excel
            </Button>
            {can('resident.manage') ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Tambah Warga
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="relative mb-4 w-full sm:w-72">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama/nomor rumah..." className="pl-8" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Belum ada data warga" hint="Tambahkan data warga untuk mulai mengelola iuran dan kehadiran rapat." />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Rumah</TableHead>
                <TableHead>No. KK</TableHead>
                <TableHead>Telepon</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.fullName}</TableCell>
                  <TableCell>Rumah {r.houseNumber}</TableCell>
                  <TableCell className="font-mono text-xs">{r.noKK ?? '-'}</TableCell>
                  <TableCell className="text-sm">{r.phone ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.isHeadOfFamily ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">KK</Badge> : <Badge variant="secondary">Anggota</Badge>}
                      {r.user ? <Badge variant="outline" className="text-[10px]">Akun: {r.user.role}</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {can('resident.manage') ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditRow(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ResidentDialog
        open={createOpen || !!editRow}
        row={editRow}
        onClose={() => {
          setCreateOpen(false)
          setEditRow(null)
        }}
      />
    </div>
  )
}

function ResidentDialog({ open, row, onClose }: { open: boolean; row: ResidentRow | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [fullName, setFullName] = useState(row?.fullName ?? '')
  const [houseNumber, setHouseNumber] = useState(row?.houseNumber ?? '')
  const [noKK, setNoKK] = useState(row?.noKK ?? '')
  const [phone, setPhone] = useState(row?.phone ?? '')
  const [isHead, setIsHead] = useState(row?.isHeadOfFamily ?? true)
  const [key, setKey] = useState('')

  // Reset saat membuka dengan baris berbeda
  const rowKey = row?.id ?? 'new'
  if (key !== rowKey && open) {
    setKey(rowKey)
    setFullName(row?.fullName ?? '')
    setHouseNumber(row?.houseNumber ?? '')
    setNoKK(row?.noKK ?? '')
    setPhone(row?.phone ?? '')
    setIsHead(row?.isHeadOfFamily ?? true)
  }

  const mut = useMutation({
    mutationFn: () =>
      row
        ? apiPut('/api/residents', { id: row.id, fullName, houseNumber, noKK, phone, isHeadOfFamily: isHead })
        : apiPost('/api/residents', { fullName, houseNumber, noKK, phone, isHeadOfFamily: isHead }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['residents'] })
      toast({ title: row ? 'Data warga diperbarui' : 'Warga ditambahkan' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? 'Edit Data Warga' : 'Tambah Warga'}</DialogTitle>
          <DialogDescription>Data warga digunakan untuk undangan, kehadiran, dan iuran.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Nama Lengkap" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nomor Rumah" required>
              <Input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="12" />
            </Field>
            <Field label="No. KK">
              <Input value={noKK} onChange={(e) => setNoKK(e.target.value)} />
            </Field>
          </div>
          <Field label="Telepon">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isHead} onChange={(e) => setIsHead(e.target.checked)} className="h-4 w-4" />
            <UserCheck className="h-4 w-4" /> Kepala Keluarga
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={fullName.trim().length < 2 || houseNumber.trim().length < 1 || mut.isPending} onClick={() => mut.mutate()}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
