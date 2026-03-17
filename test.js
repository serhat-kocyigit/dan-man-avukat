// =============================================
// HakPortal - Tam Sistem Testi
// =============================================
const http = require('http');

let passed = 0, failed = 0;
const results = [];

function req(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: 'localhost', port: 3000,
            path: '/api' + path, method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data, 'utf8') } : {}),
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        };
        const r = http.request(opts, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

function test(name, status, expected, actual) {
    const ok = status === expected;
    const info = typeof actual === 'object' ? JSON.stringify(actual) : String(actual || '');
    if (ok) { passed++; results.push(`  ✅ ${name}`); }
    else { failed++; results.push(`  ❌ ${name} (beklenen:${expected}, gelen:${status}) → ${info.substring(0, 120)}`); }
    return ok;
}

async function run() {
    console.log('\n🔍 HakPortal Tam Sistem Testi\n' + '═'.repeat(50));

    // ===== AUTH =====
    console.log('\n📌 AUTH TESTLERİ');

    // Kayıt
    const regRes = await req('POST', '/auth/register', {
        ad: 'Test', soyad: 'Kullanici',
        email: `test${Date.now()}@test.com`,
        password: 'test1234', sehir: 'Istanbul'
    });
    test('Kullanıcı kaydı', regRes.status, 201, regRes.body);
    const userToken = regRes.body.token;
    const userId = regRes.body.user?.id;

    // Login
    const loginRes = await req('POST', '/auth/login', {
        email: 'admin@hakportal.com', password: 'admin123'
    });
    test('Admin girişi', loginRes.status, 200, loginRes.body);
    const adminToken = loginRes.body.token;

    // Avukat login
    const avRes = await req('POST', '/auth/login', {
        email: 'av.ahmet@hakportal.com', password: 'avukat123'
    });
    test('Avukat girişi', avRes.status, 200, avRes.body);
    const avukatToken = avRes.body.token;

    // Me endpoint
    const meRes = await req('GET', '/auth/me', null, userToken);
    test('/auth/me endpoint', meRes.status, 200, meRes.body);

    // Hatalı login
    const badLogin = await req('POST', '/auth/login', { email: 'yok@yok.com', password: 'yanlis' });
    test('Hatalı giriş (401)', badLogin.status, 401, badLogin.body);

    // ===== HESAPLAMA =====
    console.log('\n📌 HESAPLAMA TESTLERİ');

    const hRes = await req('POST', '/hesaplama/kidem-ihbar', {
        cikisSekli: 'isverenTarafindan',
        isGirisTarihi: '2017-01-01',
        isCikisTarihi: '2024-12-31',
        brutMaas: 35000
    });
    test('Kıdem+ihbar hesaplama', hRes.status, 200, hRes.body);
    if (hRes.status === 200) {
        test('Kıdem hakkı var', hRes.body.kidem?.hakki ? 200 : 400, 200, hRes.body.kidem);
        test('İhbar hakkı var', hRes.body.ihbar?.hakki ? 200 : 400, 200, hRes.body.ihbar);
        test('Toplam alacak > 0', hRes.body.toplamAlacak > 0 ? 200 : 400, 200, hRes.body.toplamAlacak);
    }

    const istatRes = await req('GET', '/hesaplama/istatistik');
    test('Hesaplama istatistik', istatRes.status, 200, istatRes.body);

    // ===== DAVALAR =====
    console.log('\n📌 DAVA TESTLERİ');

    const caseRes = await req('POST', '/cases', {
        sehir: 'Istanbul',
        davaTuru: 'kidem-ihbar',
        tahminilAcak: hRes.body?.toplamAlacak || 50000,
        hesaplamaVerisi: hRes.body
    }, userToken);
    test('Dava oluşturma', caseRes.status, 201, caseRes.body);
    const caseId = caseRes.body.case?.id;

    const myDavalar = await req('GET', '/cases/benim', null, userToken);
    test('Kullanıcının davaları', myDavalar.status, 200, myDavalar.body);
    test('Dava listesinde kayıt var', myDavalar.body?.length > 0 ? 200 : 400, 200, myDavalar.body);

    const caseDetail = await req('GET', `/cases/${caseId}`, null, userToken);
    test('Dava detayı', caseDetail.status, 200, caseDetail.body);

    // Avukat için açık davalar (Istanbul)
    const acikRes = await req('GET', '/avukat/acik-davalar', null, avukatToken);
    test('Avukat: açık davalar', acikRes.status, 200, acikRes.body);
    test('Istanbul davası görünüyor', acikRes.body?.length > 0 ? 200 : 404, 200, acikRes.body?.length);

    // ===== TEKLİFLER =====
    console.log('\n📌 TEKLİF TESTLERİ');

    const teklifRes = await req('POST', '/offers', {
        caseId,
        ucretModeli: 'yuzde',
        oran: 20,
        onOdeme: false,
        tahminiSure: '6-12 ay',
        aciklama: 'Deneyimli is hukuku avukati',
        kartNo: '4111111111111111', kartSahibi: 'Test Avukat', sonKullanma: '12/26', cvv: '123'
    }, avukatToken);
    test('Teklif gönderme (avukat)', teklifRes.status, 201, teklifRes.body);
    const offerId = teklifRes.body?.id;

    // Çift teklif engelleme
    const dupTeklif = await req('POST', '/offers', {
        caseId, ucretModeli: 'sabit', sabitUcret: 5000, onOdeme: false, tahminiSure: '3 ay',
        kartNo: '4111111111111111', kartSahibi: 'Test Avukat', sonKullanma: '12/26', cvv: '123'
    }, avukatToken);
    test('Çift teklif engellendi (409)', dupTeklif.status, 409, dupTeklif.body);

    // Teklifleri listele
    const tekliflerRes = await req('GET', `/offers/case/${caseId}`, null, userToken);
    test('Teklifleri listele', tekliflerRes.status, 200, tekliflerRes.body);
    test('Teklif listede var', tekliflerRes.body?.length > 0 ? 200 : 400, 200, tekliflerRes.body?.length);

    // Teklif seç
    const secRes = await req('PUT', `/offers/${offerId}/sec`, null, userToken);
    test('Teklif seçme', secRes.status, 200, secRes.body);
    const odemeGerekli = secRes.body?.odenmesiGerekenUcret;
    test('Ödeme bedeli hesaplandı', odemeGerekli > 0 ? 200 : 400, 200, odemeGerekli);

    // ===== ÖDEME =====
    console.log('\n📌 ÖDEME TESTLERİ');

    const odemeRes = await req('POST', `/offers/${offerId}/odeme`, {
        kartNo: '4111111111111111',
        kartSahibi: 'Test Kullanici',
        sonKullanma: '12/26',
        cvv: '123'
    }, userToken);
    test('Ödeme tamamlama', odemeRes.status, 200, odemeRes.body);
    test('Avukat bilgisi döndü', odemeRes.body?.avukatBilgi ? 200 : 400, 200, odemeRes.body?.avukatBilgi);

    // ===== MESAJLAR =====
    console.log('\n📌 MESAJ TESTLERİ');

    const msgRes = await req('POST', '/messages', {
        caseId, icerik: 'Merhaba, davanizla ilgili gorusmek istiyorum.'
    }, userToken);
    test('Mesaj gönderme (kullanıcı)', msgRes.status, 201, msgRes.body);

    const avMsgRes = await req('POST', '/messages', {
        caseId, icerik: 'Merhaba, dosyanizi inceledim. Guclu bir davaniz var.'
    }, avukatToken);
    test('Mesaj gönderme (avukat)', avMsgRes.status, 201, avMsgRes.body);

    const getMsgRes = await req('GET', `/messages/${caseId}`, null, userToken);
    test('Mesaj okuma', getMsgRes.status, 200, getMsgRes.body);
    test('2 mesaj var', getMsgRes.body?.length === 2 ? 200 : 400, 200, getMsgRes.body?.length);

    // İletişim bilgisi engelleme
    const filtreRes = await req('POST', '/messages', {
        caseId, icerik: 'Beni ara: 05321234567'
    }, userToken);
    test('İletişim bilgisi engellendi (400)', filtreRes.status, 400, filtreRes.body);

    // ===== AVUKAT PANEL =====
    console.log('\n📌 AVUKAT PANEL TESTLERİ');

    const avProfilRes = await req('GET', '/avukat/profil', null, avukatToken);
    test('Avukat profil', avProfilRes.status, 200, avProfilRes.body);

    const avTekliflerimRes = await req('GET', '/avukat/tekliflerim', null, avukatToken);
    test('Avukat tekliflerim', avTekliflerimRes.status, 200, avTekliflerimRes.body);
    test('Teklif SELECTED durumda', avTekliflerimRes.body?.[0]?.status === 'SELECTED' ? 200 : 400, 200, avTekliflerimRes.body?.[0]?.status);

    // ===== ADMİN =====
    console.log('\n📌 ADMİN TESTLERİ');

    const statsRes = await req('GET', '/admin/istatistik', null, adminToken);
    test('Admin istatistik', statsRes.status, 200, statsRes.body);
    test('Kullanıcı sayısı > 0', statsRes.body?.kullaniciSayisi > 0 ? 200 : 400, 200, statsRes.body?.kullaniciSayisi);

    const avukatlarsRes = await req('GET', '/admin/avukatlar', null, adminToken);
    test('Admin: avukat listesi', avukatlarsRes.status, 200, avukatlarsRes.body);

    const kullanicilarRes = await req('GET', '/admin/kullanicilar', null, adminToken);
    test('Admin: kullanıcı listesi', kullanicilarRes.status, 200, kullanicilarRes.body);

    const davalarRes = await req('GET', '/admin/davalar', null, adminToken);
    test('Admin: dava listesi', davalarRes.status, 200, davalarRes.body);

    const odemelarRes = await req('GET', '/admin/odemeler', null, adminToken);
    test('Admin: ödeme listesi', odemelarRes.status, 200, odemelarRes.body);
    test('En az 1 ödeme var', odemelarRes.body?.length > 0 ? 200 : 400, 200, odemelarRes.body?.length);

    const ayarRes = await req('PUT', '/admin/ayarlar', { kidemTavani: 36000 }, adminToken);
    test('Admin: ayar güncelle', ayarRes.status, 200, ayarRes.body);

    // ===== GÜVENLİK =====
    console.log('\n📌 GÜVENLİK TESTLERİ');

    const noToken = await req('GET', '/cases/benim', null, null);
    test('Token olmadan erişim engellendi (401)', noToken.status, 401, noToken.body);

    const wrongRole = await req('GET', '/admin/istatistik', null, userToken);
    test('Yanlış rol erişim engellendi (403)', wrongRole.status, 403, wrongRole.body);

    const avukatCaseTry = await req('POST', '/cases', { sehir: 'Istanbul' }, avukatToken);
    test('Avukat dava oluşturamaz (403)', avukatCaseTry.status, 403, avukatCaseTry.body);

    // ===== SETTINGS =====
    const settingsRes = await req('GET', '/settings/public');
    test('Public ayarlar', settingsRes.status, 200, settingsRes.body);
    test('Kıdem tavanı döndü', settingsRes.body?.kidemTavani > 0 ? 200 : 400, 200, settingsRes.body?.kidemTavani);

    // ===== SONUÇ =====
    console.log('\n' + results.join('\n'));
    console.log('\n' + '═'.repeat(50));
    console.log(`\n🎯 SONUÇ: ${passed} geçti, ${failed} BAŞARISIZ\n`);

    if (failed > 0) {
        console.log('❌ Başarısız testleri inceleyin!\n');
        process.exit(1);
    } else {
        console.log('🎉 TÜM TESTLER GEÇTİ! Sistem hazır.\n');
        console.log('🌐 Site: http://localhost:3000');
        console.log('👤 Admin: admin@hakportal.com / admin123');
        console.log('⚖️  Avukat: av.ahmet@hakportal.com / avukat123\n');
    }
}

run().catch(err => {
    console.error('Test hatası:', err);
    process.exit(1);
});
