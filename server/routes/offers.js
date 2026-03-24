// =============================================
// HakPortal - Offers Route (MySQL)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const contactPattern = /(\+90|05\d{2}|\b0\d{10}\b|@[^\s]+\.[a-z]{2,}|http[s]?:\/\/|www\.|instagram|telegram|whatsapp|signal)/gi;

// ---- POST /api/offers - Teklif Ver (Avukat) ----
router.post('/', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    const { caseId, ucretModeli, oran, sabitUcret, onOdeme, tahminiSure, aciklama, kartNo, kartSahibi, sonKullanma, cvv } = req.body;

    if (!caseId || !ucretModeli || !tahminiSure)
        return res.status(400).json({ error: 'caseId, ucretModeli ve tahminiSure gerekli.' });
    if (aciklama && contactPattern.test(aciklama))
        return res.status(400).json({ error: 'Açıklama alanında iletişim bilgisi kullanılamaz.' });

    // Teklif verirken kart bilgisi gerekmiyor, sadece teklif seçildikten sonra ödeme sırasında alınacak.

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Avukat profili onaylı mı?
        const [profil] = await conn.execute(
            'SELECT profil_onay FROM avukat_profiller WHERE user_id = ?',
            [req.user.id]
        );
        if (!profil.length || !profil[0].profil_onay) { await conn.rollback(); conn.release(); return res.status(403).json({ error: 'Profil onaylı değil. Teklif veremezsiniz.' }); }

        // Dava mevcut mu?
        const [cases] = await conn.execute(
            'SELECT id, status, tahmini_alacak FROM cases WHERE id = ?', [caseId]
        );
        if (!cases.length || cases[0].status !== 'OPEN') { await conn.rollback(); conn.release(); return res.status(400).json({ error: 'Dava bulunamadı veya açık değil.' }); }

        const tahminiAlacak = parseFloat(cases[0].tahmini_alacak) || 0;

        // Platform bedeli hesapla (avukat ödeyecek)
        const [settings] = await conn.execute(
            `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN
       ('hizmet_bedeli_0_20','hizmet_bedeli_20_50','hizmet_bedeli_50_plus')`
        );
        const s = {};
        settings.forEach(r => { s[r.setting_key] = parseFloat(r.setting_value); });
        let platformBedeli = s.hizmet_bedeli_50_plus || 2000;
        if (tahminiAlacak < 20000) platformBedeli = s.hizmet_bedeli_0_20 || 750;
        else if (tahminiAlacak < 50000) platformBedeli = s.hizmet_bedeli_20_50 || 1250;

        // Teklif id oluştur ve kaydet
        const id = uuidv4();
        await conn.execute(
            `INSERT INTO offers (id, case_id, avukat_id, ucret_modeli, oran, sabit_ucret, on_odeme, tahmini_sure, aciklama, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [
                id, caseId, req.user.id,
                ucretModeli,
                oran ? parseFloat(oran) : null,
                sabitUcret ? parseFloat(sabitUcret) : null,
                onOdeme ? 1 : 0,
                tahminiSure,
                aciklama || null
            ]
        );

        // Teklif verirken ödeme kaydı oluşturulmaz. Ödeme kaydı teklif seçildikten sonra avukat ödeme yaptığında oluşturulacak.

        // Dava teklif sayısını artır
        await conn.execute(
            'UPDATE cases SET teklif_sayisi = teklif_sayisi + 1 WHERE id = ?', [caseId]
        );

        await conn.commit();
        conn.release();
        res.status(201).json({ message: 'Teklifiniz gönderildi.', id });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { }
        conn.release();
        if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ error: 'Bu davaya zaten teklif verdiniz.' });
        console.error('offers POST error:', err);
        res.status(500).json({ error: 'Teklif gönderilirken hata.' });
    }
});

// ---- GET /api/offers/case/:caseId - Teklifleri Listele (Anonim) ----
router.get('/case/:caseId', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    try {
        const [cases] = await pool.execute(
            'SELECT kullanici_id FROM cases WHERE id = ?', [req.params.caseId]
        );
        if (!cases.length || cases[0].kullanici_id !== req.user.id)
            return res.status(403).json({ error: 'Yetkisiz.' });

        const [rows] = await pool.execute(
            `SELECT id, ucret_modeli, oran, sabit_ucret, on_odeme, tahmini_sure, aciklama, status, created_at, avukat_id
       FROM offers WHERE case_id = ? ORDER BY created_at ASC`,
            [req.params.caseId]
        );

        const mappedOffers = await Promise.all(rows.map(async (o, i) => {
            const [yorums] = await pool.execute(
                `SELECT puan, yorum, created_at 
                 FROM avukat_yorumlari 
                 WHERE avukat_id = ? ORDER BY created_at DESC`,
                [o.avukat_id]
            );

            const ortalamaPuan = yorums.length > 0 ? (yorums.reduce((sum, y) => sum + y.puan, 0) / yorums.length).toFixed(1) : 0;

            return {
                id: o.id,
                teklifNo: i + 1,
                ucretModeli: o.ucret_modeli,
                oran: o.oran,
                sabitUcret: o.sabit_ucret,
                onOdeme: !!o.on_odeme,
                tahminiSure: o.tahmini_sure,
                aciklama: o.aciklama,
                status: o.status,
                createdAt: o.created_at,
                ortalamaPuan: parseFloat(ortalamaPuan),
                yorumSayisi: yorums.length,
                yorumlar: yorums
            };
        }));

        res.json(mappedOffers);
    } catch (err) {
        console.error('offers GET case error:', err);
        res.status(500).json({ error: 'Teklifler getirilirken hata.' });
    }
});

// ---- PUT /api/offers/:id/sec - Teklif Seç (Kullanıcı Tarafından) ----
// Kullanıcı teklif seçince belgeler seçilen avukata açılır
// Avukat belgeleri inceleyip KABUl ya da VAZGECecek
router.put('/:id/sec', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [offers] = await conn.execute(
            `SELECT o.*, c.kullanici_id, c.tahmini_alacak, c.status as case_status
       FROM offers o JOIN cases c ON c.id = o.case_id
       WHERE o.id = ?`,
            [req.params.id]
        );
        if (!offers.length) { await conn.rollback(); return res.status(404).json({ error: 'Teklif bulunamadı.' }); }

        const offer = offers[0];
        if (offer.kullanici_id !== req.user.id) { await conn.rollback(); return res.status(403).json({ error: 'Yetkisiz.' }); }
        if (offer.case_status !== 'OPEN' && offer.case_status !== 'MATCHING') {
            await conn.rollback(); return res.status(400).json({ error: 'Bu dava için teklif seçilemez.' });
        }

        // Diğer teklifleri reddet
        await conn.execute('UPDATE offers SET status = "REJECTED" WHERE case_id = ? AND id != ?', [offer.case_id, req.params.id]);

        // Seçilen teklifi işaretle
        await conn.execute('UPDATE offers SET status = "SELECTED", selected_at = NOW() WHERE id = ?', [req.params.id]);

        // Dava statüsünü MATCHING yap - belgeler seçilen avukata açılacak
        await conn.execute(
            `UPDATE cases SET status = 'MATCHING', secilen_avukat_id = ?, secilen_teklif_id = ? WHERE id = ?`,
            [offer.avukat_id, req.params.id, offer.case_id]
        );

        // Engagement Yarat - Avukat inceleme bekliyor (WAITING_LAWYER_REVIEW)
        const engagementId = uuidv4();
        await conn.execute(
            `INSERT INTO engagements (id, case_id, offer_id, kullanici_id, avukat_id, status)
             VALUES (?, ?, ?, ?, ?, 'WAITING_LAWYER_REVIEW')`,
            [engagementId, offer.case_id, req.params.id, offer.kullanici_id, offer.avukat_id]
        );

        await conn.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
       VALUES (?, 'MATCHING', 'Teklif seçildi. İspat belgeleri avukata açıldı. Avukat inceleme yapıyor.', ?, 'kullanici')`,
            [offer.case_id, req.user.id]
        );

        // AVUKATA BİLDİRİM GÖNDER: Teklifiniz seçildi!
        try {
            await conn.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'NEW_OFFER', '🎯 Teklifiniz Seçildi!', ?, ?, 0)`,
                [uuidv4(), offer.avukat_id,
                    'Bir müvekkil sizin teklifinizi seçti! Hemen ispat belgelerini inceleyin ve davayı kabul edip etmeyeceğinizi bildirin.',
                offer.case_id]
            );
        } catch (notifErr) {
            console.warn('Avukat bildirimi eklenemedi:', notifErr.message);
        }

        await conn.commit();
        res.json({ message: 'Teklif seçildi! Avukat belgelerinizi inceleyip onay verecek.', engagementId });
    } catch (err) {
        await conn.rollback();
        console.error('offers sec error:', err);
        res.status(500).json({ error: 'Teklif seçilirken hata.' });
    } finally {
        conn.release();
    }
});

// ---- PUT /api/offers/:id/kabul - Avukat Dosyayı Kabul Ediyor ----
// Avukat belgeleri inceledikten sonra davayı kabul eder
// Kullanıcıya 99 TL güven bedeli bildirimi gider
router.put('/:id/kabul', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Teklifi ve engagement'u bul
        const [offers] = await conn.execute(
            `SELECT o.*, c.kullanici_id, c.status as case_status
             FROM offers o JOIN cases c ON c.id = o.case_id
             WHERE o.id = ? AND o.avukat_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!offers.length) {
            await conn.rollback();
            return res.status(404).json({ error: 'Teklif bulunamadı veya size ait değil.' });
        }

        const offer = offers[0];
        if (offer.status !== 'SELECTED' || offer.case_status !== 'MATCHING') {
            await conn.rollback();
            return res.status(400).json({ error: 'Bu dava şu an kabul için uygun değil.' });
        }

        // En son engagement'u bul
        const [engs] = await conn.execute(
            `SELECT * FROM engagements WHERE offer_id = ? AND avukat_id = ? ORDER BY created_at DESC LIMIT 1`,
            [req.params.id, req.user.id]
        );
        if (!engs.length || engs[0].status !== 'WAITING_LAWYER_REVIEW') {
            await conn.rollback();
            return res.status(400).json({ error: 'Kabul etmek için uygun aşama değil.' });
        }

        const engagement = engs[0];

        // Engagement statüsünü WAITING_USER_DEPOSIT yap
        await conn.execute(
            `UPDATE engagements SET status = 'WAITING_USER_DEPOSIT' WHERE id = ?`,
            [engagement.id]
        );

        // Case statüsü MATCHING olarak kalıyor ama log kaydı at
        await conn.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
             VALUES (?, 'MATCHING', 'Avukat dosyayı inceledi ve kabul etti. Kullanıcıdan 99 TL güven bedeli bekleniyor.', ?, 'avukat')`,
            [offer.case_id, req.user.id]
        );

        // Kullanıcıya bildirim gönder: Avukat kabul etti, 99 TL sırası
        try {
            await conn.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'AVUKAT_KABUL', '✅ Avukatınız Dosyanızı Kabul Etti!', ?, ?, 0)`,
                [uuidv4(), offer.kullanici_id,
                    'Belgeleri inceleyen avukatınız dosyanızı kabul ederek devam etmek istediğini bildirdi. → Davalarım sayfasından 99 TL güven bedelini ödeyerek süreci başlatın!',
                offer.case_id]
            );
        } catch (notifErr) {
            console.warn('Bildirim eklenemedi:', notifErr.message);
        }

        await conn.commit();
        res.json({ message: 'Dosyayı kabul ettiniz! Kullanıcıya bildirim gönderildi. Güven ödemesini bekliyorsunuz.' });
    } catch (err) {
        await conn.rollback();
        console.error('offers kabul error:', err);
        res.status(500).json({ error: 'Kabul işlemi sırasında hata.' });
    } finally {
        conn.release();
    }
});

