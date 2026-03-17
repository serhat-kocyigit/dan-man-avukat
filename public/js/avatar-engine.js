/**
 * HakPortal Avatar Engine v4.1
 * DiceBear 9.x Avataaars HTTP API — Tüm renkler hex formatında
 *
 * ⚠ DiceBear v9 API doğrulama kuralları:
 *   clothesColor, hairColor, facialHairColor → hex, # olmadan (ör: 5199e4)
 *   skinColor                                → hex, # olmadan (ör: edb98a)
 *   top, eyes, eyebrows, mouth, clothing     → named enum (ör: bob, happy)
 */
(function () {
  'use strict';

  const API_BASE = 'https://api.dicebear.com/9.x/avataaars/svg';

  /* ─── Bellek + sessionStorage önbelleği ─────────────────── */
  const memCache = new Map();

  function cacheGet(key) {
    if (memCache.has(key)) return memCache.get(key);
    try {
      const v = sessionStorage.getItem('av4_' + key);
      if (v) { memCache.set(key, v); return v; }
    } catch (_) { }
    return null;
  }

  function cacheSet(key, svg) {
    memCache.set(key, svg);
    try { sessionStorage.setItem('av4_' + key, svg); } catch (_) { }
  }

  /* ─── İsimli renk → hex dönüşüm tablosu ────────────────── */
  /* DiceBear v9 API clothesColor, hairColor vb. için HEX ister */
  const COLOR_HEX = {
    // Kıyafet renkleri
    black: '262e33',
    blue01: '25557c',
    blue02: '5199e4',
    blue03: '65c9ff',
    heather: '3c4f5c',
    gray01: '929598',
    gray02: 'e6e6e6',
    pastelBlue: 'b1e2ff',
    pastelGreen: 'a7ffc4',
    pastelOrange: 'ff9a56',
    pastelRed: 'ff488e',
    pastelYellow: 'ffca58',
    pink: 'ff6eb4',
    red: 'ff4e4e',
    white: 'f8f8f8',
    // Saç / Sakal renkleri
    auburn: 'a55728',
    brown: '4a312c',
    brown2: '8d5524',
    blonde: 'b58143',
    blonde2: 'd6b370',
    platinum: 'ecdcbf',
    silverGray: 'e8e1e1',
  };

  /** İsimli renk id'sini veya ham hex'i → 6 haneli hex (# olmadan) */
  function toHex(id, fallback) {
    if (!id) return fallback || '000000';
    if (COLOR_HEX[id]) return COLOR_HEX[id];
    const c = id.replace('#', '');
    return /^[0-9a-fA-F]{6}$/.test(c) ? c : (fallback || '000000');
  }

  /* ─── Eski cache'i temizle (yanlış URL'ler birikiyor) ────── */
  try {
    const del = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith('av_') || k.startsWith('av4_'))) del.push(k);
    }
    del.forEach(k => sessionStorage.removeItem(k));
    console.log('🧹 Avatar cache temizlendi');
  } catch (_) { }

  /* ─── AVATAR PART TANIMLAMALARI ─────────────────────────── */
  const AVATAR_PARTS = {

    skinColor: {
      label: 'Ten Rengi', icon: '✋', type: 'hex-color',
      options: [
        { id: 'ffdbb4', label: 'Çok Açık', hex: '#ffdbb4' },
        { id: 'edb98a', label: 'Açık', hex: '#edb98a' },
        { id: 'd08b5b', label: 'Buğday', hex: '#d08b5b' },
        { id: 'f8d25c', label: 'Sarı', hex: '#f8d25c' },
        { id: 'fd9841', label: 'Turuncu', hex: '#fd9841' },
        { id: 'ae5d29', label: 'Esmer', hex: '#ae5d29' },
        { id: '614335', label: 'Koyu', hex: '#614335' },
      ]
    },

    top: {
      label: 'Saç / Başlık', icon: '💇',
      options: [
        { id: 'bob', label: 'Bob' },
        { id: 'shortFlat', label: 'Düz Kısa' },
        { id: 'shortRound', label: 'Yuvarlak' },
        { id: 'shortCurly', label: 'Kıvırcık Kısa' },
        { id: 'shortWaved', label: 'Dalgalı' },
        { id: 'sides', label: 'Yan Tuft' },
        { id: 'curly', label: 'Kıvırcık' },
        { id: 'curvy', label: 'Kıvımlı' },
        { id: 'longHair', label: 'Uzun Düz' },
        { id: 'straight01', label: 'Düz Sarkık' },
        { id: 'straight02', label: 'Düz Kare' },
        { id: 'bigHair', label: 'Hacimli' },
        { id: 'bun', label: 'Topuz' },
        { id: 'miaWallace', label: 'Mia W.' },
        { id: 'notTooLong', label: 'Orta Boy' },
        { id: 'frida', label: 'Örgülü' },
        { id: 'fro', label: 'Afro' },
        { id: 'froBand', label: 'Bantlı Afro' },
        { id: 'dreads', label: 'Dreadlock' },
        { id: 'shavedSides', label: 'Tıraşlı Yan' },
        { id: 'theCaesar', label: 'Caesar' },
        { id: 'theCaesarAndSidePart', label: 'Caesar Yan' },
        { id: 'hijab', label: 'Örtü' },
        { id: 'turban', label: 'Türban' },
        { id: 'winterHat01', label: 'Bere 1' },
        { id: 'winterHat02', label: 'Bere 2' },
        { id: 'winterHat03', label: 'Bere 3' },
        { id: 'winterHat04', label: 'Bere 4' },
        { id: 'hat', label: 'Şapka' },
      ]
    },

    hairColor: {
      label: 'Saç Rengi', icon: '🎨', type: 'named-color',
      options: [
        { id: 'black', label: 'Siyah', hex: '#' + toHex('black', '2b1b17') },
        { id: 'brown', label: 'Kahve', hex: '#' + toHex('brown', '4a312c') },
        { id: 'brown2', label: 'Açık Kahve', hex: '#' + toHex('brown2', '8d5524') },
        { id: 'auburn', label: 'Kumral', hex: '#' + toHex('auburn', 'a55728') },
        { id: 'blonde', label: 'Sarışın', hex: '#' + toHex('blonde', 'b58143') },
        { id: 'blonde2', label: 'Açık Sarı', hex: '#' + toHex('blonde2', 'd6b370') },
        { id: 'platinum', label: 'Platin', hex: '#' + toHex('platinum', 'ecdcbf') },
        { id: 'red', label: 'Kızıl', hex: '#c93305' },
        { id: 'silverGray', label: 'Gümüş', hex: '#' + toHex('silverGray', 'e8e1e1') },
      ]
    },

    eyes: {
      label: 'Gözler', icon: '👁',
      options: [
        { id: 'happy', label: 'Mutlu' },
        { id: 'default', label: 'Normal' },
        { id: 'wink', label: 'Kırpan' },
        { id: 'winkWacky', label: 'Çılgın' },
        { id: 'hearts', label: 'Kalp' },
        { id: 'surprised', label: 'Şaşkın' },
        { id: 'squint', label: 'Kısık' },
        { id: 'side', label: 'Yan' },
        { id: 'eyeRoll', label: 'Süzen' },
        { id: 'cry', label: 'Ağlayan' },
        { id: 'close', label: 'Kapalı' },
        { id: 'xDizzy', label: 'Baygın' },
        { id: 'twitchFace', label: 'Seğiren' },
      ]
    },

    eyebrows: {
      label: 'Kaşlar', icon: '〰',
      options: [
        { id: 'defaultNatural', label: 'Doğal' },
        { id: 'default', label: 'Normal' },
        { id: 'raisedExcited', label: 'Yüksek' },
        { id: 'raisedExcitedNatural', label: 'D.Yüksek' },
        { id: 'flatNatural', label: 'Düz' },
        { id: 'angry', label: 'Sinirli' },
        { id: 'angryNatural', label: 'D.Sinirli' },
        { id: 'sadConcerned', label: 'Endişeli' },
        { id: 'sadConcernedNatural', label: 'D.Endişeli' },
        { id: 'upDown', label: 'Asimetrik' },
        { id: 'upDownNatural', label: 'D.Asimetrik' },
        { id: 'unibrowNatural', label: 'Birleşik' },
      ]
    },

    mouth: {
      label: 'Ağız', icon: '👄',
      options: [
        { id: 'smile', label: 'Gülümseme' },
        { id: 'twinkle', label: 'Pırıltılı' },
        { id: 'default', label: 'Normal' },
        { id: 'tongue', label: 'Dil' },
        { id: 'eating', label: 'Yiyor' },
        { id: 'grimace', label: 'Homurdanma' },
        { id: 'screamOpen', label: 'Çığlık' },
        { id: 'serious', label: 'Ciddi' },
        { id: 'disbelief', label: 'İnanmaz' },
        { id: 'concerned', label: 'Endişeli' },
        { id: 'sad', label: 'Üzgün' },
      ]
    },

    clothing: {
      label: 'Kıyafet', icon: '👕',
      options: [
        { id: 'shirtCrewNeck', label: 'Yuvarlak Yaka' },
        { id: 'shirtScoopNeck', label: 'Geniş Yaka' },
        { id: 'shirtVNeck', label: 'V Yaka' },
        { id: 'hoodie', label: 'Hoodie' },
        { id: 'graphicShirt', label: 'Baskılı' },
        { id: 'collarAndSweater', label: 'Yakalı Kazak' },
        { id: 'blazerAndShirt', label: 'Blazer+Gömlek' },
        { id: 'blazerAndSweater', label: 'Blazer+Kazak' },
        { id: 'overall', label: 'Tulum' },
      ]
    },

    clothesColor: {
      label: 'Kıyafet Rengi', icon: '🩱', type: 'named-color',
      options: [
        { id: 'black', label: 'Siyah', hex: '#262e33' },
        { id: 'blue01', label: 'Koyu Mavi', hex: '#25557c' },
        { id: 'blue02', label: 'Mavi', hex: '#5199e4' },
        { id: 'blue03', label: 'Açık Mavi', hex: '#65c9ff' },
        { id: 'heather', label: 'Gri-Mavi', hex: '#3c4f5c' },
        { id: 'gray01', label: 'Koyu Gri', hex: '#929598' },
        { id: 'gray02', label: 'Açık Gri', hex: '#e6e6e6' },
        { id: 'pastelBlue', label: 'P.Mavi', hex: '#b1e2ff' },
        { id: 'pastelGreen', label: 'P.Yeşil', hex: '#a7ffc4' },
        { id: 'pastelOrange', label: 'P.Turuncu', hex: '#ff9a56' },
        { id: 'pastelRed', label: 'P.Kırmızı', hex: '#ff488e' },
        { id: 'pastelYellow', label: 'P.Sarı', hex: '#ffca58' },
        { id: 'pink', label: 'Pembe', hex: '#ff6eb4' },
        { id: 'red', label: 'Kırmızı', hex: '#ff4e4e' },
        { id: 'white', label: 'Beyaz', hex: '#f8f8f8' },
      ]
    },

    accessories: {
      label: 'Aksesuar', icon: '👓',
      options: [
        { id: '__none__', label: 'Yok' },
        { id: 'prescription01', label: 'Gözlük 1' },
        { id: 'prescription02', label: 'Gözlük 2' },
        { id: 'round', label: 'Yuvarlak' },
        { id: 'kurt', label: 'Kurt' },
        { id: 'sunglasses', label: 'Güneş' },
        { id: 'wayfarers', label: 'Wayfarer' },
        { id: 'eyepatch', label: 'Göz Bandı' },
      ]
    },

    facialHair: {
      label: 'Sakal/Bıyık', icon: '🧔',
      options: [
        { id: '__none__', label: 'Yok' },
        { id: 'beardLight', label: 'Hafif Sakal' },
        { id: 'beardMedium', label: 'Orta Sakal' },
        { id: 'beardMagestic', label: 'Uzun Sakal' },
        { id: 'moustacheFancy', label: 'Bıyık' },
        { id: 'moustacheMagnum', label: 'Gür Bıyık' },
      ]
    },

    facialHairColor: {
      label: 'Sakal Rengi', icon: '🎨', type: 'named-color',
      options: [
        { id: 'black', label: 'Siyah', hex: '#262e33' },
        { id: 'brown', label: 'Kahve', hex: '#4a312c' },
        { id: 'brown2', label: 'Açık Kahve', hex: '#8d5524' },
        { id: 'auburn', label: 'Kumral', hex: '#a55728' },
        { id: 'blonde', label: 'Sarışın', hex: '#b58143' },
        { id: 'blonde2', label: 'Açık Sarı', hex: '#d6b370' },
        { id: 'platinum', label: 'Platin', hex: '#ecdcbf' },
        { id: 'red', label: 'Kızıl', hex: '#c93305' },
        { id: 'silverGray', label: 'Gümüş', hex: '#e8e1e1' },
      ]
    },

    background: {
      label: 'Arka Plan', icon: '🌈', type: 'bg-gradient',
      options: [
        { id: 'b6e3f4-c0aede', label: 'Lavanta', hex1: '#b6e3f4', hex2: '#c0aede' },
        { id: 'd1f4e0-a8edca', label: 'Nane', hex1: '#d1f4e0', hex2: '#a8edca' },
        { id: 'ffecd2-fcb69f', label: 'Şeftali', hex1: '#ffecd2', hex2: '#fcb69f' },
        { id: 'fbc2eb-a18cd1', label: 'Pembe', hex1: '#fbc2eb', hex2: '#a18cd1' },
        { id: '667eea-764ba2', label: 'Mor', hex1: '#667eea', hex2: '#764ba2' },
        { id: 'f0f4f8-e2e8f0', label: 'Beyaz', hex1: '#f0f4f8', hex2: '#e2e8f0' },
        { id: '1a1a2e-16213e', label: 'Koyu', hex1: '#1a1a2e', hex2: '#16213e' },
        { id: 'fddb92-d1fdff', label: 'Güneş', hex1: '#fddb92', hex2: '#d1fdff' },
        { id: 'a8edea-fed6e3', label: 'Okyanus', hex1: '#a8edea', hex2: '#fed6e3' },
        { id: '43e97b-38f9d7', label: 'Yeşil', hex1: '#43e97b', hex2: '#38f9d7' },
      ]
    },
  };

  /* ─── URL üretici ────────────────────────────────────────── */
  function buildApiUrl(cfg) {
    const p = new URLSearchParams();

    // Ten rengi — hex, # olmadan
    p.set('skinColor', cfg.skinColor || 'edb98a');
    // Saç stili — named enum
    p.set('top', cfg.top || 'bob');
    // Saç rengi — HEX (v9 API zorunluluğu)
    p.set('hairColor', toHex(cfg.hairColor || 'brown', '4a312c'));
    // Yüz — named enum
    p.set('eyes', cfg.eyes || 'happy');
    p.set('eyebrows', cfg.eyebrows || 'defaultNatural');
    p.set('mouth', cfg.mouth || 'smile');
    // Kıyafet stili — named enum
    p.set('clothing', cfg.clothing || 'shirtCrewNeck');
    // Kıyafet rengi — HEX (v9 API zorunluluğu)
    p.set('clothesColor', toHex(cfg.clothesColor || 'blue02', '5199e4'));

    // Aksesuar
    const hasAcc = cfg.accessories && cfg.accessories !== '__none__';
    p.set('accessoriesProbability', hasAcc ? '100' : '0');
    if (hasAcc) {
      p.set('accessories', cfg.accessories);
      p.set('accessoriesColor', '262e33'); // siyah hex
    }

    // Sakal/Bıyık
    const hasFH = cfg.facialHair && cfg.facialHair !== '__none__';
    p.set('facialHairProbability', hasFH ? '100' : '0');
    if (hasFH) {
      p.set('facialHair', cfg.facialHair);
      // Sakal rengi — HEX
      p.set('facialHairColor', toHex(cfg.facialHairColor || 'brown', '4a312c'));
    }

    // Arka plan
    const bg1 = (cfg.bgColor1 || '#b6e3f4').replace('#', '');
    const bg2 = (cfg.bgColor2 || '#c0aede').replace('#', '');
    p.set('backgroundType', 'gradientLinear');
    p.set('backgroundRotation', '30');
    p.set('backgroundColor', bg1 + ',' + bg2);

    return API_BASE + '?' + p.toString();
  }

  /* ─── Ana önizleme (async fetch + cache) ────────────────── */
  async function renderInline(cfg, containerEl) {
    if (!containerEl) return;
    const url = buildApiUrl(cfg);
    const cached = cacheGet(url);
    if (cached) { containerEl.innerHTML = cached; return; }

    containerEl.innerHTML = `
      <div style="width:80%;height:80%;border-radius:50%;
                  background:linear-gradient(135deg,rgba(108,99,255,.1),rgba(108,99,255,.2));
                  animation:ap 1s ease-in-out infinite alternate;
                  display:flex;align-items:center;justify-content:center;font-size:3rem;">👤</div>
      <style>@keyframes ap{from{opacity:.4}to{opacity:1}}</style>`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + await res.text());
      const svg = await res.text();
      cacheSet(url, svg);
      containerEl.innerHTML = svg;
    } catch (err) {
      console.error('Avatar yüklenemedi:', err);
      containerEl.innerHTML = `<div style="color:#f59797;text-align:center;padding:20px;font-size:12px;">
        ⚠️ Avatar yüklenemedi<br>${err.message}</div>`;
    }
  }

  /* ─── data URI (kaydetme için) ─────────────────────────── */
  async function toDataURL(cfg) {
    const url = buildApiUrl(cfg);
    const cached = cacheGet(url);
    const svg = cached || await fetch(url).then(r => r.text());
    if (!cached) cacheSet(url, svg);
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  }

  /* ─── PUBLIC API ─────────────────────────────────────────── */
  window.AvatarEngine = {
    PARTS: AVATAR_PARTS,
    getAvatarUrl: buildApiUrl,
    buildApiUrl,
    renderInline,
    toDataURL,
    CATEGORY_ORDER: [
      'skinColor', 'top', 'hairColor', 'eyes', 'eyebrows', 'mouth',
      'clothing', 'clothesColor', 'accessories', 'facialHair', 'facialHairColor', 'background'
    ],
  };

  console.log('✅ HakPortal Avatar Engine v4.1 hazır');
  window.dispatchEvent(new Event('avatarEngineReady'));

})();
