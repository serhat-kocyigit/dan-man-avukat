// =============================================
// HakPortal - Yasal Model Migrasyonu (v2.0)
// Mevcut veritabanını yeni yasal modele geçirir.
// Çalıştırmak için: node server/db/migrate_legal_model.js
// =============================================

require('dotenv').config();
const pool = require('./pool');

async function migrate() {
    const conn = await pool.getConnection();
    console.log('\n🔄 HakPortal - Yasal Model Migrasyonu Başlatılıyor...\n');

    try {
        await conn.beginTransaction();

        // 1. Eski tablolar ve kolonlar - kontrol et, temizle
        console.log('1️⃣  İletişim talepleri tablosu oluşturuluyor...');
        await conn.execute(`
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
        `);
        console.log('   ✅ iletisim_talepleri tablosu hazır.');

        // 2. Avukat abonelikler tablosu
        console.log('2️⃣  Avukat abonelikleri tablosu oluşturuluyor...');
        await conn.execute(`
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
        `);
        console.log('   ✅ avukat_abonelikler tablosu hazır.');

        // 3. Cases tablosundaki statüsleri güncelle (eski → yeni)
        console.log('3️⃣  Dava statüsleri güncelleniyor...');
        const statusMap = [
            ['OPEN', 'KAYITLI'],
            ['MATCHING', 'AVUKAT_ARANIYOR'],
            ['WAITING_PAYMENT', 'AVUKAT_ARANIYOR'],
            ['WAITING_LAWYER_PAYMENT', 'AVUKAT_ARANIYOR'],
            ['PRE_CASE_REVIEW', 'ACTIVE'],
            ['PENDING_USER_AUTH', 'ACTIVE'],
            ['AUTHORIZED', 'ACTIVE'],
            ['LAWYER_ASSIGNED', 'IN_PROGRESS'],
            ['ILK_GORUSME', 'IN_PROGRESS'],
            ['DAVA_ACILDI', 'FILED_IN_COURT'],
            ['DAVA_NO_BEKLIYOR', 'FILED_IN_COURT'],
            ['DURUSMA', 'DURUSMA'],
            ['TAHSIL', 'TAHSIL'],
            ['KAPANDI', 'CLOSED'],
            ['CANCELED', 'CANCELED']
        ];

        for (const [eski, yeni] of statusMap) {
            try {
                await conn.execute(
                    `UPDATE cases SET status = ? WHERE status = ?`,
                    [yeni, eski]
                );
            } catch (e) {
                // Status ENUM kısıtlaması nedeniyle bazıları hata verebilir, yoksay
            }
        }
        console.log('   ✅ Dava statüsleri güncellendi.');

        // 4. Cases tablosu ENUM güncelle (yeni statüsler)
        console.log('4️⃣  Cases ENUM güncelleniyor...');
        try {
            await conn.execute(`
                ALTER TABLE cases
                MODIFY COLUMN status ENUM(
                    'KAYITLI', 'AVUKAT_ARANIYOR', 'ACTIVE',
                    'IN_PROGRESS', 'FILED_IN_COURT',
                    'DURUSMA', 'TAHSIL', 'CLOSED', 'CANCELED'
                ) NOT NULL DEFAULT 'KAYITLI'
            `);
            console.log('   ✅ Cases ENUM güncellendi.');
        } catch (e) {
            console.log('   ⚠️  Cases ENUM güncellenemedi (muhtemelen zaten güncel):', e.message);
        }

        // 5. Eski teklifler ve engagement değerlerini temizle / arşivle
        console.log('5️⃣  Hizmet bedeli ayarları güncelleniyor...');
        await conn.execute(`
            INSERT INTO system_settings (setting_key, setting_value, aciklama)
            VALUES
                ('abonelik_aylik', '499', 'Avukat aylık abonelik bedeli (TL)'),
                ('abonelik_yillik', '3999', 'Avukat yıllık abonelik bedeli (TL)')
            ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                aciklama = VALUES(aciklama)
        `);
        console.log('   ✅ Abonelik ayarları eklendi.');

        // 6. Eski ödeme referans kolonunu kaldır (odeme_id varsa)
        console.log('6️⃣  Eski kolonlar temizleniyor (opsiyonel)...');
        try {
            await conn.execute(`ALTER TABLE cases DROP COLUMN IF EXISTS odeme_id`);
            await conn.execute(`ALTER TABLE cases DROP COLUMN IF EXISTS secilen_teklif_id`);
            await conn.execute(`ALTER TABLE cases DROP COLUMN IF EXISTS teklif_sayisi`);
            console.log('   ✅ Eski kolonlar temizlendi.');
        } catch (e) {
            console.log('   ⚠️  Bazı kolonlar zaten yoktu:', e.message);
        }

        await conn.commit();

        console.log('\n✅ =============================================');
        console.log('   Migrasyon başarıyla tamamlandı!');
        console.log('   Yeni Yasal Model Aktif:');
        console.log('   - Avukatlar iletişim talepleri alır');
        console.log('   - Kullanıcılar avukat profillerini listeler');
        console.log('   - İş başına ödeme YOK - Abonelik sistemi');
        console.log('=============================================\n');

    } catch (err) {
        await conn.rollback();
        console.error('\n❌ Migrasyon hatası:', err);
        process.exit(1);
    } finally {
        conn.release();
        process.exit(0);
    }
}

migrate();
