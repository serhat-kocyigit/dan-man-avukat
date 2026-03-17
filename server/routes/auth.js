// =============================================
// HakPortal - Auth Route (Gelişmiş Kayıt)
// =============================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---- MULTER CONFIG (DOSYA YÜKLEME) ----
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../public/uploads/avatars');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Dosya ismini hashleyerek kaydet
        const hash = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar_${hash}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) cb(null, true);
        else cb(new Error('Sadece görsel dosyaları (.jpg, .png, .webp) yüklenebilir.'));
    }
});

// ---- Yardımcılar ----
async function findByEmail(email) {
    const [rows] = await pool.execute(
        `SELECT u.*, ap.unvan, ap.baro, ap.baro_no, ap.sicil_no, ap.mezuniyet_yili,
            ap.deneyim_yil, ap.bio, ap.uzmanlik, ap.profil_onay
     FROM users u
     LEFT JOIN avukat_profiller ap ON ap.user_id = u.id
     WHERE u.email = ?`,
        [email]
    );
    return rows[0] || null;
}

async function findById(id) {
    const [rows] = await pool.execute(
        `SELECT u.*, ap.unvan, ap.baro, ap.baro_no, ap.sicil_no, ap.mezuniyet_yili,
            ap.deneyim_yil, ap.bio, ap.uzmanlik, ap.profil_onay
     FROM users u
     LEFT JOIN avukat_profiller ap ON ap.user_id = u.id
     WHERE u.id = ?`,
        [id]
    );
    return rows[0] || null;
}

// 🚩 YENİ EKLEDİĞİMİZ ROTA - EN ÜSTE ALINDI
router.post('/upload-avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    console.log('--- PROFİL FOTOĞRAFI YÜKLEME İSTEĞİ GELDİ ---');
    try {
        if (!req.file) {
            console.log('❌ Hata: Dosya gelmedi.');
            return res.status(400).json({ error: 'Dosya seçilmedi.' });
        }

        console.log('✅ Dosya başarıyla alındı:', req.file.filename);
        const avatarPath = `/uploads/avatars/${req.file.filename}`;

        // Veritabanını güncelle (Sütun adı: avatar)
        await pool.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, req.user.id]);
        console.log('💾 Veritabanı güncellendi. Kullanıcı ID:', req.user.id);

        const updated = await findById(req.user.id);
        res.json({
            message: 'Profil fotoğrafı güncellendi.',
            avatar: avatarPath,
            user: buildUserPayload(updated)
        });
    } catch (err) {
        console.error('🔥 Yükleme Hatası (Sunucu):', err);
        res.status(500).json({ error: 'Dosya kaydedilirken sunucu hatası oluştu.' });
    }
});

function buildUserPayload(user) {
    return {
        id: user.id,
        ad: user.ad,
        soyad: user.soyad,
        email: user.email,
        role: user.role,
        avatar: user.avatar || user.ad?.charAt(0),
        sehir: user.sehir,
        telefon: user.telefon,
        profil_onay: user.profil_onay,
        unvan: user.unvan
    };
}

