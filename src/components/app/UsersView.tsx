'use client'

// ============================================================
// Pengguna & Hak Akses — kelola akun + RBAC
// ============================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, KeyRound } from 'lucide-react'
import { PageHeader, LoadingBox, ErrorBox, Field } from './shared'
import type { UserRow, ResidentRow } from './types'
import { apiGet, apiPost, apiPut } from '@/lib/api-client'
import { ROLE_LABEL, ROLES } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'

export default function UsersView() {
  const qc = useQueryClient()
  const [editRow, setEditRow] = useState<UserRow | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<UserRow[]>('/api/users'),
  })
  const { data: residents } = useQuery({
    queryKey: ['residents'],
    queryFn: () => apiGet<ResidentRow[]>('/api/residents'),
  })

  if (isLoading) return <LoadingBox />
  if (error) return <ErrorBox message={(error as Error).message} />
  const rows = data ?? []

  return (
    <div>
      <PageHeader
        title="Pengguna &amp; Hak Akses"
        description="Akun aplikasi dengan RBAC: hak akses ditentukan lewat permission per role, bukan hanya nama role. Semua endpoint memeriksa otorisasi di backend."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Pengguna
          </Button>
        }
      />

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pengguna</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Terhubung Warga</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">{u.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{u.username}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? u.role}</Badge>
                </TableCell>
                <TableCell className="text-sm">{u.resident ? `${u.resident.fullName} (Rumah ${u.resident.houseNumber})` : '-'}</TableCell>
                <TableCell>
                  {u.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Aktif</Badge>
                  ) : (
                    <Badge variant="secondary">Nonaktif</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditRow(u)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserDialog
        open={createOpen || !!editRow}
        row={editRow}
        residents={(residents ?? []).filter((r) => r.isActive)}
        onClose={() => {
          setCreateOpen(false)
          setEditRow(null)
        }}
      />
    </div>
  )
}

function UserDialog({
  open, row, residents, onClose,
}: {
  open: boolean
  row: UserRow | null
  residents: ResidentRow[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('WARGA')
  const [residentId, setResidentId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [key, setKey] = useState('')

  const rowKey = row?.id ?? 'new'
  if (key !== rowKey && open) {
    setKey(rowKey)
    setName(row?.name ?? '')
    setUsername(row?.username ?? '')
    setPassword('')
    setRole(row?.role ?? 'WARGA')
    setResidentId(row?.residentId ?? '')
    setIsActive(row?.isActive ?? true)
  }

  const mut = useMutation({
    mutationFn: () =>
      row
        ? apiPut('/api/users', {
            id: row.id,
            name,
            role,
            residentId,
            isActive,
            ...(password ? { password } : {}),
          })
        : apiPost('/api/users', { name, username, password, role, residentId, isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast({ title: row ? 'Pengguna diperbarui' : 'Pengguna dibuat' })
      onClose()
    },
    onError: (e: Error) => toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' }),
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? 'Edit Pengguna' : 'Tambah Pengguna'}</DialogTitle>
          <DialogDescription>
            {row ? 'Biarkan kata sandi kosong bila tidak diubah.' : 'Kata sandi minimal 6 karakter, di-hash scrypt di server.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nama" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Nama Pengguna" required={!row}>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} disabled={!!row} className="font-mono" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={row ? 'Kata Sandi Baru (opsional)' : 'Kata Sandi'} required={!row}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={row ? 'Tidak diubah' : 'Minimal 6 karakter'} />
            </Field>
            <Field label="Role" required>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Hubungkan ke Data Warga" hint="Wajib untuk role WARGA agar dapat konfirmasi kehadiran">
            <Select value={residentId || 'NONE'} onValueChange={(v) => setResidentId(v === 'NONE' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Tidak terhubung (pengurus/admin)</SelectItem>
                {residents.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.fullName} — Rumah {r.houseNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {row ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              <KeyRound className="h-4 w-4" /> Akun aktif
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={name.trim().length < 2 || (!row && (username.trim().length < 3 || password.length < 6)) || mut.isPending}
            onClick={() => mut.mutate()}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
