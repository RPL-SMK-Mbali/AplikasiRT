# Panduan Deployment Kas RT Online di PC Sendiri — nginx + MySQL

Panduan ini menjelaskan cara menjalankan aplikasi **Kas RT Online** di komputer Anda sendiri menggunakan **MySQL** sebagai database dan **nginx** sebagai web server (reverse proxy).

## Arsitektur

```
Browser (PC / HP di jaringan lokal)
        |
        v  http://IP-PC-ANDA  (port 80)
+-----------------+
|      nginx      |   web server, menerima semua permintaan
+-----------------+
        |
        v  proxy ke 127.0.0.1:3000
+-----------------+
|  Next.js (app)  |   server aplikasi produksi (standalone)
+-----------------+
        |
        v  127.0.0.1:3306
+-----------------+
|      MySQL      |   database kas_rt (Prisma ORM)
+-----------------+
```

- **nginx** mendengarkan di port 80 lalu meneruskan semua permintaan ke aplikasi Next.js yang berjalan di port 3000.
- **MySQL** menyimpan seluruh data (pengguna, warga, transaksi, rapat, notulen, dst.).
- **Lampiran rapat** (file upload) disimpan di folder `db/uploads` di dalam direktori kerja aplikasi.

---

## Langkah 0 — Prasyarat

| Perangkat Lunak | Versi Minimum | Catatan |
|---|---|---|
| Node.js | 20.x atau lebih baru | Runtime aplikasi. Unduh dari https://nodejs.org |
| MySQL | 8.x (atau MariaDB 10.6+) | Database |
| nginx | 1.18+ | Reverse proxy |
| npm | bawaan Node.js | Pengelola paket |
| Bun *(opsional)* | 1.x | Hanya jika ingin pakai `npm run seed` gaya sandbox; tanpa bun bisa pakai `npx tsx` |

**Instalasi di Ubuntu/Debian:**

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# MySQL Server + nginx
sudo apt-get update
sudo apt-get install -y mysql-server nginx
sudo systemctl enable --now mysql nginx
```

**Instalasi di Windows:**

1. Node.js — unduh installer LTS dari https://nodejs.org lalu instal.
2. MySQL — unduh MySQL Installer dari https://dev.mysql.com/downloads/installer/ (atau pakai XAMPP yang sudah menyertakan MySQL/MariaDB).
3. nginx — unduh paket Windows dari https://nginx.org/en/download.html, ekstrak ke `C:\nginx`.

> **Catatan Windows:** perintah `cp` di script build bawaan tidak berjalan di CMD. Panduan ini sudah menyediakan alternatifnya di Langkah 5.

---

## Langkah 1 — Salin Kode Proyek ke PC

Salin seluruh folder proyek ini ke PC Anda, misalnya ke:

- Linux: `/opt/kas-rt` atau `/home/nama-anda/kas-rt`
- Windows: `C:\kas-rt`

Pastikan file yang ikut tersalin minimal: `src/`, `prisma/`, `scripts/seed.ts`, `deploy/`, `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `public/`.

Kemudian buka terminal di folder proyek dan pasang dependensi:

```bash
npm install
```

---

## Langkah 2 — Buat Database dan User MySQL

Masuk ke MySQL sebagai root:

```bash
sudo mysql            # Linux
# atau: mysql -u root -p   (Windows / setelah set password root)
```

Jalankan SQL berikut (ganti `GANTI_PASSWORD` dengan password pilihan Anda):

```sql
CREATE DATABASE kas_rt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kasrt'@'localhost' IDENTIFIED BY 'GANTI_PASSWORD';
GRANT ALL PRIVILEGES ON kas_rt.* TO 'kasrt'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Kenapa `utf8mb4`?** Agar seluruh karakter (termasuk emoji dan karakter khusus) tersimpan benar. Ini charset default MySQL 8, dinyatakan eksplisit agar aman juga di MariaDB.

---

## Langkah 3 — Konfigurasi `.env` dan Skema MySQL

1. Salin contoh environment menjadi file `.env` di folder utama proyek:

   ```bash
   cp deploy/env.example .env
   ```

2. Buka `.env` dan isi `DATABASE_URL` sesuai kredensial Anda:

   ```
   DATABASE_URL="mysql://kasrt:GANTI_PASSWORD@127.0.0.1:3306/kas_rt"
   ```

   > Jika password mengandung karakter khusus seperti `@ : / # ?`, tulis dalam bentuk URL-encode (contoh: `@` → `%40`, `#` → `%23`).

