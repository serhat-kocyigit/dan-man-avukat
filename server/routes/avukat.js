// =============================================
// HakPortal - Avukat Route (MySQL) - GÜNCELLENMİŞ
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// Şehir adını normalize et: "istanbul" → "Istanbul"
function normalizeCity(s) {
    if (!s) return '';
    return s.trim()
        .toLowerCase()
        .replace(/i̇/g, 'i').replace(/\bı\b/g, 'i')
        .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ı/g, 'i')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// Şehir karşılaştırması için ASCII-safe sürüm
function citySlug(s) {
    if (!s) return '';
    return s.trim().toLowerCase()
        .replace(/ı/g, 'i').replace(/i̇/g, 'i')
        .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o');
}

// ---- GET /api/avukat/profil ----
router.get('/profil', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT u.id, u.email, u.ad, u.soyad, u.sehir, u.telefon, u.avatar, u.is_active,
              ap.unvan, ap.baro, ap.baro_no, ap.sicil_no, ap.mezuniyet_yili, ap.deneyim_yil,
              ap.bio, ap.uzmanlik, ap.profil_onay, ap.onay_tarihi
       FROM users u
       LEFT JOIN avukat_profiller ap ON ap.user_id = u.id
       WHERE u.id = ?`,
            [req.user.id]
        );

        if (!rows.length) return res.status(404).json({ error: 'Avukat bulunamadı.' });

        const a = rows[0];

        // Uzmanlık alanını güvenli bir şekilde işle (JSON veya Düz Metin)
        let uzmanlikDizi = [];
        if (a.uzmanlik) {
            try {
                // Eğer veri ["İş Hukuku"] gibi JSON formatındaysa
                uzmanlikDizi = typeof a.uzmanlik === 'string' ? JSON.parse(a.uzmanlik) : a.uzmanlik;
                // JSON.parse sonrası hala string ise (çift tırnak sorunu), virgülle ayır
                if (typeof uzmanlikDizi === 'string') {
                    uzmanlikDizi = uzmanlikDizi.split(',').map(item => item.trim());
                }
            } catch (e) {
                // Eğer JSON değilse ("İş Hukuku, Aile" gibi düz metinse), virgülle ayırıp dizi yap
                uzmanlikDizi = a.uzmanlik.split(',').map(item => item.trim());
            }
        }

        res.json({
            id: a.id,
            email: a.email,
            ad: a.ad,
            soyad: a.soyad,
            sehir: a.sehir,
            telefon: a.telefon,
            avatar: a.avatar,
            unvan: a.unvan || 'Av.',
            baro: a.baro,
            baroNo: a.baro_no,
            sicilNo: a.sicil_no,
            mezuniyetYili: a.mezuniyet_yili,
            deneyimYil: a.deneyim_yil,
            bio: a.bio,
            uzmanlik: uzmanlikDizi,
            profilOnay: !!a.profil_onay,
            onayTarihi: a.onay_tarihi
        });
    } catch (err) {
        console.error('avukat profil error:', err);
        res.status(500).json({ error: 'Profil yüklenirken bir sunucu hatası oluştu.' });
    }
});

// ---- GET /api/avukat/acik-davalar ----
router.get('/acik-davalar', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const [avRows] = await pool.execute(
            `SELECT u.sehir, ap.profil_onay
       FROM users u LEFT JOIN avukat_profiller ap ON ap.user_id = u.id
       WHERE u.id = ?`,
            [req.user.id]
        );

        if (!avRows.length) return res.status(404).json({ error: 'Avukat bulunamadı.' });
        if (!avRows[0].profil_onay) return res.status(403).json({ error: 'Profiliniz henüz onaylanmadı.' });

        const avukatSehirSlug = citySlug(avRows[0].sehir || '');

        const [rows] = await pool.execute(
            `SELECT
             c.id, c.sehir, c.dava_turu, c.tahmini_alacak, c.status, c.created_at, c.hesaplama_verisi, c.ispat_belgeleri,
             c.skor_hukuki, c.skor_veri, c.skor_tahsil, c.skor_toplam, c.risk_kategorisi, c.risk_notlari,
             u.ad as muvekkil_ad, u.soyad as muvekkil_soyad, u.avatar as muvekkil_avatar,
             (SELECT COUNT(*) FROM offers o WHERE o.case_id = c.id) AS teklif_sayisi,
             (SELECT COUNT(*) FROM offers o WHERE o.case_id = c.id AND o.avukat_id = ?) AS teklif_verildi
           FROM cases c
           JOIN users u ON u.id = c.kullanici_id
           WHERE c.status = 'OPEN'
           ORDER BY c.created_at DESC`,
            [req.user.id]
        );

        const filtrelenmis = rows.filter(r => {
            const davaSlug = citySlug(r.sehir || '');
            return davaSlug === avukatSehirSlug || davaSlug.includes(avukatSehirSlug) || avukatSehirSlug.includes(davaSlug);
        });

        res.json(filtrelenmis.map(r => ({
            id: r.id,
            sehir: r.sehir,
            davaTuru: r.dava_turu,
            tahminiAlacak: parseFloat(r.tahmini_alacak),
            status: r.status,
            createdAt: r.created_at,
            teklifSayisi: r.teklif_sayisi,
            teklifVerildi: r.teklif_verildi > 0,
            muvekkilAd: r.muvekkil_ad,
            muvekkilSoyad: r.muvekkil_soyad,
            muvekkilAvatar: r.muvekkil_avatar,
            skorHukuki: r.skor_hukuki || 0,
            skorVeri: r.skor_veri || 0,
            skorTahsil: r.skor_tahsil || 0,
            skorToplam: r.skor_toplam || 0,
            riskKategorisi: r.risk_kategorisi || 'BILINMIYOR',
            riskNotlari: r.risk_notlari ? (typeof r.risk_notlari === 'string' ? JSON.parse(r.risk_notlari) : r.risk_notlari) : [],
            ispatBelgeleri: [], // Avukat teklif vermeden & onaylanmadan ispat belgelerini göremez.
            hesaplamaVerisi: r.hesaplama_verisi ? (typeof r.hesaplama_verisi === 'string' ? JSON.parse(r.hesaplama_verisi) : r.hesaplama_verisi) : null
        })));
    } catch (err) {
        console.error('avukat acik-davalar error:', err);
        res.status(500).json({ error: 'Davalar alınırken hata.' });
    }
});

// ---- GET /api/avukat/tekliflerim ----
router.get('/tekliflerim', authMiddleware, roleMiddleware('avukat'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
             o.id, o.case_id, o.ucret_modeli, o.oran, o.sabit_ucret, o.on_odeme,
             o.tahmini_sure, o.status, o.created_at, o.selected_at,
             c.sehir as case_sehir, c.dava_turu as case_dava_turu,
             c.tahmini_alacak, c.status as case_status, c.hesaplama_verisi, c.ispat_belgeleri,
             c.skor_hukuki, c.skor_veri, c.skor_tahsil, c.skor_toplam, c.risk_kategorisi, c.risk_notlari,
             u.ad as muvekkil_ad, u.soyad as muvekkil_soyad, u.avatar as muvekkil_avatar, u.email as muvekkil_email, u.telefon as muvekkil_telefon,
             (SELECT e.status FROM engagements e WHERE e.offer_id = o.id LIMIT 1) as engagement_status,
             (SELECT COUNT(*) FROM messages m WHERE m.case_id = o.case_id AND m.gonderen_id != o.avukat_id AND m.okundu = 0) AS okunmamis_mesaj
           FROM offers o
           JOIN cases c ON c.id = o.case_id
           JOIN users u ON u.id = c.kullanici_id
           WHERE o.avukat_id = ?
           ORDER BY o.created_at DESC`,
            [req.user.id]
        );

        res.json(rows.map(r => {
            // İletişim bilgileri: Her iki ödeme de tamamlanınca açılır (PRE_CASE_REVIEW ve ötesi)
            // Avukat platform bedelini ödeyince PRE_CASE_REVIEW olur → iki taraf da ödemiş = aç ılır
            const isIletisimAcik = ['PRE_CASE_REVIEW', 'PENDING_USER_AUTH', 'AUTHORIZED', 'FILED_IN_COURT',
                'ACTIVE', 'LAWYER_ASSIGNED', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI',
                'DURUSMA', 'TAHSIL', 'CLOSED', 'KAPANDI'].includes(r.case_status);
            // İspat belgeleri:
            // - Teklif PENDING aşamasında (avukat teklif verirken) → GİZLİ
            // - Kullanıcı teklifi seçtikten sonra (MATCHING ve ötesi) → AÇIK
            // Yani sadece kendi teklifimiz SELECTED ise VE dava MATCHING+ ise belgeler açılır
            const isBelgeAcik = r.status === 'SELECTED' && [
                'MATCHING', 'WAITING_USER_DEPOSIT', 'WAITING_PAYMENT',
                'WAITING_LAWYER_PAYMENT', 'PRE_CASE_REVIEW', 'PENDING_USER_AUTH',
                'AUTHORIZED', 'FILED_IN_COURT', 'ACTIVE', 'LAWYER_ASSIGNED',
                'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA',
                'TAHSIL', 'CLOSED', 'KAPANDI'
            ].includes(r.case_status);
            return {
                id: r.id,
                caseId: r.case_id,
                ucretModeli: r.ucret_modeli,
                oran: parseFloat(r.oran),
                sabitUcret: parseFloat(r.sabit_ucret),
                onOdeme: !!r.on_odeme,
                tahminiSure: r.tahmini_sure,
                status: r.status,
                createdAt: r.created_at,
                selectedAt: r.selected_at,
                okunmamisMesaj: r.okunmamis_mesaj || 0,
                caseSehir: r.case_sehir,
                caseDavaTuru: r.case_dava_turu,
                caseStatus: r.case_status,
                tahminiAlacak: r.tahmini_alacak,
                hesaplamaVerisi: r.hesaplama_verisi ? (typeof r.hesaplama_verisi === 'string' ? JSON.parse(r.hesaplama_verisi) : r.hesaplama_verisi) : null,
                muvekkilAd: r.muvekkil_ad,
                muvekkilSoyad: r.muvekkil_soyad,
                muvekkilAvatar: r.muvekkil_avatar,
                muvekkilEmail: isIletisimAcik ? r.muvekkil_email : undefined,
                muvekkilTelefon: isIletisimAcik ? r.muvekkil_telefon : undefined,
                skorHukuki: r.skor_hukuki || 0,
                skorVeri: r.skor_veri || 0,
                skorTahsil: r.skor_tahsil || 0,
                skorToplam: r.skor_toplam || 0,
                riskKategorisi: r.risk_kategorisi || 'BILINMIYOR',
                engagementStatus: r.engagement_status || null,
                riskNotlari: r.risk_notlari ? (typeof r.risk_notlari === 'string' ? JSON.parse(r.risk_notlari) : r.risk_notlari) : [],
                ispatBelgeleri: isBelgeAcik ? (r.ispat_belgeleri ? (typeof r.ispat_belgeleri === 'string' ? JSON.parse(r.ispat_belgeleri) : r.ispat_belgeleri) : []) : [],
            };
        }));
    } catch (err) {
        console.error('avukat tekliflerim error:', err);
        res.status(500).json({ error: 'Teklifler alınırken hata.' });
    }
});

module.exports = router;