// ---- POST /api/offers/:id/kullanici-odeme - 99 TL Güven Bedeli ----
// Avukat kabul ettikten sonra kullanıcı bu ödemeyi yapar
router.post('/:id/kullanici-odeme', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    const { kartNo, kartSahibi, sonKullanma, cvv } = req.body;
    if (!kartNo || !kartSahibi || !sonKullanma || !cvv) return res.status(400).json({ error: 'Kart bilgileri eksik.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [engs] = await conn.execute(
            `SELECT * FROM engagements WHERE offer_id = ? AND kullanici_id = ? ORDER BY created_at DESC LIMIT 1`,
            [req.params.id, req.user.id]
        );
        // Avukat'n kabul etmis olmasi gerekiyor (WAITING_USER_DEPOSIT)
        if (!engs.length || engs[0].status !== 'WAITING_USER_DEPOSIT') {
            await conn.rollback(); return res.status(400).json({ error: 'Avukat henüz kabul etmedi veya ödeme bekleyen bir işlem yok.' });
        }

        const engagement = engs[0];

        // 99 TL Ödeme kaydı
        const paymentId = uuidv4();
        await conn.execute(
            `INSERT INTO payments (id, case_id, offer_id, kullanici_id, avukat_id, tutar, kart_son_dort, status)
             VALUES (?, ?, ?, ?, ?, 99, ?, 'COMPLETED')`,
            [paymentId, engagement.case_id, req.params.id, req.user.id, engagement.avukat_id, kartNo.slice(-4)]
        );

        // Engagement ve Case statüsü güncelle
        await conn.execute(
            `UPDATE engagements SET status = 'WAITING_LAWYER_PAYMENT', amount_paid_by_user = 99 WHERE id = ?`,
            [engagement.id]
        );

        await conn.execute(
            `UPDATE cases SET status = 'WAITING_LAWYER_PAYMENT' WHERE id = ?`,
            [engagement.case_id]
        );

        await conn.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
       VALUES (?, 'WAITING_LAWYER_PAYMENT', 'Kullanıcı 99 TL güven bedelini ödedi. Avukat platform bedeli bekleniyor.', ?, 'kullanici')`,
            [engagement.case_id, req.user.id]
        );

        // AVUKATA BİLDİRİM GÖNDER: Güven bedeli ödendi, sıra sizde!
        try {
            await conn.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'GENEL', '💳 Müvekkil Ödemeyi Yaptı!', ?, ?, 0)`,
                [uuidv4(), engagement.avukat_id,
                    'Müvekkil 99 TL güven bedelini ödedi. Şimdi sıra sizde! Platform hizmet bedelini ödeyerek süreci başlatabilir ve müvekkil ile mesajlaşmaya başlayabilirsiniz.',
                engagement.case_id]
            );
        } catch (notifErr) {
            console.warn('Avukat bildirimi eklenemedi:', notifErr.message);
        }

        await conn.commit();
        res.json({ message: 'Güven bedeli alındı! Avukatınız platform bedelini ödeyince süreç başlıyor.' });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: 'Ödeme sırasında hata.' });
    } finally {
        if (conn) conn.release();
    }
});


