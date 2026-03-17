// =============================================
// HakPortal - Messages Route (MySQL)
// =============================================
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const contactPattern = /(\+90|05\d{2}|\b0\d{10}\b|@[^\s]{2,}\.[a-z]{2,}|http[s]?:\/\/|www\.|instagram|telegram|whatsapp)/gi;

// ---- POST /api/messages - Mesaj Gönder ----
router.post('/', authMiddleware, async (req, res) => {
    const { caseId, icerik } = req.body;

    if (!caseId || !icerik?.trim())
        return res.status(400).json({ error: 'caseId ve icerik gerekli.' });

    // Eğer içerik bir dosya URL'si ise (yani /uploads/ ile başlıyorsa) regex kontrolünü atla
    if (!icerik.startsWith('/uploads/') && contactPattern.test(icerik)) {
        // İletişim blokajını sadece dava FILED_IN_COURT seviyesinden aşağıdaysa sınırlandırabiliriz 
        // Ancak daha pratik bir kural olarak direk dosya linki değilse bloke et.
        return res.status(400).json({ error: 'Mesajda iletişim bilgisi paylaşamazsınız.' });
    }

    try {
        // Dava aktif mi ve bu kullanıcı yetkili mi kontrol et
        const [rows] = await pool.execute(
            'SELECT kullanici_id, secilen_avukat_id, status FROM cases WHERE id = ?',
            [caseId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Dava bulunamadı.' });

        const c = rows[0];
        const aktifStatusler = ['PRE_CASE_REVIEW', 'PENDING_USER_AUTH', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL'];
        if (['CLOSED', 'KAPANDI'].includes(c.status)) {
            return res.status(403).json({ error: 'Bu dava kapandığı için sistem üzerinden mesajlaşmaya veya evrak gönderimine kapatılmıştır. Ancak geçmiş kayıtlarınız delil olarak tutulacaktır.' });
        }
        if (!aktifStatusler.includes(c.status))
            return res.status(403).json({ error: 'Bu dava için mesajlaşma açık değil. Önce ödeme yapın.' });

        const isKullanici = req.user.role === 'kullanici' && c.kullanici_id === req.user.id;
        const isAvukat = req.user.role === 'avukat' && c.secilen_avukat_id === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isKullanici && !isAvukat && !isAdmin)
            return res.status(403).json({ error: 'Bu davada mesajlara erişim yetkiniz yok.' });

        const id = uuidv4();
        await pool.execute(
            `INSERT INTO messages (id, case_id, gonderen_id, gonderen_rol, icerik, okundu)
       VALUES (?, ?, ?, ?, ?, 0)`,
            [id, caseId, req.user.id, req.user.role, icerik.trim()]
        );

        // 🔥 ENGAGEMENT FIRST RESPONSE TETİKLEYİCİSİ
        if (isKullanici) {
            const [engs] = await pool.execute(
                `SELECT id, first_response FROM engagements WHERE case_id = ? AND kullanici_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
                [caseId, req.user.id]
            );
            if (engs.length > 0 && !engs[0].first_response) {
                await pool.execute(`UPDATE engagements SET first_response = 1 WHERE id = ?`, [engs[0].id]);
                await pool.execute(`UPDATE cases SET status = 'IN_PROGRESS' WHERE id = ?`, [caseId]);
                await pool.execute(
                    `INSERT INTO case_status_logs (case_id, status, aciklama, guncelleyen_id, guncelleyen_rol) VALUES (?, 'IN_PROGRESS', 'Kullanıcı avukatla iletişime geçti, süreç başlatıldı.', ?, ?)`,
                    [caseId, req.user.id, 'kullanici']
                );
            }
        }

        res.status(201).json({ id, message: 'Mesaj gönderildi.' });
    } catch (err) {
        console.error('messages POST error:', err);
        res.status(500).json({ error: 'Mesaj gönderilirken hata.' });
    }
});

// ---- POST /api/messages/upload - Evrak/Dosya Yükle ----
router.post('/upload', authMiddleware, upload.single('dosya'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Lütfen bir dosya seçin.' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ message: 'Evrak başarıyla yüklendi.', url: fileUrl, originalName: req.file.originalname });
});

// ---- GET /api/messages/okunmamis-sohbet - Okunmamish Sohbet Sayisi ----
// Kaç farklı sohbette okunmamış mesaj var? (mesaj sayısı değil, sohbet sayısı)
router.get('/okunmamis-sohbet', authMiddleware, async (req, res) => {
    try {
        let query, params;
        if (req.user.role === 'kullanici') {
            query = `
                SELECT COUNT(DISTINCT m.case_id) AS sayi
                FROM messages m
                JOIN cases c ON c.id = m.case_id
                WHERE c.kullanici_id = ?
                  AND m.gonderen_id != ?
                  AND m.okundu = 0`;
            params = [req.user.id, req.user.id];
        } else if (req.user.role === 'avukat') {
            query = `
                SELECT COUNT(DISTINCT m.case_id) AS sayi
                FROM messages m
                JOIN cases c ON c.id = m.case_id
                WHERE c.secilen_avukat_id = ?
                  AND m.gonderen_id != ?
                  AND m.okundu = 0`;
            params = [req.user.id, req.user.id];
        } else {
            return res.json({ sayi: 0 });
        }
        const [rows] = await pool.execute(query, params);
        res.json({ sayi: rows[0]?.sayi || 0 });
    } catch (err) {
        console.error('okunmamis-sohbet error:', err);
        res.json({ sayi: 0 });
    }
});

// ---- GET /api/messages/:caseId - Mesajları Getir ----
router.get('/:caseId', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT kullanici_id, secilen_avukat_id, status FROM cases WHERE id = ?',
            [req.params.caseId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Dava bulunamadı.' });

        const c = rows[0];
        const isKullanici = req.user.role === 'kullanici' && c.kullanici_id === req.user.id;
        const isAvukat = req.user.role === 'avukat' && c.secilen_avukat_id === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isKullanici && !isAvukat && !isAdmin)
            return res.status(403).json({ error: 'Yetkisiz.' });

        const [messages] = await pool.execute(
            `SELECT m.id, m.case_id, m.gonderen_id, m.gonderen_rol, m.icerik, m.okundu, m.tarih,
              u.ad, u.soyad, u.avatar
       FROM messages m
       JOIN users u ON u.id = m.gonderen_id
       WHERE m.case_id = ?
       ORDER BY m.tarih ASC`,
            [req.params.caseId]
        );

        // Okundu olarak işaretle
        if (messages.length) {
            await pool.execute(
                'UPDATE messages SET okundu = 1 WHERE case_id = ? AND gonderen_id != ?',
                [req.params.caseId, req.user.id]
            );
        }

        res.json(messages.map(m => ({
            id: m.id,
            gonderenId: m.gonderen_id,
            gonderenAd: `${m.ad} ${m.soyad}`,
            avatar: m.avatar,
            rol: m.gonderen_rol,
            icerik: m.icerik,
            okundu: !!m.okundu,
            tarih: m.tarih
        })));
    } catch (err) {
        console.error('messages GET error:', err);
        res.status(500).json({ error: 'Mesajlar getirilirken hata.' });
    }
});

module.exports = router;
