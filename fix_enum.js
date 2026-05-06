const mysql = require('mysql2/promise');
(async () => {
    const pool = await mysql.createPool({
        host: 'localhost', port: 3306,
        user: 'root', password: 'S19b310?',
        database: 'hakportal'
    });

    // Mevcut status kolonu tipini görüntüle
    const [cols] = await pool.execute("SHOW COLUMNS FROM cases WHERE Field = 'status'");
    console.log('Mevcut tip:', cols[0]?.Type);

    // ENUM'u tüm yeni statülerle güncelle
    const sql = `ALTER TABLE cases MODIFY status ENUM(
    'KAYITLI','AVUKAT_ARANIYOR','ACTIVE',
    'PRE_CASE_REVIEW','PENDING_USER_AUTH','AUTHORIZED',
    'DAVA_NO_BEKLIYOR','FILED_IN_COURT','IN_PROGRESS','DURUSMA',
    'TAHSIL','CLOSED','CANCELED'
  ) NOT NULL DEFAULT 'KAYITLI'`;

    await pool.execute(sql);
    console.log('✅ ENUM başarıyla güncellendi!');

    // Kontrol
    const [check] = await pool.execute("SHOW COLUMNS FROM cases WHERE Field = 'status'");
    console.log('Yeni tip:', check[0]?.Type);

    await pool.end();
})().catch(e => console.error('HATA:', e.message));
