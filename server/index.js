require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('./db/pool');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - Updated for profile uploads
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiting - Sadece production'da aktif
const isDev = (process.env.NODE_ENV || 'development') === 'development';

// Genel API limiti
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 dakika
    max: isDev ? 10000 : 500,  // Dev'de pratikte sınırsız, prod'da 500
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isDev,         // Dev modunda tamamen atla
    message: { error: 'Çok fazla istek gönderildi. Lütfen birkaç dakika bekleyin.' }
});

// Auth limiti (brute-force koruması) - sadece production
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 10000 : 20,
    skip: () => isDev,
    message: { error: 'Çok fazla giriş denemesi. 15 dakika bekleyin.' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.get('/api/ping', (req, res) => res.json({ pong: true }));

// --- PROFİL FOTOĞRAFI YÜKLEME (DOĞRUDAN INDEX.JS) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../public/uploads/avatars');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const hash = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar_${hash}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Sadece görsel yüklenebilir.'));
    }
});

app.post('/api/auth/upload-avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    console.log('--- [INDEX.JS] AVATAR YÜKLEME İSTEĞİ ---');
    try {
        if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi.' });
        const avatarPath = `/uploads/avatars/${req.file.filename}`;

        await pool.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.user.id]);

        const [rows] = await pool.execute('SELECT id, ad, soyad, email, role, avatar, sehir, telefon FROM users WHERE id = ?', [req.user.id]);
        res.json({ message: 'Başarılı', avatar: avatarPath, user: rows[0] });
        console.log('--- [INDEX.JS] YÜKLEME VE DB KAYDI BAŞARILI ---');
    } catch (err) {
        console.error('Upload error in index.js:', err);
        res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
    }
});

// Static files - Frontend
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get('/api/auth/test', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/hesaplama', require('./routes/hesaplama'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/avukat', require('./routes/avukat'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/analyzer', require('./routes/analyzer'));
app.use('/api/notifications', require('./routes/notifications'));

// Sayfa rotaları - SPA fallback'ten ÖNCE tanımlanmalı
app.get('/avukat', (req, res) => res.sendFile(path.join(__dirname, '../public/avukat.html')));
app.get('/avukat.html', (req, res) => res.sendFile(path.join(__dirname, '../public/avukat.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));

// API Hata Yakalayıcı (JSON döndürmesi için)
app.use('/api', (err, req, res, next) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Sunucu tarafında bir hata oluştu.'
    });
});

// SPA fallback - tüm rotaları frontend'e ilet
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const { startCron } = require('./utils/CronJobs');

// Cron Job (Otomatik durum süzgeci) Başlat
startCron();

app.listen(PORT, () => {
    console.log(`\n🚀 HakPortal Sunucusu çalışıyor: http://localhost:${PORT}`);
    console.log(`📋 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`⚖️  Hesaplama: http://localhost:${PORT}/hesaplama`);
    console.log(`\nMod: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
