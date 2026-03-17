// =============================================
// HakPortal - Tam Veritabanı Reset + Rebuild
// Çalıştır: node server/db/reset.js
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

async function q(conn, sql) { return conn.query(sql); }

async function reset() {
    console.log('\n🗑️  HakPortal - VERİTABANI SIFIRLANIYOR...\n');
    let conn;

    try {
        conn = await mysql.createConnection(config);
        await q(conn, `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci`);
        await q(conn, `USE \`${DB_NAME}\``);

        // Tüm test verilerini temizle (sıralı - FK kısıtlamaları nedeniyle)
        console.log('🧹 Test verileri temizleniyor...');
        await q(conn, 'SET FOREIGN_KEY_CHECKS = 0');
        await q(conn, 'TRUNCATE TABLE messages');
        await q(conn, 'TRUNCATE TABLE payments');
        await q(conn, 'TRUNCATE TABLE case_status_logs');
        await q(conn, 'TRUNCATE TABLE offers');
        await q(conn, 'TRUNCATE TABLE documents');
        await q(conn, 'TRUNCATE TABLE sikayetler');
        await q(conn, 'TRUNCATE TABLE cases');
        await q(conn, 'TRUNCATE TABLE avukat_profiller');
        await q(conn, 'TRUNCATE TABLE users');
        await q(conn, 'SET FOREIGN_KEY_CHECKS = 1');
        console.log('✅ Tüm test verileri temizlendi.');

        // ======= USERS tablosunu genişlet =======
        const alterUsers = [
            [`ALTER TABLE users ADD COLUMN telefon VARCHAR(20) DEFAULT NULL AFTER soyad`],
            [`ALTER TABLE users ADD COLUMN tc_kimlik VARCHAR(11) DEFAULT NULL AFTER telefon`],
            [`ALTER TABLE users ADD COLUMN dogum_tarihi DATE DEFAULT NULL AFTER tc_kimlik`],
            [`ALTER TABLE users ADD COLUMN adres TEXT DEFAULT NULL AFTER dogum_tarihi`],
        ];
        for (const [cmd] of alterUsers) {
            try { await q(conn, cmd); } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        }

        // AVUKAT profiller tablosunu genişlet
        const alterAv = [
            [`ALTER TABLE avukat_profiller ADD COLUMN sicil_no VARCHAR(50) DEFAULT NULL AFTER baro_no`],
            [`ALTER TABLE avukat_profiller ADD COLUMN mezuniyet_yili YEAR DEFAULT NULL AFTER sicil_no`],
            [`ALTER TABLE avukat_profiller ADD COLUMN deneyim_yil INT DEFAULT 0 AFTER mezuniyet_yili`],
            [`ALTER TABLE avukat_profiller ADD COLUMN dil JSON DEFAULT NULL AFTER deneyim_yil`],
            [`ALTER TABLE avukat_profiller ADD COLUMN website VARCHAR(255) DEFAULT NULL AFTER dil`],
        ];
        for (const [cmd] of alterAv) {
            try { await q(conn, cmd); } catch (e) { if (!e.message.includes('Duplicate column')) throw e; }
        }
        console.log('✅ Tablo şemaları güncellendi.');

        // ======= BAŞLANGIÇ VERİSİ =======
        console.log('\n📥 Temel kurulum verileri ekleniyor...\n');

        // Sistem ayarları (mevcut değerleri koruyarak ekle)
        const settingsRows = [
            ['kidem_tavani', '35058.58', '2024 Kıdem Tazminatı Tavanı (TL)'],
            ['hizmet_bedeli_0_20', '750', '0-20.000 TL alacak için platform bedeli'],
            ['hizmet_bedeli_20_50', '1250', '20.000-50.000 TL alacak için platform bedeli'],
            ['hizmet_bedeli_50_plus', '2000', '50.000+ TL alacak için platform bedeli'],
            ['toplam_hesaplama', '0', 'Toplam yapılan hesaplama sayısı'],
            ['platform_adi', 'HakPortal', 'Platform adı'],
        ];
        for (const [key, val, aciklama] of settingsRows) {
            await conn.execute(
                `INSERT INTO system_settings (setting_key, setting_value, aciklama)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE aciklama = aciklama`,
                [key, val, aciklama]
            );
        }
        console.log('✅ Sistem ayarları hazır.');

        // Admin hesabı
        const adminPass = await bcrypt.hash('admin123', 10);
        const adminId = uuidv4();
        await conn.execute(
            `INSERT INTO users (id, email, password, role, ad, soyad, avatar, is_active)
       VALUES (?, 'admin@hakportal.com', ?, 'admin', 'Platform', 'Yöneticisi', 'A', 1)`,
            [adminId, adminPass]
        );
        console.log('✅ Admin oluşturuldu: admin@hakportal.com / admin123');

        // Demo Avukat - İstanbul (sistemi test etmek için)
        const avPass = await bcrypt.hash('avukat123', 10);
        const av1Id = uuidv4();
        const av1Prof = uuidv4();
        await conn.execute(
            `INSERT INTO users (id, email, password, role, ad, soyad, avatar, telefon, sehir, is_active)
       VALUES (?, 'av.demo@hakportal.com', ?, 'avukat', 'Demo', 'Avukat', 'D', '0555-000-0000', 'Istanbul', 1)`,
            [av1Id, avPass]
        );
        await conn.execute(
            `INSERT INTO avukat_profiller
         (id, user_id, unvan, baro, baro_no, sicil_no, mezuniyet_yili, deneyim_yil, bio, uzmanlik, profil_onay)
       VALUES (?, ?, 'Av.', 'İstanbul Barosu', 'IST-00001', 'SIC-001', 2012, 12,
               'İş hukuku ve işçi hakları alanında 12 yıllık deneyim. Kıdem ve ihbar tazminatı davalarında uzman.',
               '["İş Hukuku","Kıdem Tazminatı","İhbar Tazminatı","İşçi Hakları"]', 1)`,
            [av1Prof, av1Id]
        );
        console.log('✅ Demo avukat oluşturuldu: av.demo@hakportal.com / avukat123 (İstanbul)');

        console.log('\n════════════════════════════════════════════');
        console.log('  ✅ VERİTABANI HAZIR!');
        console.log('────────────────────────────────────────────');
        console.log('  Artık gerçek kullanıcılar kaydolabilir.');
        console.log('  Admin:  admin@hakportal.com / admin123');
        console.log('  Demo:   av.demo@hakportal.com / avukat123');
        console.log('────────────────────────────────────────────');
        console.log('  Sunucuyu başlatmak için:');
        console.log('  node server/index.js');
        console.log('════════════════════════════════════════════\n');

    } catch (err) {
        console.error('\n❌ RESET HATASI:', err.message);
        console.error('SQL:', err.sqlMessage || '');
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

reset();
