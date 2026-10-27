# Kas RT Online

Aplikasi pengelolaan kas dan rapat RT, meliputi pencatatan transaksi, iuran warga, laporan keuangan, agenda rapat, notulen, dan tindak lanjut. Dibangun dengan Next.js, TypeScript, dan Prisma dengan database MySQL/MariaDB.

## Instalasi

1. Siapkan Node.js 20.9+ dan MySQL 8 atau MariaDB 10.6+, lalu buka terminal Bash di folder proyek.

2. Pasang dependensi:

   ```bash
   npm ci
   ```

3. Buat database `kas_rt` di MySQL/MariaDB, lalu salin konfigurasi:

   ```bash
   cp deploy/env.example .env
   ```

   Sesuaikan `.env` dengan akun database Anda:

   ```dotenv
   DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/kas_rt"
   SESSION_SECRET="GANTI_DENGAN_NILAI_ACAK"
   ```

4. Siapkan tabel dan akun demo pada database baru:

   ```bash
   npm run db:generate
   npx prisma db push
   npx --yes tsx scripts/seed.ts
   ```

   **Seed menghapus data lama. Jalankan hanya pada database baru atau database uji.**

5. Jalankan aplikasi:

   ```bash
   npm run dev
   ```

   Buka [http://localhost:3000](http://localhost:3000). Login demo: `admin` dengan kata sandi `rt123456`.