3. Aktifkan skema MySQL (file `prisma/schema.mysql.prisma` sudah disiapkan dan tervalidasi). Salin menimpa skema lama:

   ```bash
   cp prisma/schema.mysql.prisma prisma/schema.prisma
   ```

4. Buat semua tabel di MySQL dan generate Prisma Client:

   ```bash
   npx prisma generate
   npx prisma db push
   ```

   Jika berhasil akan muncul pesan `Your database is now in sync with your schema`.

---

## Langkah 4 — Isi Data Demo (Opsional)

Untuk mengisi akun demo, warga, transaksi, dan rapat contoh:

```bash
# Opsi A — dengan npx tsx (tanpa bun, direkomendasikan di PC)
npx tsx scripts/seed.ts

# Opsi B — dengan bun (jika terpasang)
bun scripts/seed.ts
```

Akun demo (sandi semua: `rt123456`): `admin`, `ketua`, `sekretaris`, `bendahara`, `warga1`, `warga2`.

> Untuk penggunaan **asli**, lewati langkah ini dan mulai dengan data riil: masuk sebagai `admin` → buat data warga, akun kas, saldo awal, lalu transaksi.

---

## Langkah 5 — Build Produksi

**Linux / macOS:**

```bash
npm run build
```

Script bawaan akan menjalankan `next build` lalu menyalin folder `.next/static` dan `public/` ke dalam `.next/standalone/`.

**Windows (PowerShell)** — script `cp` bawaan tidak jalan di CMD, jadi build manual:

```powershell
npx next build
Copy-Item -Recurse -Force .next\static .next\standalone\.next\
Copy-Item -Recurse -Force public .next\standalone\
```

Hasil build yang perlu dijalankan nanti adalah satu folder: `.next/standalone/`.

---

## Langkah 6 — Jalankan Server Aplikasi

### Opsi A — Manual (paling cepat, untuk mencoba)

**Linux/macOS:**

```bash
PORT=3000 HOSTNAME=127.0.0.1 NODE_ENV=production \
DATABASE_URL="mysql://kasrt:GANTI_PASSWORD@127.0.0.1:3306/kas_rt" \
node .next/standalone/server.js
```

**Windows (PowerShell):**

```powershell
$env:PORT=3000; $env:HOSTNAME="127.0.0.1"; $env:NODE_ENV="production"
$env:DATABASE_URL="mysql://kasrt:GANTI_PASSWORD@127.0.0.1:3306/kas_rt"
node .next\standalone\server.js
```

Buka terminal kedua dan uji: `curl http://localhost:3000` — harus mengembalikan HTML (status 200). Biarkan terminal ini tetap berjalan.

### Opsi B — systemd (Linux, berjalan otomatis saat boot — disarankan)

1. Salin kode ke lokasi final, mis. `sudo mkdir -p /opt/kas-rt` lalu salin seluruh proyek (termasuk `.next/standalone`) ke sana.
2. Edit `deploy/kas-rt.service` — sesuaikan `User`, `WorkingDirectory`, dan `DATABASE_URL`.
3. Pasang service:

   ```bash
   sudo cp deploy/kas-rt.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now kas-rt
   systemctl status kas-rt        # harus "active (running)"
   journalctl -u kas-rt -f        # lihat log langsung
   ```

### Opsi C — pm2 (Linux & Windows, alternatif systemd)

```bash
npm install -g pm2
pm2 start .next/standalone/server.js --name kas-rt \
  --env NODE_ENV=production --env PORT=3000 --env HOSTNAME=127.0.0.1 \
  --env DATABASE_URL="mysql://kasrt:GANTI_PASSWORD@127.0.0.1:3306/kas_rt"
pm2 save && pm2 startup    # auto-start saat boot (Linux)
```

> **Penting tentang lokasi upload:** aplikasi menyimpan lampiran rapat ke folder `db/uploads` **di dalam direktori kerja** aplikasi. Saat mode standalone, direktori kerja adalah `.next/standalone/`, jadi file upload berada di `.next/standalone/db/uploads`. Jangan hapus folder ini saat update aplikasi — atau salin isinya ke build baru.

---

## Langkah 7 — Konfigurasi nginx

### Linux (Ubuntu/Debian)

```bash
sudo cp deploy/nginx-kas-rt.conf /etc/nginx/sites-available/kas-rt
sudo ln -s /etc/nginx/sites-available/kas-rt /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default     # hilangkan halaman default
sudo nginx -t                                   # uji konfigurasi
sudo systemctl reload nginx
```

