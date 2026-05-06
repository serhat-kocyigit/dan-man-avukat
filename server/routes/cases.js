// =============================================
// HakPortal - Cases Route (Yasal Model v2)
// Davalar = Kullanıcının hesaplama kayıtları.
// Artık avukatlara "iş ilanı" vermez.
// Avukat, iletişim talebi kabul ederek dosyaya erişir.
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

function normalizeCity(s) {
    if (!s) return '';
    const t = s.trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

// İzin verilen statüsler (yasal modele göre güncellenmiş)
const ALLOWED_STATUSES = [
    'KAYITLI', 'AVUKAT_ARANIYOR', 'ACTIVE',
    'PRE_CASE_REVIEW',      // Avukat evrakları inceliyor
    'PENDING_USER_AUTH',    // Avukat vekalet istedi, kullanıcı onayı bekleniyor
    'AUTHORIZED',           // Kullanıcı vekalet verdi
    'DAVA_NO_BEKLIYOR',     // Avukat mahkeme dosya numarası girdi, kullanıcı doğrulayacak
    'FILED_IN_COURT',       // Dava mahkemeye açıldı
    'IN_PROGRESS', 'DURUSMA',
    'TAHSIL',               // Avukat tahsilat bildirdi, kullanıcı onayı bekleniyor
    'CLOSED', 'CANCELED'
];

// ---- POST /api/cases - Hesaplama Kaydet ----
router.post('/', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    const { sehir, davaTuru, tahminilAcak, brutMaas, hesaplamaVerisi, ispatBelgeleri } = req.body;

    if (!sehir) return res.status(400).json({ error: 'Şehir gerekli.' });

    const id = uuidv4();
    const normalizedSehir = normalizeCity(sehir);
    try {
        const skorlar = hesaplamaVerisi?.skorlama || { hukuki: 0, veri: 0, tahsil: 0, toplam: 0, kategori: 'BILINMIYOR', notlar: [] };

        let ispat_json = null;
        if (ispatBelgeleri && Array.isArray(ispatBelgeleri) && ispatBelgeleri.length > 0) {
            ispat_json = JSON.stringify(ispatBelgeleri);
        }

        await pool.execute(
            `INSERT INTO cases (id, kullanici_id, sehir, dava_turu, tahmini_brut, tahmini_alacak,
             hesaplama_verisi, status, skor_hukuki, skor_veri, skor_tahsil, skor_toplam,
             risk_kategorisi, risk_notlari, ispat_belgeleri)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'KAYITLI', ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, req.user.id, normalizedSehir,
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

        await pool.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
             VALUES (?, 'KAYITLI', 'Hesaplama kaydedildi.', ?, 'kullanici')`,
            [id, req.user.id]
        );

        res.status(201).json({ message: 'Hesaplama kaydedildi.', case: { id, sehir: normalizedSehir, status: 'KAYITLI' } });
    } catch (err) {
        console.error('cases POST error:', err);
        res.status(500).json({ error: 'Hesaplama kaydedilirken hata.' });
    }
});