// ========================================
// POST /api/auth/register - Kullanıcı Kayıt
// ========================================
router.post('/register', async (req, res) => {
    const {
        ad, soyad, email, password, passwordConfirm,
        telefon, tcKimlik, dogumTarihi, sehir
    } = req.body;

    // Zorunlu alan kontrolleri
    if (!ad?.trim()) return res.status(400).json({ error: 'Ad zorunludur.' });
    if (!soyad?.trim()) return res.status(400).json({ error: 'Soyad zorunludur.' });
    if (!email?.trim()) return res.status(400).json({ error: 'E-posta zorunludur.' });
    if (!telefon?.trim()) return res.status(400).json({ error: 'Telefon numarası zorunludur.' });
    if (!dogumTarihi) return res.status(400).json({ error: 'Doğum tarihi zorunludur.' });
    if (!sehir?.trim()) return res.status(400).json({ error: 'Şehir zorunludur.' });
    if (!password) return res.status(400).json({ error: 'Şifre zorunludur.' });
    if (password.length < 8) return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır.' });
    if (password !== passwordConfirm)
        return res.status(400).json({ error: 'Şifreler eşleşmiyor.' });

    // TC Kimlik format kontrolü (opsiyonel ama girilmişse geçerli olsun)
    if (tcKimlik && (!/^\d{11}$/.test(tcKimlik)))
        return res.status(400).json({ error: 'TC Kimlik No 11 haneli rakamdan oluşmalıdır.' });

    // Telefon format kontrolü
    const telClean = telefon.replace(/[\s\-()]/g, '');
    if (!/^(0[5][0-9]{9}|0[2-4][0-9]{9})$/.test(telClean))
        return res.status(400).json({ error: 'Geçerli bir Türkiye telefon numarası girin. (Ör: 05xx xxx xx xx)' });

    // E-posta format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });

    // Yaş kontrolü (18+)
    if (dogumTarihi) {
        const yas = Math.floor((Date.now() - new Date(dogumTarihi)) / (365.25 * 24 * 3600 * 1000));
        if (yas < 18) return res.status(400).json({ error: 'Platforma 18 yaş üstü kayıt olabilirsiniz.' });
    }

    try {
        const existing = await findByEmail(email.toLowerCase().trim());
        if (existing) return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });

        const id = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 12);
        const avatar = ad.trim().charAt(0).toUpperCase();

        await pool.execute(
            `INSERT INTO users (id, email, password, role, ad, soyad, avatar, telefon, tc_kimlik, dogum_tarihi, sehir, is_active)
       VALUES (?, ?, ?, 'kullanici', ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                id,
                email.toLowerCase().trim(),
                hashedPassword,
                ad.trim(),
                soyad.trim(),
                avatar,
                telClean,
                tcKimlik?.trim() || null,
                dogumTarihi || null,
                sehir.trim()
            ]
        );

        const token = jwt.sign(
            { id, email: email.toLowerCase().trim(), role: 'kullanici' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Kayıt başarılı! Hoş geldiniz.',
            token,
            user: {
                id, ad: ad.trim(), soyad: soyad.trim(), email: email.toLowerCase().trim(),
                role: 'kullanici', avatar, sehir: sehir.trim(), telefon: telClean
            }
        });
    } catch (err) {
        console.error('register error:', err);
        res.status(500).json({ error: 'Kayıt sırasında hata oluştu.' });
    }
});

// ========================================
// POST /api/auth/avukat-basvuru
// ========================================
router.post('/avukat-basvuru', async (req, res) => {
    const {
        ad, soyad, email, password, passwordConfirm,
        telefon, sehir,
        unvan, baro, baroNo, sicilNo,
        mezuniyetYili, deneyimYil,
        uzmanlik, bio
    } = req.body;

    // Zorunlu alanlar
    const zorunlu = { ad, soyad, email, password, telefon, sehir, baro, baroNo };
    for (const [k, v] of Object.entries(zorunlu)) {
        if (!v?.toString().trim())
            return res.status(400).json({ error: `${k} alanı zorunludur.` });
    }
    if (!Array.isArray(uzmanlik) || uzmanlik.length === 0)
        return res.status(400).json({ error: 'En az bir uzmanlık alanı seçin.' });
    if (password.length < 8)
        return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır.' });
    if (password !== passwordConfirm)
        return res.status(400).json({ error: 'Şifreler eşleşmiyor.' });

    // Telefon
    const telClean = telefon.replace(/[\s\-()]/g, '');
    if (!/^(0[5][0-9]{9}|0[2-4][0-9]{9})$/.test(telClean))
        return res.status(400).json({ error: 'Geçerli bir telefon numarası girin.' });

    // E-posta
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });

    // Bio'da iletişim bilgisi yasak
    const contactPattern = /(\+90|05\d{2}|@[^\s]+\.[a-z]{2,}|http[s]?:\/\/|www\.|instagram|telegram|whatsapp)/gi;
    if (bio?.trim() && contactPattern.test(bio))
        return res.status(400).json({ error: 'Hakkınızda alanında iletişim bilgisi kullanılamaz.' });

    // Mezuniyet yılı kontrolü
    const thisYear = new Date().getFullYear();
    if (mezuniyetYili && (mezuniyetYili < 1960 || mezuniyetYili > thisYear))
        return res.status(400).json({ error: 'Geçerli bir mezuniyet yılı girin.' });

    try {
        const existing = await findByEmail(email.toLowerCase().trim());
        if (existing) return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });

        const userId = uuidv4();
        const profilId = uuidv4();
        const hashedPwd = await bcrypt.hash(password, 12);

        // users tablosuna ekle - is_active=0 (admin onayı bekleyecek)
        await pool.execute(
            `INSERT INTO users (id, email, password, role, ad, soyad, avatar, telefon, sehir, is_active)
       VALUES (?, ?, ?, 'avukat', ?, ?, ?, ?, ?, 0)`,
            [
                userId,
                email.toLowerCase().trim(),
                hashedPwd,
                ad.trim(),
                soyad.trim(),
                ad.trim().charAt(0).toUpperCase(),
                telClean,
                sehir.trim()
            ]
        );

        // avukat_profiller tablosuna ekle - profil_onay=0
        await pool.execute(
            `INSERT INTO avukat_profiller
         (id, user_id, unvan, baro, baro_no, sicil_no, mezuniyet_yili, deneyim_yil, bio, uzmanlik, profil_onay)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                profilId, userId,
                unvan?.trim() || 'Av.',
                baro.trim(),
                baroNo.trim(),
                sicilNo?.trim() || null,
                mezuniyetYili ? parseInt(mezuniyetYili) : null,
                deneyimYil ? parseInt(deneyimYil) : 0,
                bio?.trim() || null,
                JSON.stringify(uzmanlik)
            ]
        );

        res.status(201).json({
            message: 'Başvurunuz alındı! ✅\n\nAdmin ekibimiz bilgilerinizi inceledikten sonra e-posta ile bilgilendirileceksiniz. Onay sonrası sisteme giriş yapabilirsiniz.'
        });
    } catch (err) {
        console.error('avukat-basvuru error:', err);
        res.status(500).json({ error: 'Başvuru sırasında hata oluştu.' });
    }
});

