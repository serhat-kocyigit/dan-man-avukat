const mysql = require('mysql2/promise');
async function run() {
  const conn = await mysql.createConnection({ host: 'localhost', port: 3306, user: 'root', password: 'S19b310?', database: 'hakportal' });
  try {
    const q = "ALTER TABLE cases MODIFY COLUMN status ENUM('OPEN', 'MATCHING', 'WAITING_PAYMENT', 'WAITING_LAWYER_PAYMENT', 'PRE_CASE_REVIEW', 'PENDING_USER_AUTH', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'IN_PROGRESS', 'FILED_IN_COURT', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL', 'CLOSED', 'KAPANDI', 'CANCELED') NOT NULL DEFAULT 'OPEN'";
    await conn.query(q);
    console.log('OK');
  } catch(e) {
    console.error(e.message);
  }
  await conn.end();
}
run();
