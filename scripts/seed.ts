// ============================================================
// Seed data demo Kas RT Online
// Jalankan: bun scripts/seed.ts
// ============================================================

import { PrismaClient } from '@prisma/client'
import { randomBytes, scryptSync } from 'crypto'

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function pad(n: number): string {
  return String(n).padStart(3, '0')
}

async function main() {
  console.log('Memulai seed...')

  // Reset (urutan aman untuk SQLite tanpa FK enforcement by default)
  await db.notification.deleteMany()
  await db.auditLog.deleteMany()
  await db.meetingDocumentVersion.deleteMany()
  await db.meetingAttachment.deleteMany()
  await db.meetingActionItem.deleteMany()
  await db.meetingDecision.deleteMany()
  await db.meetingMinutes.deleteMany()
  await db.meetingAgenda.deleteMany()
  await db.meetingAttendance.deleteMany()
  await db.meetingInvitation.deleteMany()
  await db.meeting.deleteMany()
  await db.accountingPeriodSnapshot.deleteMany()
  await db.accountingPeriodAdjustment.deleteMany()
  await db.accountingPeriod.deleteMany()
  await db.cashReconciliation.deleteMany()
  await db.payment.deleteMany()
  await db.feeType.deleteMany()
  await db.cashTransfer.deleteMany()
  await db.transaction.deleteMany()
  await db.openingBalanceCorrection.deleteMany()
  await db.openingBalance.deleteMany()
  await db.cashAccount.deleteMany()
  await db.user.deleteMany()
  await db.resident.deleteMany()
  await db.appSetting.deleteMany()

  // ---------- Pengaturan ----------
  await db.appSetting.create({
    data: {
      id: 'singleton',
      data: JSON.stringify({
        namaRT: 'Kas RT 05',
        nomorRT: '05',
        nomorRW: '02',
        desa: 'Kelurahan Sukamaju',
        ketuaName: 'Ahmad Wijaya',
        sekretarisName: 'Budi Santoso',
        bendaharaName: 'Siti Rahayu',
        alamat: 'Jl. Melati No. 5, Sukamaju',
        contactEmail: 'rt05@sukamaju.id',
        contactPhone: '0812-3456-7890',
      }),
    },
  })


  // ---------- Warga ----------
  const residentsData = [
    { fullName: 'Ahmad Wijaya', houseNumber: '01', isHeadOfFamily: true },
    { fullName: 'Budi Santoso', houseNumber: '02', isHeadOfFamily: true },
    { fullName: 'Siti Rahayu', houseNumber: '03', isHeadOfFamily: true },
    { fullName: 'Dewi Lestari', houseNumber: '07', isHeadOfFamily: true },
    { fullName: 'Eko Prasetyo', houseNumber: '09', isHeadOfFamily: true },
    { fullName: 'Fitri Handayani', houseNumber: '11', isHeadOfFamily: true },
    { fullName: 'Gilang Ramadhan', houseNumber: '14', isHeadOfFamily: true },
    { fullName: 'Hana Puspita', houseNumber: '16', isHeadOfFamily: true },
  ]
  const residents: Record<string, { id: string; fullName: string; houseNumber: string }> = {}
  for (const r of residentsData) {
    const created = await db.resident.create({ data: { ...r, isActive: true } })
    residents[r.fullName] = created
  }

  // ---------- Pengguna ----------
  const password = hashPassword('rt123456')
  const admin = await db.user.create({ data: { username: 'admin', name: 'Admin Sistem RT', email: 'admin@rt05.id', role: 'ADMIN', passwordHash: password, isActive: true } })
  const ketua = await db.user.create({ data: { username: 'ketua', name: 'Ahmad Wijaya', email: 'ketua@rt05.id', role: 'KETUA', passwordHash: password, isActive: true, residentId: residents['Ahmad Wijaya'].id } })
  const sekre = await db.user.create({ data: { username: 'sekretaris', name: 'Budi Santoso', email: 'sekretaris@rt05.id', role: 'SEKRETARIS', passwordHash: password, isActive: true, residentId: residents['Budi Santoso'].id } })
  const bendahara = await db.user.create({ data: { username: 'bendahara', name: 'Siti Rahayu', email: 'bendahara@rt05.id', role: 'BENDAHARA', passwordHash: password, isActive: true, residentId: residents['Siti Rahayu'].id } })
  await db.user.create({ data: { username: 'warga1', name: 'Dewi Lestari', email: 'warga1@rt05.id', role: 'WARGA', passwordHash: password, isActive: true, residentId: residents['Dewi Lestari'].id } })
  const warga2 = await db.user.create({ data: { username: 'warga2', name: 'Eko Prasetyo', email: 'warga2@rt05.id', role: 'WARGA', passwordHash: password, isActive: true, residentId: residents['Eko Prasetyo'].id } })

  // ---------- Akun Kas ----------
  const kasTunai = await db.cashAccount.create({ data: { name: 'Kas Tunai RT', type: 'KAS' } })
  await db.cashAccount.create({ data: { name: 'Rekening Bank BRI', type: 'BANK' } })

  // ---------- Saldo Awal (APPROVED, belum dikunci — untuk demo alur) ----------
  const year = new Date().getFullYear()
  await db.openingBalance.create({
    data: {
      openingBalanceNumber: `SA/${year}/001`,
      effectiveDate: new Date(Date.UTC(year, 9, 1, -7)), // 1 Okt WIB
      amount: 5000000,
      description: 'Saldo kas fisal per 30 September 2026 hasil pembukuan manual buku kas RT',
      sourceType: 'PEMBUKUAN_SEBELUMNYA',
      status: 'APPROVED',
      createdById: bendahara.id,
      approvedById: ketua.id,
      approvedAt: new Date(),
    },
  })

  // ---------- Periode akuntansi Oktober ----------
  await db.accountingPeriod.create({
    data: {
      periodCode: `${year}-10`,
      periodName: 'Oktober 2026',
      startDate: new Date(Date.UTC(year, 9, 1, -7)),
      endDate: new Date(Date.UTC(year, 9, 31, 16, 59, 59, 999)),
      status: 'OPEN',
      createdById: bendahara.id,
    },
  })

  // ---------- Transaksi ----------
  let n = 1
  async function trx(data: {
    type: string; category: string; amount: number; day: number;
    description: string; status?: string; accountId?: string | null
  }) {
    await db.transaction.create({
      data: {
        trxNumber: `TRX/${year}10/${pad(n++)}`,
        type: data.type,
        category: data.category,
        amount: data.amount,
        transactionDate: new Date(Date.UTC(year, 9, data.day, 2, 0, 0)), // 09:00 WIB
        description: data.description,
        status: data.status ?? 'POSTED',
        cashAccountId: data.accountId ?? null,
        isTransfer: data.type.startsWith('TRANSFER'),
        postedAt: (data.status ?? 'POSTED') === 'POSTED' ? new Date() : null,
        postedById: (data.status ?? 'POSTED') === 'POSTED' ? bendahara.id : null,
        createdById: bendahara.id,
      },
    })
  }

  await trx({ type: 'INCOME', category: 'DONASI', amount: 750000, day: 3, description: 'Donasi warga untuk perbaikan pos ronda' })
  await trx({ type: 'EXPENSE', category: 'KEAMANAN', amount: 300000, day: 5, description: 'Honor petugas ronda bulan September' })
  await trx({ type: 'EXPENSE', category: 'KEBERSIHAN', amount: 250000, day: 8, description: 'Pembelian alat kebersihan dan kantong sampah' })
  await trx({ type: 'INCOME', category: 'KEGIATAN', amount: 1500000, day: 10, description: 'Sumbangan sponsor lomba anak Hari Anak Nasional' })
  await trx({ type: 'EXPENSE', category: 'KEGIATAN', amount: 900000, day: 15, description: 'Perlombaan anak-anak Hari Anak Nasional' })
  await trx({ type: 'INCOME', category: 'DONASI', amount: 400000, day: 18, description: 'Donasi warga RT 05 untuk santunan' })
  await trx({ type: 'EXPENSE', category: 'SOSIAL', amount: 500000, day: 20, description: 'Santunan warga kurang mampu' })
  await trx({ type: 'EXPENSE', category: 'OPERASIONAL', amount: 120000, day: 22, description: 'Penggantian lampu penerangan gang' })
  await trx({ type: 'EXPENSE', category: 'OPERASIONAL', amount: 85000, day: 24, description: 'Nota beli ATK rapat (DRAFT)', status: 'DRAFT' })

  // ---------- Iuran ----------
  const iuranBulanan = await db.feeType.create({ data: { name: 'Iuran Bulanan', amount: 25000, frequency: 'BULANAN' } })
  await db.feeType.create({ data: { name: 'Iuran Keamanan', amount: 15000, frequency: 'BULANAN' } })

  const payers = ['Dewi Lestari', 'Eko Prasetyo', 'Fitri Handayani', 'Gilang Ramadhan']
  let pn = 1
  for (const name of payers) {
    const r = residents[name]
    const payment = await db.payment.create({
      data: {
        residentId: r.id,
        feeTypeId: iuranBulanan.id,
        periodCode: `${year}-10`,
        amount: 25000,
        paidAt: new Date(Date.UTC(year, 9, 10 + pn, 1, 0, 0)),
        recordedById: bendahara.id,
        status: 'PAID',
      },
    })
    const linkedTrx = await db.transaction.create({
      data: {
        trxNumber: `TRX/${year}10/${pad(n++)}`,
        type: 'INCOME',
        category: 'IURAN',
        amount: 25000,
        transactionDate: new Date(Date.UTC(year, 9, 10 + pn, 1, 0, 0)),
        description: `Pembayaran Iuran Bulanan Oktober 2026 — ${r.fullName} (Rumah ${r.houseNumber})`,
        status: 'POSTED',
        paymentId: payment.id,
        postedAt: new Date(),
        postedById: bendahara.id,
        createdById: bendahara.id,
      },
    })
    await db.payment.update({ where: { id: payment.id }, data: { transactionId: linkedTrx.id } })
    pn++
  }

  // ---------- Rekonsiliasi ----------
  await db.cashReconciliation.create({
    data: {
      reconcileDate: new Date(Date.UTC(year, 9, 15, 9, 0, 0)),
      cashAccountId: kasTunai.id,
      systemBalance: 6250000,
      actualBalance: 6250000,
      difference: 0,
      notes: 'Rekonsiliasi paruh bulan — kas cocok',
      checkedById: bendahara.id,
      status: 'COCOK',
    },
  })

  // ---------- Rapat 1: DRAFT undangan (Rapat Pengurus) ----------
  const m1 = await db.meeting.create({
    data: {
      meetingNumber: `RTM/${year}/001`,
      title: 'Rapat Pengurus: Evaluasi Program Kerja',
      meetingType: 'PENGURUS',
      meetingDate: new Date(Date.UTC(year, 10, 5, 13, 0, 0)), // 5 Nov 20:00 WIB
      startTime: '19:00',
      endTime: '21:00',
      location: 'Rumah Ketua RT (Rumah 01)',
      meetingMethod: 'LURING',
      description: 'Evaluasi program kerja triwulan IV',
      status: 'SCHEDULED',
      createdById: sekre.id,
    },
  })
  await db.meetingAgenda.createMany({
    data: [
      { meetingId: m1.id, order: 1, title: 'Evaluasi lomba anak Hari Anak Nasional' },
      { meetingId: m1.id, order: 2, title: 'Persiapan kerja bakti November' },
    ],
  })
  await db.meetingInvitation.create({
    data: {
      meetingId: m1.id,
      invitationNumber: `UND/RT05/${year}/002`,
      invitationContent: 'Dalam rangka evaluasi program kerja pengurus, kami mengundang Bapak/Ibu untuk menghadiri rapat yang akan diselenggarakan pada:\n\n- Hari/Tanggal: Kamis, 5 November 2026\n- Waktu: 19:00–21:00 WIB\n- Tempat: Rumah Ketua RT (Rumah 01)\n- Agenda: Evaluasi program kerja',
      participantScope: 'PENGURUS',
      invitationDate: new Date(),
      responseDeadline: new Date(Date.UTC(year, 10, 4, 16, 59, 59)),
      status: 'DRAFT',
      createdById: sekre.id,
    },
  })
  const pengurusRows = [residents['Ahmad Wijaya'].id, residents['Budi Santoso'].id, residents['Siti Rahayu'].id]
  await db.meetingAttendance.createMany({
    data: pengurusRows.map((rid) => ({ meetingId: m1.id, residentId: rid })),
  })

  // ---------- Rapat 2: PUBLISHED (Rapat Warga mendatang) ----------
  const m2 = await db.meeting.create({
    data: {
      meetingNumber: `RTM/${year}/002`,
      title: 'Rapat Warga: Rencana Kerja & Anggaran 2027',
      meetingType: 'WARGA',
      meetingDate: new Date(Date.UTC(year, 10, 12, 13, 0, 0)), // 12 Nov 20:30 WIB
      startTime: '19:30',
      endTime: '21:30',
      location: 'Balai RT 05',
      meetingMethod: 'LURING',
      description: 'Musyawarah rencana kerja dan anggaran tahun 2027',
      status: 'SCHEDULED',
      createdById: sekre.id,
    },
  })
  await db.meetingAgenda.createMany({
    data: [
      { meetingId: m2.id, order: 1, title: 'Laporan pertanggungjawaban bendahara 2026' },
      { meetingId: m2.id, order: 2, title: 'Rencana kerja 2027: perbaikan drainase lingkungan' },
      { meetingId: m2.id, order: 3, title: 'Rencana penyesuaian iuran bulanan' },
    ],
  })
  await db.meetingInvitation.create({
    data: {
      meetingId: m2.id,
      invitationNumber: `UND/RT05/${year}/001`,
      invitationContent: 'Dalam rangka musyawarah rencana kerja dan anggaran tahun 2027, kami mengundang Bapak/Ibu untuk menghadiri rapat yang akan diselenggarakan pada:\n\n- Hari/Tanggal: Kamis, 12 November 2026\n- Waktu: 19:30–21:30 WIB\n- Tempat: Balai RT 05\n- Agenda: Laporan bendahara, rencana kerja 2027, penyesuaian iuran',
      participantScope: 'SEMUA_KK',
      invitationDate: new Date(Date.UTC(year, 9, 20, 2, 0, 0)),
      responseDeadline: new Date(Date.UTC(year, 10, 11, 16, 59, 59)),
      status: 'PUBLISHED',
      publishedAt: new Date(Date.UTC(year, 9, 20, 3, 0, 0)),
      approvedById: ketua.id,
      approvedAt: new Date(Date.UTC(year, 9, 20, 2, 30, 0)),
      createdById: sekre.id,
    },
  })
  const allKK = Object.values(residents).map((r) => r.id)
  const responses = ['HADIR', 'BELUM_MERESPONS', 'HADIR', 'TIDAK_HADIR', 'BELUM_PASTI', 'HADIR', 'BELUM_MERESPONS', 'HADIR']
  let ri = 0
  for (const rid of allKK) {
    const resp = responses[ri % responses.length]
    await db.meetingAttendance.create({
      data: {
        meetingId: m2.id,
        residentId: rid,
        responseStatus: resp,
        responseAt: resp !== 'BELUM_MERESPONS' ? new Date(Date.UTC(year, 9, 21, 1, 0, 0)) : null,
      },
    })
    ri++
  }

  // ---------- Rapat 3: COMPLETED + notulen PUBLISHED ----------
  const m3 = await db.meeting.create({
    data: {
      meetingNumber: `RTM/${year}/003`,
      title: 'Rapat Keamanan dan Kebersihan Lingkungan',
      meetingType: 'KEAMANAN_KEBERSIHAN',
      meetingDate: new Date(Date.UTC(year, 9, 14, 13, 0, 0)), // 14 Okt 20:00 WIB
      startTime: '20:00',
      endTime: '22:00',
      location: 'Balai RT 05',
      meetingMethod: 'LURING',
      status: 'COMPLETED',
      createdById: sekre.id,
    },
  })
  await db.meetingAgenda.createMany({
    data: [
      { meetingId: m3.id, order: 1, title: 'Evaluasi jadwal ronda' },
      { meetingId: m3.id, order: 2, title: 'Penanganan saluran air tersumbat Blok C' },
      { meetingId: m3.id, order: 3, title: 'Sampah: penguatan pemilahan' },
    ],
  })
  await db.meetingInvitation.create({
    data: {
      meetingId: m3.id,
      invitationNumber: `UND/RT05/${year}/003`,
      invitationContent: 'Undangan rapat keamanan dan kebersihan lingkungan RT 05.',
      participantScope: 'SEMUA_KK',
      invitationDate: new Date(Date.UTC(year, 9, 10, 2, 0, 0)),
      status: 'COMPLETED',
      publishedAt: new Date(Date.UTC(year, 9, 10, 3, 0, 0)),
      createdById: sekre.id,
    },
  })
  const att3 = [
    { name: 'Ahmad Wijaya', resp: 'HADIR', attend: 'HADIR' },
    { name: 'Budi Santoso', resp: 'HADIR', attend: 'HADIR' },
    { name: 'Siti Rahayu', resp: 'HADIR', attend: 'HADIR' },
    { name: 'Dewi Lestari', resp: 'HADIR', attend: 'HADIR' },
    { name: 'Eko Prasetyo', resp: 'TIDAK_HADIR', attend: 'IZIN' },
    { name: 'Fitri Handayani', resp: 'HADIR', attend: 'HADIR' },
    { name: 'Gilang Ramadhan', resp: 'BELUM_PASTI', attend: 'TIDAK_HADIR' },
    { name: 'Hana Puspita', resp: 'HADIR', attend: 'HADIR' },
  ]
  for (const a of att3) {
    await db.meetingAttendance.create({
      data: {
        meetingId: m3.id,
        residentId: residents[a.name].id,
        responseStatus: a.resp,
        responseAt: a.resp !== 'BELUM_MERESPONS' ? new Date(Date.UTC(year, 9, 12, 1, 0, 0)) : null,
        attendanceStatus: a.attend,
        attendanceTime: a.attend === 'HADIR' ? new Date(Date.UTC(year, 9, 14, 13, 10, 0)) : null,
        attendanceMethod: a.attend === 'HADIR' ? 'MANUAL' : null,
        verifiedById: sekre.id,
        notes: a.attend === 'IZIN' ? 'Izin karena tugas luar kota' : null,
      },
    })
  }
  const minutes3 = await db.meetingMinutes.create({
    data: {
      meetingId: m3.id,
      minutesNumber: `NTR/RT05/${year}/001`,
      chairperson: 'Ahmad Wijaya',
      minuteTaker: 'Budi Santoso',
      attendeesCount: 6,
      agendaSummary: 'Evaluasi ronda, penanganan saluran air, penguatan pemilahan sampah.',
      discussionSummary:
        '1. Jadwal ronda dinilai berjalan baik namun ada beberapa malam tanpa petugas; disepakati rotasi tambahan.\n2. Saluran air Blok C tersumbat akibat endapan lumpur dan sampah plastik.\n3. Warga diminta memilah sampah organik dan anorganik; keranjang pemilahan akan dipasang di 3 titik.',
      closingNotes: 'Rapat ditutup pukul 22:00 WIB oleh Ketua RT dengan doa bersama.',
      documentStatus: 'PUBLISHED',
      publishedAt: new Date(Date.UTC(year, 9, 16, 2, 0, 0)),
      approvedById: ketua.id,
      approvedAt: new Date(Date.UTC(year, 9, 16, 1, 30, 0)),
      reviewedById: ketua.id,
      preparedById: sekre.id,
      version: 1,
    },
  })
  const d1 = await db.meetingDecision.create({
    data: { meetingId: m3.id, minutesId: minutes3.id, order: 1, decision: 'Membersihkan saluran air lingkungan Blok A-C sebelum 15 November 2026.', isPublic: true },
  })
  const d2 = await db.meetingDecision.create({
    data: { meetingId: m3.id, minutesId: minutes3.id, order: 2, decision: 'Rotasi jadwal ronda ditambah tiap Jumat malam dengan petugas cadangan.', isPublic: true },
  })
  await db.meetingActionItem.create({
    data: {
      meetingId: m3.id,
      decisionId: d1.id,
      title: 'Bersihkan saluran air Blok A-C',
      description: 'Melibatkan kerja bakti warga; koordinasi alat dan truk pengangkut.',
      responsibleUserId: warga2.id,
      startDate: new Date(Date.UTC(year, 9, 20)),
      dueDate: new Date(Date.UTC(year, 10, 15, 16, 59, 59)),
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      createdById: sekre.id,
    },
  })
  await db.meetingActionItem.create({
    data: {
      meetingId: m3.id,
      decisionId: d2.id,
      title: 'Susun jadwal rotasi ronda Jumat malam',
      responsibleResidentId: residents['Gilang Ramadhan'].id,
      startDate: new Date(Date.UTC(year, 9, 16)),
      dueDate: new Date(Date.UTC(year, 10, 1, 16, 59, 59)),
      priority: 'NORMAL',
      status: 'COMPLETED',
      completionNotes: 'Jadwal rotasi Jumat malam telah disusun dan disebar di grup warga.',
      completedAt: new Date(Date.UTC(year, 10, 1, 10, 0, 0)),
      createdById: sekre.id,
    },
  })
  void d2

  // ---------- Notifikasi contoh ----------
  await db.notification.createMany({
    data: [
      {
        userId: warga2.id,
        type: 'TUGAS_BARU',
        title: 'Tugas tindak lanjut diberikan',
        body: 'Anda ditetapkan sebagai penanggung jawab tugas "Bersihkan saluran air Blok A-C". Tenggat: 15 November 2026.',
        link: `rapat/${m3.id}`,
      },
      {
        userId: warga2.id,
        type: 'UNDANGAN_BARU',
        title: 'Undangan rapat diterbitkan',
        body: `Undangan UND/RT05/${year}/001: "Rapat Warga: Rencana Kerja & Anggaran 2027" — 19:30 WIB, Balai RT 05. Silakan buka aplikasi untuk konfirmasi kehadiran.`,
        link: `rapat/${m2.id}`,
      },
      {
        userId: admin.id,
        type: 'PERIODE_INFO',
        title: 'Saldo awal menunggu penguncian',
        body: `Saldo awal SA/${year}/001 telah disetujui. Kunci saldo awal agar menjadi final.`,
        link: 'saldo-awal',
      },
    ],
  })

  // ---------- Audit log contoh ----------
  await db.auditLog.createMany({
    data: [
      {
        userId: bendahara.id, userName: 'Siti Rahayu', action: 'CREATE',
        objectType: 'OPENING_BALANCE', objectId: `SA/${year}/001`,
        description: `Membuat saldo awal SA/${year}/001 sebesar Rp5.000.000 berlaku 1 Oktober 2026`,
        afterData: JSON.stringify({ amount: 5000000 }),
      },
      {
        userId: ketua.id, userName: 'Ahmad Wijaya', action: 'APPROVE',
        objectType: 'OPENING_BALANCE', objectId: `SA/${year}/001`,
        description: `Menyetujui saldo awal SA/${year}/001`,
        beforeData: JSON.stringify({ status: 'DRAFT' }), afterData: JSON.stringify({ status: 'APPROVED' }),
      },
      {
        userId: sekre.id, userName: 'Budi Santoso', action: 'PUBLISH',
        objectType: 'MEETING_INVITATION', objectId: `UND/RT05/${year}/001`,
        description: `Menerbitkan undangan UND/RT05/${year}/001 untuk rapat "Rapat Warga: Rencana Kerja & Anggaran 2027" (8 peserta)`,
        afterData: JSON.stringify({ status: 'PUBLISHED' }),
      },
    ],
  })

  console.log('Seed selesai!')
  console.log('Akun demo (sandi: rt123456): admin, ketua, sekretaris, bendahara, warga1, warga2')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
