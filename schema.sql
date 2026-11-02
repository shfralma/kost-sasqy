-- Verified from live XAMPP schema, 28 October 2026. Schema only; no personal data.
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `penghuni` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `nama_lengkap` varchar(150) NOT NULL,
  `nik` varchar(16) NOT NULL,
  `no_hp` varchar(20) NOT NULL,
  `status_pernikahan` varchar(30) DEFAULT NULL,
  `pekerjaan` varchar(100) DEFAULT NULL,
  `nama_instansi` varchar(150) DEFAULT NULL,
  `alamat_instansi` text DEFAULT NULL,
  `no_telp_instansi` varchar(20) DEFAULT NULL,
  `alamat_ktp` text DEFAULT NULL,
  `nama_kontak_darurat` varchar(150) DEFAULT NULL,
  `no_hp_darurat` varchar(20) DEFAULT NULL,
  `hubungan_darurat` varchar(50) DEFAULT NULL,
  `foto` varchar(255) DEFAULT NULL,
  `tanda_tangan` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nik` (`nik`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `kamar` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `nomor_kamar` varchar(20) NOT NULL,
  `lantai` int(11) DEFAULT 1,
  `kapasitas` int(11) NOT NULL DEFAULT 1,
  `harga_bulanan` decimal(12,2) NOT NULL,
  `harga_tahunan` decimal(12,2) DEFAULT NULL,
  `status` enum('tersedia','terisi','perbaikan') DEFAULT 'tersedia',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nomor_kamar` (`nomor_kamar`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `riwayat_hunian` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `penghuni_id` bigint(20) unsigned NOT NULL,
  `kamar_id` bigint(20) unsigned NOT NULL,
  `tanggal_masuk` date NOT NULL,
  `tanggal_keluar` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `penghuni_id` (`penghuni_id`),
  KEY `kamar_id` (`kamar_id`),
  CONSTRAINT `riwayat_hunian_ibfk_1` FOREIGN KEY (`penghuni_id`) REFERENCES `penghuni` (`id`),
  CONSTRAINT `riwayat_hunian_ibfk_2` FOREIGN KEY (`kamar_id`) REFERENCES `kamar` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `pembayaran` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `hunian_id` bigint(20) unsigned NOT NULL,
  `jenis_pembayaran` enum('bulanan','tahunan') NOT NULL,
  `periode_mulai` date NOT NULL,
  `periode_selesai` date NOT NULL,
  `nominal` decimal(12,2) NOT NULL,
  `tanggal_bayar` date DEFAULT NULL,
  `metode_pembayaran` varchar(50) DEFAULT NULL,
  `status` enum('belum_bayar','lunas') DEFAULT 'belum_bayar',
  `bukti_pembayaran` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `hunian_id` (`hunian_id`),
  CONSTRAINT `pembayaran_ibfk_1` FOREIGN KEY (`hunian_id`) REFERENCES `riwayat_hunian` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `settings` (
  `setting_key` varchar(100) NOT NULL,
  `value` longtext NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `penghuni_form` (
  `penghuni_id` bigint(20) unsigned NOT NULL,
  `hunian_id` bigint(20) unsigned NOT NULL,
  `gender` varchar(20) NOT NULL,
  `birth` date NOT NULL,
  `origin_phone` varchar(300) NOT NULL,
  `emergency_address` text NOT NULL,
  `signature` longtext NOT NULL,
  `accepted_rules` longtext NOT NULL,
  `agreement` tinyint(1) NOT NULL,
  `payment` varchar(300) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  PRIMARY KEY (`penghuni_id`),
  UNIQUE KEY `hunian_id` (`hunian_id`),
  CONSTRAINT `sasqy_form_hunian_fk` FOREIGN KEY (`hunian_id`) REFERENCES `riwayat_hunian` (`id`),
  CONSTRAINT `sasqy_form_penghuni_fk` FOREIGN KEY (`penghuni_id`) REFERENCES `penghuni` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
