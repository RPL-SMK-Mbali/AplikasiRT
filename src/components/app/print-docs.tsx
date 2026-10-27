'use client'

// ============================================================
// Dokumen cetak resmi — Undangan, Notulen, Daftar Hadir
// Format A4, identitas RT dari pengaturan aplikasi.
// Cetak via window.print() — area cetak diatur CSS @media print.
// ============================================================

import { useApp } from './shared'
import type { RTSettings, MeetingDetail, AttendanceRow } from './types'
import { formatDate, dayName, formatDateTime } from '@/lib/format'
import { ACTION_STATUS } from '@/lib/labels'

export function PrintArea({ children, onDone }: { children: React.ReactNode; onDone?: () => void }) {
  return (
    <div className="print-root fixed inset-0 z-[100] overflow-auto bg-white p-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-root, .print-root * { visibility: visible; }
          .print-root { position: absolute; inset: 0; padding: 0; background: white; }
          .print-no { display: none !important; }
          @page { size: A4; margin: 18mm; }
        }
      `}</style>
      <div className="print-no mx-auto mb-4 flex max-w-[210mm] items-center justify-end gap-2">
        <button
          onClick={() => window.print()}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Cetak / Simpan PDF
        </button>
        <button
          onClick={onDone}
          className="rounded-md border px-4 py-2 text-sm hover:bg-slate-50"
        >
          Tutup
        </button>
      </div>
      <div className="mx-auto w-full max-w-[210mm] bg-white text-black" style={{ fontFamily: 'Times New Roman, serif' }}>
        {children}
      </div>
    </div>
  )
}

function DocHeader({ settings, title, number }: { settings: RTSettings; title: string; number: string }) {
  return (
    <div className="mb-4 border-b-2 border-black pb-3 text-center">
      <p className="text-base font-bold uppercase tracking-wide">Pengurus RT {settings.nomorRT} / RW {settings.nomorRW}</p>
      <p className="text-sm">{settings.desa}</p>
      <p className="text-sm">{settings.alamat}</p>
      <p className="mt-2 text-lg font-bold uppercase underline">{title}</p>
      <p className="text-sm">Nomor: {number}</p>
    </div>
  )
}

function SignatureBlock({ settings, leftLabel, rightLabel }: { settings: RTSettings; leftLabel?: string; rightLabel?: string }) {
  return (
    <div className="mt-10 flex justify-between text-sm">
      <div className="text-center">
        {leftLabel ? <p>{leftLabel}</p> : null}
        <div className="h-16" />
        <p className="font-semibold underline">{settings.ketuaName}</p>
        <p>Ketua RT</p>
      </div>
      <div className="text-center">
        {rightLabel ? <p>{rightLabel}</p> : null}
        <div className="h-16" />
        <p className="font-semibold underline">{settings.sekretarisName}</p>
        <p>Sekretaris RT</p>
      </div>
    </div>
  )
}

// ---------- UNDANGAN ----------

export function InvitationDoc({ meeting, onClose }: { meeting: MeetingDetail; onClose: () => void }) {
  const { settings } = useApp()
  const inv = meeting.invitation
  if (!inv) return null
  return (
    <PrintArea onDone={onClose}>
      <DocHeader settings={settings} title="Undangan Rapat" number={inv.invitationNumber} />
      <div className="space-y-3 text-sm leading-relaxed">
        <p>Kepada Yth.</p>
        <p className="font-semibold">Bapak/Ibu Warga RT {settings.nomorRT} RW {settings.nomorRW}</p>
        <p className="pt-2">Dengan hormat,</p>
        <p>
          {inv.invitationContent && inv.invitationContent.includes('Dalam rangka')
            ? inv.invitationContent
                .split('\n')
                .filter((l) => !l.startsWith('UNDANGAN') && !l.startsWith('Nomor:') && !l.startsWith('Kepada Yth.') &&
                  !l.startsWith('Bapak/Ibu Warga') && !l.startsWith('Dengan hormat') &&
                  !l.startsWith('Ketua RT') && !l.startsWith('Sekretaris RT') &&
                  l.trim() !== settings.ketuaName && l.trim() !== settings.sekretarisName &&
                  !l.startsWith(settings.desa) && !l.startsWith('Demikian') && !l.startsWith('Atas perhatian'))
                .join('\n')
            : inv.invitationContent}
        </p>
      </div>
      <div className="mt-6 text-sm">
        <p>{settings.desa}, {formatDate(inv.invitationDate)}</p>
        <p>Hormat kami,</p>
        <SignatureBlock settings={settings} />
      </div>
      <p className="mt-6 text-[10px] text-muted-foreground">
        Dicetak dari Kas RT Online — {formatDateTime(new Date())}. Dokumen sah bila ditandatangani basah oleh Ketua/Sekretaris RT.
      </p>
    </PrintArea>
  )
}

// ---------- NOTULEN ----------

export function MinutesDoc({
  meeting, onClose,
}: {
  meeting: MeetingDetail
  onClose: () => void
}) {
  const { settings } = useApp()
  const min = meeting.minutes
  if (!min) return null
  const decisions = meeting.decisions
  const actionItems = meeting.actionItems

  return (
    <PrintArea onDone={onClose}>
      <DocHeader settings={settings} title="Notulen Rapat" number={min.minutesNumber} />

      <table className="mb-4 w-full text-sm">
        <tbody>
          <Row label="Hari/Tanggal" value={`${dayName(meeting.meetingDate)}, ${formatDate(meeting.meetingDate)}`} />
          <Row label="Waktu" value={`${min ? meeting.startTime : ''}${meeting.endTime ? `–${meeting.endTime}` : ''} WIB`} />
          <Row label="Tempat" value={meeting.location} />
          <Row label="Pimpinan Rapat" value={min.chairperson} />
          <Row label="Notulis" value={min.minuteTaker} />
          <Row label="Jumlah Hadir" value={`${min.attendeesCount} orang`} />
        </tbody>
      </table>

      <Section n={1} title="Agenda Rapat">
        {meeting.agendas.length === 0 ? (
          <p className="text-sm">-</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {meeting.agendas.map((a) => (
              <li key={a.id}>
                {a.title}
                {a.description ? <span className="text-black/70"> — {a.description}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section n={2} title="Ringkasan Pembahasan">
        <p className="whitespace-pre-wrap text-sm">{min.discussionSummary || '-'}</p>
      </Section>

      <Section n={3} title="Keputusan Rapat">
        {decisions.length === 0 ? (
          <p className="text-sm">-</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {decisions.map((d) => (
              <li key={d.id}>{d.decision}</li>
            ))}
          </ol>
        )}
      </Section>

      <Section n={4} title="Tindak Lanjut">
        {actionItems.length === 0 ? (
          <p className="text-sm">-</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border border-black bg-black/5">
                <th className="border border-black px-2 py-1">No.</th>
                <th className="border border-black px-2 py-1">Tugas</th>
                <th className="border border-black px-2 py-1">Penanggung Jawab</th>
                <th className="border border-black px-2 py-1">Tenggat</th>
                <th className="border border-black px-2 py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {actionItems.map((a, i) => (
                <tr key={a.id} className="border border-black">
                  <td className="border border-black px-2 py-1 text-center">{i + 1}</td>
                  <td className="border border-black px-2 py-1">{a.title}</td>
                  <td className="border border-black px-2 py-1">
                    {a.responsibleResident?.fullName ?? a.responsibleUser?.name ?? '-'}
                  </td>
                  <td className="border border-black px-2 py-1 text-center">
                    {a.dueDate ? formatDate(a.dueDate) : '-'}
                  </td>
                  <td className="border border-black px-2 py-1 text-center">
                    {ACTION_STATUS[a.status]?.label ?? a.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section n={5} title="Penutup">
        <p className="whitespace-pre-wrap text-sm">{min.closingNotes || '-'}</p>
      </Section>

      <div className="mt-8 text-sm">
        <p>Notulen dibuat oleh: <span className="font-semibold">{min.preparedBy?.name ?? min.minuteTaker}</span></p>
        <p className="mt-1">
          Diperiksa/disetujui oleh: <span className="font-semibold">{min.approvedBy?.name ?? min.reviewedBy?.name ?? '________________'}</span>
          {min.approvedAt ? ` (disetujui ${formatDate(min.approvedAt)})` : ' (menunggu persetujuan)'}
        </p>
        <SignatureBlock settings={settings} rightLabel="Sekretaris/Notulis" />
      </div>
      <p className="mt-6 text-[10px] text-muted-foreground">
        Versi dokumen: {min.version} — Dicetak dari Kas RT Online, {formatDateTime(new Date())}.
      </p>
    </PrintArea>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="w-44 py-0.5 align-top text-sm">{label}</td>
      <td className="w-2 py-0.5 text-sm">:</td>
      <td className="py-0.5 text-sm font-medium">{value}</td>
    </tr>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-sm font-bold uppercase">{n}. {title}</p>
      {children}
    </div>
  )
}

// ---------- DAFTAR HADIR ----------

export function AttendanceDoc({
  meeting, rows, onClose,
}: {
  meeting: MeetingDetail
  rows: AttendanceRow[]
  onClose: () => void
}) {
  const { settings } = useApp()
  return (
    <PrintArea onDone={onClose}>
      <DocHeader settings={settings} title="Daftar Hadir Rapat" number={meeting.invitation?.invitationNumber ?? meeting.meetingNumber} />
      <table className="mb-4 w-full text-sm">
        <tbody>
          <Row label="Hari/Tanggal" value={`${dayName(meeting.meetingDate)}, ${formatDate(meeting.meetingDate)}`} />
          <Row label="Waktu" value={`${meeting.startTime}${meeting.endTime ? `–${meeting.endTime}` : ''} WIB`} />
          <Row label="Tempat" value={meeting.location} />
          <Row label="Agenda" value={meeting.title} />
        </tbody>
      </table>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border border-black bg-black/5">
            <th className="border border-black px-2 py-1 w-8">No.</th>
            <th className="border border-black px-2 py-1">Nama</th>
            <th className="border border-black px-2 py-1 w-20">Rumah</th>
            <th className="border border-black px-2 py-1 w-28">Tanda Tangan</th>
            <th className="border border-black px-2 py-1 w-24">Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border border-black">
              <td className="border border-black px-2 py-1 text-center">{i + 1}</td>
              <td className="border border-black px-2 py-1">{r.resident.fullName}</td>
              <td className="border border-black px-2 py-1 text-center">{r.resident.houseNumber}</td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1 text-center">
                {r.attendanceStatus === 'HADIR' ? 'H' : r.attendanceStatus === 'IZIN' ? 'I' : r.attendanceStatus === 'TIDAK_HADIR' ? 'A' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-8 text-sm">
        <p>Keterangan: H = Hadir, I = Izin, A = Tidak Hadir</p>
        <SignatureBlock settings={settings} rightLabel="Pencatat Kehadiran" />
      </div>
    </PrintArea>
  )
}
