// =============================================
// HakPortal - Auth JS (auth.js)
// =============================================

// ---- GİRİŞ ----
async function doLogin() {
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    const errorEl = document.getElementById('loginError');
    const btn = document.querySelector('#girisForm .btn-primary');

    if (!email || !password) {
        showErr(errorEl, 'E-posta ve şifre gerekli.');
        return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Giriş yapılıyor...'; }

    try {
        const data = await window.HakPortal.apiCall('POST', '/auth/login', { email, password });
        window.HakPortal.Auth.setAuth(data.token, data.user);
        window.closeModal('authModal');
        window.HakPortal.showToast(`Hoş geldin, ${data.user.ad}! 👋`, 'success');
        setTimeout(() => {
            const role = data.user.role;
            if (role === 'admin') window.location.href = '/admin.html';
            else if (role === 'avukat') window.location.href = '/avukat-panel.html';
            else window.location.href = '/panel.html';
        }, 700);
    } catch (err) {
        showErr(errorEl, err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Giriş Yap'; }
    }
}

// ---- KAYIT ----
async function doRegister() {
    const ad = document.getElementById('regAd')?.value?.trim();
    const soyad = document.getElementById('regSoyad')?.value?.trim();
    const email = document.getElementById('regEmail')?.value?.trim();
    const telefon = document.getElementById('regTelefon')?.value?.trim();
    const dogumTarihi = document.getElementById('regDogumTarihi')?.value;
    const sehir = document.getElementById('regSehir')?.value;
    const password = document.getElementById('regPassword')?.value;
    const passwordConfirm = document.getElementById('regPasswordConfirm')?.value;
    const kvkk = document.getElementById('regKvkk')?.checked;
    const errorEl = document.getElementById('regError');
    const btn = document.querySelector('#kayitForm .btn-primary');

    // Ön yüz kontrolleri
    if (!ad || !soyad) { showErr(errorEl, 'Ad ve soyad zorunludur.'); return; }
    if (!email) { showErr(errorEl, 'E-posta zorunludur.'); return; }
    if (!telefon) { showErr(errorEl, 'Telefon numarası zorunludur.'); return; }
    if (!dogumTarihi) { showErr(errorEl, 'Doğum tarihi zorunludur.'); return; }
    if (!sehir) { showErr(errorEl, 'Lütfen şehir seçin.'); return; }
    if (!password) { showErr(errorEl, 'Şifre zorunludur.'); return; }
    if (password.length < 8) { showErr(errorEl, 'Şifre en az 8 karakter olmalıdır.'); return; }
    if (password !== passwordConfirm) { showErr(errorEl, 'Şifreler eşleşmiyor.'); return; }
    if (!kvkk) { showErr(errorEl, 'KVKK ve Kullanım Şartları\'nı kabul etmelisiniz.'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Kayıt oluşturuluyor...'; }

    try {
        const data = await window.HakPortal.apiCall('POST', '/auth/register', {
            ad, soyad, email, password, passwordConfirm,
            telefon, dogumTarihi, sehir
        });
        window.HakPortal.Auth.setAuth(data.token, data.user);
        window.closeModal('authModal');
        window.HakPortal.showToast('Hesabınız oluşturuldu! Hoş geldiniz 🎉', 'success');
        setTimeout(() => window.location.href = '/panel.html', 700);
    } catch (err) {
        showErr(errorEl, err.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Hesap Oluştur →'; }
    }
}

function showErr(el, msg) {
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

window.doLogin = doLogin;
window.doRegister = doRegister;