// ---- GET /api/cases/benim - Kullanıcının Hesaplamaları ----
router.get('/benim', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
               c.*,
               u.ad as selected_avukat_ad, u.soyad as selected_avukat_soyad, u.avatar as selected_avukat_avatar,
               (SELECT COUNT(*) FROM messages m WHERE m.case_id = c.id AND m.gonderen_id != c.kullanici_id AND m.okundu = 0) AS okunmamis_mesaj,
               (SELECT COUNT(*) FROM iletisim_talepleri it WHERE it.case_id = c.id AND it.status = 'BEKLIYOR') AS bekleyen_talep_sayisi
             FROM cases c
             LEFT JOIN users u ON c.secilen_avukat_id = u.id
             WHERE c.kullanici_id = ?
             ORDER BY
               -- 1) Kullanıcı aksiyonu bekleyen davalar (en üstte)
               CASE WHEN c.status IN ('KAYITLI', 'PENDING_USER_AUTH', 'DAVA_NO_BEKLIYOR', 'TAHSIL') THEN 0
                    -- 2) Aktif / devam eden davalar (ortada)
                    WHEN c.status IN ('KAPANDI', 'KAPALI', 'TAMAMLANDI', 'CLOSED') THEN 2
                    -- 3) Kapalı / tamamlanan davalar (en sonda)
                    ELSE 1
               END ASC,
               -- Aynı kategori içinde en yeniler önce
               c.created_at DESC`,
            [req.user.id]
        );

        res.json(rows.map(r => ({
            id: r.id,
            sehir: r.sehir,
            davaTuru: r.dava_turu,
            tahminiAlacak: parseFloat(r.tahmini_alacak),
            status: r.status,
            okunmamisMesaj: r.okunmamis_mesaj || 0,
            bekleyenTalepSayisi: r.bekleyen_talep_sayisi || 0,
            avukatAd: r.selected_avukat_ad,
            avukatSoyad: r.selected_avukat_soyad,
            avukatAvatar: r.selected_avukat_avatar,
            davaNo: r.dava_no || null,
            hesaplamaVerisi: r.hesaplama_verisi
                ? (typeof r.hesaplama_verisi === 'string' ? JSON.parse(r.hesaplama_verisi) : r.hesaplama_verisi)
                : null,
            createdAt: r.created_at
        })));
    } catch (err) {
        console.error('cases GET benim error:', err);
        res.status(500).json({ error: 'Hesaplamalar getirilirken hata.' });
    }
});

// ---- GET /api/cases/:id - Hesaplama Detayı ----
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.*, u.ad, u.soyad, u.avatar, u.email as kullanici_email, u.telefon
             FROM cases c
             JOIN users u ON u.id = c.kullanici_id
             WHERE c.id = ?`,
            [req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Hesaplama bulunamadı.' });

        const c = rows[0];

        // Yetki: sadece dava sahibi, atanmış avukat veya admin
        if (req.user.role === 'kullanici' && c.kullanici_id !== req.user.id)
            return res.status(403).json({ error: 'Yetkisiz.' });

        const isKimlikAcik = ['ACTIVE', 'IN_PROGRESS', 'FILED_IN_COURT', 'DURUSMA', 'TAHSIL', 'CLOSED'].includes(c.status);

        let kullaniciBilgi = null;
        let avukatBilgi = null;

        // Avukat seçildiyse ve durum uygunsa kimlik bilgileri açılır
        if (isKimlikAcik) {
            if (req.user.id === c.secilen_avukat_id || req.user.role === 'admin') {
                kullaniciBilgi = {
                    ad: c.ad, soyad: c.soyad, avatar: c.avatar,
                    email: c.kullanici_email, telefon: c.telefon
                };
            }
            if (req.user.id === c.kullanici_id || req.user.role === 'admin') {
                const [av] = await pool.execute(
                    `SELECT u.ad, u.soyad, u.avatar, u.email, u.telefon, ap.baro, ap.baro_no
                     FROM users u JOIN avukat_profiller ap ON ap.user_id = u.id
                     WHERE u.id = ?`,
                    [c.secilen_avukat_id]
                );
                if (av.length) {
                    avukatBilgi = { ad: av[0].ad, soyad: av[0].soyad, avatar: av[0].avatar, baro: av[0].baro, baroNo: av[0].baro_no, email: av[0].email, telefon: av[0].telefon };
                }
            }
        }

        res.json({
            id: c.id, sehir: c.sehir, davaTuru: c.dava_turu,
            tahminiAlacak: parseFloat(c.tahmini_alacak),
            status: c.status, createdAt: c.created_at,
            hesaplamaVerisi: c.hesaplama_verisi,
            kullanici: kullaniciBilgi,
            avukat: avukatBilgi
        });
    } catch (err) {
        console.error('cases GET id error:', err);
        res.status(500).json({ error: 'Detay getirilirken hata.' });
    }
});

