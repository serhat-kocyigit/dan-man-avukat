// =============================================
// HakPortal - Ana JavaScript (app.js)
// =============================================

const API = '/api';

// ---- TOKEN YÖNETİMİ ----
const Auth = {
    getToken: () => localStorage.getItem('hp_token'),
    getUser: () => { try { return JSON.parse(localStorage.getItem('hp_user')); } catch { return null; } },
    setAuth: (token, user) => {
        localStorage.setItem('hp_token', token);
        localStorage.setItem('hp_user', JSON.stringify(user));
    },
    clear: () => {
        localStorage.removeItem('hp_token');
        localStorage.removeItem('hp_user');
    },
    isLoggedIn: () => !!localStorage.getItem('hp_token'),
    getRole: () => { const u = Auth.getUser(); return u ? u.role : null; }
};

// ---- API HELPER ----
async function apiCall(method, endpoint, data = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (data && method !== 'GET') opts.body = JSON.stringify(data);

    const res = await fetch(API + endpoint, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Bir hata oluştu.');
    return json;
}

// ---- SİSTEM BİLDİRİM MODALI (Eski Toast Yerine) ----
function showToast(msg, type = 'info', duration = 0 /* duration artik kullanilmiyor, butonlu eklendi */) {
    let modal = document.getElementById('globalAlertModal');
    if (!modal) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'globalAlertModal';
        overlay.style.display = 'none';
        overlay.style.zIndex = '99999';

        overlay.innerHTML = `
            <div class="modal" style="text-align: center; max-width: 400px; padding: 30px 20px;">
                <div id="globalAlertIcon" style="font-size: 3rem; margin-bottom: 15px;"></div>
                <h3 id="globalAlertTitle" style="margin-bottom: 10px; color: var(--text-primary);">Bilgilendirme</h3>
                <p id="globalAlertMessage" style="color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem; margin-bottom: 25px;"></p>
                <button class="btn-primary btn-block" onclick="closeModal('globalAlertModal')" style="width: 100%;">Tamam</button>
            </div>
        `;
        document.body.appendChild(overlay);
        modal = overlay;

        // Overlay'e tıklanınca kapansın (opsiyonel)
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeModal('globalAlertModal');
        });
    }

    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const titles = { success: 'Başarılı!', error: 'Bir Hata Oluştu', info: 'Bilgilendirme', warning: 'Uyarı' };

    document.getElementById('globalAlertIcon').textContent = icons[type] || 'ℹ️';
    document.getElementById('globalAlertTitle').textContent = titles[type] || 'Bilgilendirme';
    document.getElementById('globalAlertMessage').textContent = msg;

    openModal('globalAlertModal');
}

