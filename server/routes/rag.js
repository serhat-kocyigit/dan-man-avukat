const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const pool = require('../db/pool');

// --- OTURUM YÖNETİMİ ---

// Tüm oturumları getir
router.get('/sessions', authMiddleware, roleMiddleware('avukat', 'kullanici'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, title, created_at FROM ai_chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[RAG SESSIONS] Fetch Error:', err);
        res.status(500).json({ error: 'Sohbet oturumları yüklenemedi.' });
    }
});

// Yeni oturum oluştur
router.post('/sessions', authMiddleware, roleMiddleware('avukat', 'kullanici'), async (req, res) => {
    try {
        const { title } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO ai_chat_sessions (user_id, title) VALUES (?, ?)',
            [req.user.id, title || 'Yeni Sohbet']
        );
        res.json({ id: result.insertId, title: title || 'Yeni Sohbet' });
    } catch (err) {
        console.error('[RAG SESSIONS] Create Error:', err);
        res.status(500).json({ error: 'Yeni sohbet oluşturulamadı.' });
    }
});

// Oturumu sil
router.delete('/sessions/:id', authMiddleware, roleMiddleware('avukat', 'kullanici'), async (req, res) => {
    try {
        await pool.execute(
            'DELETE FROM ai_chat_sessions WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[RAG SESSIONS] Delete Error:', err);
        res.status(500).json({ error: 'Sohbet silinemedi.' });
    }
});

// Belirli bir oturumun mesajlarını getir
router.get('/sessions/:id/messages', authMiddleware, roleMiddleware('avukat', 'kullanici'), async (req, res) => {
    try {
        const [rows] = await pool.execute(
            'SELECT message, response, sources, created_at FROM ai_chat_history WHERE session_id = ? AND user_id = ? ORDER BY created_at ASC',
            [req.params.id, req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('[RAG MESSAGES] Fetch Error:', err);
        res.status(500).json({ error: 'Mesajlar yüklenemedi.' });
    }
});

// --- SOHBET İŞLEMLERİ ---

router.post('/chat', authMiddleware, roleMiddleware('avukat', 'kullanici'), async (req, res) => {
    try {
        let { message, sessionId } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Mesaj boş olamaz.' });
        }

        // Eğer sessionId yoksa yeni bir oturum oluştur
        if (!sessionId) {
            const title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
            const [sResult] = await pool.execute(
                'INSERT INTO ai_chat_sessions (user_id, title) VALUES (?, ?)',
                [req.user.id, title]
            );
            sessionId = sResult.insertId;
        }

        console.log(`[RAG PROXY] Avukat ${req.user.id} (Session: ${sessionId}) mesaj gönderdi: ${message.substring(0, 50)}...`);

        const ragUrl = process.env.RAG_URL || 'http://localhost:3010/api/chat';

        const response = await fetch(ragUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        if (!response.ok) {
            console.error(`[RAG PROXY] Hata: RAG sistemi ${response.status} yanıtı verdi.`);
            return res.status(502).json({ error: 'RAG sistemi şu anda yanıt vermiyor.' });
        }

        const responseText = await response.text();
        let data;
        
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            if (responseText.trim().startsWith('data:')) {
                try {
                    const lines = responseText.split('\n')
                        .filter(line => line.trim().startsWith('data:'))
                        .map(line => line.replace('data:', '').trim());
                    
                    if (lines.length === 1) {
                        data = JSON.parse(lines[0]);
                    } else {
                        let fullText = '';
                        let lastData = {};
                        for (const line of lines) {
                            try {
                                const chunk = JSON.parse(line);
                                lastData = chunk;
                                const content = chunk.token || chunk.response || chunk.message || chunk.text || chunk.content || '';
                                fullText += content;
                            } catch (e) { continue; }
                        }
                        data = { ...lastData, response: fullText };
                    }
                } catch (e2) {
                    console.error('[RAG PROXY] SSE Parse Error:', e2);
                    return res.status(500).json({ error: 'RAG sisteminden gelen veri formatı geçersiz.' });
                }
            } else {
                return res.status(500).json({ error: 'RAG sisteminden geçersiz yanıt alındı.' });
            }
        }

        // Kaydet
        try {
            const aiContent = data.response || data.token || data.message || '';
            const sourcesJson = data.sources ? JSON.stringify(data.sources) : null;
            
            await pool.execute(
                'INSERT INTO ai_chat_history (user_id, session_id, message, response, sources) VALUES (?, ?, ?, ?, ?)',
                [req.user.id, sessionId, message, aiContent, sourcesJson]
            );
        } catch (dbErr) {
            console.error('[RAG PROXY] DB Kayıt Hatası:', dbErr);
        }

        res.json({ ...data, sessionId });

    } catch (err) {
        console.error('[RAG PROXY] Beklenmedik hata:', err);
        res.status(500).json({ error: 'YZ asistanı ile bağlantı kurulurken bir hata oluştu.' });
    }
});

module.exports = router;