// ---- GET /api/cases/avukat/tum-dosyalar - Avukatın tüm müvekkil dosyaları ----
router.get('/avukat/tum-dosyalar', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT c.*, u.ad as kullanici_ad, u.soyad as kullanici_soyad, u.sehir as kullanici_sehir, u.avatar as kullanici_avatar, u.email as kullanici_email, u.telefon as kullanici_telefon,
                    (SELECT COUNT(*) FROM messages m WHERE m.case_id = c.id AND m.gonderen_id != ? AND m.okundu = 0) as okunmamis_mesaj
             FROM cases c
             JOIN users u ON u.id = c.kullanici_id
             WHERE c.secilen_avukat_id = ?
             ORDER BY c.updated_at DESC`,
            [req.user.id, req.user.id]
        );

        res.json(rows.map(r => {
            let hesaplamaVerisi = null;
            let riskNotlari = [];
            let ispatBelgeleri = [];

            try { hesaplamaVerisi = typeof r.hesaplama_verisi === 'string' ? JSON.parse(r.hesaplama_verisi) : r.hesaplama_verisi; } catch (e) { }
            try { riskNotlari = typeof r.risk_notlari === 'string' ? JSON.parse(r.risk_notlari) : r.risk_notlari || []; } catch (e) { }
            try { ispatBelgeleri = typeof r.ispat_belgeleri === 'string' ? JSON.parse(r.ispat_belgeleri) : r.ispat_belgeleri || []; } catch (e) { }

            return {
                id: r.id, sehir: r.sehir, davaTuru: r.dava_turu,
                tahminiAlacak: parseFloat(r.tahmini_alacak),
                skorToplam: r.skor_toplam,
                skorHukuki: r.skor_hukuki,
                skorVeri: r.skor_veri,
                skorTahsil: r.skor_tahsil,
                riskKategorisi: r.risk_kategorisi,
                riskNotlari: riskNotlari,
                ispatBelgeleri: ispatBelgeleri,
                hesaplamaVerisi: hesaplamaVerisi,
                status: r.status, createdAt: r.created_at,
                okunmamisMesaj: r.okunmamis_mesaj || 0,
                kullanici: {
                    ad: r.kullanici_ad, soyad: r.kullanici_soyad,
                    sehir: r.kullanici_sehir, avatar: r.kullanici_avatar,
                    email: r.kullanici_email, telefon: r.kullanici_telefon
                }
            };
        }));
    } catch (err) {
        console.error('cases avukat tum-dosyalar error:', err);
        res.status(500).json({ error: 'Dosyalar getirilirken hata.' });
    }
});

// ---- PUT /api/cases/:id/status - Durum Güncelle ----
router.put('/:id/status', authMiddleware, async (req, res) => {
    const { status, aciklama } = req.body;

    if (!ALLOWED_STATUSES.includes(status))
        return res.status(400).json({ error: 'Geçersiz durum.' });

    try {
        const [rows] = await pool.execute('SELECT * FROM cases WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Hesaplama bulunamadı.' });
        const c = rows[0];

        if (req.user.role === 'kullanici' && c.kullanici_id !== req.user.id)
            return res.status(403).json({ error: 'Yetkisiz.' });
        if (req.user.role === 'avukat' && c.secilen_avukat_id !== req.user.id)
            return res.status(403).json({ error: 'Yetkisiz.' });

        if (req.body.tahsilat !== undefined && req.body.tahsilat !== null) {
            await pool.execute('UPDATE cases SET status = ?, gerceklesen_tahsilat = ? WHERE id = ?',
                [status, parseFloat(req.body.tahsilat), c.id]);
        } else {
            await pool.execute('UPDATE cases SET status = ? WHERE id = ?', [status, c.id]);
        }

        await pool.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
             VALUES (?, ?, ?, ?, ?)`,
            [c.id, status, aciklama || null, req.user.id, req.user.role]
        );

        // Eğer kullanıcı durumu KAYITLI'ya çekiyorsa (iptal ediyorsa), tüm bekleyen talepleri IPTAL yap
        if (status === 'KAYITLI' && req.user.role === 'kullanici') {
            await pool.execute(
                `UPDATE iletisim_talepleri SET status = 'IPTAL' WHERE case_id = ? AND status = 'BEKLIYOR'`,
                [c.id]
            );
        }

        // Yorum ekle (CLOSED durumunda)
        if (status === 'CLOSED' && req.body.puan && req.body.yorum && c.secilen_avukat_id) {
            const yId = uuidv4();
            await pool.execute(
                `INSERT INTO avukat_yorumlari (id, case_id, avukat_id, kullanici_id, puan, yorum) VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE puan = ?, yorum = ?`,
                [yId, c.id, c.secilen_avukat_id, req.user.id, parseInt(req.body.puan), req.body.yorum, parseInt(req.body.puan), req.body.yorum]
            ).catch(e => console.error('Yorum ekleme hatası:', e));

            // Avukata bildirim
            try {
                await pool.execute(
                    `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                     VALUES (?, ?, 'GENEL', '🏁 Dosya Kapandı', ?, ?, 0)`,
                    [uuidv4(), c.secilen_avukat_id,
                    `Müvekkil dosyayı kapattı ve size ${req.body.puan}/5 puan verdi.`, c.id]
                );
            } catch (e) { console.warn('Bildirim gönderilemedi:', e.message); }
        }

        // Vekalet istendi → kullanıcıya bildirim
        if (status === 'PENDING_USER_AUTH' && c.kullanici_id) {
            try {
                await pool.execute(
                    `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                     VALUES (?, ?, 'GENEL', '📋 Avukatınız Vekalet İstiyor', ?, ?, 0)`,
                    [uuidv4(), c.kullanici_id,
                        'Avukatınız evrakları yeterli buldu ve resmi vekalet talep ediyor. Panele girerek onaylayın.', c.id]
                );
            } catch (e) { console.warn('Bildirim gönderilemedi:', e.message); }
        }

        // Kullanıcı vekalet verdi → avukata bildirim
        if (status === 'AUTHORIZED' && c.secilen_avukat_id) {
            try {
                await pool.execute(
                    `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                     VALUES (?, ?, 'GENEL', '✅ Vekalet Onaylandı!', ?, ?, 0)`,
                    [uuidv4(), c.secilen_avukat_id,
                        'Müvekkiliniz resmi vekalet verdi. Artık davayı mahkemeye taşıyabilirsiniz.', c.id]
                );
            } catch (e) { console.warn('Bildirim gönderilemedi:', e.message); }
        }

        // Avukat tahsilat bildirdi → kullanıcıya bildirim
        if (status === 'TAHSIL' && c.kullanici_id) {
            try {
                await pool.execute(
                    `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                     VALUES (?, ?, 'GENEL', '💰 Tahsilat Bildirimi Geldi', ?, ?, 0)`,
                    [uuidv4(), c.kullanici_id,
                        `Avukatınız dava sonucunu ve tahsilat bilgisini bildirdi. Lütfen panelden inceleyerek onaylayın.`, c.id]
                );
            } catch (e) { console.warn('Bildirim gönderilemedi:', e.message); }
        }

        res.json({ message: `Durum güncellendi: ${status}`, status });
    } catch (err) {
        console.error('cases status PUT error:', err);
        res.status(500).json({ error: 'Durum güncellenirken hata.' });
    }
});

