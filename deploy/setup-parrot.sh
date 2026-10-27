#!/usr/bin/env bash
# ============================================================
# KAS RT ONLINE — Instalasi Otomatis untuk Parrot OS / Debian
# (nginx + MariaDB sudah terpasang di sistem Anda)
#
# CARA PAKAI:
#   1. Edit bagian KONFIGURASI di bawah (terutama DB_PASS)
#   2. Jalankan dari folder proyek (JANGAN pakai sudo):
#        bash deploy/setup-parrot.sh
#   3. Ikuti petunjuk di layar sampai selesai
#
# Script ini akan: membuat database & user MariaDB, menulis .env,
# memasang dependensi, membuat tabel, (opsional) seed data demo,
# build produksi, memasang konfigurasi nginx, dan service systemd.
# ============================================================
set -euo pipefail

# ==================== KONFIGURASI ====================
DB_NAME="kas_rt"
DB_USER="kasrt"
DB_PASS="KasRt2026"        # <<< GANTI dengan password pilihan Anda
                            # (hindari tanda kutip ' dan karakter @ : / # ?)
# =====================================================

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_USER="${SUDO_USER:-$(logname 2>/dev/null || echo "$USER")}"
DB_CMD="mariadb"; command -v mariadb >/dev/null 2>&1 || DB_CMD="mysql"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "${GREEN}==> $1${NC}"; }
warn() { echo -e "${YELLOW}   ! $1${NC}"; }
die()  { echo -e "${RED}   X $1${NC}"; exit 1; }

# ---------- [0/9] Pra-cek ----------
step "[0/9] Pra-cek lingkungan"
[ -f "$APP_DIR/package.json" ] || die "Script harus dijalankan dari folder proyek hasil ekstrak ZIP (folder deploy/ tidak ditemukan di jalur yang benar)."
[ "$(id -u)" -ne 0 ] || die "Jangan jalankan script ini sebagai root. Jalankan sebagai user biasa: bash deploy/setup-parrot.sh (sudo akan diminta otomatis saat perlu)."
command -v sudo >/dev/null || die "sudo tidak ditemukan."
command -v nginx >/dev/null || warn "nginx tidak ditemukan di PATH — pastikan sudah terpasang."
command -v "$DB_CMD" >/dev/null 2>&1 || die "MariaDB client ($DB_CMD) tidak ditemukan."
systemctl is-active --quiet mariadb || systemctl is-active --quiet mysql || warn "Layanan MariaDB tampak tidak berjalan; coba: sudo systemctl start mariadb"

# ---------- [1/9] Node.js ----------
step "[1/9] Memeriksa Node.js (butuh versi 20+)"
install_node() {
  command -v curl >/dev/null || { sudo apt-get update && sudo apt-get install -y curl; }
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
}
if ! command -v node >/dev/null 2>&1; then
  read -rp "   Node.js belum terpasang. Pasang Node.js 20 sekarang? (Y/n): " ANS
  case "${ANS:-Y}" in [Nn]*) die "Pasang Node 20 manual lalu jalankan ulang script ini." ;; *) install_node ;; esac
fi
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  read -rp "   Node.js $(node -v) terlalu lama (butuh 20+). Upgrade ke Node 20 sekarang? (Y/n): " ANS
  case "${ANS:-Y}" in [Nn]*) die "Upgrade Node dulu, lalu jalankan ulang script." ;; *) install_node ;; esac
fi
echo "   Node $(node -v) OK"

# ---------- [2/9] Database ----------
step "[2/9] Membuat database & user MariaDB (butuh sudo)"
sudo "$DB_CMD" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "   Database '${DB_NAME}' dan user '${DB_USER}' siap"

# ---------- [3/9] .env ----------
step "[3/9] Menulis file .env"
cat > "$APP_DIR/.env" <<EOF
DATABASE_URL="mysql://${DB_USER}:${DB_PASS}@127.0.0.1:3306/${DB_NAME}"
EOF
echo "   .env ditulis di $APP_DIR/.env"

# ---------- [4/9] Dependensi ----------
step "[4/9] Memasang dependensi aplikasi (npm install)"
cd "$APP_DIR"
npm install --no-fund --no-audit

# ---------- [5/9] Skema + tabel ----------
step "[5/9] Mengaktifkan skema MySQL & membuat tabel"
cp prisma/schema.mysql.prisma prisma/schema.prisma
npx prisma generate
npx prisma db push
echo "   Tabel dibuat di MariaDB"

# ---------- [6/9] Seed demo (opsional) ----------
step "[6/9] Data demo (opsional)"
read -rp "   Isi data demo (6 akun, warga, transaksi, rapat)? (y/N): " ANS
if [[ "${ANS:-n}" =~ ^[Yy]$ ]]; then
  npx -y tsx scripts/seed.ts && echo "   Data demo terisi"
else
  echo "   Dilewati — Anda dapat mengisi data asli via aplikasi (login admin)"
fi

# ---------- [7/9] Build ----------
step "[7/9] Build produksi (next build — beberapa menit)"
npm run build
echo "   Build selesai: .next/standalone/"

# ---------- [8/9] nginx ----------
step "[8/9] Memasang konfigurasi nginx"
sudo cp "$APP_DIR/deploy/nginx-kas-rt.conf" /etc/nginx/sites-available/kas-rt
sudo ln -sf /etc/nginx/sites-available/kas-rt /etc/nginx/sites-enabled/kas-rt
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
echo "   nginx aktif sebagai proxy: port 80 -> 3000"

# ---------- [9/9] Service systemd ----------
step "[9/9] Memasang service systemd (auto-start saat boot)"
NODE_BIN="$(command -v node)"
sudo tee /etc/systemd/system/kas-rt.service > /dev/null <<EOF
[Unit]
Description=Kas RT Online (Next.js production server)
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}/.next/standalone
ExecStart=${NODE_BIN} ${APP_DIR}/.next/standalone/server.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
Environment="DATABASE_URL=mysql://${DB_USER}:${DB_PASS}@127.0.0.1:3306/${DB_NAME}"
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now kas-rt

# ---------- Verifikasi akhir ----------
step "Verifikasi akhir"
sleep 2
UP=0
for _ in $(seq 1 15); do
  if curl -sf -o /dev/null http://127.0.0.1:3000; then UP=1; break; fi
  sleep 1
done
[ "$UP" -eq 1 ] && echo -e "   ${GREEN}Aplikasi berjalan di port 3000${NC}" \
  || { warn "Aplikasi belum merespons. Cek log: journalctl -u kas-rt -n 50 --no-pager"; exit 1; }

sudo ufw allow 80/tcp 2>/dev/null || true
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

cat <<BANNER

============================================================
  INSTALLASI SELESAI!
============================================================
  Dari PC ini      : http://localhost/
  Dari HP/PC lain  : http://${IP:-<ip-pc>}/

  Login demo (jika Anda memilih seed):
    admin / rt123456      bendahara / rt123456
    ketua / rt123456      sekretaris / rt123456
    warga1 / rt123456     warga2 / rt123456

  Perintah berguna:
    systemctl status kas-rt     # status aplikasi
    journalctl -u kas-rt -f     # log aplikasi
    sudo systemctl restart kas-rt  # restart aplikasi

  Lokasi upload lampiran: ${APP_DIR}/.next/standalone/db/uploads
  Backup database:
    mysqldump -u ${DB_USER} -p'${DB_PASS}' ${DB_NAME} > backup.sql
============================================================
BANNER
