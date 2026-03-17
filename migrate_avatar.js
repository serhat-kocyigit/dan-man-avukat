const pool = require('./server/db/pool');

async function migrate() {
    try {
        console.log('Migrating avatar column...');
        await pool.execute('ALTER TABLE users MODIFY avatar VARCHAR(255)');
        console.log('Migration successful! ✅');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