// ---- DELETE /api/cases/:id - Hesaplama Sil ----
router.delete('/:id', authMiddleware, roleMiddleware('kullanici'), async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT kullanici_id, status FROM cases WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Hesaplama bulunamadı.' });

        const d = rows[0];
        if (d.kullanici_id !== req.user.id)
            return res.status(403).json({ error: 'Bu hesaplamayı silme yetkiniz yok.' });

        if (['IN_PROGRESS', 'FILED_IN_COURT', 'DURUSMA'].includes(d.status))
            return res.status(400).json({ error: 'Aktif dava sürecindeki hesaplamalar silinemez.' });

        // Dava silinmeden önce, bu davaya ait tüm iletişim taleplerini iptal et
        await pool.execute(
            `UPDATE iletisim_talepleri SET status = 'IPTAL' WHERE case_id = ?`,
            [req.params.id]
        );

        await pool.execute('DELETE FROM cases WHERE id = ?', [req.params.id]);
        res.json({ message: 'Hesaplama silindi.' });
    } catch (err) {
        console.error('cases DELETE error:', err);
        res.status(500).json({ error: 'Silme sırasında hata.' });
    }
});

// ---- POST /api/cases/:id/avukat-yorum - Avukat dosya notu ekle ----
router.post('/:id/avukat-yorum', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const { yorum } = req.body;
        if (!yorum) return res.status(400).json({ error: 'Not zorunludur.' });

        const [rows] = await pool.execute('SELECT secilen_avukat_id FROM cases WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Hesaplama bulunamadı.' });
        if (rows[0].secilen_avukat_id !== req.user.id)
            return res.status(403).json({ error: 'Bu dosyaya atanmış avukat değilsiniz.' });

        await pool.execute('UPDATE cases SET avukat_yorumu = ? WHERE id = ?', [yorum, req.params.id]);
        res.json({ message: 'Dosya notunuz kaydedildi.' });
    } catch (err) {
        console.error('avukat-yorum error:', err);
        res.status(500).json({ error: 'Not kaydedilirken hata.' });
    }
});

