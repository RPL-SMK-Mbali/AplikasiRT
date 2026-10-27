import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { writeFile, mkdir, readFile } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { requireAuth, requirePermission, handleApiError, ok, ApiError, fail } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { can, type Role } from '@/lib/permissions'

const UPLOAD_DIR = path.join(process.cwd(), 'db', 'uploads')
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

/** GET: unduh lampiran (?file=<id>) — authorization pada setiap unduhan */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requireAuth()
    const fileId = new URL(req.url).searchParams.get('file')
    if (!fileId) throw new ApiError('Parameter file wajib diisi.', 422)

    const att = await db.meetingAttachment.findUnique({ where: { id: fileId } })
    if (!att || att.meetingId !== id) throw new ApiError('Lampiran tidak ditemukan.', 404)

    const isPengurus = can(session.role as Role, 'meeting_attachment.download')
    if (!isPengurus && !att.isPublic)
      throw new ApiError('Anda tidak berhak mengunduh lampiran ini.', 403)

    const buf = await readFile(att.filePath)
    await logAudit({
      userId: session.uid, userName: session.name, action: 'DOWNLOAD',
      objectType: 'MEETING_ATTACHMENT', objectId: att.id,
      description: `Mengunduh lampiran ${att.fileName}`,
    })
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': att.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(att.fileName)}"`,
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}

/** POST: unggah lampiran/dokumentasi (multipart) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_attachment.upload')

    const form = await req.formData()
    const file = form.get('file') as File | null
    const type = (form.get('type') as string) || 'LAINNYA'
    const isPublic = (form.get('isPublic') as string) === 'true'

    if (!file) return fail('Berkas wajib dipilih.', 422)
    if (file.size > MAX_SIZE) return fail('Ukuran berkas maksimal 5 MB.', 422)
    if (!ALLOWED_TYPES.includes(file.type))
      return fail('Tipe berkas tidak diizinkan. Gunakan gambar, PDF, Word, atau Excel.', 422)

    const meeting = await db.meeting.findUnique({ where: { id } })
    if (!meeting) throw new ApiError('Rapat tidak ditemukan.', 404)

    await mkdir(UPLOAD_DIR, { recursive: true })
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80)
    const storedName = `${randomUUID()}-${safeName}`
    const filePath = path.join(UPLOAD_DIR, storedName)
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()))

    const att = await db.meetingAttachment.create({
      data: {
        meetingId: id,
        type,
        fileName: file.name,
        filePath,
        mimeType: file.type,
        fileSize: file.size,
        isPublic,
        uploadedById: session.uid,
      },
    })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'UPLOAD',
      objectType: 'MEETING_ATTACHMENT', objectId: att.id,
      description: `Mengunggah lampiran ${att.fileName} (${(att.fileSize / 1024).toFixed(0)} KB, ${type})`,
      after: { fileName: att.fileName, type, isPublic },
    })
    return ok(att, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const session = await requirePermission('meeting_attachment.upload')
    const fileId = new URL(req.url).searchParams.get('file')
    if (!fileId) throw new ApiError('Parameter file wajib diisi.', 422)
    const att = await db.meetingAttachment.findUnique({ where: { id: fileId } })
    if (!att || att.meetingId !== id) throw new ApiError('Lampiran tidak ditemukan.', 404)

    await db.meetingAttachment.delete({ where: { id: fileId } })
    await logAudit({
      userId: session.uid, userName: session.name, action: 'DELETE',
      objectType: 'MEETING_ATTACHMENT', objectId: fileId,
      description: `Menghapus lampiran ${att.fileName}`,
    })
    return ok({ message: 'Lampiran dihapus' })
  } catch (err) {
    return handleApiError(err)
  }
}
