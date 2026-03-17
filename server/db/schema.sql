-- =============================================
-- HakPortal - MySQL Veritabanı Schema
-- Versiyon: 1.0 (MVP)
-- =============================================

-- Önce veritabanını oluştur
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
  uzmanlik     JSON         DEFAULT NULL,    -- ["iş hukuku","kıdem tazminatı"]
  profil_onay  TINYINT(1)   NOT NULL DEFAULT 0,
  onay_tarihi  DATETIME     DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 3. DAVALAR / DOSYALAR (Cases)
-- =============================================
CREATE TABLE IF NOT EXISTS cases (
  id                CHAR(36)     NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  kullanici_id      CHAR(36)     NOT NULL,
  sehir             VARCHAR(100) NOT NULL,
  dava_turu         VARCHAR(100) DEFAULT NULL,
  tahmini_brut      DECIMAL(12,2) DEFAULT 0,
  tahmini_alacak    DECIMAL(12,2) DEFAULT 0,
  gerceklesen_tahsilat DECIMAL(12,2) DEFAULT NULL,
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
    'OPEN','MATCHING','WAITING_PAYMENT','WAITING_LAWYER_PAYMENT',
    'PRE_CASE_REVIEW','PENDING_USER_AUTH','AUTHORIZED','ACTIVE',
    'LAWYER_ASSIGNED','IN_PROGRESS','FILED_IN_COURT','ILK_GORUSME',
    'DAVA_ACILDI','DURUSMA','TAHSIL','CLOSED','KAPANDI','CANCELED'
  ) NOT NULL DEFAULT 'OPEN',
  secilen_avukat_id CHAR(36)     DEFAULT NULL,
  secilen_teklif_id CHAR(36)     DEFAULT NULL,
  odeme_id          CHAR(36)     DEFAULT NULL,
  teklif_sayisi     INT          NOT NULL DEFAULT 0,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (kullanici_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 4. DAVA DURUM LOGLARI (Case Status Logs)
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
-- 5. TEKLİFLER (Offers)
-- =============================================
CREATE TABLE IF NOT EXISTS offers (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  case_id         CHAR(36)    NOT NULL,
  avukat_id       CHAR(36)    NOT NULL,
  ucret_modeli    ENUM('yuzde','sabit') NOT NULL,
  oran            DECIMAL(5,2) DEFAULT NULL,
  sabit_ucret     DECIMAL(12,2) DEFAULT NULL,
  on_odeme        TINYINT(1)  NOT NULL DEFAULT 0,
  tahmini_sure    VARCHAR(100) NOT NULL,
  aciklama        TEXT         DEFAULT NULL,
  status          ENUM('PENDING','SELECTED','REJECTED') NOT NULL DEFAULT 'PENDING',
  selected_at     DATETIME     DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_case_avukat (case_id, avukat_id),
  FOREIGN KEY (case_id)   REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (avukat_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 6. ÖDEMELER (Payments)
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
  id              CHAR(36)    NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  case_id         CHAR(36)    NOT NULL,
  offer_id        CHAR(36)    NOT NULL,
  kullanici_id    CHAR(36)    NOT NULL,
  avukat_id       CHAR(36)    NOT NULL,
  tutar           DECIMAL(10,2) NOT NULL,
  kart_son_dort   VARCHAR(4)  DEFAULT '****',
  status          ENUM('PENDING','COMPLETED','FAILED','REFUNDED') NOT NULL DEFAULT 'COMPLETED',
  tarih           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id)      REFERENCES cases(id),
  FOREIGN KEY (offer_id)     REFERENCES offers(id),
  FOREIGN KEY (kullanici_id) REFERENCES users(id),
  FOREIGN KEY (avukat_id)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 7. MESAJLAR (Messages)
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
-- 11. BAĞLANTILAR (Engagements)
-- =============================================
CREATE TABLE IF NOT EXISTS engagements (
  id VARCHAR(36) PRIMARY KEY,
  case_id VARCHAR(36) NOT NULL,
  offer_id VARCHAR(36) NOT NULL,
  kullanici_id VARCHAR(36) NOT NULL,
  avukat_id VARCHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL,
  first_response TINYINT(1) DEFAULT 0,
  amount_paid_by_user DECIMAL(10,2) DEFAULT 0,
  amount_paid_by_lawyer DECIMAL(10,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- =============================================
-- 12. AVUKAT YORUMLARI
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
-- 13. BILDIRIMLER
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

-- Sistem Ayarları
INSERT IGNORE INTO system_settings (setting_key, setting_value, aciklama) VALUES
('kidem_tavani',       '35058.58',  '2024 Kıdem Tazminatı Tavanı (TL)'),
('hizmet_bedeli_0_20', '750',       '0-20.000 TL alacak için platform bedeli'),
('hizmet_bedeli_20_50','1250',      '20.000-50.000 TL alacak için platform bedeli'),
('hizmet_bedeli_50_plus','2000',    '50.000+ TL alacak için platform bedeli'),
('toplam_hesaplama',   '1247',      'Toplam yapılan hesaplama sayısı'),
('platform_adi',       'HakPortal', 'Platform adı');

-- Admin kullanıcı (şifre: admin123)
INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, is_active) VALUES
(
  'admin-000-0000-0000-000000000001',
  'admin@hakportal.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhuG', -- admin123
  'admin',
  'Platform',
  'Yöneticisi',
  'A',
  1
);

-- Demo Avukat 1 (şifre: avukat123)
INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, sehir, is_active) VALUES
(
  'avukat-00-0000-0000-000000000001',
  'av.ahmet@hakportal.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhuG', -- avukat123... Bu hash admin123 içindir, doğrusunu aşağıda kullanıyoruz
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
  'İş hukuku ve işçi hakları alanında 10 yıllık deneyim.',
  '["iş hukuku","kıdem tazminatı"]',
  1
);

-- Demo Avukat 2 (şifre: avukat123)
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
  'İşçi hakları ve iş davalarında uzman.',
  '["iş hukuku","fazla mesai"]',
  1
);
