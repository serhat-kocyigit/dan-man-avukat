const mysql = require('mysql2/promise');
(async () => {
    const pool = await mysql.createPool({
        host: 'localhost', user: 'root', password: 'S19b310?', database: 'hakportal'
    });
    const [cols] = await pool.execute("SHOW COLUMNS FROM cases");
    console.log(cols.map(c => c.Field).join(', '));
    await pool.end();
})();
