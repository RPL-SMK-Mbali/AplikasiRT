// ============================================================
// Label status & tipe dalam Bahasa Indonesia + warna badge
// ============================================================

export const PERIOD_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Terbuka', color: 'bg-emerald-100 text-emerald-800' },
  REVIEW: { label: 'Diperiksa', color: 'bg-amber-100 text-amber-800' },
  CLOSED: { label: 'Ditutup', color: 'bg-slate-200 text-slate-700' },
  LOCKED: { label: 'Terkunci', color: 'bg-rose-100 text-rose-700' },
}

export const TX_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-amber-100 text-amber-800' },
  POSTED: { label: 'Terposting', color: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-slate-200 text-slate-600' },
  REVERSED: { label: 'Dibalik', color: 'bg-rose-100 text-rose-700' },
}

export const TX_TYPE: Record<string, string> = {
  OPENING: 'Saldo Awal',
  INCOME: 'Pemasukan',
  EXPENSE: 'Pengeluaran',
  TRANSFER_IN: 'Transfer Masuk',
  TRANSFER_OUT: 'Transfer Keluar',
}

export const OB_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Disetujui', color: 'bg-emerald-100 text-emerald-800' },
  LOCKED: { label: 'Terkunci', color: 'bg-rose-100 text-rose-700' },
}

export const INV_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-amber-100 text-amber-800' },
  PENDING_APPROVAL: { label: 'Menunggu Persetujuan', color: 'bg-orange-100 text-orange-800' },
  PUBLISHED: { label: 'Diterbitkan', color: 'bg-emerald-100 text-emerald-800' },
  COMPLETED: { label: 'Rapat Selesai', color: 'bg-teal-100 text-teal-700' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-rose-100 text-rose-700' },
  ARCHIVED: { label: 'Diarsipkan', color: 'bg-slate-200 text-slate-600' },
}

export const MINUTES_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-amber-100 text-amber-800' },
  PENDING_REVIEW: { label: 'Menunggu Pemeriksaan', color: 'bg-orange-100 text-orange-800' },
  APPROVED: { label: 'Disetujui', color: 'bg-teal-100 text-teal-800' },
  PUBLISHED: { label: 'Diterbitkan', color: 'bg-emerald-100 text-emerald-800' },
  ARCHIVED: { label: 'Diarsipkan', color: 'bg-slate-200 text-slate-600' },
}

export const RESPONSE_STATUS: Record<string, { label: string; color: string }> = {
  BELUM_MERESPONS: { label: 'Belum Merespons', color: 'bg-slate-200 text-slate-600' },
  HADIR: { label: 'Hadir', color: 'bg-emerald-100 text-emerald-800' },
  TIDAK_HADIR: { label: 'Tidak Hadir', color: 'bg-rose-100 text-rose-700' },
  BELUM_PASTI: { label: 'Belum Pasti', color: 'bg-amber-100 text-amber-800' },
}

export const ATTENDANCE_STATUS: Record<string, { label: string; color: string }> = {
  BELUM_DICATAT: { label: 'Belum Dicatat', color: 'bg-slate-200 text-slate-600' },
  HADIR: { label: 'Hadir Aktual', color: 'bg-emerald-100 text-emerald-800' },
  TIDAK_HADIR: { label: 'Tidak Hadir', color: 'bg-rose-100 text-rose-700' },
  IZIN: { label: 'Izin', color: 'bg-amber-100 text-amber-800' },
}

export const MEETING_TYPE: Record<string, string> = {
  RUTIN: 'Rapat Rutin RT',
  PENGURUS: 'Rapat Pengurus',
  WARGA: 'Rapat Warga',
  PERSIAPAN_KEGIATAN: 'Rapat Persiapan Kegiatan',
  KEAMANAN_KEBERSIHAN: 'Rapat Keamanan & Kebersihan',
  PEMBANGUNAN: 'Rapat Pembangunan/Fasilitas',
  SOSIAL: 'Rapat Sosial',
  KHUSUS: 'Rapat Khusus',
  LAINNYA: 'Lainnya',
}

export const MEETING_METHOD: Record<string, string> = {
  LURING: 'Luring (Tatap Muka)',
  DARING: 'Daring (Online)',
  HYBRID: 'Hibrida',
}

export const SCOPE: Record<string, string> = {
  SEMUA_WARGA: 'Seluruh Warga',
  SEMUA_KK: 'Seluruh Kepala Keluarga',
  PENGURUS: 'Pengurus RT',
  PILIHAN: 'Peserta Pilihan Sekretaris',
}

export const PRIORITY: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Rendah', color: 'bg-slate-200 text-slate-600' },
  NORMAL: { label: 'Normal', color: 'bg-orange-100 text-orange-800' },
  HIGH: { label: 'Tinggi', color: 'bg-amber-100 text-amber-800' },
  URGENT: { label: 'Mendesak', color: 'bg-rose-100 text-rose-700' },
}

export const ACTION_STATUS: Record<string, { label: string; color: string }> = {
  NOT_STARTED: { label: 'Belum Dimulai', color: 'bg-slate-200 text-slate-600' },
  IN_PROGRESS: { label: 'Berjalan', color: 'bg-orange-100 text-orange-800' },
  COMPLETED: { label: 'Selesai', color: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Dibatalkan', color: 'bg-rose-100 text-rose-700' },
}

export const SOURCE_TYPE: Record<string, string> = {
  PEMBUKUAN_SEBELUMNYA: 'Pembukuan Sebelumnya',
  MIGRASI_MANUAL: 'Migrasi Manual',
  LAINNYA: 'Sumber Lain',
}

export const TRX_CATEGORY: Record<string, string> = {
  IURAN: 'Iuran',
  DONASI: 'Donasi/Sumbangan',
  KEGIATAN: 'Kegiatan',
  OPERASIONAL: 'Operasional',
  KEAMANAN: 'Keamanan',
  KEBERSIHAN: 'Kebersihan',
  SOSIAL: 'Sosial',
  PEMBANGUNAN: 'Pembangunan',
  TRANSFER_INTERNAL: 'Transfer Internal',
  LAINNYA: 'Lainnya',
}

export const ATTACHMENT_TYPE: Record<string, string> = {
  UNDANGAN: 'Undangan',
  NOTULEN: 'Notulen',
  DAFTAR_HADIR: 'Daftar Hadir',
  FOTO: 'Foto Dokumentasi',
  MATERI: 'Materi Rapat',
  LAMPIRAN_KEPUTUSAN: 'Lampiran Keputusan',
  BUKTI_TINDAK_LANJUT: 'Bukti Tindak Lanjut',
  LAINNYA: 'Lainnya',
}
