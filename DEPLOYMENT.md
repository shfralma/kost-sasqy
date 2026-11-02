# Status deployment KOST SASQY

Disiapkan 28 Oktober 2026 (WITA). **Belum dipublikasikan; belum ada URL publik terverifikasi.**

Salinan produksi ini berasal dari folder proyek 20 Oktober. Frontend dipertahankan. `.env` asli, data MySQL, dan berkas SQLite tidak disalin atau diunggah.

## Hasil pemeriksaan

- Bukti migrasi sebelumnya: 78 pemeriksaan lulus pada 27 Oktober, lima tabel awal kembali kosong.
- Pemeriksaan ulang database asli setelah XAMPP dinyalakan: users 0, penghuni 1, kamar 2, pembayaran 0, riwayat_hunian 1, penghuni_form 1, settings 2. Login, baca penghuni, PDF, public API dan integritas relasi lulus tanpa perubahan data. Lihat live-test-results.json dan mysql-verification.json.
- Pengujian ulang salinan ini: 78 pemeriksaan lulus pada database MariaDB 10.4 terpisah. Mencakup login benar/salah, proteksi API, CRUD penghuni/kamar/tata tertib, benturan kamar/NIK, persistensi setelah restart, dan PDF (15.501 byte).
- Pengujian mode produksi: health check, login dengan origin HTTPS, cookie Secure/HttpOnly dan kedaluwarsa, API admin, penolakan origin asing/localhost, logout, serta pembatasan percobaan login lulus.
- Railway berhasil login. Dashboard menunjukkan Trial expired / Trial Ended, proyek pacific-trust dengan 0 dari 2 layanan online (MySQL dan sistem-lost-and-found; belum teridentifikasi sebagai proyek KOST SASQY). Deployment belum dapat dilanjutkan tanpa mengatasi batas akun; tidak ada upgrade berbayar yang dilakukan.
- Render membuka halaman Sign In; belum ada akses akun. MySQL online belum dibuat.

## Konfigurasi produksi

`npm ci --omit=dev`, `npm run db:migrate`, kemudian `npm start`. Node.js 24. Server menerima `PORT` dan mendengarkan `0.0.0.0`. `/healthz` memeriksa koneksi database. Railway memakai Dockerfile dan railway.json; migrasi berjalan sebagai pre-deploy.

Isi variabel melalui pengelola secrets hosting, bukan Git:

- `NODE_ENV=production`
- `PUBLIC_ORIGIN`: origin HTTPS persis, tanpa slash terakhir, sesuai URL bawaan hosting.
- `SASQY_ADMIN_PASSWORD`: password unik minimal 16 karakter, bukan password demo.
- `MYSQL_URL`: URL database MySQL milik aplikasi (Railway dapat memakai referensi `${{MySQL.MYSQL_URL}}`, sesuaikan nama layanan).
- `DB_SSL=true` dan `DB_SSL_CA` bila penyedia database eksternal mensyaratkan TLS. Sertifikat selalu diverifikasi. Koneksi privat Railway dapat mengikuti konfigurasi jaringan privat penyedia.

Alternatif URL database: `DATABASE_URL`, atau `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. `.env` lokal hanya untuk pengembangan dan diabaikan Git/Docker.

`schema.sql` kini diekspor dari struktur tujuh tabel database asli XAMPP, tanpa isi data dan tanpa nilai penghitung AUTO_INCREMENT. `db:migrate` membuat tabel yang belum ada tanpa seed. Database asli memiliki 1 penghuni dan 2 kamar; data itu belum dipindahkan ke hosting. Migrasi data perlu mempertahankan ID dan relasi, diverifikasi sebelum cutover. Data pribadi tidak disertakan dalam paket source.

## Urutan penyelesaian setelah akses hosting tersedia

1. Buka dashboard Railway dengan akun pengguna. Jangan menganggap proses login selesai sebelum dashboard terlihat.
2. Buat MySQL dan layanan aplikasi dari source ini, pilih kapasitas dalam batas biaya yang pengguna setujui. Tidak ada pembayaran atau langganan yang diotorisasi dalam pekerjaan ini.
3. Buat domain bawaan Railway dan isi PUBLIC_ORIGIN serta password admin unik melalui secrets hosting. Hubungkan MYSQL_URL privat.
4. Jalankan migrasi dan deployment. Pastikan `/healthz` serta beranda merespons melalui URL HTTPS publik.
5. Uji login, CRUD, validasi, PDF, logout, dan restart pada database online menggunakan data sintetis; bersihkan data uji.
6. Isi data kamar dan tata tertib resmi melalui admin. Tidak ada penghuni/kamar contoh yang otomatis dibuat.

Render merupakan fallback Node.js dengan URL onrender.com, tetapi MySQL memerlukan layanan database terpisah; belum ada akun/database yang dapat digunakan. Jangan mengganti MySQL menjadi PostgreSQL/D1 tanpa persetujuan perubahan cakupan.

Versi awal Render menggunakan sesi di memori. Versi terbaru di bawah menggunakan sesi dan pembatasan login bersama melalui MySQL.


## Penyesuaian Vercel — 2 November 2026

Render tetap meminta verifikasi kartu pada akun ini meskipun Free dipilih. Pengguna menolak penggunaan kartu. Vercel dipilih sebagai kandidat berikutnya untuk proyek tugas/nonkomersial pada paket Hobby; dashboard akun shfralma dapat diakses. Belum ada deployment atau URL publik terverifikasi.

Adapter api/index.mjs meneruskan permintaan Node ke handler aplikasi. vercel.json menyajikan frontend dari public, mengarahkan API/healthz ke fungsi, menyertakan aset PDF, dan menjalankan migrasi pada build. PUBLIC_ORIGIN dapat diisi eksplisit; bila tidak diisi, server memakai VERCEL_PROJECT_PRODUCTION_URL.

Sesi admin kini disimpan sebagai hash token dalam tabel admin_sessions dengan kedaluwarsa delapan jam dan versi kunci terkait password admin. Logout menghapus sesi melalui MySQL, sehingga berlaku lintas instance. Pembatasan login memakai tabel login_attempts. Password admin tidak disimpan dalam database atau repositori.

78 tes API/CRUD/PDF kembali lulus pada database lokal terpisah. Tes tambahan lulus untuk sesi lintas dua proses, pencabutan sesi lintas proses, dan body permintaan yang sudah diproses oleh runtime Vercel. Database asli serta secrets cloud tidak dipakai dalam pengujian ini.

Akses GitHub Vercel masih perlu diotorisasi untuk repositori kost-sasqy. Secrets Aiven belum disalin ke Vercel; izin sebelumnya hanya mencakup Render. Jangan memasukkan secrets ke file/repository.
