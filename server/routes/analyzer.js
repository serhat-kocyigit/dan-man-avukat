const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { authMiddleware } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '../../public/uploads/temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'scan-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
    }
});
const upload = multer({ storage });

// ============================================================
// 🔥 GELİŞMİŞ HUKUK ÖZGÜN ETİKET ÇIKARICI (Keyword Extractor)
// ============================================================
function extractInfo(rawText) {
    const findings = { rawText, dates: [], moneys: [], labels: [], fesihTuru: null };

    // 1. Tarihler (DD.MM.YYYY, D/M/YYYY, YYYY-MM-DD)
    const dateRegex = /\b(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})\b/g;
    let m;
    while ((m = dateRegex.exec(rawText)) !== null) findings.dates.push(m[0]);

    // 2. Parasal Değerler (TL, TRY, Lira içeren herhangi bir rakam)
    const moneyRegex = /\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:TL|TRY|Lira)\b/gi;
    while ((m = moneyRegex.exec(rawText)) !== null) findings.moneys.push(m[0]);

    const t = rawText.toLowerCase();

    // 3. FESİH TÜRÜ - tek bir ağırlıklı tür ata (önce en spesifik)
    // İşletmesel / Ekonomik / Organizasyo   nel Nedenlerle Fesih → KOD_04 (geçerli+)
    if (
        t.includes('işletmesel') || t.includes('ekonomik neden') || t.includes('organizasyonel') ||
        t.includes('kadro azaltım') || t.includes('küçülme') || t.includes('17. madde') ||
        t.includes('17 ve devamı') || t.includes('geçerli nedenle feshedil') ||
        t.includes('iş sözleşmesi fesih') || t.includes('iş sözleşmeniz feshedil') ||
        t.includes('sözleşmesi bildirimli olarak feshedil')
    ) {
        findings.fesihTuru = 'ISVEREN_FESHI_GECERLI'; // İşveren geçerli nedenle fesh → Kıdem+İhbar
        findings.labels.push('İşveren Geçerli Fesih (İşletmesel/Ekonomik)');
    }
    // Ahlak/Devamsızlık – 25/II
    if (
        t.includes('devamsızlık') || t.includes('göreve gelmedi') || t.includes('25/2') ||
        t.includes('25/ıı') || t.includes('ahlak ve iyi niyet') || t.includes('haklı nedenle fesih') ||
        t.includes('tutanakla tespit') || t.includes('ihtar yazısı')
    ) {
        findings.fesihTuru = findings.fesihTuru || 'ISVEREN_FESHI_AHLAK';
        findings.labels.push('Ahlak/İyiniyet İhlali veya Devamsızlık (25/2)');
    }
    // İstifa / Kendi İsteğiyle Çıkış
    if (
        t.includes('istifa') || t.includes('kendi isteğimle') || t.includes('kendi arzumla') ||
        t.includes('istifamı sunuyorum') || t.includes('görevimden ayrılıyorum')
    ) {
        findings.fesihTuru = findings.fesihTuru || 'ISCI_ISTIFASI';
        findings.labels.push('İstifa (İşçi Tarafından)');
    }
    // İkale / İbraname
    if (t.includes('ikale') || t.includes('karşılıklı anlaşma') || t.includes('ibraname') || t.includes('tüm alacaklarını aldım')) {
        findings.fesihTuru = findings.fesihTuru || 'IKALE_IBRANAME';
        findings.labels.push('İkale Sözleşmesi / İbraname');
    }
    // Askerlik Bildirimi
    if (t.includes('askerlik') || t.includes('muvazzaf') || t.includes('celp') || t.includes('sevk')) {
        findings.labels.push('Askerlik İbaresi Var');
    }
    // Emeklilik
    if (t.includes('emeklilik') || t.includes('yaşlılık aylığı') || t.includes('sgk koşulları')) {
        findings.labels.push('Emeklilik İbaresi');
    }
    // Baskı / Zorla İstifa (İşçi Baskı Altında İmzalamış Olabilir)
    if (t.includes('zorla') || t.includes('baskı') || t.includes('mecbur bırakıldım') || t.includes('imzalatıldı')) {
        findings.labels.push('Baskı/Zorlama İddası');
    }

    // 4. Alacak İddiaları / Destekleyici Bilgiler
    if (t.includes('ihbar') || t.includes('ihbar süresi')) findings.labels.push('İhbar Süresi Belirtilmiş');
    if (t.includes('kıdem')) findings.labels.push('Kıdem İbaresi Var');
    if (t.includes('fazla mesai') || t.includes('fazla çalışma')) findings.labels.push('Fazla Mesai İbaresi');
    if (t.includes('yıllık izin') || t.includes('izin ücreti')) findings.labels.push('Yıllık İzin İbaresi');
    if (t.includes('maaşım ödenmedi') || t.includes('ücret alacağı') || t.includes('ödenmemiş')) findings.labels.push('Ödenmeyen Ücret İbaresi');
    if (t.includes('elden') && (t.includes('maaş') || t.includes('ücret'))) findings.labels.push('Elden Maaş İbaresi');

    return findings;
}

router.post('/scan', authMiddleware, upload.single('dosya'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Evrak yüklenmedi.' });

    const filepath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let text = '';

    try {
        if (ext === '.pdf') {
            const buf = fs.readFileSync(filepath);
            const data = await pdfParse(buf);
            text = data.text;
        } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            const result = await Tesseract.recognize(filepath, 'tur+eng', { logger: () => { } });
            text = result.data.text;
        } else {
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
            return res.status(400).json({ error: 'Desteklenmeyen format. PDF veya görsel yükleyin.' });
        }

        const analysis = extractInfo(text);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        res.json({ success: true, analysis });

    } catch (err) {
        console.error('Analyzer error:', err);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        res.status(500).json({ error: 'Evrak Analiz Motoru hata verdi: ' + err.message });
    }
});

module.exports = router;
