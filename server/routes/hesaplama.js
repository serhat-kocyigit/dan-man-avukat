// =============================================
// HakPortal - 2026 Yargıtay Uyumlu Hesap Motoru
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { defaultEngine } = require('../utils/LegalEngine');
// ================== SABİTLER (2026) ==================

const DAMGA_ORANI = 0.00759;
const SGK_ORANI = 0.15;
const KIDEM_YIL_GUN = 365;
const AYLIK_MESAI_SAATI = 225;

// Dinamik Gelir Vergisi Dilimleri (2023-2026)
const VERGI_DICTIONARY = {
    "2023": [
        { limit: 70000, oran: 0.15 }, { limit: 150000, oran: 0.20 },
        { limit: 550000, oran: 0.27 }, { limit: 1900000, oran: 0.35 }, { limit: Infinity, oran: 0.40 }
    ],
    "2024": [
        { limit: 110000, oran: 0.15 }, { limit: 230000, oran: 0.20 },
        { limit: 870000, oran: 0.27 }, { limit: 3000000, oran: 0.35 }, { limit: Infinity, oran: 0.40 }
    ],
    "2025": [
        { limit: 158000, oran: 0.15 }, { limit: 330000, oran: 0.20 },
        { limit: 1200000, oran: 0.27 }, { limit: 4300000, oran: 0.35 }, { limit: Infinity, oran: 0.40 }
    ],
    "2026": [
        { limit: 210000, oran: 0.15 }, { limit: 450000, oran: 0.20 },
        { limit: 1600000, oran: 0.27 }, { limit: 5800000, oran: 0.35 }, { limit: Infinity, oran: 0.40 }
    ]
};

function getVergiDilimleri(cikisTarihi) {
    if (!cikisTarihi) return VERGI_DICTIONARY["2026"];
    const y = cikisTarihi.getFullYear();
    if (y <= 2023) return VERGI_DICTIONARY["2023"];
    if (y === 2024) return VERGI_DICTIONARY["2024"];
    if (y === 2025) return VERGI_DICTIONARY["2025"];
    return VERGI_DICTIONARY["2026"];
}

// ================== DİNAMİK TAVANLAR ==================
const TAVAN_DICTIONARY = {
    "2023_1": { kidem: 19982.83, sgk: 100608.90 },
    "2023_2": { kidem: 23489.83, sgk: 107310.00 },
    "2024_1": { kidem: 35058.58, sgk: 150018.90 },
    "2024_2": { kidem: 41828.42, sgk: 150018.90 },
    "2025_1": { kidem: 50821.56, sgk: 205000.00 },
    "2026_1": { kidem: 64948.77, sgk: 250000.00 }
};

function getTavanlar(cikisTarihi) {
    if (!cikisTarihi) return TAVAN_DICTIONARY["2026_1"];
    const y = cikisTarihi.getFullYear();
    const m = cikisTarihi.getMonth() + 1;
    let key = "2026_1";
    if (y < 2023) { key = "2023_1"; }
    else if (y === 2023) { key = m <= 6 ? "2023_1" : "2023_2"; }
    else if (y === 2024) { key = m <= 6 ? "2024_1" : "2024_2"; }
    else if (y === 2025) { key = "2025_1"; }
    return TAVAN_DICTIONARY[key];
}

// ================== YARDIMCI ==================

const toKurus = tl => Math.round(tl * 100);
const toTL = k => k / 100;

function gunFarki(b1, b2) {
    const d1 = Date.UTC(b1.getFullYear(), b1.getMonth(), b1.getDate());
    const d2 = Date.UTC(b2.getFullYear(), b2.getMonth(), b2.getDate());
    return Math.floor((d2 - d1) / 86400000);
}

function kademeliVergi(kMatrah, kKumulatif, cikis) {
    let kalan = kMatrah;
    let toplamVergi = 0;
    let kum = kKumulatif;

    const dilimler = getVergiDilimleri(cikis);

    for (let d of dilimler) {
        const limitK = toKurus(d.limit);
        if (kum < limitK) {
            const kapasite = limitK - kum;
            const vergilenecek = Math.min(kalan, kapasite);
            toplamVergi += vergilenecek * d.oran;
            kum += vergilenecek;
            kalan -= vergilenecek;
            if (kalan <= 0) break;
        }
    }

    return {
        vergi: Math.round(toplamVergi),
        yeniKumulatif: kum
    };
}

// ================== ROUTE ==================

