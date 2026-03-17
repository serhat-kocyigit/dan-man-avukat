require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hakportal',
    charset: 'utf8mb4'
};

async function apply() {
    let conn;
    try {
        console.log('Connecting...');
        conn = await mysql.createConnection(config);

        await conn.query(`
        CREATE TABLE IF NOT EXISTS avukat_yorumlari (
            id VARCHAR(36) PRIMARY KEY,
            case_id VARCHAR(36) NOT NULL,
            avukat_id VARCHAR(36) NOT NULL,
            kullanici_id VARCHAR(36) NOT NULL,
            puan INT NOT NULL CHECK(puan >= 1 AND puan <= 5),
            yorum TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
            FOREIGN KEY (avukat_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (kullanici_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY (case_id)
        )`);

        console.log('Table avukat_yorumlari created.');
    } catch (err) {
        console.log(err);
    } finally {
        if (conn) await conn.end();
        process.exit();
    }
}
apply();
