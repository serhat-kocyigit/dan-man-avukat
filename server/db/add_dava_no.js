require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hakportal'
};

async function run() {
  const conn = await mysql.createConnection(config);
  try {
    await conn.execute('ALTER TABLE cases ADD COLUMN dava_no VARCHAR(100) DEFAULT NULL');
    console.log('dava_no added');
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('dava_no already exists');
    else console.error(e);
  } finally {
    await conn.end();
  }
}

run();
