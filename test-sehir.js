// Şehir eşleşme testi
const http = require('http');

function post(path, body, token) {
    return new Promise((resolve, reject) => {
        const d = JSON.stringify(body);
        const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'POST', headers }, res => {
            let s = ''; res.on('data', c => s += c);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s) }));
        });
        req.on('error', reject); req.write(d); req.end();
    });
}

function get(path, token) {
    return new Promise((resolve, reject) => {
        const headers = {};
        if (token) headers['Authorization'] = 'Bearer ' + token;
        http.get({ hostname: 'localhost', port: 3000, path, headers }, res => {
            let s = ''; res.on('data', c => s += c);
            res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s) }));
        }).on('error', reject);
    });
}

async function test() {
    console.log('\n🧪 ŞEHİR EŞLEŞMESİ TESTİ\n');

    // 1. Kullanıcı kaydı (küçük harf 'istanbul')
    const ts = Date.now();
    const reg = await post('/api/auth/register', {
        ad: 'Test', soyad: 'Kullanici',
        email: `testuser${ts}@test.com`,
        password: 'test12345', passwordConfirm: 'test12345',
        telefon: '05551234567',
        dogumTarihi: '1990-01-01',
        sehir: 'istanbul'
    });
    console.log('1️⃣  Kullanıcı kaydı (sehir=istanbul):', reg.status, reg.body.message || reg.body.error);
    const userToken = reg.body.token;

    if (!userToken) { console.log('❌ Kullanıcı kaydı başarısız!'); return; }

    // 2. Dava oluştur (küçük harf şehir)
    const dava = await post('/api/cases', {
        sehir: 'istanbul',
        davaTuru: 'kidem-ihbar',
        tahminilAcak: 50000,
        brutMaas: 25000
    }, userToken);
    console.log('2️⃣  Dava oluşturma (sehir=istanbul):', dava.status, dava.body.message || dava.body.error);
    if (dava.body.case) {
        console.log('   → DB\'ye yazılan şehir:', dava.body.case.sehir);
    }

    // 3. Avukat girişi (sehri: 'Istanbul' - büyük I, db'de)
    const avLogin = await post('/api/auth/login', {
        email: 'av.demo@hakportal.com',
        password: 'avukat123'
    });
    console.log('3️⃣  Avukat girişi:', avLogin.status, 'Sehir:', avLogin.body.user?.sehir);
    const avToken = avLogin.body.token;

    if (!avToken) { console.log('❌ Avukat girişi başarısız'); return; }

    // 4. Açık davaları çek
    const acik = await get('/api/avukat/acik-davalar', avToken);
    console.log('4️⃣  Açık davalar:', acik.status);
    if (Array.isArray(acik.body)) {
        console.log('   → Dava sayısı:', acik.body.length);
        acik.body.forEach(d => console.log(`   → Dava şehri: "${d.sehir}"`));
        if (acik.body.length > 0) {
            console.log('\n✅ ŞEHİR EŞLEŞMESİ BAŞARILI! istanbul ↔ Istanbul eşleşti.');
        } else {
            console.log('\n⚠️  Hiç dava bulunamadı. Eşleşme kontrolü yapılamıyor.');
        }
    } else {
        console.log('   → Hata:', acik.body);
    }
}

test().catch(e => console.error('Test hatası:', e.message));