### Windows

1. Salin `deploy/nginx-kas-rt.conf` ke `C:\nginx\conf\kas-rt.conf`.
2. Buka `C:\nginx\conf\nginx.conf`, di dalam blok `http { ... }` tambahkan baris: `include kas-rt.conf;`
3. Buka CMD di `C:\nginx` lalu jalankan: `nginx -t` (uji) dan `nginx -s reload` (muat ulang). Jika nginx belum berjalan, jalankan `start nginx`.

**Buka firewall (jika akan diakses dari PC/HP lain di jaringan):**

```bash
# Ubuntu
sudo ufw allow 80/tcp
```

Windows: Windows Security → Firewall → Advanced settings → Inbound Rules → New Rule → Port 80 (TCP) → Allow.

---

## Langkah 8 — Verifikasi

1. Dari PC yang sama: buka `http://localhost` di browser → halaman login Kas RT Online tampil.
2. Dari perangkat lain di jaringan yang sama: buka `http://IP-PC-ANDA` (cek IP dengan `ip addr` di Linux atau `ipconfig` di Windows).
3. Login dengan akun demo `bendahara` / `rt123456`.
4. Cek alur utama: Dashboard → Transaksi → Buku Besar → Rapat → Notulen.
5. Cek log nginx bila ada masalah: `/var/log/nginx/error.log` (Linux) atau `C:\nginx\logs\error.log` (Windows).

---

## Langkah 9 — Backup Rutin

```bash
# Backup database (Linux — bisa dimasukkan ke cron harian)
mysqldump -u kasrt -p kas_rt | gzip > backup/kas_rt_$(date +%F).sql.gz

# Restore dari backup
gunzip -c backup/kas_rt_2026-10-26.sql.gz | mysql -u kasrt -p kas_rt
```

Backup juga folder `db/uploads` (lampiran rapat). Contoh cron harian pukul 02.00:

```
0 2 * * * mysqldump -u kasrt -p'PASSWORD_ANDA' kas_rt | gzip > /opt/kas-rt/backup/kas_rt_$(date +\%F).sql.gz
```

---

## Troubleshooting Umum

| Gejala | Penyebab & Solusi |
|---|---|
| `502 Bad Gateway` dari nginx | Aplikasi Next.js belum berjalan / port 3000 tertutup. Jalankan `systemctl status kas-rt` atau jalankan manual Opsi A, lalu `curl http://localhost:3000`. |
| `Can't reach database server` saat login | `DATABASE_URL` salah / MySQL belum jalan. Uji: `mysql -u kasrt -p -h 127.0.0.1 kas_rt`. Cek port (XAMPP kadang memakai 3307). |
| `P1003` / tabel tidak ditemukan | Lupa `npx prisma db push`. Jalankan ulang setelah `.env` benar. |
| `Access denied for user 'kasrt'` | Password/privilege MySQL salah. Ulangi Langkah 2, perhatikan URL-encode karakter khusus di `.env`. |
| Upload lampiran gagal (413 Request Entity Too Large) | `client_max_body_size` nginx terlalu kecil — sudah diset 25M di config; pastikan memakai config dari paket ini dan reload nginx. |
| `cp` bukan perintah dikenali (Windows) | Gunakan varian PowerShell pada Langkah 5. |
| Perubahan `.env` tidak berpengaruh | Restart aplikasi: `sudo systemctl restart kas-rt` (atau Ctrl+C lalu jalankan ulang manual). |
| Halaman tampil tanpa CSS setelah pindah folder | Folder `.next/standalone` dibangun dengan path lama. Jalankan ulang `npm run build` di lokasi baru. |

---

## Ringkasan Perintah Cepat (Linux)

```bash
npm install                          # 1. pasang dependensi
cp deploy/env.example .env           # 2. siapkan env, isi DATABASE_URL
cp prisma/schema.mysql.prisma prisma/schema.prisma
npx prisma generate && npx prisma db push   # 3. buat tabel
npx tsx scripts/seed.ts              # 4. (opsional) data demo
npm run build                        # 5. build produksi
sudo cp deploy/kas-rt.service /etc/systemd/system/  # 6. service (edit dulu)
sudo systemctl enable --now kas-rt
sudo cp deploy/nginx-kas-rt.conf /etc/nginx/sites-available/kas-rt  # 7. nginx
sudo ln -s /etc/nginx/sites-available/kas-rt /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# buka http://localhost → login admin / rt123456
```
