-- =============================================
-- HakPortal - MySQL Veritabanı Schema
-- Versiyon: 2.0 (Yasal Model - Türkiye Uyumlu)
-- =============================================
-- Avukat Kanunu 55. madde uyumu:
-- Avukat iş başına ÖDEMİYOR. Platform abonelik sistemi.
-- Kullanıcılar avukat profillerini görür, seçer, talep gönderir.
-- =============================================

CREATE DATABASE IF NOT EXISTS hakportal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_turkish_ci;

USE hakportal;

-- =============================================
-- 1. KULLANICILAR (Users)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  email        VARCHAR(191) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  role         ENUM('kullanici','avukat','admin') NOT NULL DEFAULT 'kullanici',
  ad           VARCHAR(100) NOT NULL,
  soyad        VARCHAR(100) NOT NULL,
  avatar       VARCHAR(10)  DEFAULT NULL,
  sehir        VARCHAR(100) DEFAULT NULL,
  telefon      VARCHAR(20)  DEFAULT NULL,
  tc_kimlik    VARCHAR(11)  DEFAULT NULL,
  dogum_tarihi DATE         DEFAULT NULL,
  adres        TEXT         DEFAULT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 2. AVUKAT PROFİLLERİ (Lawyer Profiles)
-- =============================================
CREATE TABLE IF NOT EXISTS avukat_profiller (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  user_id      CHAR(36)     NOT NULL UNIQUE,
  unvan        VARCHAR(20)  DEFAULT 'Av.',
  baro         VARCHAR(150) NOT NULL,
  baro_no      VARCHAR(50)  NOT NULL,
  sicil_no     VARCHAR(50)  DEFAULT NULL,
  mezuniyet_yili INT          DEFAULT NULL,
  deneyim_yil  INT          DEFAULT NULL,
  bio          TEXT         DEFAULT NULL,
  uzmanlik     JSON         DEFAULT NULL,
  profil_onay  TINYINT(1)   NOT NULL DEFAULT 0,
  onay_tarihi  DATETIME     DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 3. AVUKAT ABONELİKLERİ
-- Platform geliri: avukat profilini listeleme hizmeti (sabit abonelik)
-- Avukatlik Kanunu: abonelik = platform tanıtım/bilgi hizmeti, iş başına ödeme DEĞİL
-- =============================================
CREATE TABLE IF NOT EXISTS avukat_abonelikler (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  avukat_id         CHAR(36)     NOT NULL,
  paket             ENUM('aylik','yillik') NOT NULL DEFAULT 'aylik',
  tutar             DECIMAL(10,2) NOT NULL,
  baslangic_tarihi  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bitis_tarihi      DATETIME     NOT NULL,
  status            ENUM('AKTIF','PASIF','IPTAL') NOT NULL DEFAULT 'AKTIF',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (avukat_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 4. DAVALAR / DOSYALAR (Cases - Hesaplama Kaydı)
-- Kullanıcının hesaplama sonuçlarını kaydetmesini sağlar.
-- Artık "avukatlara iş ilanı" değil, "kullanıcı hesaplama kaydı".
-- =============================================
CREATE TABLE IF NOT EXISTS cases (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  kullanici_id      CHAR(36)     NOT NULL,
  sehir             VARCHAR(100) NOT NULL,
  dava_turu         VARCHAR(100) DEFAULT NULL,
  tahmini_brut      DECIMAL(12,2) DEFAULT 0,
  tahmini_alacak    DECIMAL(12,2) DEFAULT 0,
  gerceklesen_tahsilat DECIMAL(12,2) DEFAULT NULL,
  dava_no           VARCHAR(100)  DEFAULT NULL,
  hesaplama_verisi  JSON          DEFAULT NULL,
  skor_hukuki       INT           DEFAULT 0,
  skor_veri         INT           DEFAULT 0,
  skor_tahsil       INT           DEFAULT 0,
  skor_toplam       INT           DEFAULT 0,
  risk_kategorisi   VARCHAR(50)   DEFAULT 'BILINMIYOR',
  risk_notlari      JSON          DEFAULT NULL,
  ispat_belgeleri   JSON          DEFAULT NULL,
  avukat_yorumu     TEXT          DEFAULT NULL,
  status            ENUM(
    'KAYITLI',
    'AVUKAT_ARANIYOR',
    'ACTIVE',
    'IN_PROGRESS',
    'FILED_IN_COURT',
    'DURUSMA',
    'TAHSIL',
    'CLOSED',
    'CANCELED'
  ) NOT NULL DEFAULT 'KAYITLI',
  secilen_avukat_id CHAR(36)     DEFAULT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (kullanici_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 5. DAVA DURUM LOGLARI (Case Status Logs)
-- =============================================
CREATE TABLE IF NOT EXISTS case_status_logs (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_id       CHAR(36)     NOT NULL,
  status        VARCHAR(50)  NOT NULL,
  aciklama      TEXT         DEFAULT NULL,
  guncelleyen_id CHAR(36)    DEFAULT NULL,
  guncelleyen_rol VARCHAR(30) DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 6. İLETİŞİM TALEPLERİ
-- Kullanıcı bir avukata ulaşmak istediğinde talep gönderir.
-- Avukat kabul edince iletişim bilgileri açılır.
-- Bu model: avukatlık kanununa uygun, reklam/aracılık değil.
-- =============================================
CREATE TABLE IF NOT EXISTS iletisim_talepleri (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  kullanici_id  CHAR(36)     NOT NULL,
  avukat_id     CHAR(36)     NOT NULL,
  case_id       CHAR(36)     DEFAULT NULL,
  not_metni     TEXT         DEFAULT NULL,
  status        ENUM('BEKLIYOR','KABUL','REDDEDILDI','IPTAL') NOT NULL DEFAULT 'BEKLIYOR',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (kullanici_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (avukat_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 7. MESAJLAR (Messages)
-- Avukat talebi kabul ettikten sonra mesajlaşma açılır
-- =============================================
CREATE TABLE IF NOT EXISTS messages (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  case_id         CHAR(36)    NOT NULL,
  gonderen_id     CHAR(36)    NOT NULL,
  gonderen_rol    VARCHAR(30) NOT NULL,
  icerik          TEXT        NOT NULL,
  okundu          TINYINT(1)  NOT NULL DEFAULT 0,
  tarih           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id)     REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (gonderen_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_case_tarih (case_id, tarih)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 8. BELGELER (Documents)
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  case_id     CHAR(36)     NOT NULL,
  yukleyen_id CHAR(36)     NOT NULL,
  dosya_adi   VARCHAR(255) NOT NULL,
  dosya_yolu  VARCHAR(500) NOT NULL,
  dosya_tipi  VARCHAR(100) DEFAULT NULL,
  boyut       INT          DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id)     REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (yukleyen_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 9. SİSTEM AYARLARI (System Settings)
-- =============================================
CREATE TABLE IF NOT EXISTS system_settings (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  setting_key     VARCHAR(100) NOT NULL UNIQUE,
  setting_value   TEXT         NOT NULL,
  aciklama        VARCHAR(255) DEFAULT NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 10. ŞİKAYETLER (Complaints)
-- =============================================
CREATE TABLE IF NOT EXISTS sikayetler (
  id            CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  sikayet_eden  CHAR(36)    NOT NULL,
  sikayet_edilen CHAR(36)   NOT NULL,
  case_id       CHAR(36)    DEFAULT NULL,
  aciklama      TEXT        NOT NULL,
  status        ENUM('BEKLIYOR','INCELENIYOR','COZULDU','REDDEDILDI') DEFAULT 'BEKLIYOR',
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sikayet_eden)    REFERENCES users(id),
  FOREIGN KEY (sikayet_edilen)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 11. AVUKAT YORUMLARİ (Müvekkil değerlendirmeleri)
-- =============================================
CREATE TABLE IF NOT EXISTS avukat_yorumlari (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL UNIQUE,
  avukat_id VARCHAR(36) NOT NULL,
  kullanici_id VARCHAR(36) NOT NULL,
  puan INT NOT NULL,
  yorum TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 12. BİLDİRİMLER
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  tip VARCHAR(50) NOT NULL,
  baslik VARCHAR(255) NOT NULL,
  mesaj TEXT NOT NULL,
  case_id VARCHAR(36) DEFAULT NULL,
  okundu TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- BAŞLANGIÇ VERİLERİ (Seed Data)
-- =============================================

INSERT IGNORE INTO system_settings (setting_key, setting_value, aciklama) VALUES
('kidem_tavani',        '35058.58',  '2024 Kıdem Tazminatı Tavanı (TL)'),
('abonelik_aylik',      '499',       'Avukat aylık abonelik bedeli (TL)'),
('abonelik_yillik',     '3999',      'Avukat yıllık abonelik bedeli (TL)'),
('toplam_hesaplama',    '1247',      'Toplam yapılan hesaplama sayısı'),
('platform_adi',        'HakPortal', 'Platform adı');

-- Admin kullanıcı (şifre: admin123)
INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, is_active) VALUES
(
  'admin-000-0000-0000-000000000001',
  'admin@hakportal.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhuG',
  'admin',
  'Platform',
  'Yöneticisi',
  'A',
  1
);

-- Demo Avukat 1
INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, sehir, is_active) VALUES
(
  'avukat-00-0000-0000-000000000001',
  'av.ahmet@hakportal.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhuG',
  'avukat',
  'Ahmet',
  'Yılmaz',
  'A',
  'İstanbul',
  1
);

INSERT IGNORE INTO avukat_profiller (user_id, unvan, baro, baro_no, bio, uzmanlik, profil_onay) VALUES
(
  'avukat-00-0000-0000-000000000001',
  'Av.',
  'İstanbul Barosu',
  '12345',
  'İş hukuku ve işçi hakları alanında 10 yıllık deneyim. Kıdem tazminatı, ihbar tazminatı ve işe iade davalarında uzmanım.',
  '["İş Hukuku","Kıdem Tazminatı","İhbar Tazminatı","İşçi Alacakları"]',
  1
);

-- Demo Avukat 2
INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, sehir, is_active) VALUES
(
  'avukat-00-0000-0000-000000000002',
  'av.zeynep@hakportal.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhuG',
  'avukat',
  'Zeynep',
  'Kaya',
  'Z',
  'Ankara',
  1
);

INSERT IGNORE INTO avukat_profiller (user_id, unvan, baro, baro_no, bio, uzmanlik, profil_onay) VALUES
(
  'avukat-00-0000-0000-000000000002',
  'Av.',
  'Ankara Barosu',
  '54321',
  'İşçi hakları ve iş davalarında uzman. Fazla mesai, yıllık izin ve mobbing davalarında 8 yıllık deneyim.',
  '["İş Hukuku","Fazla Mesai","Yıllık İzin","Mobbing"]',
  1
);
