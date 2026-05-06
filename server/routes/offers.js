// =============================================
// HakPortal - Avukat Listeleme & İletişim Kodu
// YENİ YASAL MODEL: Avukat teklif yarışması YOK.
// Platform avukatlara arama/listeleme hizmeti sunar.
// Kullanıcı avukatı seçer, iletişim kodunu alır,
// avukata doğrudan ulaşır. Ödeme kullanıcıdan avukata.
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// ---- GET /api/offers/avukatlar - Şehre göre onaylı avukatları listele ----
// Kullanıcı hesaplama yaptıktan sonra şehirdeki avukatları görür
router.get('/avukatlar', authMiddleware, async (req, res) => {
    const { sehir, uzmanlik, caseId } = req.query;

    try {
        const params = [];
        let talepSubquery = '0 AS talep_sayisi';
        if (caseId) {
            talepSubquery = `(SELECT COUNT(*) FROM iletisim_talepleri it 
                               WHERE it.avukat_id = u.id 
                               AND it.case_id = ? 
                               AND it.status != 'IPTAL') AS talep_sayisi`;
            params.push(caseId);
        }

        let query = `
            SELECT
                u.id,
                u.ad,
                u.soyad,
                u.avatar,
                u.sehir,
                ap.unvan,
                ap.baro,
                ap.baro_no,
                ap.mezuniyet_yili,
                ap.deneyim_yil,
                ap.bio,
                ap.uzmanlik,
                COALESCE(AVG(ay.puan), 0) AS ortalama_puan,
                COUNT(DISTINCT ay.id) AS yorum_sayisi,
                ${talepSubquery}
            FROM users u
            JOIN avukat_profiller ap ON ap.user_id = u.id
            LEFT JOIN avukat_yorumlari ay ON ay.avukat_id = u.id
            WHERE u.role = 'avukat'
              AND u.is_active = 1
              AND ap.profil_onay = 1
        `;

        if (sehir && sehir.trim()) {
            query += ' AND u.sehir LIKE ?';
            params.push(`%${sehir.trim()}%`);
        }

        query += ' GROUP BY u.id ORDER BY ortalama_puan DESC, ap.deneyim_yil DESC';

        const [rows] = await pool.execute(query, params);

        const avukatlar = rows.filter(r => {
            if (!uzmanlik || !uzmanlik.trim()) return true;
            try {
                const liste = typeof r.uzmanlik === 'string' ? JSON.parse(r.uzmanlik) : (r.uzmanlik || []);
                return liste.some(u => u.toLowerCase().includes(uzmanlik.toLowerCase()));
            } catch { return true; }
        }).map(r => ({
            id: r.id,
            ad: r.ad,
            soyad: r.soyad,
            avatar: r.avatar,
            sehir: r.sehir,
            unvan: r.unvan,
            baro: r.baro,
            baroNo: r.baro_no,
            mezuniyetYili: r.mezuniyet_yili,
            deneyimYil: r.deneyim_yil,
            bio: r.bio,
            talepGonderildi: r.talep_sayisi > 0,
            uzmanlik: (() => {
                try { return typeof r.uzmanlik === 'string' ? JSON.parse(r.uzmanlik) : (r.uzmanlik || []); } catch { return []; }
            })(),
            ortalamaPuan: parseFloat(r.ortalama_puan).toFixed(1),
            yorumSayisi: r.yorum_sayisi
        }));

        res.json(avukatlar);
    } catch (err) {
        console.error('avukatlar listele error:', err);
        res.status(500).json({ error: 'Avukatlar getirilirken hata.' });
    }
});

