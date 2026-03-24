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
    console.log('Altering cases table status ENUM...');
    await conn.execute(`
      ALTER TABLE cases MODIFY COLUMN status ENUM(
        'OPEN','MATCHING','WAITING_PAYMENT','WAITING_LAWYER_PAYMENT',
        'PRE_CASE_REVIEW','PENDING_USER_AUTH','AUTHORIZED','ACTIVE',
        'LAWYER_ASSIGNED','IN_PROGRESS','FILED_IN_COURT','ILK_GORUSME',
        'DAVA_ACILDI','DURUSMA','TAHSIL','CLOSED','KAPANDI','CANCELED',
        'DAVA_NO_BEKLIYOR'
      ) NOT NULL DEFAULT 'OPEN'
    `);
    console.log('✅ Cases status ENUM updated successfully.');
  } catch(e) {
    console.error('❌ Error modifying ENUM:', e);
  } finally {
    await conn.end();
  }
}

run();
