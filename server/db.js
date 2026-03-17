// In-Memory Database (MVP için - production'da PostgreSQL/MongoDB kullanılacak)
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Sistem Ayarları
let systemSettings = {
    kidemTavani: 35058.58,
    hizmetBedeliSkala: [
        { min: 0, max: 20000, ucret: 750 },
        { min: 20000, max: 50000, ucret: 1250 },
        { min: 50000, max: Infinity, ucret: 2000 }
    ],
    platformAdi: 'HakPortal',
    toplamHesaplama: 1247 // Güven sayacı için başlangıç değeri
};

// Kullanıcılar
const users = [
    {
        id: 'admin-001',
        email: 'admin@hakportal.com',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        ad: 'Platform',
        soyad: 'Yöneticisi',
        avatar: 'A',
        createdAt: new Date().toISOString(),
        isActive: true
    }
];

// Avukatlar
const avukatlar = [
    {
        id: 'avukat-001',
        email: 'av.ahmet@hakportal.com',
        password: bcrypt.hashSync('avukat123', 10),
        role: 'avukat',
        ad: 'Ahmet',
        soyad: 'Yılmaz',
        unvan: 'Av.',
        sehir: 'İstanbul',
        uzmanlik: ['iş hukuku', 'kıdem tazminatı'],
        baro: 'İstanbul Barosu',
        baroNo: '12345',
        bio: 'İş hukuku ve işçi hakları alanında 10 yıllık deneyim.',
        profilOnay: true,
        isActive: true,
        createdAt: new Date().toISOString()
    },
    {
        id: 'avukat-002',
        email: 'av.zeynep@hakportal.com',
        password: bcrypt.hashSync('avukat123', 10),
        role: 'avukat',
        ad: 'Zeynep',
        soyad: 'Kaya',
        unvan: 'Av.',
        sehir: 'Ankara',
        uzmanlik: ['iş hukuku', 'fazla mesai'],
        baro: 'Ankara Barosu',
        baroNo: '54321',
        bio: 'İşçi hakları ve iş davalarında uzman.',
        profilOnay: true,
        isActive: true,
        createdAt: new Date().toISOString()
    }
];

// Davalar (Cases)
const cases = [];

// Teklifler (Offers)
const offers = [];

// Ödemeler (Payments)
const payments = [];

// Mesajlar (Messages)
const messages = [];

// Şikayetler
const sikayetler = [];

module.exports = {
    users,
    avukatlar,
    cases,
    offers,
    payments,
    messages,
    sikayetler,
    systemSettings,
    uuidv4
};
