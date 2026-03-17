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

async function q(conn, sql) {
    return conn.query(sql);
}

async function runUpdate() {
    let conn;
    try {
        conn = await mysql.createConnection(config);
        console.log('Veritabanına bağlanıldı.');

        await q(conn, `
      CREATE TABLE IF NOT EXISTS engagements (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        case_id VARCHAR(36) NOT NULL,
        offer_id VARCHAR(36) NOT NULL,
        kullanici_id VARCHAR(36) NOT NULL,
        avukat_id VARCHAR(36) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'OFFER_SELECTED',
        first_response TINYINT(1) NOT NULL DEFAULT 0,
        amount_paid_by_user DECIMAL(10,2) NOT NULL DEFAULT 0,
        amount_paid_by_lawyer DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
        FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
        FOREIGN KEY (kullanici_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (avukat_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
        console.log('✅ Tablo: engagements');

        await q(conn, `
      CREATE TABLE IF NOT EXISTS wallets (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        balance DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wallet_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
        console.log('✅ Tablo: wallets');

        await q(conn, `
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        wallet_id VARCHAR(36) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        type ENUM('CREDIT', 'DEBIT') NOT NULL,
        description TEXT DEFAULT NULL,
        related_entity_id VARCHAR(36) DEFAULT NULL,
        expiry_date DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
        console.log('✅ Tablo: wallet_transactions');

        console.log('✅ Güncelleme tamamlandı!');
        process.exit(0);
    } catch (err) {
        console.error('Hata:', err);
        process.exit(1);
    }
}

runUpdate();