// ---- GET /api/offers/avukatlar/:id - Avukat detay profili ----
router.get('/avukatlar/:id', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT
                u.id, u.ad, u.soyad, u.avatar, u.sehir,
                ap.unvan, ap.baro, ap.baro_no, ap.sicil_no,
                ap.mezuniyet_yili, ap.deneyim_yil, ap.bio, ap.uzmanlik
            FROM users u
            JOIN avukat_profiller ap ON ap.user_id = u.id
            WHERE u.id = ? AND u.role = 'avukat' AND u.is_active = 1 AND ap.profil_onay = 1
        `, [req.params.id]);

        if (!rows.length) return res.status(404).json({ error: 'Avukat bulunamadı.' });

        const r = rows[0];

        // Yorumları da getir (anonim)
        const [yorumlar] = await pool.execute(`
            SELECT ay.puan, ay.yorum, ay.created_at
            FROM avukat_yorumlari ay
            WHERE ay.avukat_id = ?
            ORDER BY ay.created_at DESC
            LIMIT 10
        `, [r.id]);

        res.json({
            id: r.id,
            ad: r.ad,
            soyad: r.soyad,
            avatar: r.avatar,
            sehir: r.sehir,
            unvan: r.unvan,
            baro: r.baro,
            baroNo: r.baro_no,
            sicilNo: r.sicil_no,
            mezuniyetYili: r.mezuniyet_yili,
            deneyimYil: r.deneyim_yil,
            bio: r.bio,
            uzmanlik: (() => {
                try { return typeof r.uzmanlik === 'string' ? JSON.parse(r.uzmanlik) : (r.uzmanlik || []); } catch { return []; }
            })(),
            yorumlar: yorumlar
        });
    } catch (err) {
        console.error('avukat detay error:', err);
        res.status(500).json({ error: 'Avukat detayı getirilirken hata.' });
    }
});

// ---- POST /api/offers/iletisim-talebi - Avukata iletişim talebi gönder ----
// Kullanıcı avukat seçer → platforma kayıt olur → avukat e-posta/bildirim alır
// Avukat direkt kullanıcıya ulaşır. Platform ARACI değil REHBER platformdur.
router.post('/iletisim-talebi', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    const { avukatId, caseId, not } = req.body;

    if (!avukatId) return res.status(400).json({ error: 'Avukat ID gerekli.' });

    // İletişim notunda telefon/mail yasak
    const contactPattern = /(\+90|05\d{2}|\b0\d{10}\b|@[^\s]+\.[a-z]{2,}|http[s]?:\/\/|www\.|instagram|telegram|whatsapp)/gi;
    if (not && contactPattern.test(not)) {
        return res.status(400).json({ error: 'Not alanında iletişim bilgisi yazılamaz.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Avukat var ve onaylı mı?
        const [avukat] = await conn.execute(
            `SELECT u.id, u.ad, u.soyad, ap.profil_onay FROM users u
             JOIN avukat_profiller ap ON ap.user_id = u.id
             WHERE u.id = ? AND u.is_active = 1 AND ap.profil_onay = 1`,
            [avukatId]
        );
        if (!avukat.length) {
            await conn.rollback();
            return res.status(404).json({ error: 'Avukat bulunamadı veya onaylı değil.' });
        }

        // Aynı avukata daha önce talep var mı? (case bazlı)
        if (caseId) {
            const [mevcut] = await conn.execute(
                `SELECT id FROM iletisim_talepleri
                 WHERE kullanici_id = ? AND avukat_id = ? AND case_id = ? AND status != 'IPTAL'`,
                [req.user.id, avukatId, caseId]
            );
            if (mevcut.length) {
                await conn.rollback();
                conn.release();
                return res.status(409).json({ error: 'Bu avukata bu dosya için zaten talep gönderdiniz.' });
            }

            // [DEĞİŞİKLİK] Eskiden burada diğer bekleyen talepler iptal ediliyordu.
            // Artık kullanıcı birden fazla avukata talep gönderebilir (Yönlendirme/Arama serbestliği).
            // Diğer talepler ancak bir avukat kabul ettiğinde otomatik iptal edilecek.
        }

        const talepId = uuidv4();
        await conn.execute(
            `INSERT INTO iletisim_talepleri (id, kullanici_id, avukat_id, case_id, not_metni, status)
             VALUES (?, ?, ?, ?, ?, 'BEKLIYOR')`,
            [talepId, req.user.id, avukatId, caseId || null, not || null]
        );

        // Avukata bildirim gönder
        try {
            await conn.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'ILETISIM_TALEBI', '📞 Yeni İletişim Talebi', ?, ?, 0)`,
                [uuidv4(), avukatId,
                    `Bir kullanıcı sizinle iletişime geçmek istiyor. Panelden müvekkil taleplerinizi görüntüleyin.`,
                caseId || null]
            );
        } catch (notifErr) {
            console.warn('Bildirim gönderilemedi:', notifErr.message);
        }

        await conn.commit();
        res.status(201).json({
            message: `${avukat[0].unvan || 'Av.'} ${avukat[0].ad} ${avukat[0].soyad}'a iletişim talebiniz iletildi! Avukatınız en kısa sürede sizinle iletişime geçecektir.`,
            talepId
        });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { }
        conn.release();
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Bu avukata zaten talep gönderdiniz.' });
        console.error('iletisim-talebi error:', err);
        res.status(500).json({ error: 'Talep gönderilirken hata.' });
    } finally {
        try { conn.release(); } catch (e) { }
    }
});