// ========================================
// POST /api/auth/login
// ========================================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'E-posta ve şifre gerekli.' });

    try {
        const user = await findByEmail(email.toLowerCase().trim());
        if (!user) return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });

        if (!user.is_active && user.role === 'avukat')
            return res.status(403).json({ error: 'Avukat hesabınız henüz admin tarafından onaylanmamış.' });
        if (!user.is_active)
            return res.status(403).json({ error: 'Hesabınız askıya alınmış. Destek için iletişime geçin.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'E-posta veya şifre hatalı.' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Giriş başarılı!',
            token,
            user: buildUserPayload(user)
        });
    } catch (err) {
        console.error('login error:', err);
        res.status(500).json({ error: 'Giriş sırasında hata oluştu.' });
    }
});

// ========================================
// GET /api/auth/me
// ========================================

// ========================================
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        const u = {
            id: user.id,
            ad: user.ad,
            soyad: user.soyad,
            email: user.email,
            role: user.role,
            avatar: user.avatar || user.ad?.charAt(0),
            sehir: user.sehir,
            telefon: user.telefon,
            tcKimlik: user.tc_kimlik ? '***********' : null, // güvenlik: maskele
            dogumTarihi: user.dogum_tarihi,
            profil_onay: user.profil_onay,
            uzmanlik: user.uzmanlik ? JSON.parse(user.uzmanlik) : [],
            baro: user.baro,
            baroNo: user.baro_no,
            sicilNo: user.sicil_no,
            mezuniyetYili: user.mezuniyet_yili,
            deneyimYil: user.deneyim_yil,
            bio: user.bio,
            unvan: user.unvan
        };
        res.json(u);
    } catch (err) {
        console.error('me error:', err);
        res.status(500).json({ error: 'Profil alınırken hata oluştu.' });
    }
});

