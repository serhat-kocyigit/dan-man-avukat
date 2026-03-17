// =============================================
// HakPortal - MySQL Bağlantı Pool (db/pool.js)
// =============================================
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hakportal',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: '+03:00'
});

// Bağlantı testi
pool.getConnection()
    .then(conn => {
        console.log('✅ MySQL bağlantısı başarılı:', process.env.DB_NAME);
        conn.release();
    })
    .catch(err => {
        console.error('❌ MySQL bağlantı hatası:', err.message);
        console.error('   Lütfen .env dosyasındaki DB_HOST, DB_USER, DB_PASSWORD, DB_NAME alanlarını kontrol edin.');
        process.exit(1);
    });

module.exports = pool;
