# Website KOST SASQY — Kelompok 4 PTSI

Website lokal Sistem Informasi Pendataan Penghuni KOST SASQY berdasarkan [Figma UI/UX PTSI](https://www.figma.com/design/Qf0E7WDZfQHUS556R0Awhx/Untitled?node-id=0-1).

## Membuka website

Jalankan `npm install` sekali jika dependensi belum tersedia, lalu `npm run dev` dari folder ini. Buka http://127.0.0.1:4173.

Akun admin untuk demonstrasi lokal: **admin** / **Sasqy2026!**. Password dapat diubah saat menjalankan server melalui variabel `SASQY_ADMIN_PASSWORD`. Server hanya mendengarkan koneksi lokal 127.0.0.1.

Urutan penggunaan pertama:
1. Masuk sebagai admin.
2. Buka **Data Kamar** di bagian bawah panel, lalu masukkan kamar dan harga sebenarnya.
3. Buka **Tata Tertib**, lalu isi naskah resmi Kost SASQY. Naskah dari pengguna sudah dimasukkan ke database dan disalin ke TATA-TERTIB.txt; nilai daya listrik yang masih “…” dipertahankan.
4. Kembali ke Beranda dan pilih **Isi Formulir Sekarang**.
5. Lengkapi formulir, baca tata tertib, buat tanda tangan, klik **Simpan TTD**, lalu kirim formulir.
6. Admin dapat mencari, melihat, mengedit, menghapus, serta mengunduh PDF dari daftar penghuni.

Data uji dibersihkan setelah verifikasi. Daftar kamar dan penghuni dimulai kosong. Tata tertib dari pengguna sudah tersimpan. Jika tata tertib atau kamar belum diisi, pendaftaran belum dapat diselesaikan; formulir dapat disimpan sebagai draf pada sesi browser.

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
- Node.js 24, modul SQLite bawaan, dan PDFKit untuk server lokal.
- Database persisten berada di `.data/sasqy.sqlite`. Folder ini tidak boleh diletakkan di direktori publik atau dibagikan bersama kode.
- Sesi admin memakai cookie HttpOnly dan SameSite=Strict dengan masa berlaku delapan jam; restart server mengakhiri sesi. Kata sandi dibandingkan menggunakan scrypt.
- Data penghuni, detail, perubahan, penghapusan, pengelolaan kamar, dan PDF memerlukan sesi admin. Formulir pendaftaran baru serta daftar kamar tersedia dapat diakses dari beranda.
- Formulir memeriksa kolom wajib, NIK 16 digit, nomor HP, kamar tersedia, NIK unik, persetujuan, dan tanda tangan. Kamar terisi tidak dapat dihapus atau dipakai penghuni lain.
- Draf tersimpan di sessionStorage selama sesi browser. Data yang sudah dikirim tersimpan di SQLite.
- PDF memuat data penghuni, kontak darurat, data kost/pembayaran, tanda tangan, serta salinan tata tertib saat formulir dikirim. Font Inter disematkan di PDF. Tata tertib atau data yang panjang dapat menambah jumlah halaman.

PHP, Composer, dan MySQL belum ditemukan pada lingkungan awal. Proyek ini **belum menggunakan Laravel + MySQL** dan **belum dipublikasikan**. Untuk penggunaan daring, tahap selanjutnya adalah menyiapkan lingkungan backend yang disepakati, mengganti akun demonstrasi dengan akun pengelola, dan menyiapkan hosting serta pengelolaan data.

## Verifikasi yang dilakukan

Pengujian menggunakan data sintetis, tanpa data penghuni sebenarnya:
- Login benar/salah dan penolakan akses tanpa sesi admin.
- Validasi NIK, kewajiban tanda tangan, penyimpanan penghuni, penolakan NIK/kamar ganda.
- Pengeditan data dan penolakan penghapusan kamar terisi.
- Pembuatan PDF, identifikasi dua halaman A4 pada data uji, serta pemeriksaan visual kedua halaman setelah dirender.
- Pemeriksaan browser pada Home, Login, Dashboard, formulir lengkap, formulir tiga langkah, edit, Data Kamar, dan Pratinjau PDF.
- Validasi kolom wajib sebelum pindah langkah dan simpan perubahan melalui browser.

Catatan ini merupakan bukti pengujian pengembangan, bukan pengujian penerimaan oleh pengelola kost.
