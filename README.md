# Website KOST SASQY — Kelompok 4 PTSI

> Salinan persiapan produksi 28 Oktober 2026. Belum deploy. Lihat DEPLOYMENT.md untuk status akses hosting, konfigurasi, dan pengujian terbaru. Catatan migrasi 27 Oktober di bawah merupakan riwayat pengembangan.

Website lokal Sistem Informasi Pendataan Penghuni KOST SASQY berdasarkan [Figma UI/UX PTSI](https://www.figma.com/design/Qf0E7WDZfQHUS556R0Awhx/Untitled?node-id=0-1).

## Membuka website

Jalankan `npm install` sekali jika dependensi belum tersedia, lalu `npm run dev` dari folder ini. Buka http://127.0.0.1:4173.

Akun admin untuk demonstrasi pengembangan (jangan gunakan di hosting): **admin** / **Sasqy2026!**. Password dapat diubah saat menjalankan server melalui variabel `SASQY_ADMIN_PASSWORD`. Salinan produksi ini mendengarkan 0.0.0.0; gunakan HOST=127.0.0.1 untuk pengembangan lokal. Mode produksi menolak password demonstrasi dan mewajibkan PUBLIC_ORIGIN HTTPS.

Urutan penggunaan pertama:
1. Masuk sebagai admin.
2. Buka **Data Kamar** di bagian bawah panel, lalu masukkan kamar dan harga sebenarnya.
3. Buka **Tata Tertib**, lalu isi naskah resmi Kost SASQY. Naskah tersedia di TATA-TERTIB.txt untuk disalin ke editor; MySQL baru tidak mengambil tata tertib dari SQLite.
4. Kembali ke Beranda dan pilih **Isi Formulir Sekarang**.
5. Lengkapi formulir, baca tata tertib, buat tanda tangan, klik **Simpan TTD**, lalu kirim formulir.
6. Admin dapat mencari, melihat, mengedit, menghapus, serta mengunduh PDF dari daftar penghuni.

Data uji dibersihkan setelah verifikasi. Daftar kamar dan penghuni dimulai kosong. Tata tertib MySQL perlu diisi melalui editor admin. Jika tata tertib atau kamar belum diisi, pendaftaran belum dapat diselesaikan; formulir dapat disimpan sebagai draf pada sesi browser.

## Halaman dan acuan desain

| Halaman | Acuan |
| --- | --- |
| Beranda | Frame Home 59:2, ukuran 1066 × 820 |
| Login Admin | Frame Login 59:3, ukuran 710 × 820 |
| Dashboard / Daftar Penghuni | Frame Dashboard Admin 59:4, ukuran 1106 × 820 |
| Formulir lengkap dan tanda tangan | Frame 79:7, ukuran 1100 × 1860 |
| Detail / Pratinjau PDF | Frame 82:169, ukuran 1200 × 1520 |
| Formulir langkah 1–3 | Tambahan alur dari formulir lengkap, memakai komponen dan warna yang sama |
| Data Kamar dan editor Tata Tertib | Halaman tambahan memakai gaya dashboard; tidak ada frame tersendiri di Figma |
| Pendaftaran berhasil | Halaman konfirmasi setelah penyimpanan sukses |

Font Inter disimpan lokal. Foto bangunan dan ikon memakai aset asli dari Figma. Tata letak memakai seluruh lebar dan tinggi layar browser, sesuai revisi pengguna. Ukuran frame Figma menjadi acuan struktur; lebar halaman menyesuaikan layar tanpa memperbesar atau memperkecil seluruh teks. Login menggunakan kartu 400 px di tengah layar, judul 20 px, isian 14 px, dan tombol 15 px. Halaman lain menggunakan ukuran teks antarmuka 13–15 px dan judul 22–24 px; judul hero 32–48 px sesuai lebar layar. Halaman menampilkan data sebenarnya dari penyimpanan; isi contoh di Figma tidak dimasukkan sebagai penghuni nyata. Tombol tambahan untuk data kamar/tata tertib serta pemilih mode formulir ditambahkan agar fitur dapat diakses.

## Implementasi saat ini

- HTML, CSS, JavaScript untuk antarmuka.
- Node.js 24, MySQL/MariaDB XAMPP melalui mysql2/promise, dotenv, dan PDFKit untuk server lokal.
- Database aktif adalah MySQL yang dikonfigurasi di `.env`. File `.env` diabaikan oleh Git dan jangan dibagikan. SQLite lama di `.data/` tidak dibaca, tidak dimigrasikan, dan tidak dihapus.
- Sesi admin memakai cookie HttpOnly dan SameSite=Strict dengan masa berlaku delapan jam; sesi dibagikan melalui MySQL dan tetap berlaku sampai kedaluwarsa atau logout. Kata sandi dibandingkan menggunakan scrypt.
- Data penghuni, detail, perubahan, penghapusan, pengelolaan kamar, dan PDF memerlukan sesi admin. Formulir pendaftaran baru serta daftar kamar tersedia dapat diakses dari beranda.
- Formulir memeriksa kolom wajib, NIK 16 digit, nomor HP, kamar tersedia, NIK unik, persetujuan, dan tanda tangan. Kamar terisi tidak dapat dihapus atau dipakai penghuni lain.
- Draf tersimpan di sessionStorage selama sesi browser. Data yang sudah dikirim tersimpan di MySQL.
- PDF memuat data penghuni, kontak darurat, data kost/pembayaran, tanda tangan, serta salinan tata tertib saat formulir dikirim. Font Inter disematkan di PDF. Tata tertib atau data yang panjang dapat menambah jumlah halaman.

MySQL XAMPP harus berjalan sebelum `npm run dev`. Konfigurasi dibaca dari `.env` di folder proyek, termasuk jika server dijalankan dari folder lain. Jangan memasukkan `.env` ke repositori. Backend tetap Node.js; proyek ini belum menggunakan Laravel dan belum dipublikasikan.

### Pemetaan MySQL

- `penghuni`: nama, NIK, HP, status formulir pada kolom `pekerjaan`, instansi, alamat KTP, dan kontak darurat. Status Mahasiswa/Pelajar/Bekerja tidak dipaksakan ke `status_pernikahan`.
- `kamar`: nomor, harga, dan ketersediaan. Kamar harus sudah terdaftar; kamar dalam perbaikan atau terisi tidak menerima pendaftaran baru.
- `riwayat_hunian`: hubungan penghuni-kamar dan tanggal masuk. Mengedit formulir mengoreksi catatan hunian terkait, bukan menciptakan riwayat pindah kamar baru.
- Tabel tambahan `penghuni_form`: tanggal lahir, jenis kelamin, kontak asal, alamat darurat, tanda tangan PNG lengkap, persetujuan, salinan tata tertib, serta nominal dan cara pembayaran formulir.
- Tabel tambahan `settings`: tata tertib aktif dan kunci untuk mengurutkan perubahan bersamaan. Kedua tabel tambahan dibuat otomatis tanpa mengubah struktur lima tabel awal.
- `pembayaran` tidak diisi otomatis: formulir belum meminta periode bulanan/tahunan, rentang tanggal, tanggal bayar, atau status lunas. Nominal dan cara pembayaran tetap tersimpan di `penghuni_form` dan tampil di detail/PDF; tidak ada tagihan atau pelunasan yang direkayasa.
- `users` tetap utuh. Login admin mempertahankan akun demonstrasi/variabel `SASQY_ADMIN_PASSWORD` yang sudah digunakan backend; bukan login dari tabel `users` yang masih kosong.
- Penyimpanan memakai transaksi dan parameter SQL. Kamar terisi tidak dapat dihapus; kamar dengan riwayat juga dilindungi. Menghapus penghuni lewat API menghapus formulir, pembayaran terkait jika ada, dan riwayat milik penghuni itu, lalu membebaskan kamar.
- Salinan kode SQLite sebelum migrasi berada di `work/server.sqlite.original.mjs`. Jangan menjalankannya bersamaan di port yang sama.

## Verifikasi migrasi MySQL — 27 Oktober 2026

Pengujian aktual ke XAMPP lokal menggunakan data sintetis, dibersihkan setelah pengujian:

- 78 pemeriksaan lulus: halaman/aset, login benar/salah, sesi/logout, proteksi admin, seluruh endpoint CRUD penghuni/kamar dan tata tertib, validasi, tanggal tidak valid, kamar/NIK ganda, dan kamar terisi.
- Dua pendaftaran bersamaan untuk satu kamar menghasilkan satu keberhasilan dan satu penolakan.
- Data penghuni, perubahan, tanda tangan, dan salinan tata tertib tetap terbaca setelah restart. Catatan lama: versi saat itu mengakhiri sesi ketika restart. Versi Vercel terbaru menyimpan hash token sesi dalam MySQL.
- PDF aktual berisi dua halaman A4; kedua halaman dirender dan diperiksa secara visual, termasuk gambar tanda tangan.
- Pemeriksaan browser aktual: beranda, login admin sampai dashboard, Data Kamar, dan editor Tata Tertib berhasil dibuka.
- Jumlah data lima tabel awal kembali sama dengan sebelum pengujian (semuanya kosong). Pengujian tidak menghapus data SQLite atau mengubah frontend.
- Bukti pengujian berada di `work/api-test-results.json`; pengujian dapat diulang dengan `node work/api-test.mjs` ketika MySQL aktif dan port 4174 kosong. Pengujian memakai tata tertib sementara lalu memulihkannya; jalankan saat tidak ada pengguna lain yang mengubah data.

Catatan ini merupakan bukti pengujian pengembangan, bukan pengujian penerimaan oleh pengelola kost.