// ---- POST /api/offers/:id/avukat-odeme - Avukat Hizmet Bedeli Ödemesi ----
router.post('/:id/avukat-odeme', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    const { kartNo, kartSahibi, sonKullanma, cvv } = req.body;
    if (!kartNo || !kartSahibi || !sonKullanma || !cvv) return res.status(400).json({ error: 'Kart bilgileri eksik.' });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [engs] = await conn.execute(
            `SELECT e.*, c.tahmini_alacak FROM engagements e JOIN cases c ON c.id = e.case_id WHERE e.offer_id = ? AND e.avukat_id = ? ORDER BY e.created_at DESC LIMIT 1`,
            [req.params.id, req.user.id]
        );
        if (!engs.length || engs[0].status !== 'WAITING_LAWYER_PAYMENT') {
            await conn.rollback(); return res.status(400).json({ error: 'Ödeme yapabileceğiniz uygun bir durum yok.' });
        }

        const engagement = engs[0];
        const alacak = parseFloat(engagement.tahmini_alacak) || 0;

        // Platform bedeli (Dinamik)
        const [settings] = await conn.execute(`SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('hizmet_bedeli_0_20','hizmet_bedeli_20_50','hizmet_bedeli_50_plus')`);
        const s = {}; settings.forEach(r => { s[r.setting_key] = parseFloat(r.setting_value); });
        let tutar = s.hizmet_bedeli_50_plus || 2000;
        if (alacak < 20000) tutar = s.hizmet_bedeli_0_20 || 750;
        else if (alacak < 50000) tutar = s.hizmet_bedeli_20_50 || 1250;

        const paymentId = uuidv4();
        await conn.execute(
            `INSERT INTO payments (id, case_id, offer_id, kullanici_id, avukat_id, tutar, kart_son_dort, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
            [paymentId, engagement.case_id, req.params.id, engagement.kullanici_id, req.user.id, tutar, kartNo.slice(-4)]
        );

        // Engagement Status -> PRE_CASE_REVIEW
        await conn.execute(
            `UPDATE engagements SET status = 'PRE_CASE_REVIEW', amount_paid_by_lawyer = ? WHERE id = ?`,
            [tutar, engagement.id]
        );

        // Case Status -> PRE_CASE_REVIEW
        await conn.execute(
            `UPDATE cases SET status = 'PRE_CASE_REVIEW', odeme_id = ? WHERE id = ?`,
            [paymentId, engagement.case_id]
        );

        await conn.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
       VALUES (?, 'PRE_CASE_REVIEW', 'Avukat platform bedelini ödedi. Ön inceleme ve anonim iletişim başladı.', ?, 'avukat')`,
            [engagement.case_id, req.user.id]
        );

        // Kullanıcıya bildirim gönder: Avukat ödeme yaptı, dosyayı inceliyor
        try {
            await conn.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'AVUKAT_KABUL', '✅ Avukatınız Dosyanızı İnceliyor!', ?, ?, 0)`,
                [uuidv4(), engagement.kullanici_id,
                    'Seçtiğiniz avukat platform bedelini ödedi ve dosyanızı incelemeye başladı. Avukat dosyayı inceleyip onaylarsa size bildirim gelecektir.',
                engagement.case_id]
            );
        } catch (notifErr) {
            console.warn('Bildirim eklenemedi (notifications tablosu eksik olabilir):', notifErr.message);
        }

        await conn.commit();
        res.json({ message: 'Ödeme başarılı! Ön inceleme ve anonim mesajlaşma başladı.' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('avukat odeme error:', err);
        res.status(500).json({ error: 'Ödeme sırasında hata.' });
    } finally {
        if (conn) conn.release();
    }
});



// ---- PUT /api/offers/:id/vazgec - Avukat Tekliften Vazgeç ----
router.put('/:id/vazgec', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [offers] = await conn.execute(
            `SELECT o.*, c.status as case_status FROM offers o JOIN cases c ON c.id = o.case_id WHERE o.id = ? AND o.avukat_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!offers.length) { await conn.rollback(); return res.status(404).json({ error: 'Teklif bulunamadı veya size ait değil.' }); }

        const offer = offers[0];

        // Ensure state allows withdrawal (cant withdraw if already in advanced stages)
        if (['DURUSMA', 'TAHSIL', 'KAPANDI', 'CLOSED', 'CANCELED'].includes(offer.case_status)) {
            await conn.rollback(); return res.status(400).json({ error: 'Bu aşamada tekliften vazgeçilemez.' });
        }

        // Cancel the offer
        await conn.execute('UPDATE offers SET status = "REJECTED_BY_LAWYER" WHERE id = ?', [req.params.id]);

        // Revert case back to OPEN
        await conn.execute(
            `UPDATE cases SET status = 'OPEN', secilen_avukat_id = NULL, secilen_teklif_id = NULL WHERE id = ?`,
            [offer.case_id]
        );

        // Cancel Engagement
        await conn.execute(
            `UPDATE engagements SET status = 'CANCELLED_BY_LAWYER' WHERE offer_id = ?`,
            [req.params.id]
        );

        await conn.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
       VALUES (?, 'OPEN', 'Avukat tekliften vazgeçti. Dava tekrar tekliflere açıldı.', ?, 'avukat')`,
            [offer.case_id, req.user.id]
        );

        // Kullanıcıya bildirim gönder: Avukat vazgeçti
        try {
            // Dava sahibini bul
            const [caseOwner] = await conn.execute(
                'SELECT kullanici_id FROM cases WHERE id = ?', [offer.case_id]
            );
            if (caseOwner.length) {
                await conn.execute(
                    `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                     VALUES (?, ?, 'AVUKAT_VAZGECTI', '⚠️ Avukatınız Dosyadan Vazgeçti', ?, ?, 0)`,
                    [uuidv4(), caseOwner[0].kullanici_id,
                        'İnceleme sonucunda seçtiğiniz avukat bu dosyayı üstlenmekten vazgeçti. Davanız tekrar teklif havuzuna alındı. Yeni avukatlardan teklif alabilirsiniz.',
                    offer.case_id]
                );
            }
        } catch (notifErr) {
            console.warn('Bildirim eklenemedi (notifications tablosu eksik olabilir):', notifErr.message);
        }

        await conn.commit();
        res.json({ message: 'Teklifiniz iptal edildi. Dosya tekrar havuza döndü.' });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('vazgec error:', err);
        res.status(500).json({ error: 'İptal edilirken bir hata oluştu.' });
    } finally {
        if (conn) conn.release();
    }
});

module.exports = router;
