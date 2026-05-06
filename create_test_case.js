const mysql = require('mysql2/promise');
(async () => {
    const pool = await mysql.createPool({ host: 'localhost', user: 'root', password: 'S19b310?', database: 'hakportal' });
    const [u] = await pool.execute("SELECT id FROM users WHERE email='a@a.com'");
    const uid = u[0]?.id;
    const id = '99999999-9999-9999-9999-999999999999';
    await pool.execute('DELETE FROM cases WHERE id=?', [id]);
    await pool.execute("INSERT INTO cases (id, kullanici_id, secilen_avukat_id, status, sehir) VALUES (?, '7fbac810-ed19-4b86-ba5f-4c33713cf183', ?, 'AUTHORIZED', 'İstanbul')", [id, uid]);
    console.log('Test case created');
    await pool.end();
})();
