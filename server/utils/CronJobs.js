const pool = require('../db/pool');
const { v4: uuidv4 } = require('uuid');

async function runCronJobs() {
    console.log('[CRON] State Machine Integrity Checks Started.');
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // ==========================================
        // 1) WAITING_LAWYER_PAYMENT > 24 saat -> FAILED_BY_LAWYER
        // ==========================================
        const [failedLawyerEngs] = await conn.execute(`
            SELECT id, case_id, kullanici_id, amount_paid_by_user 
            FROM engagements 
            WHERE status = 'WAITING_LAWYER_PAYMENT' 
            AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);

        for (const eng of failedLawyerEngs) {
            // Engagement Status -> FAILED_BY_LAWYER
            await conn.execute(`UPDATE engagements SET status = 'FAILED_BY_LAWYER' WHERE id = ?`, [eng.id]);

            // Kullanıcıya Wallet Kredisi (99 TL) iade
            if (eng.amount_paid_by_user > 0) {
                // Wallet Var mı? Yoksa oluştur.
                const [w] = await conn.execute(`SELECT id FROM wallets WHERE user_id = ?`, [eng.kullanici_id]);
                let walletId = w.length ? w[0].id : uuidv4();
                if (!w.length) {
                    await conn.execute(`INSERT INTO wallets (id, user_id, balance) VALUES (?, ?, 0)`, [walletId, eng.kullanici_id]);
                }

                await conn.execute(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [eng.amount_paid_by_user, walletId]);
                await conn.execute(
                    `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, related_entity_id) VALUES (?, ?, ?, 'CREDIT', 'Ciddiyet Bedeli İadesi (Avukat Ödeme Yapmadı)', ?)`,
                    [uuidv4(), walletId, eng.amount_paid_by_user, eng.id]
                );
            }

            // Dava durumu MATCHING'e geri döner
            await conn.execute(`UPDATE cases SET status = 'MATCHING', secilen_avukat_id = NULL, secilen_teklif_id = NULL WHERE id = ?`, [eng.case_id]);
            await conn.execute(`INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_rol) VALUES (?, 'MATCHING', 'Avukat 24 saatte bedeli ödemedi, iptal oldu ve dava teklife tekrar açıldı.', 'system')`, [eng.case_id]);
        }


        // ==========================================
        // 2) ACTIVE (first_response=0) > 48 saat -> AT_RISK
        // ==========================================
        const [atRiskEngs] = await conn.execute(`
            SELECT id, case_id 
            FROM engagements 
            WHERE status = 'ACTIVE' 
            AND first_response = 0 
            AND updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
        `);

        for (const eng of atRiskEngs) {
            await conn.execute(`UPDATE engagements SET status = 'AT_RISK' WHERE id = ?`, [eng.id]);
            // SMS, Push Email eklenebilir. Şu an sadece DB güncelledik.
        }


        // ==========================================
        // 3) AT_RISK > 24 saat -> FAILED_BY_USER
        // ==========================================
        const [failedUserEngs] = await conn.execute(`
            SELECT id, case_id, avukat_id, amount_paid_by_lawyer 
            FROM engagements 
            WHERE status = 'AT_RISK' 
            AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
        `);

        for (const eng of failedUserEngs) {
            await conn.execute(`UPDATE engagements SET status = 'FAILED_BY_USER' WHERE id = ?`, [eng.id]);

            // Avukata Wallet Kredisi (Platform bedeli iade, 6 ay geçerli)
            if (eng.amount_paid_by_lawyer > 0) {
                const [w] = await conn.execute(`SELECT id FROM wallets WHERE user_id = ?`, [eng.avukat_id]);
                let walletId = w.length ? w[0].id : uuidv4();
                if (!w.length) {
                    await conn.execute(`INSERT INTO wallets (id, user_id, balance) VALUES (?, ?, 0)`, [walletId, eng.avukat_id]);
                }

                await conn.execute(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [eng.amount_paid_by_lawyer, walletId]);
                await conn.execute(
                    `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, related_entity_id, expiry_date) VALUES (?, ?, ?, 'CREDIT', 'Eşleşme Ücreti İadesi (Kullanıcı İlgilenmedi)', ?, DATE_ADD(NOW(), INTERVAL 6 MONTH))`,
                    [uuidv4(), walletId, eng.amount_paid_by_lawyer, eng.id]
                );

                // Check Abuse: 3 Kez FAILED_BY_USER yapan var mı? (Gelecek entegrasyon)
            }

            // Dava durumu MATCHING'e geri döner
            await conn.execute(`UPDATE cases SET status = 'MATCHING', secilen_avukat_id = NULL, secilen_teklif_id = NULL WHERE id = ?`, [eng.case_id]);
            await conn.execute(`INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_rol) VALUES (?, 'MATCHING', 'Kullanıcı iletişime geçmedi, eşleşme iptal oldu ve dava tekrar açıldı.', 'system')`, [eng.case_id]);
        }

        await conn.commit();
        console.log('[CRON] Integrity Checks Completed Successfully.');
    } catch (err) {
        await conn.rollback();
        console.error('[CRON] Error during jobs:', err);
    } finally {
        conn.release();
    }
}

// Her saat başı çalışacak şekilde export ediyoruz
function startCron() {
    setInterval(runCronJobs, 1000 * 60 * 60); // Her 60 dk
    // runCronJobs(); // Sunucu kalktığında ilk kez da çalışsın
}

module.exports = { startCron, runCronJobs };