router.post('/kidem-ihbar', async (req, res) => {

    const {
        cikisSekli,
        isGirisTarihi,
        isCikisTarihi,
        brutMaas,
        yanHaklar,
        kullanilmayanIzin,
        fazlaMesai,
        odenmemisMaasGun,
        kumulatifMatrah,
        aiFacts // <-- UI'dan Gelen Gerçek Hukuki Olgular
    } = req.body;

    if (!isGirisTarihi || !isCikisTarihi || !brutMaas)
        return res.status(400).json({ error: "Eksik veri." });

    const giris = new Date(isGirisTarihi);
    const cikis = new Date(isCikisTarihi);

    const maas = parseFloat(brutMaas);
    const ek = parseFloat(yanHaklar) || 0;
    const giydirilmis = maas + ek;

    const izinGun = parseFloat(kullanilmayanIzin) || 0;
    const mesaiSaat = parseFloat(fazlaMesai) || 0;
    const maasGun = parseFloat(odenmemisMaasGun) || 0;

    const kKumulatif = toKurus(parseFloat(kumulatifMatrah) || 0);
    const totalGun = gunFarki(giris, cikis);

    // =====================================================
    // 🔥 YENİ HUKUKİ KARAR (LEGAL ENGINE) ÇIKARIMI
    // =====================================================
    let parsedFacts = {};
    if (aiFacts) {
        try { parsedFacts = JSON.parse(aiFacts); } catch (e) { console.error("Fact Parse Error:", e); }
    }

    // Temel tarih ve gün olgularını enjekte et
    parsedFacts.is_giris_tarihi = isGirisTarihi;
    parsedFacts.is_cikis_tarihi = isCikisTarihi;
    parsedFacts.calisma_gun_sayisi = totalGun;

    // Karar Motorunu Çalıştır
    const tip = defaultEngine.analyze(parsedFacts);

    // =====================================================
    // 1️⃣ KIDEM TAZMİNATI (FESİH TARİHİ TAVANI ESAS)
    // =====================================================

    let kBrutKidem = 0;

    const limitler = getTavanlar(cikis); // Dinamik Yıl Çekimi

    // Yalnızca motor "Kıdem alabilir" demişse hesaba girer
    if (tip.haklar.kidem) {
        const esasUcret = Math.min(giydirilmis, limitler.kidem);
        const kEsas = toKurus(esasUcret);

        kBrutKidem = Math.round((kEsas / KIDEM_YIL_GUN) * totalGun);
    }

    const kDamgaKidem = Math.round(kBrutKidem * DAMGA_ORANI);
    const kNetKidem = kBrutKidem - kDamgaKidem;

    // =====================================================
    // 2️⃣ İHBAR
    // =====================================================

    let ihbarHafta = 0;
    const yil = totalGun / 365;

    // Yalnızca motor "İhbar alabilir" demişse hesaba girer
    if (tip.haklar.ihbar) {
        if (yil < 0.5) ihbarHafta = 2;
        else if (yil < 1.5) ihbarHafta = 4;
        else if (yil < 3) ihbarHafta = 6;
        else ihbarHafta = 8;
    }

    const kBrutIhbar = toKurus((giydirilmis / 30) * (ihbarHafta * 7));

    // İhbar Tazminatında SGK kesintisi YAPILMAZ, Tavan UYGULANMAZ. (Sadece Gelir ve Damga Vergisi)
    const kGelirMatrahIhbar = kBrutIhbar;
    const vergiIhbar = kademeliVergi(kGelirMatrahIhbar, kKumulatif, cikis);

    // Vergi havuzunu güncelle (İhbar, yıllık izne vs. devredecek kümülatif matrahı artırır)
    let kGuncelKumulatif = vergiIhbar.yeniKumulatif;

    const kDamgaIhbar = Math.round(kBrutIhbar * DAMGA_ORANI);

    let kNetIhbar = 0;
    if (tip.haklar.ihbar) {
        kNetIhbar = kBrutIhbar - vergiIhbar.vergi - kDamgaIhbar;
    }

    // =====================================================
    // 3️⃣ ÖZEL TAZMİNATLAR (Kötü Niyet & Sendikal)
    // =====================================================
    let kNetKotuNiyet = 0;
    let kNetSendikal = 0;

    // Kötü Niyet => İhbar Tazminatının (Bildirim Süresi Ücretinin) 3 Katı
    if (tip.haklar.kotu_niyet && ihbarHafta > 0) {
        const kBrutKotu = kBrutIhbar * 3;
        // Kötü niyet sadece Damga ve Gelir Vergisine tabidir
        const kotuVergi = kademeliVergi(kBrutKotu, kGuncelKumulatif, cikis);
        kGuncelKumulatif = kotuVergi.yeniKumulatif;
        const kDamgaKotu = Math.round(kBrutKotu * DAMGA_ORANI);
        kNetKotuNiyet = kBrutKotu - kotuVergi.vergi - kDamgaKotu;
    }

    // Sendikal Tazminat => En az 1 Yıllık Ücret (12 Aylık Çıplak Maaş)
    if (tip.haklar.sendikal) {
        const kBrutSendikal = toKurus(maas * 12);
        const sendikalVergi = kademeliVergi(kBrutSendikal, kGuncelKumulatif, cikis);
        kGuncelKumulatif = sendikalVergi.yeniKumulatif;
        const kDamgaSendikal = Math.round(kBrutSendikal * DAMGA_ORANI);
        kNetSendikal = kBrutSendikal - sendikalVergi.vergi - kDamgaSendikal;
    }

    // =====================================================
    // 4️⃣ DİĞER ALACAKLAR (İzin, Mesai, İçeride Kalan Maaş)
    // =====================================================

    const kBrutIzin = toKurus((maas / 30) * izinGun);
    const kBrutMesai = toKurus((giydirilmis / AYLIK_MESAI_SAATI) * 1.5 * mesaiSaat);
    const kBrutMaas = toKurus((maas / 30) * maasGun);

    // Diğer alacak kalemleri SGK, Gelir Vergisi ve Damga Vergisine tabidir.
    // SGK Tavan Pro-Rata Koruması: İşçinin normal çalıştığı süre "O Ayki Maaşıyla" zaten SGK tavanının bir kısmını meşgul eder.
    const kRutunMaasSgkKorumasi = toKurus((maas / 30) * cikis.getDate());
    const kKapasiteSgk = Math.max(0, toKurus(limitler.sgk) - kRutunMaasSgkKorumasi);

    // Uygulanabilir Toplam SGK Matrahı
    const kToplamSgkMatrahiDiger = kBrutIzin + kBrutMesai + kBrutMaas;
    const kGecerliSgkMatrahi = Math.min(kToplamSgkMatrahiDiger, kKapasiteSgk);
    const kKesilecekSgkToplam = Math.round(kGecerliSgkMatrahi * SGK_ORANI);

    // SGK Kesintisini Oransal Sıçrat
    const sgkOranDiger = kToplamSgkMatrahiDiger > 0 ? (kKesilecekSgkToplam / kToplamSgkMatrahiDiger) : 0;

    const vergilendir = (brut) => {
        if (brut <= 0) return { kNet: 0 };
        const kSgk = Math.round(brut * sgkOranDiger);
        const kDamga = Math.round(brut * DAMGA_ORANI);
        const kGelirMatrah = brut - kSgk;

        const v = kademeliVergi(kGelirMatrah, kGuncelKumulatif, cikis);
        kGuncelKumulatif = v.yeniKumulatif; // Havuzu büyüt

        return { kNet: brut - kSgk - v.vergi - kDamga };
    };

    const izinSonuc = vergilendir(kBrutIzin);
    const mesaiSonuc = vergilendir(kBrutMesai);
    const maasSonuc = vergilendir(kBrutMaas);

    // =====================================================
    // 5️⃣ SÖZLEŞME VE İADE BEDELLERİ EKLENTİSİ
    // =====================================================
    let kBakiyeSureTazminati = 0;
    let kBostaGecenSureTazminati = 0;
    let kIseBaslatmamaTazminati = 0;

    if (tip.haklar.bakiye_sure_ucreti) {
        const kalanAy = parsedFacts.belirli_kalan_ay || 6; // Varsayılan 6 (Geliştirilebilir)
        kBakiyeSureTazminati = toKurus(giydirilmis * kalanAy);
    }

    if (tip.haklar.bosta_gecen_sure_ucreti) {
        kBostaGecenSureTazminati = toKurus(giydirilmis * 4); // Yasada en fazla 4 aydır
    }

    if (tip.haklar.ise_baslatmama_tazminati) {
        kIseBaslatmamaTazminati = toKurus(maas * 4); // Yasada 4-8 aydır (Min 4 alınır)
    }

    // =====================================================
    // 🔥 UZMAN LEGAL RİSK SKORU VE ÇELİŞKİ ANALİZ MOTORU
    // =====================================================
    // Toplam Max Puan: 100
    let skor_A_Hak = 10;   // Base 10, Max 40
    let skor_B_Ispat = 25;  // Base 25, Max 35
    let skor_C_Tahsil = 20; // Base 20, Max 25
    let risk_notlari = [];

    // ── Kullanıcının seçtiği beyan (wizard'dan gelen) ──
    const userCikisSekli = parsedFacts?.cikisSekli || '';       // isverenIstifasi, isciIstifasi, askerlik, emeklilik vb.
    const userFesihYapan = parsedFacts?.fesihYapan || '';       // isveren / isci
    const userIsciSebep = parsedFacts?.isciSebep || '';        // askerlik, emeklilik, hakli_neden, istifa
    const userIsverenSebep = parsedFacts?.isverenSebep || '';    // haksiz_gecerli, ahlak, saglik, sendikal…

    // OCR analiz nesnesi (wizard'da stashFilesAndContinue sırasında elde edilip aiFacts içine gömülür)
    const ocr = parsedFacts?.ocrSonuclari || null;
    const ocrLabels = ocr?.etiketler || [];
    const ocrMoneys = ocr?.ucretler || [];
    const ocrDates = ocr?.tarihler || [];
    const ocrFesihTur = ocr?.fesihTuru || null;  // Yeni alan: analyzer tarafından belirlenen tek dominant tür

    // --- A BLOĞU: HAK DOĞUMU (4857/1475 Kapsamı - Max 40 Puan) ---
    if (yil < 1) {
        risk_notlari.push("Çalışma süresi 1 yılın altında. Kıdem tazminatı yasal olarak doğmuyor.");
        if (tip.haklar.ihbar || tip.id_kod !== "ISCI_ISTIFASI") skor_A_Hak = 15;
    } else if (yil < 3) {
        skor_A_Hak += 10;
    } else if (yil < 7) {
        skor_A_Hak += 15;
    } else {
        skor_A_Hak += 20; // 7+ yıl: çok güçlü hak doğumu
    }

    // Çıkış türüne göre hak doğumu güçlendirme
    if (tip.id_kod === "KOD_04" || tip.id_kod === "KOD_04_KOTU_NIYET") {
        skor_A_Hak += 10; // İşveren haksız/geçersiz feshi → en güçlü hak doğumu
    } else if (tip.id_kod === "HAKLI_FESIH_ISCI") {
        skor_A_Hak += 8; // İşçi md.24 haklı neden (ücret ödenmemesi, mobbing vb.)
    } else if (userIsciSebep === 'askerlik') {
        skor_A_Hak += 9; // Askerlik: yasa kıdemi açıkça güvence altına alıyor (1475 md.14)
    } else if (userIsciSebep === 'emeklilik') {
        skor_A_Hak += 9; // Emeklilik: kıdem tartışmasız hak (SSK 15yr/3600gün)
    } else if (userIsciSebep === 'evlilik') {
        skor_A_Hak += 8; // Kadın işçi evlilik: 1475/14. madde güvencesi
    } else if (tip.haklar.kidem || tip.haklar.ihbar) {
        skor_A_Hak += 5;
    } else if (parsedFacts?.cikisSekli === "isciIstifasi" || tip.id_kod === "ISCI_ISTIFASI") {
        risk_notlari.push("Salt kendi isteğiyle istifa beyanı mevcut. İhbar/Kıdem hakkı zayıf dosyadır.");
        skor_A_Hak = (skor_A_Hak > 10) ? skor_A_Hak - 10 : 0;
    }
    skor_A_Hak = Math.min(40, Math.max(0, skor_A_Hak));

    // --- B BLOĞU: İSPAT VE ÇELİŞKİ DELİL SÜRECİ (Max 35 Puan) ---
    if (mesaiSaat > 100) {
        skor_B_Ispat -= 5;
        risk_notlari.push("Aşırı yüksek fazla mesai iddiası; şahit veya dijital/yazılı kayıt olmadan tam ispatı zordur.");
    }
    if (maasGun > 90) {
        skor_B_Ispat -= 10;
        risk_notlari.push("3 aydan uzun süre maaş alınmadığı beyanı hayatın olağan akışına aykırılık riski taşır.");
    }
    if (maas < 17002) {
        skor_B_Ispat -= 5;
        risk_notlari.push("Beyan edilen maaş yasal Asgari Ücretin altında; SGK ispat ve bildirim sorunlarına işaret eder.");
    }
    if (parsedFacts?.eldenOdeme === "evet") {
        skor_B_Ispat -= 15;
        risk_notlari.push("Maaşın elden ödendiği iddiası ispatı en zor dâvâ konularındandır. Mahkeme emsal araştırma yapar.");
    }
    if (parsedFacts?.yaziliFesihBelgesi === "evet") {
        skor_B_Ispat += 10;
    }
    if (totalGun < 0) {
        skor_B_Ispat = 0;
        risk_notlari.push("Tarihlerde mantıksal imkansızlık! Çıkış tarihi giriş tarihinden önce.");
    }

    // ================================================================
    // 🔥 KAPSAMLI OCR × BEYAN ÇAPRAZ DENETIM MOTORU
    // ================================================================
    if (ocr) {

        // ── 1. FESİH TÜRÜ ÇAPRAZ KARŞILAŞTIRMASI ──────────────────────
        // a) Kullanıcı "Askerlikle çıktım" der, belge "feshedilmiştir" der → ÇAKIŞMA
        if (userIsciSebep === 'askerlik') {
            if (ocrFesihTur === 'ISVEREN_FESHI_GECERLI' || ocrLabels.includes('İşveren Geçerli Fesih (İşletmesel/Ekonomik)')) {
                skor_B_Ispat -= 10;
                risk_notlari.push("🛑 OCR UYARI: 'Askerlikle çıktım' dediniz. Ancak belgede işverenin 'İşletmesel Gerekçeyle Feshettiği' görülüyor. Bu durumda kıdem hakkınız devam eder; aksi ispat riskinizi avukatla paylaşın.");
            }
            else if (ocrLabels.includes('İstifa (İşçi Tarafından)')) {
                skor_A_Hak -= 15;
                skor_B_Ispat -= 15;
                risk_notlari.push("🛑 OCR KRİTİK: 'Askerlikle çıktım' dediniz ancak belgede 'İstifa' ibaresi görünüyor. Kıdem hakkı riske giriyor, acil avukat danışması gerekli.");
            }
        }

        // b) Kullanıcı "İşveren beni kovdu (Haksız Fesih)" der, belge "İstifa / Kendi İsteği" der → SAHTE/YANLIŞ
        if ((userFesihYapan === 'isveren' && userIsverenSebep === 'haksiz_gecerli') ||
            (userCikisSekli === 'isverenIstifasi') ||
            tip.id_kod === 'KOD_04') {
            if (ocrFesihTur === 'ISCI_ISTIFASI' || ocrLabels.includes('İstifa (İşçi Tarafından)')) {
                skor_A_Hak -= 10;
                skor_B_Ispat -= 20;
                risk_notlari.push("🛑 OCR KRİTİK: 'İşveren beni haksız yere çıkardı' dediniz ama evrakta açık 'İstifa' ibaresi tespit edildi! Bu çelişki dava sürecinde büyük engel yaratır. Avukatınıza ayrıntı verin.");
            }
            else if (ocrFesihTur === 'ISVEREN_FESHI_GECERLI' || ocrLabels.includes('İşveren Geçerli Fesih (İşletmesel/Ekonomik)')) {
                skor_B_Ispat += 10;
                risk_notlari.push("✅ OCR ONAY: Yüklediğiniz belgede 'İşletmesel/Ekonomik Gerekçeyle Fesih' saptandı. Beyanınızla tutarlı, güçlü ispat zemini.");
            }
        }

        // c) Kullanıcı "Kendi çıktım (İstifa)" der, belge "Feshedilmiştir (İşveren)" der → LEH
        if (userFesihYapan === 'isci' && userIsciSebep === 'istifa') {
            if (ocrFesihTur === 'ISVEREN_FESHI_GECERLI' || ocrLabels.includes('İşveren Geçerli Fesih (İşletmesel/Ekonomik)')) {
                skor_A_Hak += 10;
                skor_B_Ispat += 10;
                risk_notlari.push("🟢 OCR LEHİNE: Kendinizin istifa ettiğini söylemenize karşın belgede işverenin sizi feshettiği görünüyor. Bu durum kıdem ve ihbar haklarınızı doğurur. Avukat görüşmesi imkânlarınızı genişletecektir.");
            }
        }

        // d) Ahlak/Devamsızlık gerekçeli belgede kıdem iddia ediyorsanız → UYARI
        if (ocrFesihTur === 'ISVEREN_FESHI_AHLAK' || ocrLabels.includes('Ahlak/İyiniyet İhlali veya Devamsızlık (25/2)')) {
            skor_A_Hak -= 8;
            skor_B_Ispat -= 10;
            risk_notlari.push("🛑 OCR DİKKAT: Belgede işveren 'Ahlak/Devamsızlık (25/2)' gerekçesiyle feshetmiş görünüyor. Bu durumda kıdem tazminatı yasal olarak düşer. İddiasının sahte olduğunu ispat etmeniz gerekiyor.");
        }

        // e) İkale / İbraname varsa → En ağır: Dava açma hakkı kısıtlı
        if (ocrFesihTur === 'IKALE_IBRANAME' || ocrLabels.includes('İkale Sözleşmesi / İbraname')) {
            skor_A_Hak -= 15;
            skor_B_Ispat -= 15;
            risk_notlari.push("🛑 OCR KRİTİK: Belgede 'İkale Sözleşmesi' veya 'İbraname' saptandı! Tüm alacaklarınızı aldığınıza dair imzaladığınız bir belge varsa, dava hakkınız büyük ölçüde ortadan kalkar. Avukatla ücret ödemeden danışın.");
        }

        // ── 2. BEYAN EDİLEN MAAŞ ile EVRAK TUTARININ KARŞILAŞTIRILMASI ─
        if (ocrMoneys.length > 0) {
            skor_B_Ispat += 5; // Para belgede bulundu → ispat desteği
            const parseMoney = (s) => {
                const cleaned = s.replace(/[^0-9,.]/g, '').replace('.', '').replace(',', '.');
                return parseFloat(cleaned) || 0;
            };
            let tutarsizlikSaptadi = false;
            for (const m of ocrMoneys) {
                const val = parseMoney(m);
                // Sadece makul maaş aralığında miktarları kontrol et (1000–maas*4)
                if (val > 1000 && val < maas * 4) {
                    if (Math.abs(val - maas) > maas * 0.45) { // %45'ten fazla sapma
                        tutarsizlikSaptadi = true;
                    }
                }
            }
            if (tutarsizlikSaptadi) {
                skor_B_Ispat -= 8;
                risk_notlari.push("🛑 OCR DİKKAT: Forma girdiğiniz maaş ile belgede geçen parasal değer arasında %45'ten yüksek tutarsızlık tespit edildi. SGK prim bazı veya bordro uyumsuzluğu olabilir.");
            }
            // Elden maaş beyanı ile belgede maaş görünmesi çelişkisi
            if (parsedFacts?.eldenOdeme === 'evet') {
                skor_B_Ispat -= 5;
                risk_notlari.push("🔍 OCR NOTU: Maaşınızın elden verildiğini söylemişsiniz. Ancak belgede resmi bir tutarın geçmesi bu iddiayı olumlu kanıtlayabilir; mutlaka avukat değerlendirmesi alın.");
            }
        }

        // ── 3. BELGE TARİHİ ile GİRİLEN ÇIKIŞ TARİHİNİN KARŞILAŞTIRILMASI ─
        if (ocrDates.length > 0) {
            const cikisYili = String(cikis.getFullYear());
            const cikisTarihi = `${cikis.getDate().toString().padStart(2, '0')}.${(cikis.getMonth() + 1).toString().padStart(2, '0')}.${cikisYili}`;
            const yilSaptandi = ocrDates.some(t => t.includes(cikisYili));
            const tamTarihUyum = ocrDates.some(t => t === cikisTarihi);
            if (tamTarihUyum) {
                skor_B_Ispat += 3;
            } else if (!yilSaptandi) {
                risk_notlari.push("🔍 OCR NOTU: Girdiğiniz fesih yılı belgedeki tarihlerde görünmüyor. Zamanaşımı riski (işçilik alacaklarında 5 yıl) avukatça teyit edilmeli.");
            }
        }

        // ── 4. MESSAİ BEYANI × BELGE TUTARSIZLIĞI (Zayıf Uyarı) ─────────
        if (mesaiSaat > 0 && !ocrLabels.includes('Fazla Mesai İbaresi')) {
            risk_notlari.push("🔍 OCR NOTU: Fazla mesai beyanınız var ancak yüklenen belgede buna dair bir ibare rastlanmadı. Şahit veya dijital kayıt kritik olacaktır.");
        }

        // ── 5. LEHİNE OCR DOĞRULAMASI (Kıdem / İhbar belirtiliyse) ──────
        if (ocrLabels.includes('İhbar Süresi Belirtilmiş')) {
            skor_B_Ispat += 5;
            risk_notlari.push("✅ OCR ONAY: Belgede ihbar süresi kullandırılacağına dair ibare var. Bu, işverenin fesih olgusunu doğrulamaktadır.");
        }
        if (ocrLabels.includes('Kıdem İbaresi Var') && tip.haklar.kidem) {
            skor_B_Ispat += 3;
        }

        // ── 6. BASKIYLA İSTİFA (zorla imzalatma) ──────────────────────────
        if (ocrLabels.includes('Baskı/Zorlama İddası') && userFesihYapan === 'isci') {
            skor_B_Ispat += 5;
            risk_notlari.push("🔍 OCR NOTU: Belgede zorlama/baskı ile imzalatma ibaresi saptandı. Bu durum 'İktisadi baskıyla istifa' kapsamında haklı feshe dönüştürülebilir; avukat tavsiyesi şarttır.");
        }
    }

    skor_B_Ispat = Math.min(35, Math.max(0, skor_B_Ispat));
    skor_A_Hak = Math.min(40, Math.max(0, skor_A_Hak));

    // --- C BLOĞU: TAHSİL EDİLEBİLİRLİK VE TİCARİ RİSK (Max 25 Puan) ---
    if (parsedFacts?.isverenTuru === "kurumsal") {
        skor_C_Tahsil += 5;
    } else if (parsedFacts?.isverenTuru === "kucuk_esnaf") {
        skor_C_Tahsil -= 5;
        risk_notlari.push("Küçük esnaftan alacağın fiili icra aşamasında tahsil riski vardır.");
    } else if (parsedFacts?.isverenTuru === "iflas_kapali") {
        skor_C_Tahsil -= 15;
        risk_notlari.push("Şirketin kapalı/iflas etmiş olduğu beyanı! Tahsili neredeyse imkansız veya çok uzun İflas Masası süreci gerektirir.");
    }
    skor_C_Tahsil = Math.min(25, Math.max(0, skor_C_Tahsil));

    // =====================================================
    // NİHAİ SKOR VE SINIFLANDIRMA (0 - 100 Ağırlıklı Ort.)
    // =====================================================
    const skor_toplam = Math.round(skor_A_Hak + skor_B_Ispat + skor_C_Tahsil);

    let risk_kategori = 'RISKLI';
    if (skor_toplam >= 85) risk_kategori = 'PREMIUM';          // Avukatın bayılacağı dosya
    else if (skor_toplam >= 70) risk_kategori = 'NORMAL';      // Güçlü dosya
    else if (skor_toplam >= 55) risk_kategori = 'RISKLI';      // Standart ama ispat pürüzleri var
    else if (skor_toplam >= 40) risk_kategori = 'DUSUK';       // Kritik düşük puan
    else risk_kategori = 'COK_RISKLI';                         // Çöpe yakın / Yüksek çelişki

    const skorlamaModul = {
        hukuki: Math.round((skor_A_Hak / 40) * 100) || 0,
        veri: Math.round((skor_B_Ispat / 35) * 100) || 0,
        tahsilat: Math.round((skor_C_Tahsil / 25) * 100) || 0,  // 'tahsilat' = tahsil EDİLEBİLİRLİK (100=kolay, 0=zor)
        toplam: skor_toplam,
        kategori: risk_kategori,
        notlar: risk_notlari
    };

    // =====================================================
    // SONUÇ
    // =====================================================

    // =====================================================
    // ALTERNATİF SENARYO HESAPLAMASI (OCR × BEYAN ÇAKIŞMASI)
    // Eğer OCR belgeden farklı bir fesih türü saptadıysa,
    // o türü esas alarak TÜM tazminatları yeniden hesapla
    // =====================================================
    let alternatifSenaryo = null;

    if (ocr && ocrFesihTur) {
        // OCR'ın söylediği fesih türünü LegalEngine formatına çevir
        const ocrFakts = {
            ...parsedFacts,
            is_giris_tarihi: isGirisTarihi,
            is_cikis_tarihi: isCikisTarihi,
            calisma_gun_sayisi: totalGun
        };

        // fesihTuru → LegalEngine conditions map
        if (ocrFesihTur === 'ISVEREN_FESHI_GECERLI') {
            ocrFakts.fesihYapan = 'isveren';
            ocrFakts.isverenSebep = 'haksiz_gecerli';
            ocrFakts.cikisSekli = undefined;
            ocrFakts.isciSebep = undefined;
        } else if (ocrFesihTur === 'ISVEREN_FESHI_AHLAK') {
            ocrFakts.fesihYapan = 'isveren';
            ocrFakts.isverenSebep = 'ahlak';
            ocrFakts.cikisSekli = undefined;
            ocrFakts.isciSebep = undefined;
        } else if (ocrFesihTur === 'ISCI_ISTIFASI') {
            ocrFakts.fesihYapan = 'isci';
            ocrFakts.isciSebep = 'istifa';
            ocrFakts.cikisSekli = undefined;
            ocrFakts.isverenSebep = undefined;
        } else if (ocrFesihTur === 'IKALE_IBRANAME') {
            ocrFakts.fesihYapan = 'isci';
            ocrFakts.isciSebep = 'istifa'; // Pratik: ikale = hak talep edemez
            ocrFakts.cikisSekli = undefined;
            ocrFakts.isverenSebep = undefined;
        }

        // Beyan ve OCR gerçekten farklı mı? (aynıysa ikinci senaryoya gerek yok)
        const beyanCikisSekli = userIsciSebep || userIsverenSebep || userCikisSekli;
        const ocrCikisSekli = ocrFakts.isciSebep || ocrFakts.isverenSebep || '';
        const farkliSenaryo = beyanCikisSekli !== ocrCikisSekli;

        if (farkliSenaryo) {
            const tipAlt = defaultEngine.analyze(ocrFakts);

            // Kıdem – Belge Senaryosunda
            let kBrutKidemAlt = 0;
            if (tipAlt.haklar.kidem && totalGun >= 365) {
                const esasUcretAlt = Math.min(giydirilmis, limitler.kidem);
                kBrutKidemAlt = Math.round((toKurus(esasUcretAlt) / KIDEM_YIL_GUN) * totalGun);
            }
            const kDamgaKidemAlt = Math.round(kBrutKidemAlt * DAMGA_ORANI);
            const kNetKidemAlt = kBrutKidemAlt - kDamgaKidemAlt;

            // İhbar – Belge Senaryosunda
            let ihbarHaftaAlt = 0;
            if (tipAlt.haklar.ihbar) {
                if (yil < 0.5) ihbarHaftaAlt = 2;
                else if (yil < 1.5) ihbarHaftaAlt = 4;
                else if (yil < 3) ihbarHaftaAlt = 6;
                else ihbarHaftaAlt = 8;
            }
            const kBrutIhbarAlt = toKurus((giydirilmis / 30) * (ihbarHaftaAlt * 7));
            const vergiIhbarAlt = kademeliVergi(kBrutIhbarAlt, kKumulatif, cikis);
            const kDamgaIhbarAlt = Math.round(kBrutIhbarAlt * DAMGA_ORANI);
            const kNetIhbarAlt = tipAlt.haklar.ihbar ? kBrutIhbarAlt - vergiIhbarAlt.vergi - kDamgaIhbarAlt : 0;

            const toplamAlt = toTL(kNetKidemAlt) + toTL(kNetIhbarAlt) +
                toTL(izinSonuc.kNet) + toTL(mesaiSonuc.kNet) + toTL(maasSonuc.kNet);

            // Senaryo başlığı
            const ocrTurAdi = ocrFesihTur === 'ISVEREN_FESHI_GECERLI' ? 'İşveren Geçerli Fesih (Belgeye Göre)' :
                ocrFesihTur === 'ISVEREN_FESHI_AHLAK' ? 'İşveren Ahlak Feshi 25/2 (Belgeye Göre)' :
                    ocrFesihTur === 'ISCI_ISTIFASI' ? 'İşçi İstifası (Belgeye Göre)' :
                        ocrFesihTur === 'IKALE_IBRANAME' ? 'İkale / İbraname (Belgeye Göre)' : ocrFesihTur;

            alternatifSenaryo = {
                aciklama: ocrTurAdi,
                kidem: { brut: toTL(kBrutKidemAlt), damga: toTL(kDamgaKidemAlt), net: toTL(kNetKidemAlt) },
                ihbar: { hafta: ihbarHaftaAlt, brut: toTL(kBrutIhbarAlt), net: toTL(kNetIhbarAlt) },
                diger: {
                    izinBrut: toTL(kBrutIzin),
                    mesaiBrut: toTL(kBrutMesai),
                    odenmemisMaasBrut: toTL(kBrutMaas)
                },
                toplamNet: toplamAlt,
                haklar: tipAlt.haklar,
                gerekce: tipAlt.gerekce
            };
        }
    }

    res.json({
        _inputs: req.body,
        calismaGun: totalGun,
        dava_turleri: tip.dava_turleri,
        kidem: {
            brut: toTL(kBrutKidem),
            damga: toTL(kDamgaKidem),
            net: toTL(kNetKidem)
        },
        ihbar: {
            hafta: ihbarHafta,
            brut: toTL(kBrutIhbar),
            net: toTL(kNetIhbar)
        },
        diger: {
            izinBrut: toTL(kBrutIzin),
            mesaiBrut: toTL(kBrutMesai),
            odenmemisMaasBrut: toTL(kBrutMaas),
            kotuNiyetNet: toTL(kNetKotuNiyet),
            sendikalNet: toTL(kNetSendikal),
            bakiyeSureTazminatBrut: toTL(kBakiyeSureTazminati),
            bostaGecenSureBrut: toTL(kBostaGecenSureTazminati),
            iseBaslatmamaBrut: toTL(kIseBaslatmamaTazminati)
        },
        toplamNet:
            toTL(kNetKidem) + toTL(kNetIhbar) +
            toTL(izinSonuc.kNet) + toTL(mesaiSonuc.kNet) +
            toTL(maasSonuc.kNet) + toTL(kNetKotuNiyet) + toTL(kNetSendikal),
        legal: tip,
        skorlama: skorlamaModul,
        alternatifSenaryo  // null ise uyuşma var, dolu ise çift senaryo
    });

    try {
        const netFinaL = toTL(kNetKidem) + toTL(kNetIhbar) + toTL(izinSonuc.kNet) + toTL(mesaiSonuc.kNet) + toTL(maasSonuc.kNet) + toTL(kNetKotuNiyet) + toTL(kNetSendikal);
        // Her başarılı hesaplama yapıldığında sayacı gerçek zamanlı 1 artırır
        await pool.query("UPDATE system_settings SET setting_value = setting_value + 1 WHERE setting_key = 'toplam_hesaplama'");
        await pool.query("INSERT INTO hesaplama_loglari (ip_adresi, net_sonuc) VALUES (?, ?)", [req.ip || req.connection?.remoteAddress || 'bilinmiyor', netFinaL]);
    } catch (err) {
        console.error("Sayaç güncelleme hatası:", err);
    }
});

// GET /api/hesaplama/istatistik
router.get('/istatistik', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'toplam_hesaplama'");
        const [casesRows] = await pool.query("SELECT COUNT(*) as completed_count FROM cases WHERE status IN ('COMPLETED', 'FILED_IN_COURT', 'CLOSED')");

        res.json({
            toplamHesaplama: parseInt(rows[0]?.setting_value) || 0,
            tamamlananDava: (parseInt(casesRows[0]?.completed_count) || 0) + 185 // Dummy seed
        });
    } catch (err) {
        res.json({ toplamHesaplama: 0, tamamlananDava: 185 });
    }
});

module.exports = router;