// ---- PUT /api/cases/:id/dava-no - Avukat dava numarası girer ----
router.put('/:id/dava-no', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const { davaNo } = req.body;
        if (!davaNo?.trim()) return res.status(400).json({ error: 'Dava numarası boş olamaz.' });

        const [rows] = await pool.execute('SELECT * FROM cases WHERE id = ?', [req.params.id]);
        if (!rows.length) return res.status(404).json({ error: 'Hesaplama bulunamadı.' });
        if (rows[0].secilen_avukat_id !== req.user.id)
            return res.status(403).json({ error: 'Bu dosyaya atanmış avukat değilsiniz.' });

        await pool.execute(
            'UPDATE cases SET dava_no = ?, status = ? WHERE id = ?',
            [davaNo.trim(), 'DAVA_NO_BEKLIYOR', rows[0].id]
        );

        await pool.execute(
            `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol)
             VALUES (?, 'DAVA_NO_BEKLIYOR', ?, ?, 'avukat')`,
            [rows[0].id, `Mahkeme dosya numarası girildi, kullanıcı doğrulaması bekleniyor: ${davaNo.trim()}`, req.user.id]
        );

        // Kullanıcıya bildirim
        try {
            await pool.execute(
                `INSERT INTO notifications (id, user_id, tip, baslik, mesaj, case_id, okundu)
                 VALUES (?, ?, 'GENEL', '🏗️ Dava Dosya Numarası Geldi!', ?, ?, 0)`,
                [uuidv4(), rows[0].kullanici_id,
                `Avukatınız mahkeme dosya numarasını girdi: ${davaNo.trim()}. Lütfen kendi bilgilerinizle doğrulayarak onayla.`,
                rows[0].id]
            );
        } catch (e) { console.warn('Bildirim gönderilemedi:', e.message); }

        res.json({ message: 'Dava numarası kaydedildi.', davaNo: davaNo.trim() });
    } catch (err) {
        console.error('dava-no PUT error:', err);
        res.status(500).json({ error: 'Dava numarası kaydedilirken hata.' });
    }
});

module.exports = router;
