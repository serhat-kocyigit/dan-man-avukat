// =============================================
// HakPortal - Notifications Route
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

// ---- GET /api/notifications - Bildirimleri Listele ----
router.get('/', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('notifications GET error:', err);
        res.status(500).json({ error: 'Bildirimler alınırken hata.' });
    }
});

// ---- GET /api/notifications/count - Okunmamış Sayısı ----
router.get('/count', authMiddleware, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT COUNT(*) as sayi FROM notifications WHERE user_id = ? AND okundu = 0`,
            [req.user.id]
        );
        res.json({ sayi: rows[0].sayi || 0 });
    } catch (err) {
        res.status(500).json({ error: 'Sayım alınırken hata.' });
    }
});

// ---- PUT /api/notifications/tumunu-oku - Tüm Bildirimleri Okundu İşaretle ----
// NOT: Bu route, /:id/oku'dan ÖNCE tanımlanmalı! (Express route matching)
router.put('/tumunu-oku', authMiddleware, async (req, res) => {
    try {
        await pool.execute(
            `UPDATE notifications SET okundu = 1 WHERE user_id = ? AND okundu = 0`,
            [req.user.id]
        );
        res.json({ message: 'Tümü okundu.' });
    } catch (err) {
        res.status(500).json({ error: 'Güncelleme hatası.' });
    }
});

// ---- PUT /api/notifications/:id/oku - Bildirimi Okundu İşaretle ----
router.put('/:id/oku', authMiddleware, async (req, res) => {
    try {
        await pool.execute(
            `UPDATE notifications SET okundu = 1 WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );
        res.json({ message: 'Okundu işaretlendi.' });
    } catch (err) {
        res.status(500).json({ error: 'Güncelleme hatası.' });
    }
});


module.exports = router;
