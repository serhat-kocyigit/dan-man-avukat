const mysql = require('mysql2/promise');
(async () => {
    const pool = await mysql.createPool({
        host: 'localhost', port: 3306,
        user: 'root', password: 'S19b310?',
        database: 'hakportal'
    });

    try {
        const [cols] = await pool.execute("SHOW COLUMNS FROM case_status_logs WHERE Field = 'status'");
        console.log('case_status_logs.status tipi:', cols[0]?.Type);

        // Eğer ENUM ise güncelle
        if (cols[0]?.Type && cols[0].Type.includes('enum')) {
            await pool.execute(`ALTER TABLE case_status_logs MODIFY status ENUM(
        'KAYITLI','AVUKAT_ARANIYOR','ACTIVE',
        'PRE_CASE_REVIEW','PENDING_USER_AUTH','AUTHORIZED',
        'DAVA_NO_BEKLIYOR','FILED_IN_COURT','IN_PROGRESS','DURUSMA',
        'TAHSIL','CLOSED','CANCELED'
      ) NOT NULL`);
            console.log('✅ case_status_logs ENUM güncellendi');
        } else {
            console.log('VARCHAR/TEXT — ENUM değil, güncelleme gerekmiyor.');
        }
    } catch (e) {
        console.log('case_status_logs tablosu yok veya hata:', e.message);
    }

    await pool.end();
})();
