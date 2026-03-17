// =============================================
// HakPortal - Admin Route v2.0 (MySQL)
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// Tüm admin rotaları için kimlik doğrulama
router.use(authMiddleware, roleMiddleware('admin'));

// ---- GET /api/admin/istatistik ----
router.get('/istatistik', async (req, res) => {
    try {
        const [[users]] = await pool.execute('SELECT COUNT(*) as c FROM users WHERE role = "kullanici"');
        const [[avukatlar]] = await pool.execute('SELECT COUNT(*) as c FROM users WHERE role = "avukat"');
        const [[bekleyenAv]] = await pool.execute(
            `SELECT COUNT(*) as c FROM users u
             LEFT JOIN avukat_profiller ap ON ap.user_id = u.id
             WHERE u.role = 'avukat' AND (ap.profil_onay = 0 OR ap.profil_onay IS NULL) AND u.is_active = 1`
        );
        const [[toplamDava]] = await pool.execute('SELECT COUNT(*) as c FROM cases');
        const [[acikDava]] = await pool.execute('SELECT COUNT(*) as c FROM cases WHERE status = "OPEN"');
        const [[aktifDava]] = await pool.execute('SELECT COUNT(*) as c FROM cases WHERE status IN ("ACTIVE","IN_PROGRESS","ILK_GORUSME","DAVA_ACILDI","DURUSMA","TAHSIL")');
        const [[odemeler]] = await pool.execute('SELECT COALESCE(SUM(tutar),0) as toplam FROM payments');
        const [[hesap]] = await pool.execute(
            `SELECT setting_value FROM system_settings WHERE setting_key = 'toplam_hesaplama'`
        );

        res.json({
            kullaniciSayisi: users.c,
            avukatSayisi: avukatlar.c,
            bekleyenAvukat: bekleyenAv.c,
            toplamDava: toplamDava.c,
            acikDava: acikDava.c,
            aktifDava: aktifDava.c,
            toplamOdeme: parseFloat(odemeler.toplam),
            toplamHesaplama: parseInt(hesap?.setting_value) || 0
        });
    } catch (err) {
        console.error('admin istatistik error:', err);
        res.status(500).json({ error: 'İstatistikler alınırken hata.' });
    }
});

// ---- GET /api/admin/avukatlar ----
router.get('/avukatlar', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT u.id, u.email, u.ad, u.soyad, u.sehir, u.is_active, u.created_at,
                    ap.baro, ap.baro_no, ap.uzmanlik, ap.profil_onay, ap.onay_tarihi
             FROM users u
             LEFT JOIN avukat_profiller ap ON ap.user_id = u.id
             WHERE u.role = 'avukat'
             ORDER BY ap.profil_onay ASC, u.created_at DESC`
        );
        res.json(rows.map(r => ({
            id: r.id, email: r.email, ad: r.ad, soyad: r.soyad, sehir: r.sehir,
            isActive: !!r.is_active, createdAt: r.created_at,
            baro: r.baro, baroNo: r.baro_no, uzmanlik: r.uzmanlik,
            profilOnay: !!r.profil_onay, onayTarihi: r.onay_tarihi
        })));
    } catch (err) {
        console.error('admin avukatlar error:', err);
        res.status(500).json({ error: 'Avukatlar alınırken hata.' });
    }
});

// ---- PUT /api/admin/avukat/:id/onayla ----
router.put('/avukat/:id/onayla', async (req, res) => {
    try {
        await pool.execute('UPDATE users SET is_active = 1 WHERE id = ?', [req.params.id]);
        await pool.execute(
            'UPDATE avukat_profiller SET profil_onay = 1, onay_tarihi = NOW() WHERE user_id = ?',
            [req.params.id]
        );
        res.json({ message: 'Avukat profili onaylandı.' });
    } catch (err) {
        console.error('admin onayla error:', err);
        res.status(500).json({ error: 'Onaylama sırasında hata.' });
    }
});

// ---- PUT /api/admin/avukat/:id/reddet ----
router.put('/avukat/:id/reddet', async (req, res) => {
    try {
        await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
        await pool.execute('UPDATE avukat_profiller SET profil_onay = 0 WHERE user_id = ?', [req.params.id]);
        res.json({ message: 'Avukat profili askıya alındı.' });
    } catch (err) {
        console.error('admin reddet error:', err);
        res.status(500).json({ error: 'İşlem sırasında hata.' });
    }
});

// ---- GET /api/admin/kullanicilar ----
router.get('/kullanicilar', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT id, email, ad, soyad, sehir, is_active, created_at
             FROM users WHERE role = 'kullanici'
             ORDER BY created_at DESC`
        );
        res.json(rows.map(r => ({
            id: r.id, email: r.email, ad: r.ad, soyad: r.soyad,
            sehir: r.sehir, isActive: !!r.is_active, createdAt: r.created_at
        })));
    } catch (err) {
        console.error('admin kullanicilar error:', err);
        res.status(500).json({ error: 'Kullanıcılar alınırken hata.' });
    }
});

// ---- PUT /api/admin/kullanici/:id/ban ----
router.put('/kullanici/:id/ban', async (req, res) => {
    try {
        await pool.execute('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Kullanıcı askıya alındı.' });
    } catch (err) {
        res.status(500).json({ error: 'İşlem sırasında hata.' });
    }
});

// ---- PUT /api/admin/kullanici/:id/aktif ----
router.put('/kullanici/:id/aktif', async (req, res) => {
    try {
        await pool.execute('UPDATE users SET is_active = 1 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Kullanıcı aktifleştirildi.' });
    } catch (err) {
        res.status(500).json({ error: 'İşlem sırasında hata.' });
    }
});