// ---- GET /api/offers/taleplerim - Kullanıcının iletişim talepleri ----
router.get('/taleplerim', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT it.*, u.ad, u.soyad, u.avatar, ap.unvan, ap.baro
            FROM iletisim_talepleri it
            JOIN users u ON u.id = it.avukat_id
            JOIN avukat_profiller ap ON ap.user_id = it.avukat_id
            WHERE it.kullanici_id = ?
            ORDER BY it.created_at DESC
        `, [req.user.id]);

        res.json(rows.map(r => ({
            id: r.id,
            avukat: { id: r.avukat_id, ad: r.ad, soyad: r.soyad, avatar: r.avatar, unvan: r.unvan, baro: r.baro },
            caseId: r.case_id,
            not: r.not_metni,
            status: r.status,
            createdAt: r.created_at
        })));
    } catch (err) {
        console.error('taleplerim error:', err);
        res.status(500).json({ error: 'Talepler getirilirken hata.' });
    }
});

// ---- GET /api/offers/gelen-talepler - Avukata gelen iletişim talepleri ----
router.get('/gelen-talepler', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT it.*,
                u.ad, u.soyad, u.telefon, u.email, u.sehir,
                c.dava_turu, c.tahmini_alacak, c.skor_toplam,
                c.skor_hukuki, c.skor_veri, c.skor_tahsil,
                c.risk_kategorisi, c.risk_notlari, c.ispat_belgeleri,
                c.hesaplama_verisi
            FROM iletisim_talepleri it
            JOIN users u ON u.id = it.kullanici_id
            LEFT JOIN cases c ON c.id = it.case_id
            WHERE it.avukat_id = ?
            ORDER BY it.created_at DESC
        `, [req.user.id]);

        res.json(rows.map(r => {
            let hesaplamaVerisi = null;
            let riskNotlari = [];
            let ispatBelgeleri = [];

            if (r.case_id) {
                try { hesaplamaVerisi = typeof r.hesaplama_verisi === 'string' ? JSON.parse(r.hesaplama_verisi) : r.hesaplama_verisi; } catch (e) { }
                try { riskNotlari = typeof r.risk_notlari === 'string' ? JSON.parse(r.risk_notlari) : r.risk_notlari || []; } catch (e) { }
                try { ispatBelgeleri = typeof r.ispat_belgeleri === 'string' ? JSON.parse(r.ispat_belgeleri) : r.ispat_belgeleri || []; } catch (e) { }
            }

            return {
                id: r.id,
                kullanici: {
                    ad: r.ad,
                    soyad: r.soyad,
                    sehir: r.sehir,
                    telefon: r.status === 'KABUL' ? r.telefon : null,
                    email: r.status === 'KABUL' ? r.email : null,
                },
                dava: r.case_id ? {
                    davaTuru: r.dava_turu,
                    tahminiAlacak: parseFloat(r.tahmini_alacak),
                    skorToplam: r.skor_toplam,
                    skorHukuki: r.skor_hukuki,
                    skorVeri: r.skor_veri,
                    skorTahsil: r.skor_tahsil,
                    riskKategorisi: r.risk_kategorisi,
                    riskNotlari: riskNotlari,
                    ispatBelgeleri: ispatBelgeleri,
                    hesaplamaVerisi: hesaplamaVerisi
                } : null,
                not: r.not_metni,
                status: r.status,
                createdAt: r.created_at
            };
        }));
    } catch (err) {
        console.error('gelen-talepler error:', err);
        res.status(500).json({ error: 'Talepler getirilirken hata.' });
    }
});

