// =============================================
// HakPortal - Veritabanı Kurulum Scripti
// Çalıştır: node server/db/setup.js
// =============================================
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_NAME = process.env.DB_NAME || 'hakportal';

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: false,
  charset: 'utf8mb4'
};

// query() ile DDL çalıştır (prepared statement protokolü yok)
async function q(conn, sql) {
  return conn.query(sql);
}

async function setup() {
  console.log('\n🔧 HakPortal MySQL Kurulumu Başlıyor...\n');
  let conn;

  try {
    conn = await mysql.createConnection(config);
    console.log('✅ MySQL sunucusuna bağlandı.');

    await q(conn, `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci`);
    console.log(`✅ Veritabanı oluşturuldu/mevcut: ${DB_NAME}`);

    await q(conn, `USE \`${DB_NAME}\``);

    // ===================== TABLOLAR =====================

    // 1. users
    await q(conn, `
      CREATE TABLE IF NOT EXISTS users (
        id           VARCHAR(36)  NOT NULL PRIMARY KEY,
        email        VARCHAR(191) NOT NULL,
        password     VARCHAR(255) NOT NULL,
        role         ENUM('kullanici','avukat','admin') NOT NULL DEFAULT 'kullanici',
        ad           VARCHAR(100) NOT NULL,
        soyad        VARCHAR(100) NOT NULL,
        avatar       VARCHAR(255) DEFAULT NULL,
        sehir        VARCHAR(100) DEFAULT NULL,
        telefon      VARCHAR(20)  DEFAULT NULL,
        tc_kimlik    VARCHAR(11)  DEFAULT NULL,
        dogum_tarihi DATE         DEFAULT NULL,
        adres        TEXT         DEFAULT NULL,
        is_active    TINYINT(1)   NOT NULL DEFAULT 1,
        created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: users');

    // 2. avukat_profiller
    await q(conn, `
      CREATE TABLE IF NOT EXISTS avukat_profiller (
        id          VARCHAR(36)  NOT NULL PRIMARY KEY,
        user_id     VARCHAR(36)  NOT NULL,
        unvan       VARCHAR(20)  DEFAULT 'Av.',
        baro        VARCHAR(150) NOT NULL,
        baro_no     VARCHAR(50)  NOT NULL,
        sicil_no    VARCHAR(50)  DEFAULT NULL,
        mezuniyet_yili INT       DEFAULT NULL,
        deneyim_yil INT          DEFAULT NULL,
        bio         TEXT         DEFAULT NULL,
        uzmanlik    JSON         DEFAULT NULL,
        profil_onay TINYINT(1)   NOT NULL DEFAULT 0,
        onay_tarihi DATETIME     DEFAULT NULL,
        UNIQUE KEY uq_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: avukat_profiller');

    // 3. cases
    await q(conn, `
      CREATE TABLE IF NOT EXISTS cases (
        id                VARCHAR(36)   NOT NULL PRIMARY KEY,
        kullanici_id      VARCHAR(36)   NOT NULL,
        sehir             VARCHAR(100)  NOT NULL,
        dava_turu         VARCHAR(100)  DEFAULT NULL,
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
        status            VARCHAR(50)   NOT NULL DEFAULT 'OPEN',
        secilen_avukat_id VARCHAR(36)   DEFAULT NULL,
        secilen_teklif_id VARCHAR(36)   DEFAULT NULL,
        odeme_id          VARCHAR(36)   DEFAULT NULL,
        teklif_sayisi     INT           NOT NULL DEFAULT 0,
        created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_kullanici (kullanici_id),
        INDEX idx_status    (status),
        INDEX idx_sehir     (sehir),
        FOREIGN KEY (kullanici_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: cases');

    // 4. case_status_logs
    await q(conn, `
      CREATE TABLE IF NOT EXISTS case_status_logs (
        id              INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
        case_id         VARCHAR(36) NOT NULL,
        status          VARCHAR(50) NOT NULL,
        aciklama        TEXT        DEFAULT NULL,
        guncelleyen_id  VARCHAR(36) DEFAULT NULL,
        guncelleyen_rol VARCHAR(30) DEFAULT NULL,
        created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_case (case_id),
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: case_status_logs');

    // 5. offers
    await q(conn, `
      CREATE TABLE IF NOT EXISTS offers (
        id            VARCHAR(36)   NOT NULL PRIMARY KEY,
        case_id       VARCHAR(36)   NOT NULL,
        avukat_id     VARCHAR(36)   NOT NULL,
        ucret_modeli  ENUM('yuzde','sabit') NOT NULL,
        oran          DECIMAL(5,2)  DEFAULT NULL,
        sabit_ucret   DECIMAL(12,2) DEFAULT NULL,
        on_odeme      TINYINT(1)    NOT NULL DEFAULT 0,
        tahmini_sure  VARCHAR(100)  NOT NULL,
        aciklama      TEXT          DEFAULT NULL,
        status        VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
        selected_at   DATETIME      DEFAULT NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_case_avukat (case_id, avukat_id),
        INDEX idx_avukat (avukat_id),
        FOREIGN KEY (case_id)   REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (avukat_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: offers');

    // 6. payments
    await q(conn, `
      CREATE TABLE IF NOT EXISTS payments (
        id            VARCHAR(36)   NOT NULL PRIMARY KEY,
        case_id       VARCHAR(36)   NOT NULL,
        offer_id      VARCHAR(36)   NOT NULL,
        kullanici_id  VARCHAR(36)   NOT NULL,
        avukat_id     VARCHAR(36)   NOT NULL,
        tutar         DECIMAL(10,2) NOT NULL,
        kart_son_dort VARCHAR(4)    DEFAULT '****',
        status        VARCHAR(20)   NOT NULL DEFAULT 'COMPLETED',
        tarih         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id)      REFERENCES cases(id),
        FOREIGN KEY (offer_id)     REFERENCES offers(id),
        FOREIGN KEY (kullanici_id) REFERENCES users(id),
        FOREIGN KEY (avukat_id)    REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: payments');

    // 7. messages
    await q(conn, `
      CREATE TABLE IF NOT EXISTS messages (
        id           VARCHAR(36) NOT NULL PRIMARY KEY,
        case_id      VARCHAR(36) NOT NULL,
        gonderen_id  VARCHAR(36) NOT NULL,
        gonderen_rol VARCHAR(30) NOT NULL,
        icerik       TEXT        NOT NULL,
        okundu       TINYINT(1)  NOT NULL DEFAULT 0,
        tarih        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_case_tarih (case_id, tarih),
        FOREIGN KEY (case_id)    REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (gonderen_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: messages');

    // 8. documents
    await q(conn, `
      CREATE TABLE IF NOT EXISTS documents (
        id          VARCHAR(36)  NOT NULL PRIMARY KEY,
        case_id     VARCHAR(36)  NOT NULL,
        yukleyen_id VARCHAR(36)  NOT NULL,
        dosya_adi   VARCHAR(255) NOT NULL,
        dosya_yolu  VARCHAR(500) NOT NULL,
        dosya_tipi  VARCHAR(100) DEFAULT NULL,
        boyut       INT          DEFAULT 0,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id)     REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (yukleyen_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: documents');

    // 9. system_settings
    await q(conn, `
      CREATE TABLE IF NOT EXISTS system_settings (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        setting_key   VARCHAR(100) NOT NULL,
        setting_value TEXT         NOT NULL,
        aciklama      VARCHAR(255) DEFAULT NULL,
        updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: system_settings');

    // 10. sikayetler
    await q(conn, `
      CREATE TABLE IF NOT EXISTS sikayetler (
        id              VARCHAR(36) NOT NULL PRIMARY KEY,
        sikayet_eden    VARCHAR(36) NOT NULL,
        sikayet_edilen  VARCHAR(36) NOT NULL,
        case_id         VARCHAR(36) DEFAULT NULL,
        aciklama        TEXT        NOT NULL,
        status          VARCHAR(20) DEFAULT 'BEKLIYOR',
        created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sikayet_eden)   REFERENCES users(id),
        FOREIGN KEY (sikayet_edilen) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: sikayetler');

    // 11. engagements
    await q(conn, `
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: engagements');

    // 12. avukat_yorumlari
    await q(conn, `
      CREATE TABLE IF NOT EXISTS avukat_yorumlari (
        id VARCHAR(36) PRIMARY KEY,
        case_id VARCHAR(36) NOT NULL UNIQUE,
        avukat_id VARCHAR(36) NOT NULL,
        kullanici_id VARCHAR(36) NOT NULL,
        puan INT NOT NULL,
        yorum TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: avukat_yorumlari');

    // 13. notifications
    await q(conn, `
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        tip VARCHAR(50) NOT NULL,
        baslik VARCHAR(255) NOT NULL,
        mesaj TEXT NOT NULL,
        case_id VARCHAR(36) DEFAULT NULL,
        okundu TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    console.log('✅ Tablo: notifications');

    // ===================== BAŞLANGIÇ VERİSİ =====================
    console.log('\n📥 Başlangıç verileri ekleniyor...\n');

    // Sistem Ayarları
    const settingsRows = [
      ['kidem_tavani', '35058.58', '2024 Kıdem Tazminatı Tavanı (TL)'],
      ['hizmet_bedeli_0_20', '750', '0-20.000 TL alacak için platform bedeli'],
      ['hizmet_bedeli_20_50', '1250', '20.000-50.000 TL alacak için platform bedeli'],
      ['hizmet_bedeli_50_plus', '2000', '50.000+ TL alacak için platform bedeli'],
      ['toplam_hesaplama', '1247', 'Toplam yapılan hesaplama sayısı'],
      ['platform_adi', 'HakPortal', 'Platform adı'],
    ];

    for (const [key, val, aciklama] of settingsRows) {
      await conn.execute(
        `INSERT IGNORE INTO system_settings (setting_key, setting_value, aciklama) VALUES (?, ?, ?)`,
        [key, val, aciklama]
      );
    }
    console.log('✅ Sistem ayarları eklendi.');

    // Şifre hash'leri
    const adminPass = await bcrypt.hash('admin123', 10);
    const avukatPass = await bcrypt.hash('avukat123', 10);

    // Admin
    const adminId = uuidv4();
    await conn.execute(
      `INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, is_active)
       VALUES (?, ?, ?, 'admin', 'Platform', 'Yöneticisi', 'A', 1)`,
      [adminId, 'admin@hakportal.com', adminPass]
    );
    console.log('✅ Admin: admin@hakportal.com / admin123');

    // Demo Avukat 1 - İstanbul
    const av1Id = uuidv4();
    await conn.execute(
      `INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, sehir, is_active)
       VALUES (?, ?, ?, 'avukat', 'Ahmet', 'Yilmaz', 'A', 'Istanbul', 1)`,
      [av1Id, 'av.ahmet@hakportal.com', avukatPass]
    );
    // Sadece user eklenmişse profil ekle
    const [av1Check] = await conn.execute(
      'SELECT id FROM avukat_profiller WHERE user_id = ?', [av1Id]
    );
    if (!av1Check.length) {
      await conn.execute(
        `INSERT INTO avukat_profiller (id, user_id, unvan, baro, baro_no, bio, uzmanlik, profil_onay)
         VALUES (?, ?, 'Av.', 'Istanbul Barosu', '12345',
                 'Is hukuku ve isci haklari alaninda 10 yillik deneyim.',
                 '["is hukuku","kidem tazminati"]', 1)`,
        [uuidv4(), av1Id]
      );
    }
    console.log('✅ Avukat 1: av.ahmet@hakportal.com / avukat123 (Istanbul)');

    // Demo Avukat 2 - Ankara
    const av2Id = uuidv4();
    await conn.execute(
      `INSERT IGNORE INTO users (id, email, password, role, ad, soyad, avatar, sehir, is_active)
       VALUES (?, ?, ?, 'avukat', 'Zeynep', 'Kaya', 'Z', 'Ankara', 1)`,
      [av2Id, 'av.zeynep@hakportal.com', avukatPass]
    );
    const [av2Check] = await conn.execute(
      'SELECT id FROM avukat_profiller WHERE user_id = ?', [av2Id]
    );
    if (!av2Check.length) {
      await conn.execute(
        `INSERT INTO avukat_profiller (id, user_id, unvan, baro, baro_no, bio, uzmanlik, profil_onay)
         VALUES (?, ?, 'Av.', 'Ankara Barosu', '54321',
                 'Isci haklari ve is davalarinda uzman.',
                 '["is hukuku","fazla mesai"]', 1)`,
        [uuidv4(), av2Id]
      );
    }
    console.log('✅ Avukat 2: av.zeynep@hakportal.com / avukat123 (Ankara)');

    console.log('\n🎉 VERİTABANI KURULUMU TAMAMLANDI!\n');
    console.log('═══════════════════════════════════════════');
    console.log('  Sunucuyu başlatmak için:');
    console.log('  node server/index.js');
    console.log('═══════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ KURULUM HATASI:', err.message);
    console.error('Detay:', err.sqlMessage || '');
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

setup();