// ---- GET /api/admin/davalar ----
router.get('/davalar', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.id, c.sehir, c.dava_turu, c.tahmini_alacak, c.gerceklesen_tahsilat, c.status, c.created_at,
                    c.secilen_avukat_id,
                    u.email  AS kullanici_email,
                    u.ad     AS kullanici_ad,
                    u.soyad  AS kullanici_soyad,
                    av.ad    AS avukat_ad,
                    av.soyad AS avukat_soyad
             FROM cases c
             JOIN users u  ON u.id  = c.kullanici_id
             LEFT JOIN users av ON av.id = c.secilen_avukat_id
             ORDER BY c.created_at DESC
             LIMIT 500`
        );
        res.json(rows.map(r => ({
            id: r.id,
            sehir: r.sehir,
            davaTuru: r.dava_turu,
            tahminiAlacak: parseFloat(r.tahmini_alacak),
            gerceklesenTahsilat: r.gerceklesen_tahsilat ? parseFloat(r.gerceklesen_tahsilat) : null,
            status: r.status,
            createdAt: r.created_at,
            kullaniciEmail: r.kullanici_email,
            kullaniciAd: r.kullanici_ad,
            kullaniciSoyad: r.kullanici_soyad,
            avukatAd: r.avukat_ad,
            avukatSoyad: r.avukat_soyad
        })));
    } catch (err) {
        console.error('admin davalar error:', err);
        res.status(500).json({ error: 'Davalar alınırken hata.' });
    }
});

// ---- PUT /api/admin/dava/:id/kapat ----
router.put('/dava/:id/kapat', async (req, res) => {
    const { tahsilat } = req.body;
    try {
        if (tahsilat) {
            await pool.execute('UPDATE cases SET status = "KAPANDI", gerceklesen_tahsilat = ? WHERE id = ?', [tahsilat, req.params.id]);
        } else {
            await pool.execute('UPDATE cases SET status = "KAPANDI" WHERE id = ?', [req.params.id]);
        }

        await pool.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
             VALUES (?, 'KAPANDI', ?, ?, 'admin')`,
            [req.params.id, tahsilat ? `Admin tarafından kapatıldı. Tahsilat: ${tahsilat} TL` : 'Admin tarafından kapatıldı.', req.user.id]
        );
        res.json({ message: 'Dava kapatıldı.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Dava kapatılırken hata.' });
    }
});

// ---- GET /api/admin/dava/:id/detay ----
router.get('/dava/:id/detay', async (req, res) => {
    try {
        const [logs] = await pool.execute(
            `SELECT l.id, l.status, l.aciklama, l.created_at, u.ad, u.soyad, l.guncelleyen_rol
             FROM case_status_logs l
             LEFT JOIN users u ON u.id = l.guncelleyen_id
             WHERE l.case_id = ? ORDER BY l.created_at DESC`,
            [req.params.id]
        );
        const [messages] = await pool.execute(
            `SELECT m.id, m.icerik, m.gonderen_rol, m.tarih, u.ad, u.soyad
             FROM messages m
             JOIN users u ON u.id = m.gonderen_id
             WHERE m.case_id = ? ORDER BY m.tarih ASC`,
            [req.params.id]
        );
        res.json({ logs, messages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Detaylar alınırken hata.' });
    }
});

// ---- GET /api/admin/odemeler ----
router.get('/odemeler', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT p.id, p.case_id, p.tutar, p.kart_son_dort, p.status, p.tarih,
                    u.email AS kullanici_email,
                    av.ad  AS avukat_ad, av.soyad AS avukat_soyad
             FROM payments p
             JOIN users u  ON u.id = p.kullanici_id
             LEFT JOIN users av ON av.id = p.avukat_id
             ORDER BY p.tarih DESC`
        );
        res.json(rows.map(r => ({
            id: r.id,
            caseId: r.case_id,
            tutar: parseFloat(r.tutar),
            kartSonDort: r.kart_son_dort,
            status: r.status,
            tarih: r.tarih,
            kullaniciEmail: r.kullanici_email,
            avukatAd: r.avukat_ad ? `${r.avukat_ad} ${r.avukat_soyad || ''}`.trim() : null
        })));
    } catch (err) {
        console.error('admin odemeler error:', err);
        res.status(500).json({ error: 'Ödemeler alınırken hata.' });
    }
});

// ---- PUT /api/admin/ayarlar ----
router.put('/ayarlar', async (req, res) => {
    const { kidemTavani, hizmetBedeliSkala } = req.body;
    try {
        if (kidemTavani !== undefined) {
            await pool.execute(
                `INSERT INTO system_settings (setting_key, setting_value) VALUES ('kidem_tavani', ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
                [String(kidemTavani)]
            );
        }
        if (hizmetBedeliSkala && Array.isArray(hizmetBedeliSkala)) {
            const keys = ['hizmet_bedeli_0_20', 'hizmet_bedeli_20_50', 'hizmet_bedeli_50_plus'];
            for (let i = 0; i < Math.min(hizmetBedeliSkala.length, 3); i++) {
                await pool.execute(
                    `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
                    [keys[i], String(hizmetBedeliSkala[i].ucret)]
                );
            }
        }
        res.json({ message: 'Ayarlar güncellendi.' });
    } catch (err) {
        console.error('admin ayarlar error:', err);
        res.status(500).json({ error: 'Ayarlar güncellenirken hata.' });
    }
});

module.exports = router;
