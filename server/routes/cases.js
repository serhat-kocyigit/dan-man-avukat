// =============================================
// HakPortal - Cases Route (MySQL)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// Şehir normalize: Dropdown'dan doğru fmt geliyor, trim + ilk harf büyük
// Eşleşme avukat.js citySlug() ile yapılır
function normalizeCity(s) {
    if (!s) return '';
    const t = s.trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---- POST /api/cases - Dava Oluştur ----
router.post('/', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    const { sehir, davaTuru, tahminilAcak, brutMaas, hesaplamaVerisi, ispatBelgeleri } = req.body;

    if (!sehir) return res.status(400).json({ error: 'Şehir gerekli.' });

    const id = uuidv4();
    const normalizedSehir = normalizeCity(sehir); // normalize et
    try {
        const skorlar = hesaplamaVerisi?.skorlama || { hukuki: 0, veri: 0, tahsil: 0, toplam: 0, kategori: 'BILINMIYOR', notlar: [] };

        let ispat_json = null;
        if (ispatBelgeleri && Array.isArray(ispatBelgeleri) && ispatBelgeleri.length > 0) {
            ispat_json = JSON.stringify(ispatBelgeleri);
        }

        await pool.execute(
            `INSERT INTO cases (id, kullanici_id, sehir, dava_turu, tahmini_brut, tahmini_alacak, hesaplama_verisi, status, skor_hukuki, skor_veri, skor_tahsil, skor_toplam, risk_kategorisi, risk_notlari, ispat_belgeleri)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                req.user.id,
                normalizedSehir,
                davaTuru || 'kıdem-ihbar',
                parseFloat(brutMaas) || 0,
                parseFloat(tahminilAcak) || 0,
                hesaplamaVerisi ? JSON.stringify(hesaplamaVerisi) : null,
                skorlar.hukuki ?? 0,
                skorlar.veri ?? 0,
                skorlar.tahsilat ?? skorlar.tahsil ?? 0,
                skorlar.toplam ?? 0,
                skorlar.kategori ?? 'BILINMIYOR',
                JSON.stringify(skorlar.notlar || []),
                ispat_json
            ]
        );

        // Durum logu
        await pool.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
       VALUES (?, 'OPEN', 'Dava oluşturuldu.', ?, 'kullanici')`,
            [id, req.user.id]
        );

        res.status(201).json({ message: 'Dava oluşturuldu.', case: { id, sehir, status: 'OPEN' } });
    } catch (err) {
        console.error('cases POST error:', err);
        res.status(500).json({ error: 'Dava oluşturulurken hata.' });
    }
});