// ---- SİSTEM ONAY MODALI (Eski Confirm Yerine) ----
function showConfirm(msg) {
    return new Promise((resolve) => {
        let modal = document.getElementById('globalConfirmModal');
        if (!modal) {
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = 'globalConfirmModal';
            overlay.style.display = 'none';
            overlay.style.zIndex = '99999';

            overlay.innerHTML = `
                <div class="modal" style="text-align: center; max-width: 400px; padding: 30px 20px;">
                    <div style="font-size: 3rem; margin-bottom: 15px;">❓</div>
                    <h3 style="margin-bottom: 10px; color: var(--text-primary);">Onay Bekleniyor</h3>
                    <p id="globalConfirmMessage" style="color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem; margin-bottom: 25px; white-space: pre-wrap;"></p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <button id="globalConfirmNoBtn" class="btn-ghost" style="width: 100%;">Hayır</button>
                        <button id="globalConfirmYesBtn" class="btn-primary" style="width: 100%;">Evet, Onaylıyorum</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            modal = overlay;

            // Overlay'e tıklanınca iptal et
            overlay.addEventListener('click', e => {
                if (e.target === overlay) {
                    closeModal('globalConfirmModal');
                    if (modal._rejectFn) modal._rejectFn(false);
                }
            });
        }

        document.getElementById('globalConfirmMessage').textContent = msg;

        const yesBtn = document.getElementById('globalConfirmYesBtn');
        const noBtn = document.getElementById('globalConfirmNoBtn');

        // Temizleyici handlerlar
        const cleanup = () => {
            closeModal('globalConfirmModal');
            yesBtn.onclick = null;
            noBtn.onclick = null;
        };

        yesBtn.onclick = () => { cleanup(); resolve(true); };
        noBtn.onclick = () => { cleanup(); resolve(false); };
        modal._rejectFn = resolve; // Overlay cancel için ref tutuyoruz

        openModal('globalConfirmModal');
    });
}

// ---- MODAL YÖNETİMİ ----
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

// ESC ile modal kapat
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    }
});

// Overlay'e tıklayınca kapat
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeModal(overlay.id);
    });
});

// ---- NAVBAR ----
const navbar = document.getElementById('navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 30) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');
    });
}

function toggleMenu() {
    const links = document.getElementById('navLinks');
    const hamburger = document.getElementById('hamburger');

    if (links) {
        links.classList.toggle('open');
        if (hamburger) hamburger.classList.toggle('open');
        document.body.classList.toggle('nav-open');
    }
}

document.addEventListener('click', (e) => {
    const links = document.getElementById('navLinks');
    const hamburger = document.getElementById('hamburger');

    if (links && links.classList.contains('open')) {
        if (!links.contains(e.target) && !hamburger.contains(e.target)) {
            links.classList.remove('open');
            if (hamburger) hamburger.classList.remove('open');
            document.body.classList.remove('nav-open');
        }
    }
});

// ---- NAV STATE (KULLANICI DURUMU) ----
function updateNav() {
    const user = Auth.getUser();
    const girisBtn = document.getElementById('navGirisBtn');
    const kayitBtn = document.getElementById('navKayitBtn');
    const panelBtn = document.getElementById('navPanelBtn');
    const cikisBtn = document.getElementById('navCikisBtn');

    if (user) {
        if (girisBtn) girisBtn.style.display = 'none';
        if (kayitBtn) kayitBtn.style.display = 'none';
        if (panelBtn) panelBtn.style.display = 'inline-flex';
        if (cikisBtn) cikisBtn.style.display = 'inline-flex';
    } else {
        if (girisBtn) girisBtn.style.display = 'inline-flex';
        if (kayitBtn) kayitBtn.style.display = 'inline-flex';
        if (panelBtn) panelBtn.style.display = 'none';
        if (cikisBtn) cikisBtn.style.display = 'none';
    }
}

function goPanel() {
    const role = Auth.getRole();
    if (role === 'admin') window.location.href = '/admin.html';
    else if (role === 'avukat') window.location.href = '/avukat-panel.html';
    else window.location.href = '/panel.html';
}

function logout() {
    Auth.clear();
    showToast('Çıkış yapıldı.', 'info');
    setTimeout(() => window.location.href = '/', 800);
}

// ---- GİRİŞ/ÇIKIŞ BUTONLARI NAV ----
const navGirisBtn = document.getElementById('navGirisBtn');
if (navGirisBtn) {
    navGirisBtn.addEventListener('click', e => {
        e.preventDefault();
        openModal('authModal');
        switchTab('giris');
    });
}

const navKayitBtn = document.getElementById('navKayitBtn');
if (navKayitBtn) {
    navKayitBtn.addEventListener('click', e => {
        e.preventDefault();
        openModal('authModal');
        switchTab('kayit');
    });
}

// ---- TAB SWITCH ----
function switchTab(tab) {
    const girisForm = document.getElementById('girisForm');
    const kayitForm = document.getElementById('kayitForm');
    const tabGiris = document.getElementById('tabGiris');
    const tabKayit = document.getElementById('tabKayit');

    if (!girisForm || !kayitForm) return;

    if (tab === 'giris') {
        girisForm.style.display = 'block';
        kayitForm.style.display = 'none';
        tabGiris?.classList.add('active');
        tabKayit?.classList.remove('active');
    } else {
        girisForm.style.display = 'none';
        kayitForm.style.display = 'block';
        tabGiris?.classList.remove('active');
        tabKayit?.classList.add('active');
    }
}

// ---- COUNTER ANİMASYON ----
function animateCounter(el, target, duration = 2000) {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
        start += step;
        if (start >= target) { start = target; clearInterval(timer); }
        el.textContent = Math.floor(start).toLocaleString('tr-TR') + '+';
    }, 16);
}

// Hero istatistik counter
async function loadCounter() {
    const elHesap = document.getElementById('counterHesaplama');
    const elDava = document.getElementById('counterDava');
    if (!elHesap && !elDava) return;
    try {
        const data = await apiCall('GET', '/hesaplama/istatistik');
        if (elHesap) animateCounter(elHesap, data.toplamHesaplama);
        if (elDava) animateCounter(elDava, data.tamamlananDava);
    } catch {
        if (elHesap) elHesap.textContent = '1.000+';
        if (elDava) elDava.textContent = '185+';
    }
}

// ---- SAYFA YÜKLENDİĞİNDE ----
document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    loadCounter();
});

// ---- BLOG MODAL DETAYLARI ----
window.openBlogModal = function (type) {
    const data = {
        kidem: { title: "Kıdem Tazminatı Nedir?", text: "Kıdem tazminatı, işçinin çeşitli sebeplerle işinden ayrılırken çalıştığı yıllar için aldığı bir toplu paradır. Bu tazminat işçinin emeğinin ve işverene bağlılığının bir karşılığı olarak görülür.\n\nKimler Kıdem Tazminatı Alabilir?\nEn önemli şart, aynı işverene bağlı olarak en az 1 tam yıl çalışmış olmaktır. 1 yılı doldurmayan işçiler kıdem tazminatına hak kazanamazlar.\n\nNasıl Hak Kazanılır?\n• İşveren tarafından haksız yere işten çıkarılmak (Kod 04, Kod 15 vb.).\n• İşçi tarafından haklı nedenle derhal fesih (maaş ödenmemesi, mobbing vb.).\n• Askere gitmek (Erkekler için).\n• Evlilik (Kadınlar için evlendikten sonraki 1 yıl içinde).\n• Emeklilik şartlarını sağlamak veya yaş dışındaki şartları doldurmak.\n• İşçinin vefatı (Mirasçılarına ödenir).\n\nNasıl Hesaplanır?\nKıdem tazminatı hesaplanırken işçinin son aldığı giydirilmiş brüt ücret dikkate alınır. Giydirilmiş brüt ücret, çıplak maaşınıza ek olarak yol, yemek, ikramiye gibi süreklilik arz eden tüm yardımların eklenmesiyle bulunur. Her tam yıl için 30 günlük giydirilmiş brüt ücret üzerinden hesaplama yapılır. Artan aylar ve günler de oranlanarak tazminata eklenir.\n\nÖnemli Uyarı: Kıdem Tazminatı Tavanı\nDevlet her yıl ocak ve temmuz aylarında bir 'Kıdem Tazminatı Tavanı' belirler. Sizin aylık giydirilmiş brüt ücretiniz bu tavanı geçse bile, hesaplama yalnızca bu tavan miktar üzerinden yapılır. Dolayısıyla çok yüksek maaş alan çalışanlar da en fazla tavan sınırında tazminat alabilirler.\n\nÖdeme Zamanı ve Gecikme Faizi\nKıdem tazminatı kural olarak iş sözleşmesinin bittiği gün peşin olarak ödenmelidir. Taksitle ödenmesi konusunda işçinin onayı yoksa kabul edilemez. Zamanında ödenmeyen kıdem tazminatı için 'en yüksek mevduat faizi' oranında gecikme faizi talep etme hakkınız doğar." },
        ihbar: { title: "İhbar Süreleri ve Tazminat Hesabı", text: "İhbar tazminatı, iş sözleşmasını tek taraflı olarak fesheden (bitiren) tarafın, diğer tarafa yasal bildirim sürelerine uymadığı için ödemek zorunda olduğu bir tazminat türüdür.\n\nİhbar Öneli (Bildirim Süresi) Tam Olarak Nedir?\n'İhbar öneli', işçi veya işverenin sözleşmeyi bitirmeden önce karşı tarafa kanunen haber vermesi gereken 'zaman dilimi'dir. İş Hukuku, tarafların birbirlerini aniden zor durumda bırakmamasını hedefler. İşveren işçiyi çıkarırken ona 'yeni bir iş bulması için' zaman (önel) tanımalıdır. Benzer şekilde işçi de aniden çıkıp işleri aksatmamak için aynı süreyi işverene (istifa öncesi) önceden haber vermelidir. Bu bekleme süresine (önele) uymadan ayrılan veya işçiyi çıkaran taraf ihbar tazminatı öder.\n\nYasal İhbar Öneli Süreleri (İş Kanunu Madde 17)\nİhbar öneli, işçinin ayn işyerindeki çalışma süresine (kıdemine) göre belirlenir. Sözleşme ile artırılabilir ama azaltılamaz:\n• 0 - 6 ay arası çalışanlar için: 2 Hafta\n• 6 ay - 1,5 yıl arası çalışanlar için: 4 Hafta\n• 1,5 yıl - 3 yıl arası çalışanlar için: 6 Hafta\n• 3 yıldan fazla çalışanlar için: 8 Hafta\n\nNasıl Hesaplanır?\nİhbar tazminatı, işçinin son 'Giydirilmiş Brüt Ücreti' üzerinden hesaplanır. Yukarıdaki tablodan hangi ihbar öneli haftasına giriyorsanız, o kadar haftalık (giydirilmiş) ücretiniz ihbar tazminatı olarak hesaplanır. İhbar tazminatı, kıdemin aksine devlet tavan sınır uygulamasına tabi değildir; tam maaşınız üzerinden hesaplanır.\n\nVergi Kesintileri\nKıdem tazminatından dadece damga vergisi kesilirken, ihbar tazminatından hem Damga Vergisi hem de Gelir Vergisi kesilir. Bu yüzden o anki vergi diliminiz alacağınız net ele geçen tutarı etkiler.\n\nHangi Durumlarda Ödenmez?\n• İşverenin sizi 'Haklı Nedenle' (Ahlak ve iyi niyet kurallarına aykırılık vb. Madde 25/II) derhal işten çıkarması durumunda.\n• İşçinin 'Haklı bir nedenle' (işverenin maaş/mesai ödememesi, mobbing yapması vb.) haklı istifasında bekleme süresi şartı aranmaz, ihbar tazminatı da doğmaz.\n• Deneme süresi (ilk 2 ay) içindeyseniz taraflar birbirlerine ihbar öneli vermeksizin ve tazminatsız sözleşmeyi sonlandırabilirler." },
        hukuk: { title: "İşten Çıkarıldınızda İlk 10 Adım", text: "İşten aniden çıkarıldığınızda paniğe kapılmayın ve şu adımları takip edin:\n\n1. Evrak İmzalamadan Önce Okuyun: Ne imzaladığınızı anlamadan 'ibraname', 'istifa dilekçesi' ve 'ikâle sözleşmesi'ne asla imza atmayın.\n2. İşten Çıkış Kodunuzu Öğrenin: E-Devlet üzerinden SGK işten ayrılış bildirgesini kontrol edin (Örn: Kod 04, Kod 29).\n3. Delilleri Güvenceye Alın: WhatsApp mesajları, mailler, maaş bordroları ve mesai çizelgelerinizi hemen yedekleyin.\n4. Kendi Hesaplamanızı Yapın: Hemen bir avukatla görüşmeden önce sistemimizden ortalama ne kadar hak ettiğinizi hesaplayın.\n5. İşsizlik Maaşı İçin Başvurun: Haklı feshiniz veya işverenin çıkarması durumunda İŞKUR'a 30 gün içinde başvurmayı unutmayın.\n6. Şahitlerinizi Belirleyin: Mahkemede lehinize şahitlik yapabilecek (mümkünse işten ayrılmış) eski çalışma arkadaşlarınızı tespip edin.\n7. İşe İade Şartlarını Gözden Geçirin: İşyerinde 30'dan fazla çalışan varsa ve 6 aylık kıdeminiz dolduysa işe iade davası açabilirsiniz.\n8. Süreyi Kaçırmayın: İşe iade davaları için sadece 30 günlük, diğer alacaklar için 5 yıllık yasal süreniz vardır.\n9. Arabulucu Sürecini Başlatın: Türkiye'de iş davalarından önce zorunlu olarak arabulucu başvurusunda bulunmanız gerekmektedir.\n10. Uzman Hukuki Destek Alın: Tüm bu süreci profesyonel bir avukat aracılığıyla yönetin, hak kaybına uğramayın." }
    };
    document.getElementById('blogModalTitle').textContent = data[type].title;
    document.getElementById('blogModalContent').textContent = data[type].text;
    openModal('blogModal');
};

// Para formatlama
function formatTL(amount) {
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Tarih formatlama
function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
}

// Global exports
window.HakPortal = { Auth, apiCall, showToast, showConfirm, openModal, closeModal, formatTL, formatDate, goPanel, logout };
window.openModal = openModal;
window.closeModal = closeModal;
window.showConfirm = showConfirm;
window.switchTab = switchTab;
window.goPanel = goPanel;
window.logout = logout;
window.toggleMenu = toggleMenu;
// ════════════════════════════════════════════════════════════
//  AVATAR DESIGNER - DiceBear Avataaars (Resmi JS Kütüphane)
//  Bitmoji kalitesinde, internet gerektirmez, anında güncelleme
// ════════════════════════════════════════════════════════════

let currentAvatarConfig = {
    skinColor: 'edb98a',   // Hex without # (DiceBear avataaars)
    top: 'bob',      // Bob - açıkça görünen saç
    hairColor: 'brown',
    eyes: 'happy',
    eyebrows: 'defaultNatural',
    mouth: 'smile',
    clothing: 'shirtCrewNeck',
    clothesColor: 'blue02',
    accessories: '__none__',
    facialHair: '__none__',
    facialHairColor: 'brown',
    bgColor1: '#b6e3f4',
    bgColor2: '#c0aede',
};

let activeDesignerCategory = 'skinColor';

// Eski API uyumu
window.generateAvatarUrl = (config) => window.AvatarEngine?.toDataURL(config) || '';

window.openAvatarDesigner = () => {
    // Kayıtlı config varsa yükle
    const user = (window.HakPortal?.Auth || window.Auth)?.getUser?.();
    if (user?.avatarConfig) {
        try { Object.assign(currentAvatarConfig, JSON.parse(user.avatarConfig)); } catch (e) { }
    }

    openModal('avatarDesignerModal');

    const launch = () => { _renderAllDesignerUI(); };

    if (window.AvatarEngine && window.AvatarEngine.PARTS && Object.keys(window.AvatarEngine.PARTS).length > 0) {
        launch();
    } else {
        // Engine async yükleniyor, bekle
        window.addEventListener('avatarEngineReady', launch, { once: true });
        // 5 saniye sonra timeout
        setTimeout(() => {
            const ctrl = document.getElementById('designerControls');
            if (ctrl && ctrl.innerHTML === '') {
                ctrl.innerHTML = '<p style="color:#f59797;padding:20px;text-align:center;">⚠️ Avatar motoru yüklenemedi. İnternet bağlantınızı kontrol edin.</p>';
            }
        }, 5000);
    }
};

function _renderAllDesignerUI() {
    _renderDesignerTabs();
    _renderDesignerOptions();
    _renderDesignerPreview();
}

// ── Önizleme (async fetch + inline SVG) ──────────────────────
function _renderDesignerPreview() {
    const container = document.getElementById('avatarPreviewContainer');
    if (!container || !window.AvatarEngine) return;
    // Async: fetch SVG from DiceBear API and inject
    window.AvatarEngine.renderInline(currentAvatarConfig, container).then(() => {
        // Başarılı yükleme animasyonu
        const svg = container.querySelector('svg');
        if (svg) {
            svg.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
            svg.style.transform = 'scale(0.92)';
            requestAnimationFrame(() => {
                setTimeout(() => { svg.style.transform = 'scale(1)'; }, 20);
            });
        }
    });
}

// ── Kategori Sekmeleri ─────────────────────────────────────
function _renderDesignerTabs() {
    const el = document.getElementById('designerTabs');
    if (!el || !window.AvatarEngine?.PARTS) return;

    const order = window.AvatarEngine.CATEGORY_ORDER;
    const parts = window.AvatarEngine.PARTS;

    el.innerHTML = order
        .filter(key => parts[key])
        .map(key => {
            const part = parts[key];
            const isActive = activeDesignerCategory === key;
            return `<button class="designer-tab ${isActive ? 'active' : ''}"
                        onclick="switchDesignerCategory('${key}')">
                        <span class="tab-icon">${part.icon}</span>
                        <span class="tab-label">${part.label}</span>
                    </button>`;
        }).join('');
}

// ── Seçenek Paneli ─────────────────────────────────────────
function _renderDesignerOptions() {
    const container = document.getElementById('designerControls');
    if (!container || !window.AvatarEngine?.PARTS) return;

    const E = window.AvatarEngine;
    const part = E.PARTS[activeDesignerCategory];
    if (!part) return;

    const type = part.type || 'style';
    let html = '<div class="options-grid fade-in">';

    if (type === 'named-color' || type === 'bg-gradient' || type === 'hex-color') {
        part.options.forEach(opt => {
            const isActive = _isActive(activeDesignerCategory, opt.id);
            const bg = type === 'bg-gradient'
                ? `linear-gradient(135deg, ${opt.hex1}, ${opt.hex2})`
                : opt.hex;

            html += `<button class="color-swatch ${isActive ? 'active' : ''}"
                        onclick="updateDesignerPart('${activeDesignerCategory}','${opt.id}')"
                        title="${opt.label}">
                        <span class="swatch-circle" style="background:${bg}"></span>
                        <span class="swatch-label">${opt.label}</span>
                     </button>`;
        });
    } else {
        // Style: her seçenek için DiceBear API URL'li mini avatar (<img>)
        part.options.forEach(opt => {
            const isActive = _isActive(activeDesignerCategory, opt.id);
            const miniConfig = { ...currentAvatarConfig, [activeDesignerCategory]: opt.id };
            // Mini önizleme URL'i (tarayıcı cache'li)
            const miniUrl = E.getAvatarUrl(miniConfig);

            html += `<button class="style-cell ${isActive ? 'active' : ''}"
                        onclick="updateDesignerPart('${activeDesignerCategory}','${opt.id}')">
                        <img src="${miniUrl}" alt="${opt.label}" loading="lazy"
                             onerror="this.style.opacity='0.3'" />
                        <span class="style-label">${opt.label}</span>
                     </button>`;
        });
    }

    html += '</div>';
    container.innerHTML = html;
}

// Mevcut seçimi kontrol et
function _isActive(category, optId) {
    const part = window.AvatarEngine?.PARTS?.[category];
    if (category === 'background') {
        // id formatı: 'hex1-hex2' (# olmadan)
        const [h1] = optId.split('-');
        return currentAvatarConfig.bgColor1 === '#' + h1;
    }
    // skinColor ve named-color kategorileri: doğrudan karşılaştır
    return currentAvatarConfig[category] === optId;
}

// ── Global Fonksiyonlar ────────────────────────────────────
window.switchDesignerCategory = (key) => {
    activeDesignerCategory = key;
    _renderDesignerTabs();
    _renderDesignerOptions();
};

window.updateDesignerPart = (key, val) => {
    if (key === 'background') {
        const parts = val.split('-');
        // format: hex1-hex2 (e.g. "b6e3f4-c0aede")
        currentAvatarConfig.bgColor1 = '#' + parts[0];
        currentAvatarConfig.bgColor2 = '#' + (parts[1] || parts[0]);
    } else {
        currentAvatarConfig[key] = val;
    }

    // Anında önizleme güncelle (sıfır gecikme, sıfır HTTP isteği)
    _renderDesignerPreview();
    // Aktif halkayı güncelle (sadece seçim göstergesi)
    _renderDesignerOptions();
};

// Geri uyumluluk
window.updateAvatarPart = window.updateDesignerPart;

window.saveAvatarAndClose = async () => {
    if (!window.AvatarEngine) return;

    const configStr = JSON.stringify(currentAvatarConfig);
    // Önce mevcut URL'i profil avatarlarına ata (anında)
    const avatarUrl = window.AvatarEngine.buildApiUrl(currentAvatarConfig);
    document.querySelectorAll('#pAvatarImg, #avAvatarImg, .profile-avatar-img').forEach(img => {
        img.src = avatarUrl;
    });

    // Data URI'yı async oluştur (push notification veya export için)
    let dataUrl = avatarUrl;
    try {
        dataUrl = await window.AvatarEngine.toDataURL(currentAvatarConfig);
    } catch (_) { }

    window.selectedAvatar = dataUrl;
    window.selectedAvatarConfig = configStr;

    // Sunucuya kaydet
    const token = localStorage.getItem('token');
    if (token) {
        fetch('/api/users/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ avatar: dataUrl, avatarConfig: configStr })
        }).catch(() => { });
    }

    closeModal('avatarDesignerModal');
    if (window.showToast) showToast('✨ Avatar kaydedildi!', 'success');
};