// ========================================
// PUT /api/auth/profil - Profil Güncelle
// ========================================
router.put('/profil', authMiddleware, async (req, res) => {
    const { ad, soyad, sehir, telefon, adres, avatar } = req.body;

    // 🚩 TELEFON NUMARASI ENGELLEME (05xx veya 5xx formatı)
    const phoneBlockPattern = /(05\d{1}|5\d{1})\d{7,9}/g;
    const contactPattern = /(\+90|@[^\s]+\.[a-z]{2,}|http[s]?:\/\/|www\.)/gi;

    const checkContact = (str) => {
        if (!str) return false;
        const cleanStr = str.replace(/\s/g, '');
        return phoneBlockPattern.test(cleanStr) || contactPattern.test(cleanStr);
    };

    if (checkContact(ad)) return res.status(400).json({ error: 'İsim alanında iletişim bilgisi kullanılamaz.' });
    if (checkContact(soyad)) return res.status(400).json({ error: 'Soyisim alanında iletişim bilgisi kullanılamaz.' });

    if (!ad?.trim()) return res.status(400).json({ error: 'Ad zorunludur.' });
    if (!soyad?.trim()) return res.status(400).json({ error: 'Soyad zorunludur.' });
    if (!sehir?.trim()) return res.status(400).json({ error: 'Şehir zorunludur.' });

    let telClean = null;
    if (telefon) {
        telClean = telefon.replace(/[\s\-()]/g, '');
        if (!/^(0[5][0-9]{9}|0[2-4][0-9]{9})$/.test(telClean))
            return res.status(400).json({ error: 'Geçerli bir telefon numarası girin.' });
    }

    try {
        const finalAvatar = avatar || ad.trim().charAt(0).toUpperCase();

        await pool.execute(
            `UPDATE users SET ad = ?, soyad = ?, sehir = ?,
       telefon = COALESCE(?, telefon),
       adres   = COALESCE(?, adres),
       avatar  = ?
       WHERE id = ?`,
            [ad.trim(), soyad.trim(), sehir.trim(), telClean, adres?.trim() || null, finalAvatar, req.user.id]
        );

        // Avukat bio güncelleme ve telefon kontrolü
        if (req.user.role === 'avukat') {
            const { bio, deneyimYil } = req.body;
            if (checkContact(bio))
                return res.status(400).json({ error: 'Hakkınızda alanında iletişim bilgisi/telefon kullanılamaz.' });

            await pool.execute(
                `UPDATE avukat_profiller SET
         bio          = COALESCE(?, bio),
         deneyim_yil  = COALESCE(?, deneyim_yil)
         WHERE user_id = ?`,
                [bio?.trim() || null, deneyimYil ? parseInt(deneyimYil) : null, req.user.id]
            );
        }

        const updated = await findById(req.user.id);
        res.json({
            message: 'Profiliniz güncellendi.',
            user: buildUserPayload(updated)
        });
    } catch (err) {
        console.error('profil update error:', err);
        res.status(500).json({ error: 'Profil güncellenirken hata oluştu.' });
    }
});

// ========================================
// PUT /api/auth/sifre-degistir
// ========================================
router.put('/sifre-degistir', authMiddleware, async (req, res) => {
    const { eskiSifre, yeniSifre, yeniSifreConfirm } = req.body;

    if (!eskiSifre || !yeniSifre || !yeniSifreConfirm)
        return res.status(400).json({ error: 'Tüm alanlar zorunludur.' });
    if (yeniSifre.length < 8)
        return res.status(400).json({ error: 'Yeni şifre en az 8 karakter olmalıdır.' });
    if (yeniSifre !== yeniSifreConfirm)
        return res.status(400).json({ error: 'Yeni şifreler eşleşmiyor.' });

    try {
        const [rows] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

        const isMatch = await bcrypt.compare(eskiSifre, rows[0].password);
        if (!isMatch) return res.status(400).json({ error: 'Mevcut şifreniz hatalı.' });

        const hashed = await bcrypt.hash(yeniSifre, 12);
        await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);

        res.json({ message: 'Şifreniz başarıyla değiştirildi.' });
    } catch (err) {
        console.error('sifre-degistir error:', err);
        res.status(500).json({ error: 'Şifre değiştirirken hata oluştu.' });
    }
});


module.exports = router;