// ---- GET /api/cases/benim - Kullanıcının Davaları ----
router.get('/benim', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
         c.*,
         u.ad as selected_avukat_ad, u.soyad as selected_avukat_soyad, u.avatar as selected_avukat_avatar,
         (SELECT COUNT(*) FROM offers o WHERE o.case_id = c.id) AS teklif_sayisi,
         (SELECT COUNT(*) FROM offers o WHERE o.case_id = c.id AND o.status = 'PENDING') AS bekleyen_teklif,
         (SELECT COUNT(*) FROM messages m WHERE m.case_id = c.id AND m.gonderen_id != c.kullanici_id AND m.okundu = 0) AS okunmamis_mesaj,
         (SELECT aciklama FROM case_status_logs l WHERE l.case_id = c.id AND l.status = 'TAHSIL' ORDER BY l.id DESC LIMIT 1) AS tahsil_log,
         (SELECT e.status FROM engagements e WHERE e.case_id = c.id ORDER BY e.created_at DESC LIMIT 1) AS engagement_status
       FROM cases c
       LEFT JOIN users u ON c.secilen_avukat_id = u.id
       WHERE c.kullanici_id = ?
       ORDER BY c.created_at DESC`,
            [req.user.id]
        );

        res.json(rows.map(r => ({
            id: r.id,
            sehir: r.sehir,
            davaTuru: r.dava_turu,
            tahminiAlacak: parseFloat(r.tahmini_alacak),
            status: r.status,
            teklifSayisi: r.teklif_sayisi,
            bekleyenTeklif: r.bekleyen_teklif,
            okunmamisMesaj: r.okunmamis_mesaj || 0,
            avukatAd: r.selected_avukat_ad,
            avukatSoyad: r.selected_avukat_soyad,
            avukatAvatar: r.selected_avukat_avatar,
            tahsilAciklama: r.tahsil_log,
            // Engagement durumu: WAITING_LAWYER_REVIEW veya WAITING_USER_DEPOSIT (avukat kabul edince)
            engagementStatus: r.engagement_status || null,
            hesaplamaVerisi: r.hesaplama_verisi ? (typeof r.hesaplama_verisi === 'string' ? JSON.parse(r.hesaplama_verisi) : r.hesaplama_verisi) : null,
            createdAt: r.created_at
        })));
    } catch (err) {
        console.error('cases GET benim error:', err);
        res.status(500).json({ error: 'Davalar getirilirken hata.' });
    }
});


// ---- GET /api/cases/:id - Dava Detayı ----
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.*, u.ad, u.soyad, u.avatar, u.email as kullanici_email, u.telefon
       FROM cases c
       JOIN users u ON u.id = c.kullanici_id
       WHERE c.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Dava bulunamadı.' });

        const c = rows[0];
        // Yetki kontrolü: sadece dava sahibi, o davanın avukatı veya admin
        if (req.user.role === 'kullanici' && c.kullanici_id !== req.user.id)
            return res.status(403).json({ error: 'Yetkisiz.' });

        // Teklifleri de getir
        const [teklifler] = await pool.execute(
            `SELECT o.*, u.ad, u.soyad, u.avatar FROM offers o
       JOIN users u ON u.id = o.avukat_id
       WHERE o.id = o.id AND o.case_id = ?`,
            [c.id]
        );

        let kullaniciBilgi = null;
        let avukatBilgi = null;

        const isKimlikAcik = ['PRE_CASE_REVIEW', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'FILED_IN_COURT', 'DURUSMA', 'TAHSIL', 'CLOSED', 'KAPANDI'].includes(c.status);
        const isIletisimAcik = ['FILED_IN_COURT', 'IN_PROGRESS', 'DURUSMA', 'TAHSIL', 'CLOSED', 'KAPANDI'].includes(c.status);

        if (isKimlikAcik) {
            if (req.user.id === c.secilen_avukat_id || req.user.role === 'admin') {
                kullaniciBilgi = {
                    ad: c.ad,
                    soyad: c.soyad,
                    avatar: c.avatar,
                    email: isIletisimAcik ? c.kullanici_email : undefined,
                    telefon: isIletisimAcik ? c.telefon : undefined
                };
            }
            if (req.user.id === c.kullanici_id || req.user.role === 'admin') {
                // Seçilen avukat bilgilerini getir
                const [av] = await pool.execute(
                    `SELECT u.ad, u.soyad, u.avatar, u.email, u.telefon, ap.baro, ap.baro_no
                     FROM users u JOIN avukat_profiller ap ON ap.user_id = u.id
                     WHERE u.id = ?`,
                    [c.secilen_avukat_id]
                );
                if (av.length) {
                    avukatBilgi = {
                        ad: av[0].ad,
                        soyad: av[0].soyad,
                        avatar: av[0].avatar,
                        baro: av[0].baro,
                        baroNo: av[0].baro_no,
                        email: isIletisimAcik ? av[0].email : undefined,
                        telefon: isIletisimAcik ? av[0].telefon : undefined
                    };
                }
            }
        }

        res.json({
            id: c.id, sehir: c.sehir, davaTuru: c.dava_turu,
            tahminiAlacak: parseFloat(c.tahmini_alacak),
            status: c.status, createdAt: c.created_at,
            hesaplamaVerisi: c.hesaplama_verisi,
            kullanici: kullaniciBilgi,
            avukat: avukatBilgi,
            teklifler: teklifler.map(t => ({
                id: t.id, ucretModeli: t.ucret_modeli,
                oran: t.oran, sabitUcret: t.sabit_ucret,
                tahminiSure: t.tahmini_sure, status: t.status,
                avukatAd: t.ad, avukatSoyad: t.soyad
            }))
        });
    } catch (err) {
        console.error('cases GET id error:', err);
        res.status(500).json({ error: 'Dava detayı getirilirken hata.' });
    }
});

// ---- GET /api/cases/sehir/:sehir - Avukat için şehirdeki davalar ----
router.get('/sehir/:sehir', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
         c.id, c.sehir, c.dava_turu, c.tahmini_alacak, c.status, c.created_at,
         (SELECT COUNT(*) FROM offers o WHERE o.case_id = c.id) AS teklif_sayisi,
         (SELECT COUNT(*) FROM offers o WHERE o.case_id = c.id AND o.avukat_id = ?) AS teklif_verildi
       FROM cases c
       WHERE c.sehir LIKE ? AND c.status = 'OPEN'
       ORDER BY c.created_at DESC`,
            [req.user.id, `%${req.params.sehir}%`]
        );

        res.json(rows.map(r => ({
            id: r.id, sehir: r.sehir, davaTuru: r.dava_turu,
            tahminiAlacak: parseFloat(r.tahmini_alacak),
            status: r.status, createdAt: r.created_at,
            teklifSayisi: r.teklif_sayisi,
            teklifVerildi: r.teklif_verildi > 0
        })));
    } catch (err) {
        console.error('cases sehir error:', err);
        res.status(500).json({ error: 'Davalar getirilirken hata.' });
    }
});