// ---- PUT /api/offers/talep/:id/kabul - Avukat iletişim talebini kabul eder ----
router.put('/talep/:id/kabul', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [talepler] = await conn.execute(
            `SELECT * FROM iletisim_talepleri WHERE id = ? AND avukat_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!talepler.length) {
            await conn.rollback();
            return res.status(404).json({ error: 'Talep bulunamadı.' });
        }
        if (talepler[0].status !== 'BEKLIYOR') {
            await conn.rollback();
            return res.status(400).json({ error: 'Bu talep zaten işleme alınmış.' });
        }

        await conn.execute(
            `UPDATE iletisim_talepleri SET status = 'KABUL' WHERE id = ?`,
            [req.params.id]
        );

        // [YENİ] Bir avukat kabul ettiğine göre, aynı dava için diğer tüm BEKLEYEN talepleri iptal et
        if (talepler[0].case_id) {
            await conn.execute(
                `UPDATE iletisim_talepleri SET status = 'IPTAL' 
                 WHERE case_id = ? AND status = 'BEKLIYOR' AND id != ?`,
                [talepler[0].case_id, req.params.id]
            );
        }

        // Kullanıcıya bildirim: Avukat kabul etti
        try {
            await conn.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'AVUKAT_KABUL', '✅ Avukatınız Talebi Kabul Etti!', ?, ?, 0)`,
                [uuidv4(), talepler[0].kullanici_id,
                    'Avukatınız iletişim talebinizi kabul etti. Panelinizdeki "Taleplerim" bölümünden avukat iletişim bilgilerine ulaşabilirsiniz.',
                talepler[0].case_id]
            );
        } catch (notifErr) { console.warn('Bildirim gönderilemedi:', notifErr.message); }

        // Case varsa statüsünü güncelle
        if (talepler[0].case_id) {
            await conn.execute(
                `UPDATE cases SET status = 'ACTIVE', secilen_avukat_id = ? WHERE id = ?`,
                [req.user.id, talepler[0].case_id]
            );
            await conn.execute(
                `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
                 VALUES (?, 'ACTIVE', 'Avukat iletişim talebini kabul etti. Doğrudan iletişim başladı.', ?, 'avukat')`,
                [talepler[0].case_id, req.user.id]
            );
        }

        await conn.commit();
        res.json({ message: 'İletişim talebi kabul edildi. Kullanıcı bilgilendirildi.' });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { }
        console.error('talep kabul error:', err);
        res.status(500).json({ error: 'İşlem sırasında hata.' });
    } finally {
        conn.release();
    }
});

// ---- PUT /api/offers/talep/:id/reddet - Avukat iletişim talebini reddeder ----
router.put('/talep/:id/reddet', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [talepler] = await conn.execute(
            `SELECT * FROM iletisim_talepleri WHERE id = ? AND avukat_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!talepler.length) {
            await conn.rollback();
            return res.status(404).json({ error: 'Talep bulunamadı.' });
        }

        await conn.execute(
            `UPDATE iletisim_talepleri SET status = 'REDDEDILDI' WHERE id = ?`,
            [req.params.id]
        );

        // Kullanıcıya bildirim
        try {
            await conn.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'GENEL', '⚠️ Avukat Şu An Müsait Değil', ?, ?, 0)`,
                [uuidv4(), talepler[0].kullanici_id,
                    'Seçtiğiniz avukat şu an yeni müvekkil kabul etmiyor. Diğer avukatlar arasından uygun birini seçebilirsiniz.',
                talepler[0].case_id]
            );
        } catch (notifErr) { console.warn('Bildirim gönderilemedi:', notifErr.message); }

        await conn.commit();
        res.json({ message: 'Talep reddedildi.' });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { }
        console.error('talep reddet error:', err);
        res.status(500).json({ error: 'İşlem sırasında hata.' });
    } finally {
        conn.release();
    }
});

module.exports = router;
