require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hakportal',
    multipleStatements: false,
    charset: 'utf8mb4'
};

async function q(conn, sql, label) {
    try {
        await conn.query(sql);
        console.log(`✅ ${label}`);
    } catch (err) {
        if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_INDEX' || err.message.includes('Duplicate column')) {
            console.log(`ℹ️  ${label} (zaten mevcut, atlandı)`);
        } else {
            throw err;
        }
    }
}

async function runMigration() {
    let conn;
    try {
        conn = await mysql.createConnection(config);
        console.log('✅ Veritabanına bağlanıldı.\n');

        // ====================================================
        // 1. Notifications (Bildirimler) Tablosu
        // ====================================================
        await q(conn, `
            CREATE TABLE IF NOT EXISTS notifications (
                id          CHAR(36)     NOT NULL PRIMARY KEY,
                user_id     CHAR(36)     NOT NULL,
                tip         VARCHAR(50)  NOT NULL DEFAULT 'GENEL',
                baslik      VARCHAR(255) NOT NULL,
                mesaj       TEXT         NOT NULL,
                case_id     CHAR(36)     DEFAULT NULL,
                okundu      TINYINT(1)   NOT NULL DEFAULT 0,
                created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_notif_user (user_id, okundu),
                INDEX idx_notif_case (case_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
        `, 'Tablo: notifications');

        // ====================================================
        // 2. Cases tablosuna ispat_belgeleri kolonu (eğer yoksa)
        // ====================================================
        await q(conn, `
            ALTER TABLE cases ADD COLUMN ispat_belgeleri JSON DEFAULT NULL
        `, 'Kolon: cases.ispat_belgeleri');

        // ====================================================
        // 3. Cases tablosuna skor kolonları (eğer yoksa)
        // ====================================================
        await q(conn, `
            ALTER TABLE cases ADD COLUMN skor_hukuki DECIMAL(5,2) DEFAULT 0
        `, 'Kolon: cases.skor_hukuki');

        await q(conn, `
            ALTER TABLE cases ADD COLUMN skor_veri DECIMAL(5,2) DEFAULT 0
        `, 'Kolon: cases.skor_veri');

        await q(conn, `
            ALTER TABLE cases ADD COLUMN skor_tahsil DECIMAL(5,2) DEFAULT 0
        `, 'Kolon: cases.skor_tahsil');

        await q(conn, `
            ALTER TABLE cases ADD COLUMN skor_toplam DECIMAL(5,2) DEFAULT 0
        `, 'Kolon: cases.skor_toplam');

        await q(conn, `
            ALTER TABLE cases ADD COLUMN risk_kategorisi VARCHAR(50) DEFAULT 'BILINMIYOR'
        `, 'Kolon: cases.risk_kategorisi');

        await q(conn, `
            ALTER TABLE cases ADD COLUMN risk_notlari JSON DEFAULT NULL
        `, 'Kolon: cases.risk_notlari');

        await q(conn, `
            ALTER TABLE cases ADD COLUMN avukat_yorumu TEXT DEFAULT NULL
        `, 'Kolon: cases.avukat_yorumu');

        // ====================================================
        // 4. Cases status enum genişletme
        // ====================================================
        await q(conn, `
            ALTER TABLE cases MODIFY COLUMN status ENUM(
                'OPEN','MATCHING','WAITING_PAYMENT','WAITING_LAWYER_PAYMENT',
                'PRE_CASE_REVIEW','PENDING_USER_AUTH','AUTHORIZED','ACTIVE',
                'LAWYER_ASSIGNED','IN_PROGRESS','FILED_IN_COURT',
                'ILK_GORUSME','DAVA_ACILDI','DURUSMA','TAHSIL',
                'CLOSED','KAPANDI','CANCELED'
            ) NOT NULL DEFAULT 'OPEN'
        `, 'Cases status enum güncellendi');

        // ====================================================
        // 5. Offers status enum genişletme
        // ====================================================
        await q(conn, `
            ALTER TABLE offers MODIFY COLUMN status ENUM(
                'PENDING','SELECTED','REJECTED','REJECTED_BY_LAWYER'
            ) NOT NULL DEFAULT 'PENDING'
        `, 'Offers status enum güncellendi');

        // ====================================================
        // 6. Avukat Yorumları Tablosu (eğer yoksa)
        // ====================================================
        await q(conn, `
            CREATE TABLE IF NOT EXISTS avukat_yorumlari (
                id          CHAR(36)    NOT NULL PRIMARY KEY,
                case_id     CHAR(36)    NOT NULL,
                avukat_id   CHAR(36)    NOT NULL,
                kullanici_id CHAR(36)   NOT NULL,
                puan        TINYINT(1)  NOT NULL DEFAULT 5,
                yorum       TEXT        DEFAULT NULL,
                created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_case_yorum (case_id),
                FOREIGN KEY (case_id)      REFERENCES cases(id) ON DELETE CASCADE,
                FOREIGN KEY (avukat_id)    REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (kullanici_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
        `, 'Tablo: avukat_yorumlari');

        // ====================================================
        // 7. Sicil No ve deneyim kolonları (eğer yoksa)
        // ====================================================
        await q(conn, `
            ALTER TABLE avukat_profiller ADD COLUMN sicil_no VARCHAR(50) DEFAULT NULL
        `, 'Kolon: avukat_profiller.sicil_no');

        await q(conn, `
            ALTER TABLE avukat_profiller ADD COLUMN mezuniyet_yili YEAR DEFAULT NULL
        `, 'Kolon: avukat_profiller.mezuniyet_yili');

        await q(conn, `
            ALTER TABLE avukat_profiller ADD COLUMN deneyim_yil INT DEFAULT NULL
        `, 'Kolon: avukat_profiller.deneyim_yil');

        console.log('\n✅ Tüm migrasyon işlemleri başarıyla tamamlandı!');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ Migrasyon hatası:', err.message);
        process.exit(1);
    } finally {
        if (conn) await conn.end();
    }
}

runMigration();