// ---- PUT /api/cases/:id/status - Durum Güncelle ----
router.put('/:id/status', authMiddleware, async (req, res) => {
    const { status, aciklama } = req.body;
    const allowedStatuses = ['OPEN', 'MATCHING', 'WAITING_PAYMENT', 'WAITING_LAWYER_PAYMENT', 'PRE_CASE_REVIEW', 'PENDING_USER_AUTH', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'IN_PROGRESS', 'FILED_IN_COURT', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL', 'CLOSED', 'KAPANDI'];

    if (!allowedStatuses.includes(status))
        return res.status(400).json({ error: 'Geçersiz durum.' });

    try {
        const [rows] = await pool.execute('SELECT * FROM cases WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Dava bulunamadı.' });
        const c = rows[0];

        // Kullanıcı sadece kendi davasını değiştirebilir; avukat aktif davalarını; admin hepsini
        if (req.user.role === 'kullanici' && c.kullanici_id !== req.user.id)
            return res.status(403).json({ error: 'Yetkisiz.' });
        if (req.user.role === 'avukat' && c.secilen_avukat_id !== req.user.id)
            return res.status(403).json({ error: 'Yetkisiz.' });

        if (req.body.tahsilat !== undefined && req.body.tahsilat !== null) {
            await pool.execute('UPDATE cases SET status = ?, gerceklesen_tahsilat = ? WHERE id = ?', [status, parseFloat(req.body.tahsilat), c.id]);
        } else {
            await pool.execute('UPDATE cases SET status = ? WHERE id = ?', [status, c.id]);
        }
        await pool.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
       VALUES (?, ?, ?, ?, ?)`,
            [c.id, status, aciklama || null, req.user.id, req.user.role]
        );

        if (status === 'CLOSED' && req.body.puan && req.body.yorum) {
            const yId = require('uuid').v4(); // Ensuring we uniquely grab v4 locally if needed
            await pool.execute(
                `INSERT INTO avukat_yorumlari (id, case_id, avukat_id, kullanici_id, puan, yorum) VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE puan = ?, yorum = ?`,
                [yId, c.id, c.secilen_avukat_id, req.user.id, parseInt(req.body.puan), req.body.yorum, parseInt(req.body.puan), req.body.yorum]
            ).catch(e => console.error("Yorum ekleme hatasi:", e));
        }

        res.json({ message: `Durum güncellendi: ${status}`, status });
    } catch (err) {
        console.error('cases status PUT error:', err);
        res.status(500).json({ error: 'Durum güncellenirken hata.' });
    }
});

// ---- DELETE /api/cases/:id - Dava Sil ----
router.delete('/:id', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT kullanici_id, status FROM cases WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Dava bulunamadı.' });

        const d = rows[0];
        if (d.kullanici_id !== req.user.id) {
            return res.status(403).json({ error: 'Bu ilanı silme yetkiniz yok.' });
        }

        if (d.status !== 'OPEN' && d.status !== 'MATCHING') {
            return res.status(400).json({ error: 'İşlem görmüş veya ödeme aşamasına geçmiş davalar silinemez.' });
        }

        // cascade delete will handle engagements, offers, and case logs due to ibfk constraints,
        // but we explicitly delete what is safe.
        await pool.execute('DELETE FROM cases WHERE id = ?', [req.params.id]);

        res.json({ message: 'Dava ilanı başarıyla silindi.' });
    } catch (err) {
        console.error('cases DELETE error:', err);
        res.status(500).json({ error: 'Dava silinirken sunucu hatası oluştu.' });
    }
});

// ---- POST /api/cases/:id/avukat-yorum - Avukat Dosya Tutarlılık Değerlendirmesi ----
router.post('/:id/avukat-yorum', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const { id } = req.params;
        const { yorum } = req.body;

        if (!yorum) return res.status(400).json({ error: 'Lütfen bir değerlendirme yazın.' });

        const [rows] = await pool.execute('SELECT secilen_avukat_id, status FROM cases WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ error: 'Dava bulunamadı.' });

        const c = rows[0];
        if (c.secilen_avukat_id !== req.user.id) {
            return res.status(403).json({ error: 'Geri bildirim yapmak için bu davaya atanmış olmalısınız.' });
        }

        await pool.execute('UPDATE cases SET avukat_yorumu = ? WHERE id = ?', [yorum, id]);

        res.json({ message: 'Değerlendirmeniz sisteme kaydedildi. Dosya tutarlılığına katkınız için teşekkürler.' });
    } catch (err) {
        console.error('avukat-yorum error:', err);
        res.status(500).json({ error: 'Yorum kaydedilirken bir hata oluştu.' });
    }
});

module.exports = router;
