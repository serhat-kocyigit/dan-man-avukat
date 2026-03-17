// =============================================
// HakPortal - Avukat Panel JS (DÜZELTILMIŞ)
// =============================================

function getHP() { return window.HakPortal || {}; }
const _Auth = () => getHP().Auth || window.Auth;
const _apiCall = () => getHP().apiCall || window.apiCall;
const _showToast = () => getHP().showToast || window.showToast;
const _formatTL = () => getHP().formatTL || window.formatTL;
const _formatDate = () => getHP().formatDate || window.formatDate;

let activeCaseId = null;
let avMesajInterval = null;
let avCurrentSection = null;
const _avLoading = {}; // yükleme kilitleri

let selectedAvatar = '⚖️';
let _avProfilData = null;

document.addEventListener('DOMContentLoaded', () => {
  const Auth = _Auth();
  if (!Auth || !Auth.isLoggedIn() || Auth.getRole() !== 'avukat') {
    window.location.href = '/';
    return;
  }

  const avukat = Auth.getUser();
  const nameEl = document.getElementById('navAvukatName');
  if (nameEl) nameEl.textContent = `Av. ${avukat?.ad || ''} ${avukat?.soyad || ''}`;

  const avKartNo = document.getElementById('avModalKartNo');
  if (avKartNo) {
    avKartNo.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 16);
      e.target.value = val.replace(/(.{4})/g, '$1 ').trim();
    });
  }

  const avSonKul = document.getElementById('avModalSonKullanma');
  if (avSonKul) {
    avSonKul.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 4);
      if (val.length > 2) val = val.substring(0, 2) + ' / ' + val.substring(2, 4);
      e.target.value = val;
    });
  }

  avukatSection('acikDavalar');

  // Okunmamis mesaj badge'i basalt
  loadAvMesajBadge();
  setInterval(loadAvMesajBadge, 30000);
});

// ---- SECTION ----
function avukatSection(name) {
  const sections = ['AcikDavalar', 'TeklifVer', 'Tekliflerim', 'AktivDavalar', 'Mesajlar', 'Profil'];
  sections.forEach(s => {
    const el = document.getElementById(`avSection${s}`);
    if (el) el.style.display = 'none';
  });

  const key = name.charAt(0).toUpperCase() + name.slice(1);
  const target = document.getElementById(`avSection${key}`);
  if (target) target.style.display = 'block';
  else { console.warn('avSection bulunamadı:', `avSection${key}`); return; }

  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  // Mesaj dışına çıkınca interval'ı temizle
  if (avCurrentSection === 'mesajlar' && name !== 'mesajlar') {
    if (avMesajInterval) { clearInterval(avMesajInterval); avMesajInterval = null; }
  }
  avCurrentSection = name;

  if (name === 'acikDavalar') { loadAcikDavalar(); document.getElementById('sbAcik')?.classList.add('active'); }
  if (name === 'tekliflerim') { loadAvTeklifler(); document.getElementById('sbTeklif')?.classList.add('active'); }
  if (name === 'aktivDavalar') { loadAktivDavalar(); document.getElementById('sbAktif')?.classList.add('active'); }
  if (name === 'mesajlar') {
    // Eğer zaten bir mesaj penceresi açıksa ve "Mesajlar" menüsüne tekrar basıldıysa listeye dön
    if (activeCaseId && document.getElementById('avMsgBody')) {
      activeCaseId = null;
    }
    loadAvMesajlar();
    document.getElementById('sbMesaj')?.classList.add('active');
    // Badge sifirla (kullanici mesajlar bolumunu acti = okundu)
    const avBadge = document.getElementById('avMesajBadge');
    if (avBadge) { avBadge.style.display = 'none'; avBadge.textContent = ''; }
  }
  if (name === 'profil') { loadAvProfil(); document.getElementById('sbProfil')?.classList.add('active'); }
}

// ---- AVUKAT MESAJ BADGE ----
async function loadAvMesajBadge() {
  try {
    const token = localStorage.getItem('hp_token');
    if (!token) return;
    const res = await fetch('/api/messages/okunmamis-sohbet', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const badge = document.getElementById('avMesajBadge');
    if (!badge) return;
    const sayi = parseInt(data.sayi) || 0;
    if (sayi > 0) {
      badge.textContent = sayi > 9 ? '9+' : sayi;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
    }
  } catch (e) {
    // Sessizce yut
  }
}

// ---- PROFİL FOTOĞRAFI ÖNİZLEME ----
function previewAvProfilePhoto(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = document.getElementById('avAvatarImg');
      if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}
window.previewAvProfilePhoto = previewAvProfilePhoto;

function renderDavaGirdileri(inputs, calismaGun) {
  if (!inputs) return '';
  const cikisMap = {
    'isverenTarafindan': 'İşveren Tarafından Fesih',
    'hakliFesihIsci': 'Haklı Nedenle Fesih (İşçi)',
    'isciIstifasi': 'İstifa (İşçi Beyanı)',
    'asilliNeden': 'Ahlak/İyi Niyet İhlali (İşveren 25/2)',
    '02_deneme_suresi': 'Deneme Süresi',
    '04_haksiz_fesih': 'Haksız Fesih',
    '05_belirli_sure': 'Belirli Süreli Sözleşme Bitimi'
  };
  const sebep = cikisMap[inputs.cikisSekli] || inputs.cikisSekli || 'Bilinmiyor';

  return `
    <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.1); color:#ccc; font-size:0.75rem; text-align:left;">
      <strong style="color:var(--text-light);display:block;margin-bottom:4px;font-size:0.75rem;">📌 Üye Ham Beyanları (Form Girdileri):</strong>
      <ul style="margin:0; padding-left:14px; list-style:disc; line-height:1.4; color:var(--text-secondary);">
        <li><b>Çıkış:</b> ${sebep}</li>
        <li><b>Dönem:</b> ${_formatDate()(inputs.isGirisTarihi)} &rarr; ${_formatDate()(inputs.isCikisTarihi)} <span style="color:var(--accent);">(${calismaGun || '?'} Gün)</span></li>
        <li><b>Maaş:</b> ${_formatTL()(inputs.brutMaas || 0)} Brüt &nbsp;|&nbsp; <b>Yan Hak:</b> ${_formatTL()(inputs.yanHaklar || 0)}</li>
        <li><b>Eksik:</b> ${inputs.kullanilmayanIzinGun || 0} Gün İzin / ${inputs.haftalikFazlaMesai || 0} Saat Mesai</li>
      </ul>
    </div>
  `;
}

// Tam kapsamlı Hukuki ve Finansal Pano Raporlayıcısı
function renderDetayliDavaRaporu(data, skorInfo = null) {
  if (!data) return '';

  let skorHtml = '';
  if (skorInfo && skorInfo.skorToplam !== undefined) {
    const kat = skorInfo.riskKategorisi;
    const badgeColor = kat === 'PREMIUM' ? '#fb5607' : kat === 'NORMAL' ? '#3a86ff' : kat === 'RISKLI' ? '#ffbe0b' : '#ff006e';

    // Risk notlarını listeletelim
    let riskNotesList = '';
    if (skorInfo.riskNotlari && skorInfo.riskNotlari.length > 0) {
      riskNotesList = `<ul style="margin:5px 0 0 0; padding-left:14px; list-style-type:square; font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">` +
        skorInfo.riskNotlari.map(not => `<li><span style="color:#e63946">⚠️</span> ${not}</li>`).join('') +
        `</ul>`;
    }

    let ispatList = '';
    if (skorInfo.ispatBelgeleri && skorInfo.ispatBelgeleri.length > 0) {
      ispatList = `<div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.05); font-size:0.8rem; color:var(--text-secondary);">
          <strong style="color:var(--primary-light); display:flex; align-items:center; gap:5px; margin-bottom:5px;">📎 Ekli İspat Belgeleri:</strong>
          <ul style="margin:0; padding-left:14px; list-style:none;">` +
        skorInfo.ispatBelgeleri.map(belge => `<li style="margin-bottom:4px;"><a href="${belge.url}" target="_blank" style="color:var(--accent); text-decoration:underline; font-weight:600;">📄 ${belge.name}</a></li>`).join('') +
        `</ul>
       </div>`;
    }

    skorHtml = `
      <div style="margin-top:10px; background:var(--bg-card); border-left:4px solid ${badgeColor}; padding:10px 12px; border-radius:6px; margin-bottom:10px; border-top:1px solid var(--border); border-right:1px solid var(--border); border-bottom:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <div style="font-size:0.8rem; font-weight:700; color:${badgeColor}; text-transform:uppercase; letter-spacing:0.5px;">🤖 YZ DOSYA ANALİZİ: ${kat}</div>
          <div style="font-size:1.1rem; font-weight:900; color:#fff;">${skorInfo.skorToplam}<span style="font-size:0.7rem;color:var(--text-muted)">/100</span></div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-top:8px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:8px;">
          <div style="text-align:center;">
             <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Hukuki Güç</div>
             <div style="font-size:0.85rem; font-weight:700; color:var(--primary-light);">${skorInfo.skorHukuki}/100</div>
          </div>
          <div style="text-align:center;">
             <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Veri Tutarlılığı</div>
             <div style="font-size:0.85rem; font-weight:700; color:${skorInfo.skorVeri < 50 ? '#e63946' : 'var(--accent)'};">${skorInfo.skorVeri}/100</div>
          </div>
          <div style="text-align:center;">
             <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Tahsil İhtimali</div>
             <div style="font-size:0.85rem; font-weight:700; color:#fff;">${skorInfo.skorTahsil}/100</div>
          </div>
        </div>
        ${riskNotesList}
        ${ispatList}
      </div>
    `;
  }

  let html = `
    ${skorHtml}
    <div style="margin-top:10px; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; overflow:hidden;">
      <div style="padding:10px 12px; background:rgba(0, 217, 163, 0.05); border-bottom:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <strong style="color:var(--accent); font-size:0.85rem;">⚖️ Hukuki Nitelendirme</strong>
          <div style="text-align:right;">
            <span style="font-size:0.7rem; color:var(--text-muted); display:block; margin-bottom:-2px;">Tahmini Toplam</span>
            <span style="font-size:1.15rem; font-weight:800; color:var(--primary-light);">${_formatTL()(data.toplamNet || 0)}</span>
          </div>
        </div>
        <div style="color:var(--text-secondary); font-size:0.75rem; line-height:1.4;">
          ${data.legal?.gerekce || 'Sistem tarafından dava konusu derlendi.'}
        </div>
      </div>
      <div style="padding:10px 12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">
          ${data.kidem?.net > 0 ? `
          <div style="background:var(--bg-card); padding:8px; border-radius:6px; border:1px solid rgba(0,217,163,0.1);">
            <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">Kıdem Tazminatı</div>
            <div style="font-size:1rem; font-weight:700; color:var(--primary-light);">${_formatTL()(data.kidem.net)}</div>
          </div>` : ''}
          ${data.ihbar?.net > 0 ? `
          <div style="background:var(--bg-card); padding:8px; border-radius:6px; border:1px solid rgba(162,185,255,0.1);">
            <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">İhbar Tazminatı</div>
            <div style="font-size:1rem; font-weight:700; color:#a2b9ff;">${_formatTL()(data.ihbar.net)}</div>
          </div>` : ''}
        </div>
  `;

  const diger = data.diger || {};
  const ekstraHaklar = [
    { name: 'Boşta Geçen Süre Ücreti', val: diger.bostaGecenSureBrut, color: '#52b788' },
    { name: 'İşe Başlatmama Tazminatı', val: diger.iseBaslatmamaBrut, color: '#ffb703' },
    { name: 'Kötü Niyet Tazminatı', val: diger.kotuNiyetNet, color: '#e63946' },
    { name: 'Sendikal Tazminat', val: diger.sendikalNet, color: '#9d4edd' },
    { name: 'Ödenmemiş Maaş/Ücret', val: diger.odenmemisMaasBrut, color: '#4cc9f0' },
    { name: 'Fazla Mesai Ücreti', val: diger.mesaiBrut, color: '#f72585' },
    { name: 'Kullanılmayan Yıllık İzin', val: diger.izinBrut, color: '#f8961e' },
    { name: 'Bakiye Süre Ücreti', val: diger.bakiyeSureTazminatBrut, color: '#43aa8b' }
  ];

  let ekstraHtmlArr = ekstraHaklar.filter(h => h.val > 0);
  let ekstraHtml = '';
  if (ekstraHtmlArr.length > 0) {
    ekstraHtml = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px;">` +
      ekstraHtmlArr.map(h => `
      <div style="padding:8px; border-radius:6px; border:1px solid ${h.color}40; background:var(--bg-card);">
        <div style="font-size:0.7rem; color:${h.color}; font-weight:600; margin-bottom:2px;">⚖️ ${h.name}</div>
        <div style="font-size:0.95rem; font-weight:700; color:#fff;">${_formatTL()(h.val)}</div>
      </div>
    `).join('') + `</div>`;
  }

  if (ekstraHtml) {
    html += ekstraHtml;
  }

  html += renderDavaGirdileri(data._inputs, data.calismaGun);

  html += `</div></div>`;
  return html;
}

// ---- AÇIK DAVALAR ----
async function loadAcikDavalar() {
  const container = document.getElementById('acikDavalarListesi');
  if (!container) return;
  if (_avLoading['acikDavalar']) return;
  _avLoading['acikDavalar'] = true;
  // Sadece ilk açılışta spinner göster
  if (!container.dataset.loaded) {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>';
  }

  try {
    const profil = await _apiCall()('GET', '/avukat/profil');

    if (!profil.profilOnay) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">Profiliniz Onay Bekliyor</div>
          <div class="empty-sub">Admin ekibimiz profil bilgilerinizi inceliyor. Onaylandıktan sonra davalara teklif verebilirsiniz.</div>
        </div>`;
      return;
    }

    const titleEl = document.getElementById('acikDavatitle');
    if (titleEl) titleEl.textContent = `${profil.sehir} şehrindeki yeni davalar`;

    const davalar = await _apiCall()('GET', '/avukat/acik-davalar');

    if (!davalar.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">Şu an açık dava yok.</div>
          <div class="empty-sub">Yeni davalar geldiğinde burada görünecek. Sayfayı yenileyebilirsiniz.</div>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="dava-grid">` +
      davalar.map(d => `
        <div class="dava-card">
          <div class="dava-card-header">
            <div>
              <div class="dava-card-title">${d.davaTuru || 'Kıdem/İhbar Davası'}</div>
              <div class="dava-card-sub">${d.sehir} • ${_formatDate()(d.createdAt)}</div>
            </div>
            ${d.teklifVerildi
          ? '<span class="status-badge status-PENDING">✓ Teklif Verildi</span>'
          : '<span class="status-badge status-OPEN">Teklif Bekliyor</span>'
        }
          </div>
          <div class="dava-card-body">
            ${d.muvekkilAd ? `
            <div style="margin-bottom:12px;display:flex; gap:10px; align-items:center;">
              <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.1rem;color:#fff;">
                ${d.muvekkilAvatar ? `<img src="${d.muvekkilAvatar}" style="width:100%;height:100%;object-fit:cover;">` : d.muvekkilAd.charAt(0)}
              </div>
              <div>
                <div style="font-size:0.9rem;font-weight:700">${d.muvekkilAd} ${d.muvekkilSoyad}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary)">Müvekkil</div>
              </div>
            </div>` : ''}
            <div class="dava-detail-row">
              <span>Tahmini Alacak</span>
              <span class="alacak">${_formatTL()(d.tahminiAlacak)}</span>
            </div>
            <div class="dava-detail-row">
              <span>Mevcut Teklif</span>
              <span>${d.teklifSayisi} avukat</span>
            </div>
            ${renderDetayliDavaRaporu(d.hesaplamaVerisi, d)}
          </div>
          <div class="dava-card-actions">
            ${!d.teklifVerildi
          ? `<button class="btn-primary" style="font-size:0.85rem;padding:10px 16px"
                   onclick="goTeklifVer('${d.id}', ${d.tahminiAlacak}, '${d.davaTuru || 'kıdem-ihbar'}', '${d.sehir}')">
                   ⚖️ Teklif Ver
                 </button>`
          : `<button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px" disabled>
                   ✓ Teklif Gönderildi
                 </button>`
        }
          </div>
        </div>
      `).join('') + `</div>`;
    container.dataset.loaded = '1';
  } catch (err) {
    _showToast()(err.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">${err.message}</div></div>`;
  } finally {
    _avLoading['acikDavalar'] = false;
  }
}

function goTeklifVer(caseId, tahminiAlacak, davaTuru, sehir) {
  activeCaseId = caseId;
  avukatSection('teklifVer');

  const bilgiEl = document.getElementById('teklifDavaBilgi');
  if (bilgiEl) {
    bilgiEl.innerHTML = `
      <div class="dava-detail-row"><span>Dava Türü</span><span>${davaTuru}</span></div>
      <div class="dava-detail-row"><span>Şehir</span><span>${sehir}</span></div>
      <div class="dava-detail-row"><span>Tahmini Alacak</span><span class="alacak">${_formatTL()(tahminiAlacak)}</span></div>`;
  }

  // Formu sıfırla
  const form = document.getElementById('avTeklifForm');
  if (form) form.reset();
  document.getElementById('oranField').style.display = 'block';
  document.getElementById('sabitField').style.display = 'none';
}

function toggleUcretFields() {
  const model = document.getElementById('avUcretModeli')?.value;
  document.getElementById('oranField').style.display = model === 'yuzde' ? 'block' : 'none';
  document.getElementById('sabitField').style.display = model === 'sabit' ? 'block' : 'none';
}

async function submitTeklif() {
  const ucretModeli = document.getElementById('avUcretModeli')?.value;
  const oran = document.getElementById('avOran')?.value;
  const sabitUcret = document.getElementById('avSabitUcret')?.value;
  const onOdeme = document.getElementById('avOnOdeme')?.value === 'true';
  const tahminiSure = document.getElementById('avTahminiSure')?.value;
  const aciklama = document.getElementById('avAciklama')?.value;

  if (!ucretModeli) { _showToast()('Ücret modeli seçin.', 'error'); return; }
  if (ucretModeli === 'yuzde' && (!oran || oran <= 0)) {
    _showToast()('Oran giriniz.', 'error'); return;
  }
  if (ucretModeli === 'sabit' && (!sabitUcret || sabitUcret <= 0)) {
    _showToast()('Ücret tutarı giriniz.', 'error'); return;
  }
  if (!tahminiSure) { _showToast()('Tahmini süre gerekli.', 'error'); return; }

  const submitBtn = document.getElementById('submitTeklifBtn');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Gönderiliyor...'; }

  try {
    await _apiCall()('POST', '/offers', {
      caseId: activeCaseId,
      ucretModeli,
      oran: ucretModeli === 'yuzde' ? parseFloat(oran) : null,
      sabitUcret: ucretModeli === 'sabit' ? parseFloat(sabitUcret) : null,
      onOdeme,
      tahminiSure,
      aciklama: aciklama || undefined
    });
    _showToast()('Teklifiniz gönderildi! 🎉', 'success');
    setTimeout(() => avukatSection('tekliflerim'), 800);
  } catch (err) {
    _showToast()(err.message, 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Teklifi Gönder'; }
  }
}

// ---- TEKLİFLERİM ----
async function loadAvTeklifler() {
  const container = document.getElementById('avTekliflerListesi');
  if (!container) return;
  if (_avLoading['tekliflerim']) return;
  _avLoading['tekliflerim'] = true;
  if (!container.dataset.loaded) {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>';
  }

  try {
    const teklifler = await _apiCall()('GET', '/avukat/tekliflerim');

    if (!teklifler.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">Henüz teklif vermediniz.</div>
          <div class="empty-sub">Açık davalara göz atıp teklif verin.</div>
        </div>`;
      return;
    }

    const statusLabels = {
      PENDING: '⏳ Beklemede',
      SELECTED: '✅ Seçildi',
      REJECTED: '❌ Reddedildi',
      WAITING_PAYMENT: '💳 Ödeme Bekleniyor',
      WAITING_LAWYER_PAYMENT: '💳 Ödeme Bekleniyor'
    };

    container.innerHTML = `<div class="dava-grid">` +
      teklifler.map(t => {
        // DOĞRU AKIŞ:
        // 1. Kullanıcı teklif seçti → MATCHING → Belgeler avukata açılır → "Kabul Et" veya "Vazgeç"
        // 2. Avukat kabul edince → MATCHING ama engagement WAITING_USER_DEPOSIT → Kullanıcı 99 TL bekle
        // 3. Kullanıcı 99 TL ödedi → WAITING_LAWYER_PAYMENT → Avukat platform bedeli öder
        
        // Teklif "SELECTED" durumunda ve dava "MATCHING" aşamasında. 
        // Ancak avukat çoktan kabul etmişse engagement durumu WAITING_USER_DEPOSIT olur. 
        const isMatching = t.status === 'SELECTED' && t.caseStatus === 'MATCHING' && t.engagementStatus !== 'WAITING_USER_DEPOSIT';
        const isWaitingUserDeposit = t.status === 'SELECTED' && (t.engagementStatus === 'WAITING_USER_DEPOSIT' || t.caseStatus === 'WAITING_USER_DEPOSIT');
        // Avukat platform ücreti ödeme aşaması
        const isWaitingLawyerPayment = t.status === 'SELECTED' && (t.caseStatus === 'WAITING_LAWYER_PAYMENT' || t.caseStatus === 'WAITING_PAYMENT');
        // const isPreReview = t.status === 'SELECTED' && t.caseStatus === 'PRE_CASE_REVIEW'; // Old logic, replaced by isMatching
        // MATCHING aşamasında belgeler açık
        // const belgelerAcik = isMatching && t.ispatBelgeleri && t.ispatBelgeleri.length > 0; // Not directly used, logic embedded below

        // İspat belgeleri HTML'i - sadece MATCHING aşamasında göster
        let ispatHtml = '';
        if (isMatching) {
          if (t.ispatBelgeleri && t.ispatBelgeleri.length > 0) {
            ispatHtml = `
              <div style="margin-top:14px; padding:14px; background:linear-gradient(135deg,rgba(0,217,163,0.09),rgba(0,217,163,0.02)); border:1px solid rgba(0,217,163,0.35); border-radius:10px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                  <span style="font-size:1.1rem;">📎</span>
                  <strong style="color:var(--accent);font-size:0.85rem;">Müvekkil İspat Belgeleri (${t.ispatBelgeleri.length} adet)</strong>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  ${t.ispatBelgeleri.map(b => `
                    <a href="${b.url || '#'}" target="_blank"
                      style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(0,0,0,0.2);border-radius:7px;border:1px solid rgba(255,255,255,0.08);text-decoration:none;color:var(--text-color);transition:all 0.2s;"
                      onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(0,217,163,0.07)'"
                      onmouseout="this.style.borderColor='rgba(255,255,255,0.08)';this.style.background='rgba(0,0,0,0.2)'">
                      <span style="font-size:1.4rem;">📄</span>
                      <div style="overflow:hidden;">
                        <div style="font-size:0.83rem;font-weight:700;color:var(--accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.name || 'Belge'}</div>
                        <div style="font-size:0.72rem;color:var(--text-muted);">Görüntüle / İndir</div>
                      </div>
                      <span style="margin-left:auto;font-size:0.75rem;color:var(--accent);">→</span>
                    </a>
                  `).join('')}
                </div>
                <div style="margin-top:10px;padding:8px 10px;background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.25);border-radius:6px;font-size:0.78rem;color:#ffc107;">
                  🔒 Bu belgeler yalnızca sizinle paylaşılmıştır. Üçüncü kişilerle paylaşılması yasaktır.
                </div>
              </div>`;
          } else {
            ispatHtml = `
              <div style="margin-top:12px;padding:10px;background:rgba(0,217,163,0.04);border:1px dashed rgba(0,217,163,0.2);border-radius:8px;font-size:0.8rem;color:var(--text-muted);text-align:center;">
                📭 Müvekkil bu dava için ispat belgesi eklememiş.
              </div>`;
          }
        }

        return `
          <div class="dava-card" style="${isMatching ? 'border-color:#ffc107;border-width:2px;' : isWaitingLawyerPayment ? 'border-color:var(--accent);border-width:2px;' : ''}">
            <div class="dava-card-header">
              <div>
                <div class="dava-card-title">${t.caseDavaTuru || 'Dava'}</div>
                <div class="dava-card-sub">${t.caseSehir || '-'} • ${_formatDate()(t.createdAt)}</div>
              </div>
              <span class="status-badge status-${t.status}">${statusLabels[t.status] || t.status}</span>
            </div>
            <div class="dava-card-body">
              ${isMatching ? `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(90deg,rgba(255,193,7,0.12),transparent);border-radius:8px;margin-bottom:12px;border-left:3px solid #ffc107;">
                <span style="font-size:1.5rem;">🧐</span>
                <div>
                  <div style="font-size:0.85rem;font-weight:700;color:#ffc107;">Belge İnceleme Aşaması</div>
                  <div style="font-size:0.75rem;color:var(--text-secondary);">Müvekkilin belgelerini inceleyin. Davayı kabul edin ya da vazgeçin.</div>
                </div>
              </div>` : ''}
              ${isWaitingUserDeposit ? `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(90deg,rgba(255,193,7,0.12),transparent);border-radius:8px;margin-bottom:12px;border-left:3px solid #ffc107;">
                <span style="font-size:1.5rem;">⏳</span>
                <div>
                  <div style="font-size:0.85rem;font-weight:700;color:#ffc107;">Müvekkil Güven Bedeli Bekleniyor</div>
                  <div style="font-size:0.75rem;color:var(--text-secondary);">Müvekkil 99 TL güven bedelini ödediğinde platform bedeli ödeme aşamasına geçeceksiniz.</div>
                </div>
              </div>` : ''}
              ${isWaitingLawyerPayment ? `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(90deg,rgba(0,217,163,0.12),transparent);border-radius:8px;margin-bottom:12px;border-left:3px solid var(--accent);">
                <span style="font-size:1.5rem;">💳</span>
                <div>
                  <div style="font-size:0.85rem;font-weight:700;color:var(--accent);">Platform Bedeli Bekleniyor</div>
                  <div style="font-size:0.75rem;color:var(--text-secondary);">Müvekkil 99 TL güven bedelini ödedi. Sıra sizde — platform bedelini ödeyerek süreci başlatın.</div>
                </div>
              </div>` : ''}
              <div class="dava-detail-row">
                <span>Tahmini Alacak</span>
                <span class="alacak">${_formatTL()(t.tahminiAlacak || 0)}</span>
              </div>
              <div class="dava-detail-row">
                <span>Sizin Teklifiniz</span>
                <strong style="color:var(--primary-light)">${t.ucretModeli === 'yuzde' ? `%${t.oran}` : _formatTL()(Number(t.sabitUcret) || 0)}</strong>
              </div>
              ${renderDetayliDavaRaporu(t.hesaplamaVerisi, t)}
              ${ispatHtml}
              ${t.muvekkilAd && !isMatching && !isWaitingUserDeposit && !isWaitingLawyerPayment && !['CLOSED', 'KAPANDI', 'CANCELED'].includes(t.caseStatus) ? `
              <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border); display:flex; gap:10px; align-items:center;">
                <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.1rem;color:#fff;">
                  ${t.muvekkilAvatar ? `<img src="${t.muvekkilAvatar}" style="width:100%;height:100%;object-fit:cover;">` : t.muvekkilAd.charAt(0)}
                </div>
                <div>
                  <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Müvekkil İletişim Bilgileri:</div>
                  <div style="font-size:0.9rem;font-weight:700">${t.muvekkilAd} ${t.muvekkilSoyad}</div>
                  ${t.muvekkilEmail && t.muvekkilTelefon ? `<div style="font-size:0.8rem;color:var(--text-secondary)">${t.muvekkilEmail} • ${t.muvekkilTelefon}</div>` : ''}
                </div>
              </div>` : ''}
            </div>
            <div class="dava-card-actions">
              ${isMatching ? `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;">
                  <button class="btn-primary" style="font-size:0.82rem;padding:12px 8px;background:linear-gradient(135deg,#00d9a3,#00b386);color:#000;font-weight:700;"
                    onclick="window.avukatKabulEt('${t.id}')">
                    ✅ Dosyayı Kabul Et
                  </button>
                  <button class="btn-ghost" style="font-size:0.82rem;padding:12px 8px;color:#ff6b6b;border-color:#ff6b6b;"
                    onclick="window.avukatDosyadanVazgec('${t.id}')">
                    ↩️ Vazgeç
                  </button>
                </div>
              ` : ''}
              ${isWaitingLawyerPayment ? `<button class="btn-primary" style="font-size:0.85rem;padding:10px 16px;width:100%" onclick="openAvukatOdemeModal('${t.id}', ${t.tahminiAlacak})">💸 Platform Bedelini Öde (${t.tahminiAlacak < 20000 ? '750' : t.tahminiAlacak < 50000 ? '1.250' : '2.000'} TL)</button>` : ''}
              ${t.status === 'SELECTED' && ['PRE_CASE_REVIEW', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL'].includes(t.caseStatus) ? `<button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%" onclick="avMesajYukle('${t.caseId}')">💬 Müvekkilinizle Mesajlaş</button>` : ''}
              ${t.status === 'SELECTED' && ['CLOSED', 'KAPANDI', 'CANCELED'].includes(t.caseStatus) ? `<button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%;color:#ff6b6b;border-color:rgba(255,107,107,0.3);background:rgba(255,107,107,0.05);cursor:not-allowed;" disabled>🔒 Dava Dosyası Kapandı</button>` : ''}
              ${t.status === 'PENDING' ? `<button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%" disabled>⏳ Kullanıcı Kararını Bekliyor</button>` : ''}
              ${isWaitingUserDeposit ? `<button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%" disabled>⏳ Müvekkil Güven Bedeli Bekleniyor</button>` : ''}
              ${t.status === 'REJECTED' || t.status === 'REJECTED_BY_LAWYER' ? `<button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%;opacity:0.5;" disabled>❌ Teklif Reddedildi</button>` : ''}
            </div>
          </div>
        `;
      }).join('') + `</div>`;

    // ---- DOSYAYI KABUL ET FONKSİYONU ----
    window.avukatKabulEt = async function (offerId) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML = `
        <div style="background:var(--bg-card);border:2px solid #00d9a3;border-radius:16px;padding:28px;max-width:420px;width:100%;box-shadow:0 0 40px rgba(0,217,163,0.25);">
          <div style="text-align:center;font-size:3rem;margin-bottom:12px;">✅</div>
          <h2 style="text-align:center;font-size:1.2rem;font-weight:800;margin-bottom:8px;color:#00d9a3;">Dosyayı Kabul Et</h2>
          <p style="text-align:center;font-size:0.88rem;color:var(--text-secondary);margin-bottom:20px;line-height:1.6;">
            Belgeleri incediniz ve bu davayı üstlenmek istiyorsunuz. Kabul ettiğinizde müvekkile bildirim gidecek ve <strong style="color:#00d9a3;">99 TL güven bedeli</strong> yatırması istenecek.
          </p>
          <div style="background:rgba(0,217,163,0.07);border:1px solid rgba(0,217,163,0.25);border-radius:8px;padding:12px;margin-bottom:20px;font-size:0.82rem;color:#00d9a3;">
            📌 Müvekkil 99 TL ödedikten sonra sıra sizde — platform bedelini ödeyerek dava sürecini başlatırsınız.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button onclick="this.closest('.modal-overlay').remove()"
              style="padding:12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-color);cursor:pointer;font-size:0.9rem;">İptal</button>
            <button id="confirmKabulBtn" onclick="window._doKabul('${offerId}', this)"
              style="padding:12px;border-radius:8px;border:none;background:linear-gradient(135deg,#00d9a3,#00b386);color:#000;cursor:pointer;font-size:0.9rem;font-weight:800;">Evet, Kabul Et</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    };

    window._doKabul = async function (offerId, btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Gönderiliyor...';

      // Modal'ı hemen kapat — kullanıcı beklemeden devam edebilir
      const overlay = btn.closest('.modal-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s';
        setTimeout(() => overlay.remove(), 200);
      }

      // Toast hemen göster
      _showToast()('✅ Dosya kabul edildi! Müvekkile bildirim gönderildi, güven ödemesi bekleniyor.', 'success');

      // API isteğini ve liste yenilemeyi ARKA PLANDA yap (kullanıcı beklemez)
      (async () => {
        try {
          await _apiCall()('PUT', `/offers/${offerId}/kabul`);
        } catch (err) {
          // Hata olursa sessizce logla, kullanıcıyı tekrar toast ile bilgilendir
          console.warn('Kabul API hatası:', err);
          _showToast()('⚠️ İşlem sırasında bir sorun oluştu: ' + err.message, 'error');
        } finally {
          // Liste arka planda yenilenir
          _avLoading['tekliflerim'] = false;
          if (container) delete container.dataset.loaded;
          loadAvTeklifler();
        }
      })();
    };


    // ---- DOSYADAN VAZGEÇ FONKSİYONU ----
    window.avukatDosyadanVazgec = async function (offerId) {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);align-items:center;justify-content:center;padding:20px;';
      modal.innerHTML = `
        <div style="background:var(--bg-card);border:2px solid #ff6b6b;border-radius:16px;padding:28px;max-width:420px;width:100%;box-shadow:0 0 40px rgba(255,107,107,0.25);">
          <div style="text-align:center;font-size:3rem;margin-bottom:12px;">↩️</div>
          <h2 style="text-align:center;font-size:1.2rem;font-weight:800;margin-bottom:8px;color:#ff6b6b;">Dosyadan Vazgeç</h2>
          <p style="text-align:center;font-size:0.88rem;color:var(--text-secondary);margin-bottom:20px;line-height:1.5;">
            Belgeleri inceledikten sonra bu davayı üstlenmek istemediğinizi mi belirtmek istiyorsunuz?
          </p>
          <div style="background:rgba(255,107,107,0.07);border:1px solid rgba(255,107,107,0.25);border-radius:8px;padding:12px;margin-bottom:16px;font-size:0.82rem;color:#ff6b6b;">
            ⚠️ Vazgeçerseniz dava tekrar teklif havuzuna döner ve müvekkile bildirim gönderilir. Bu işlem geri alınamaz.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <button onclick="this.closest('.modal-overlay').remove()"
              style="padding:12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-color);cursor:pointer;font-size:0.9rem;">İptal</button>
            <button id="confirmVazgecBtn" onclick="window._doVazgec('${offerId}', this)"
              style="padding:12px;border-radius:8px;border:none;background:#ff6b6b;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:700;">Evet, Vazgeç</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    };

    window._doVazgec = async function (offerId, btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Gönderiliyor...';

      // Modal'ı hemen kapat
      const overlay = btn.closest('.modal-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s';
        setTimeout(() => overlay.remove(), 200);
      }

      // Toast hemen göster
      _showToast()('↩️ Dosyadan vazgeçildi. Dava tekrar teklif havuzuna döndü.', 'info');

      // API isteği ve liste yenileme arka planda
      (async () => {
        try {
          await _apiCall()('PUT', `/offers/${offerId}/vazgec`);
        } catch (err) {
          console.warn('Vazgeç API hatası:', err);
          _showToast()('⚠️ İşlem sırasında bir sorun oluştu: ' + err.message, 'error');
        } finally {
          _avLoading['tekliflerim'] = false;
          _avLoading['aktivDavalar'] = false;
          if (container) delete container.dataset.loaded;
          loadAvTeklifler();
        }
      })();
    };


    // ---- AVUKAT ÖDEME MODAL YOLLARI ----
    window.openAvukatOdemeModal = (offerId, tahminiAlacak) => {
      const tutar = tahminiAlacak < 20000 ? 750 : tahminiAlacak < 50000 ? 1250 : 2000;
      const tutarEl = document.getElementById('avOdemeTutari');
      if (tutarEl) tutarEl.textContent = _formatTL()(tutar);

      const btn = document.getElementById('avModalOdemeBtn');
      if (btn) {
        btn.onclick = () => doAvukatOdeme(offerId);
        btn.disabled = false;
        btn.textContent = 'Ödemeyi Tamamla';
      }

      // Formu temizle
      ['avModalKartNo', 'avModalSonKullanma', 'avModalCVV', 'avModalKartSahibi'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });

      if (window.openModal) window.openModal('avOdemeModal');
      else document.getElementById('avOdemeModal').style.display = 'flex';
    };

    window.doAvukatOdeme = async function (offerId) {
      const kartNo = document.getElementById('avModalKartNo')?.value.replace(/\s/g, '');
      const sonKullanma = document.getElementById('avModalSonKullanma')?.value;
      const cvv = document.getElementById('avModalCVV')?.value;
      const kartSahibi = document.getElementById('avModalKartSahibi')?.value;
      const btn = document.getElementById('avModalOdemeBtn');

      if (!kartNo || kartNo.length < 16) { _showToast()('Geçerli kart numarası girin.', 'error'); return; }
      if (!sonKullanma || !sonKullanma.includes('/')) { _showToast()('Son kullanma tarihi eksik.', 'error'); return; }
      if (!cvv || cvv.length < 3) { _showToast()('CVV eksik.', 'error'); return; }
      if (!kartSahibi?.trim() || kartSahibi.trim().length < 3) { _showToast()('Kart sahibi adı eksik.', 'error'); return; }

      btn.disabled = true; btn.textContent = '⏳ İşleniyor...';
      try {
        await _apiCall()('POST', `/offers/${offerId}/avukat-odeme`, { kartNo, kartSahibi, sonKullanma, cvv });
        _showToast()('Ödeme başarılı! 🎉', 'success');
        if (window.closeModal) window.closeModal('avOdemeModal');
        else document.getElementById('avOdemeModal').style.display = 'none';
        setTimeout(() => loadAvTeklifler(), 800);
      } catch (err) {
        _showToast()(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Ödemeyi Tamamla';
      }
    };
    container.dataset.loaded = '1';
  } catch (err) {
    _showToast()(err.message, 'error');
  } finally {
    _avLoading['tekliflerim'] = false;
  }
}

// ---- AKTİF DAVALAR ----
async function loadAktivDavalar() {
  const container = document.getElementById('avAktivListesi');
  if (!container) return;
  if (_avLoading['aktivDavalar']) return;
  _avLoading['aktivDavalar'] = true;
  if (!container.dataset.loaded) {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>';
  }

  try {
    const teklifler = await _apiCall()('GET', '/avukat/tekliflerim');
    const secilen = teklifler.filter(t =>
      t.status === 'SELECTED' &&
      ['PRE_CASE_REVIEW', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL'].includes(t.caseStatus)
    );

    if (!secilen.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <div class="empty-title">Henüz aktif davanız yok.</div>
          <div class="empty-sub">Teklifiniz kabul edilip ödeme yapılınca burada görünecek.</div>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="dava-grid">` +
      secilen.map(t => `
        <div class="dava-card" style="border-color:var(--accent)">
          <div class="dava-card-header">
            <div>
              <div class="dava-card-title">${t.caseDavaTuru || 'Dava'}</div>
              <div class="dava-card-sub">${t.caseSehir}</div>
            </div>
            <span class="status-badge status-ACTIVE">${t.caseStatus === 'PRE_CASE_REVIEW' ? '🧐 Ön İnceleme' : t.caseStatus === 'PENDING_USER_AUTH' ? '⏳ Vekalet İsteğinde' : t.caseStatus === 'AUTHORIZED' ? '✅ Vekalet Onaylı' : t.caseStatus === 'FILED_IN_COURT' ? '🏛️ Dava Açıldı' : '🟢 Aktif'}</span>
          </div>
          <div class="dava-card-body">
            <div class="dava-detail-row">
              <span>Tahmini Alacak</span>
              <span class="alacak">${_formatTL()(t.tahminiAlacak)}</span>
            </div>
            <div class="dava-detail-row">
              <span>Ücretim</span>
              <span>${t.ucretModeli === 'yuzde' ? `%${t.oran}` : _formatTL()(Number(t.sabitUcret) || 0)}</span>
            </div>
            ${t.muvekkilAd ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border); display:flex; gap:10px; align-items:center;">
              <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.1rem;color:#fff;">
                ${t.muvekkilAvatar ? `<img src="${t.muvekkilAvatar}" style="width:100%;height:100%;object-fit:cover;">` : t.muvekkilAd.charAt(0)}
              </div>
              <div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Müvekkil İletişim Bilgileri:</div>
                <div style="font-size:0.9rem;font-weight:700">${t.muvekkilAd} ${t.muvekkilSoyad}</div>
                ${t.muvekkilEmail ? `
                  <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">
                    📧 ${t.muvekkilEmail}
                  </div>
                  <div style="font-size:0.8rem;color:var(--text-secondary);">
                    📞 ${t.muvekkilTelefon || '—'}
                  </div>
                ` : `
                  <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;padding:4px 8px;background:rgba(255,255,255,0.04);border-radius:4px;border:1px dashed rgba(255,255,255,0.1);">
                    🔒 İletişim bilgileri gizli
                  </div>
                `}
              </div>
            </div>
            ` : ''}

          </div>
          <div class="dava-card-actions">
            ${t.caseStatus === 'PRE_CASE_REVIEW' ? `<button class="btn-primary btn-block" style="background:#00d9a3;color:#000;font-size:0.85rem;padding:10px;margin-bottom:8px;" onclick="window.requestUserAuth('${t.caseId}')">✅ Evraklar Yeterli (Vekalet İste)</button>` : ''}
            ${t.caseStatus === 'AUTHORIZED' ? `<button class="btn-primary btn-block" style="background:#ffb300;color:#000;font-size:0.85rem;padding:10px;margin-bottom:8px;" onclick="window.fileInCourt('${t.caseId}')">🏛️ Dava Açıldı (Dosya No Gir)</button>` : ''}
            ${['FILED_IN_COURT', 'IN_PROGRESS', 'DURUSMA'].includes(t.caseStatus) ? `<button class="btn-primary btn-block" style="background:#4caf50;color:#fff;font-size:0.85rem;padding:10px;margin-bottom:8px;" onclick="window.reportCollectionModal('${t.caseId}')">💰 Tahsilat Bildir (Dava Bitti)</button>` : ''}
            <button class="btn-ghost btn-block" style="font-size:0.85rem;padding:10px;width:100%;"
              onclick="avMesajYukle('${t.caseId}', false, '${t.caseStatus}')">
              💬 Müvekkilimle Mesajlaş
            </button>
          </div>
        </div>
      `).join('') + `</div>`;
    container.dataset.loaded = '1';
  } catch (err) {
    _showToast()(err.message, 'error');
  } finally {
    _avLoading['aktivDavalar'] = false;
  }
}

window.avukatTeklifVazgec = async (offerId) => {
  if (!confirm('Bu davadan çekilmek / tekliften vazgeçmek istediğinize emin misiniz? Dosya tekrar havuza düşecektir.')) return;
  try {
    const res = await _apiCall()('PUT', `/offers/${offerId}/vazgec`);
    _showToast()(res.message || 'Tekliften vazgeçildi.', 'success');
    _avLoading['tekliflerim'] = false;
    _avLoading['aktivDavalar'] = false;
    avukatSection('aktivDavalar');
  } catch (err) {
    _showToast()(err.message, 'error');
  }
};

window.dosyaDegerlendirModal = (caseId) => {
  const yorum = prompt('İşlemler bitti. Dosya tutarlılığı hakkında (AI Tahmini vs. Gerçekleşen) değerlendirmeniz nedir?');
  if (!yorum || yorum.trim() === '') return;

  _apiCall()('POST', `/cases/${caseId}/avukat-yorum`, { yorum })
    .then(res => {
      _showToast()(res.message, 'success');
    })
    .catch(err => {
      _showToast()(err.message, 'error');
    });
};


window.requestUserAuth = async function (caseId) {
  const isConfirmed = await window.HakPortal.showConfirm('Evrakların yeterli olduğunu onaylayıp, kullanıcıdan resmi vekalet talep etmek istediğinize emin misiniz?');
  if (!isConfirmed) return;
  try {
    await _apiCall()('PUT', `/cases/${caseId}/status`, { status: 'PENDING_USER_AUTH', aciklama: 'Avukat evrakları inceledi ve uygun bularak vekalet talep etti.' });
    _showToast()('Vekalet talebi gönderildi.', 'success');
    loadAktivDavalar();
    loadAvTeklifler();
  } catch (err) {
    _showToast()(err.message, 'error');
  }
};

window.fileInCourt = async function (caseId) {
  const dosyaNo = prompt('Lütfen mahkeme dosya numarasını veya Dava Takip referans kodunuzu giriniz:');
  if (!dosyaNo) return;
  try {
    await _apiCall()('PUT', `/cases/${caseId}/status`, { status: 'FILED_IN_COURT', aciklama: 'Mahkeme Dosya Numarası: ' + dosyaNo });
    _showToast()('Dava platforma kaydedildi. İletişim bilgileri kilitleri açıldı!', 'success');
    loadAktivDavalar();
    loadAvTeklifler();
  } catch (err) {
    _showToast()(err.message, 'error');
  }
};

window.reportCollectionModal = function (caseId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="width:100%; max-width:450px; padding:24px; border-radius:12px; border:2px solid #4caf50;">
      <div style="font-size:3rem; text-align:center; margin-bottom:10px;">💰</div>
      <h2 style="font-size:1.3rem; margin-bottom:16px; text-align:center;">Tahsilat (Dava Bitiş) Bildirimi</h2>
      <p style="font-size:0.95rem; color:var(--text-secondary); text-align:center; margin-bottom:20px;">
        Dava başarıyla sonuçlandı mı? Lütfen müvekkiliniz için tahsil edilen / anlaşılan toplam tutarı giriniz.
      </p>
      
      <div style="margin-bottom:20px;">
        <input type="number" id="tahsilatMiktar" placeholder="Örn: 150000" style="width:100%; padding:12px; font-size:1.2rem; border-radius:8px; border:1px solid var(--border); text-align:center; background:var(--bg-card); color:var(--text-color);" />
        <div style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top:8px;">Tutar TL cinsinden girilmelidir.</div>
      </div>
      
      <div style="background:#fff3cd; color:#856404; padding:12px; border-radius:6px; font-size:0.85rem; margin-bottom:16px; border:1px solid #ffeeba; text-align:left;">
        <strong>Önemli Uyarı:</strong> Girdiğiniz tutar kapanış onayı için doğrudan müvekkilinize iletilecektir. Sistem kayıtları ihtilaflarda kanıt olarak kullanılabilir. Olası yasadışı veya yanıltıcı bildirimlerde itiraz süreci derhal işletilir. Lütfen gerçek tahsilat tutarını eksiksiz giriniz.
      </div>

      <div style="display:flex; gap:12px;">
        <button class="btn-ghost" style="flex:1" onclick="this.closest('.modal-overlay').remove()">Hayır, İptal</button>
        <button class="btn-primary" style="flex:1; background:#4caf50;" id="avFinalCloseBtn_${caseId}">Evet, Bildir & Kapat</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById(`avFinalCloseBtn_${caseId}`).onclick = async function () {
    const miktar = document.getElementById('tahsilatMiktar').value.trim();
    if (!miktar) {
      _showToast()('Lütfen geçerli bir tutar giriniz.', 'error');
      return;
    }

    try {
      this.disabled = true; this.textContent = '...';
      await _apiCall()('PUT', `/cases/${caseId}/status`, {
        status: 'TAHSIL',
        aciklama: `Avukat davanın sonuçlandığını ve ${miktar} TL tahsilat/anlaşma yapıldığını bildirdi. Kullanıcı (Müvekkil) kapanış onayı bekleniyor.`,
        tahsilat: parseFloat(miktar)
      });
      _showToast()('Dava bitişi (tahsilat) başarıyla bildirildi ve Müvekkilin nihai onayına sunuldu!', 'success');
      modal.remove();
      loadAktivDavalar();
      loadAvTeklifler();
    } catch (err) {
      this.disabled = false; this.textContent = 'Evet, Bildir & Kapat';
      _showToast()(err.message, 'error');
    }
  };
};

// ---- MESAJLAR ----
async function loadAvMesajlar() {
  const container = document.getElementById('avMesajContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>';

  try {
    const teklifler = await _apiCall()('GET', '/avukat/tekliflerim');
    const aktif = teklifler.filter(t =>
      t.status === 'SELECTED' &&
      ['PRE_CASE_REVIEW', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL', 'CLOSED', 'KAPANDI'].includes(t.caseStatus)
    );

    if (!aktif.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <div class="empty-title">Aktif dava yok.</div>
          <div class="empty-sub">Teklifiniz kabul edilip ödeme yapıldıktan sonra mesajlaşabilirsiniz.</div>
        </div>`;
      return;
    }

    if (aktif.length === 1 && !activeCaseId) {
      avMesajYukle(aktif[0].caseId, true, aktif[0].caseStatus);
    } else if (activeCaseId) {
      // Zaten bir davanın mesajları yüklüyse dokunma
      return;
    } else {
      container.innerHTML = `
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:12px">Müvekkilinizi seçin:</h3>
        <div class="dava-grid">
          ${aktif.map(t => {
        const kisaltilmisTarih = new Date(t.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        return `
            <div class="dava-card" style="cursor:pointer; border-left:4px solid var(--primary-light)" onclick="avMesajYukle('${t.caseId}', false, '${t.caseStatus}')">
              ${t.muvekkilAd ? `
              <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #eee;">
                <img src="${t.muvekkilAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + t.muvekkilAd}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid var(--primary-light)"/>
                <div>
                  <div style="font-size:0.9rem;font-weight:700">${t.muvekkilAd} ${t.muvekkilSoyad}</div>
                  <div style="font-size:0.75rem;color:var(--text-secondary)">Müvekkil</div>
                </div>
              </div>` : ''}
              <div class="dava-card-title">${t.caseDavaTuru || 'Hukuki Danışmanlık'}</div>
              <div class="dava-card-sub">${t.caseSehir} • ${kisaltilmisTarih}</div>
              <div style="font-size:0.8rem; margin-top:8px; color:var(--text-light);">
                Toplam Alacak: <strong style="color:var(--accent)">${_formatTL()(t.tahminiAlacak)}</strong>
              </div>
              <div class="dava-card-actions" style="margin-top:12px; position:relative;">
                ${t.okunmamisMesaj > 0 ? `<div style="position:absolute; top:-35px; right:0px; background:#e63946; color:#fff; font-size:0.7rem; font-weight:bold; padding:4px 8px; border-radius:12px; box-shadow:0 0 10px rgba(230,57,70,0.6); animation: pulse 1.5s infinite;">🔔 ${t.okunmamisMesaj} Yeni Mesaj</div>` : ''}
                <button class="btn-primary" style="font-size:0.85rem;padding:8px 14px; width:100%">💬 Sohbeti Aç</button>
              </div>
            </div>`;
      }).join('')}
        </div>`;
    }
  } catch (err) {
    _showToast()(err.message, 'error');
  }
}

async function avMesajYukle(caseId, isAuto = false, status = '') {
  if (!isAuto) {
    const sections = ['AcikDavalar', 'TeklifVer', 'Tekliflerim', 'AktivDavalar', 'Mesajlar', 'Profil'];
    sections.forEach(s => {
      const el = document.getElementById(`avSection${s}`);
      if (el) el.style.display = 'none';
    });
    const msglr = document.getElementById('avSectionMesajlar');
    if (msglr) msglr.style.display = 'block';

    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.getElementById('sbMesaj')?.classList.add('active');
    avCurrentSection = 'mesajlar';
  }
  activeCaseId = caseId;

  const container = document.getElementById('avMesajContainer');
  if (!container) return;

  container.innerHTML = `
    <div class="messages-container">
      <div class="messages-header">
        <button class="btn-ghost" style="padding:6px 12px;font-size:0.82rem" onclick="window.avClearMesaj(); loadAvMesajlar()">← Geri</button>
        <span style="font-size:0.9rem;color:var(--text-secondary)">Müvekkil Mesajları</span>
      </div>
      <div class="messages-body" id="avMsgBody">
        <div class="loading-spinner"><div class="spinner"></div></div>
      </div>
      <div class="messages-input" style="display:${['CLOSED', 'KAPANDI'].includes(status) ? 'none' : 'flex'}; align-items:center;">
        <label style="cursor:pointer; margin-right:8px; font-size:1.2rem; display:flex; align-items:center;" title="Belge / Evrak Yükle">
          📎
          <input type="file" id="avMsgFile" style="display:none" onchange="window.avUploadFile('${caseId}')"/>
        </label>
        <input type="text" id="avMsgInput" placeholder="Müvekkilinize veya sisteme mesaj yazın..." style="flex:1" />
        <button class="btn-primary" id="avSendBtn" onclick="avSendMesaj('${caseId}')" style="padding:10px 20px;white-space:nowrap">
          ➤<span class="send-text"> Gönder</span>
        </button>
      </div>
      ${['CLOSED', 'KAPANDI'].includes(status) ? `<div style="text-align:center; padding:12px; font-size:0.85rem; color:#856404; background:#fff3cd; border-top:1px solid #ffeeba;">Platform üzerindeki dosya süreci kapanmıştır. Yeni mesaj veya evrak gönderimi yapılamaz. Mevcut kayıtlar, ilgili mevzuat kapsamında güvenli şekilde saklanmaktadır.</div>` : ''}
    </div>`;

  document.getElementById('avMsgInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') avSendMesaj(caseId);
  });

  await avFetchMesajlar(caseId);

  if (avMesajInterval) clearInterval(avMesajInterval);
  avMesajInterval = setInterval(() => {
    if (!document.hidden) avFetchMesajlar(caseId);
  }, 10000); // 10 saniye
}

window.avClearMesaj = function () {
  if (avMesajInterval) { clearInterval(avMesajInterval); avMesajInterval = null; }
  activeCaseId = null;
  const cont = document.getElementById('avMesajContainer');
  if (cont) { cont.innerHTML = ''; }
};

async function avFetchMesajlar(caseId) {
  try {
    const mesajlar = await _apiCall()('GET', `/messages/${caseId}`);
    const body = document.getElementById('avMsgBody');
    if (!body) return;

    const myId = _Auth().getUser()?.id;

    if (!mesajlar.length) {
      body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:0.9rem">Henüz mesaj yok. Müvekkilinize merhaba deyin! 👋</div>`;
      return;
    }

    body.innerHTML = mesajlar.map(m => {
      let avatarHtml = `<div style="width:32px;height:32px;border-radius:50%;overflow:hidden;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-size:0.8rem;color:#fff;font-weight:bold;flex-shrink:0;">${m.gonderenAd.charAt(0)}</div>`;
      if (m.avatar) {
        avatarHtml = `<img src="${m.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;" alt="Avatar"/>`;
      }
      let msgHtml = m.icerik;
      if (m.icerik.startsWith('/uploads/')) {
        const parts = m.icerik.split('|');
        const fileUrl = parts[0];
        const originalName = parts.length > 1 ? parts.slice(1).join('|') : 'Belge';
        const ext = fileUrl.split('.').pop().toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

        if (isImage) {
          msgHtml = `<div style="max-width:220px; border-radius:8px; overflow:hidden; margin-bottom:4px;">
                      <a href="${fileUrl}" target="_blank">
                        <img src="${fileUrl}" style="width:100%; display:block;" alt="Resim"/>
                      </a>
                   </div>
                   <a href="${fileUrl}" target="_blank" style="color:inherit; text-decoration:underline; font-size:0.75rem; word-break:break-all;">📎 ${originalName}</a>`;
        } else {
          msgHtml = `<a href="${fileUrl}" target="_blank" style="display:flex; align-items:center; background:rgba(0,0,0,0.05); color:inherit; padding:8px 12px; border-radius:6px; text-decoration:none; border:1px solid rgba(0,0,0,0.1); max-width:250px;">
                      <div style="font-size:1.8rem; margin-right:12px;">📄</div>
                      <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
                         <div style="font-weight:600; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis;">${originalName}</div>
                         <div style="font-size:0.75rem; opacity:0.8; margin-top:2px;">İndir / Görüntüle</div>
                      </div>
                   </a>`;
        }
      }

      return `
      <div class="message-row ${m.gonderenId === myId ? 'mine' : 'theirs'}" style="display:flex; gap:8px; align-items:flex-end;">
        ${m.gonderenId !== myId ? avatarHtml : ''}
        <div class="message-bubble ${m.gonderenId === myId ? 'sent' : 'received'}">
          ${msgHtml}
          <div class="message-time">${new Date(m.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    `}).join('');

    body.scrollTop = body.scrollHeight;
  } catch { /* sessizce yut */ }
}

async function avSendMesaj(caseId) {
  const input = document.getElementById('avMsgInput');
  const icerik = input?.value?.trim();
  if (!icerik) return;

  const sendBtn = document.getElementById('avSendBtn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }

  try {
    await _apiCall()('POST', '/messages', { caseId, icerik });
    if (input) input.value = '';
    await avFetchMesajlar(caseId);
  } catch (err) {
    _showToast()(err.message, 'error');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = '➤ Gönder'; }
  }
}

window.avUploadFile = async function (caseId) {
  const fileInput = document.getElementById('avMsgFile');
  if (!fileInput || !fileInput.files[0]) return;

  const file = fileInput.files[0];
  if (file.size > 5 * 1024 * 1024) {
    _showToast()('Dosya boyutu 5MB altında olmalıdır.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('dosya', file);

  try {
    const token = localStorage.getItem('hp_token');
    if (!token) throw new Error('Oturum kapalı');

    _showToast()('Evrak yükleniyor...', 'info');
    const res = await fetch('/api/messages/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Dosya yüklenemedi.');

    // Dosya yüklendiğinde linki mesaj olarak atalım
    await _apiCall()('POST', '/messages', { caseId, icerik: data.url + '|' + (data.originalName || 'Evrak') });
    _showToast()('Evrak iletildi.', 'success');
    await avFetchMesajlar(caseId);
  } catch (err) {
    _showToast()(err.message, 'error');
  } finally {
    fileInput.value = ''; // temizle
  }
}

// ---- PROFİL ----
async function loadAvProfil() {
  const container = document.getElementById('avProfilBilgi');
  if (!container) return;
  // Zaten yüklüyse tekrar fetch etme
  if (container.dataset.loaded) return;
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>';

  try {
    const profil = await _apiCall()('GET', '/avukat/profil');
    _avProfilData = profil;
    const uzmanlik = Array.isArray(profil.uzmanlik)
      ? profil.uzmanlik.join(', ')
      : (profil.uzmanlik || '—');

    let avatarHTML = '';
    if (profil.avatar && (profil.avatar.includes('/') || profil.avatar.includes('http'))) {
      avatarHTML = `<img src="${profil.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
    } else {
      avatarHTML = profil.avatar || profil.ad?.charAt(0) || '⚖️';
    }

    container.innerHTML = `
      <div class="profil-card">
        <div class="profil-avatar" style="font-size:2.5rem;overflow:hidden">${avatarHTML}</div>
        <div style="width:100%;display:flex;flex-direction:column;gap:6px">
          <div class="profil-bilgi-item">
            <span>Tam Ad</span>
            <span><strong>${profil.unvan || 'Av.'} ${profil.ad} ${profil.soyad}</strong></span>
          </div>
          <div class="profil-bilgi-item"><span>E-posta</span><span>${profil.email}</span></div>
          <div class="profil-bilgi-item"><span>Şehir</span><span>${profil.sehir || '—'}</span></div>
          <div class="profil-bilgi-item"><span>Baro</span><span>${profil.baro || '—'}</span></div>
          <div class="profil-bilgi-item"><span>Baro No</span><span>${profil.baroNo || '—'}</span></div>
          <div class="profil-bilgi-item"><span>Uzmanlık</span><span>${uzmanlik}</span></div>
          <div class="profil-bilgi-item">
            <span>Profil Onayı</span>
            <span class="status-badge ${profil.profilOnay ? 'status-ACTIVE' : 'status-PENDING'}">
              ${profil.profilOnay ? '✅ Onaylı' : '⏳ Onay Bekliyor'}
            </span>
          </div>
          ${profil.bio ? `<div class="profil-bilgi-item"><span>Hakkında</span><span>${profil.bio}</span></div>` : ''}
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
            <button class="btn-ghost" style="font-size:0.85rem;padding:8px 16px" onclick="switchAvProfilTab('duzenle')">
              ✏️ Profili Düzenle
            </button>
          </div>
        </div>
      </div>`;
    container.dataset.loaded = '1';
  } catch (err) {
    _showToast()(err.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">${err.message}</div></div>`;
  }
}

// ---- PROFİL SEKME GEÇİŞİ ----
window.switchAvProfilTab = (tab) => {
  ['bilgi', 'duzenle', 'sifre'].forEach(t => {
    const el = document.getElementById(`avProfilTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const btn = document.getElementById(`avTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (el) el.style.display = 'none';
    if (btn) btn.classList.remove('active');
  });

  const targetEl = document.getElementById(`avProfilTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  const targetBtn = document.getElementById(`avTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (targetEl) targetEl.style.display = 'block';
  if (targetBtn) targetBtn.classList.add('active');

  if (tab === 'duzenle' && _avProfilData) {
    selectedAvatar = _avProfilData.avatar || '⚖️';
    const avImg = document.getElementById('avAvatarImg');
    if (avImg) {
      if (selectedAvatar && (selectedAvatar.includes('/') || selectedAvatar.includes('http'))) {
        avImg.src = selectedAvatar;
      } else {
        avImg.src = `https://ui-avatars.com/api/?name=${_avProfilData.ad}+${_avProfilData.soyad}&background=random`;
      }
    }

    document.getElementById('avAd').value = _avProfilData.ad || '';
    document.getElementById('avSoyad').value = _avProfilData.soyad || '';
    document.getElementById('avTelefon').value = _avProfilData.telefon || '';
    document.getElementById('avBio').value = _avProfilData.bio || '';

    const sehirSelect = document.getElementById('avSehir');
    if (sehirSelect) {
      [...sehirSelect.options].forEach(o => {
        if (o.value === _avProfilData.sehir || o.text === _avProfilData.sehir) o.selected = true;
      });
    }
  }
};

window.avProfilKaydet = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('avProfilSaveBtn');
  const errEl = document.getElementById('avProfilError');
  const fileInput = document.getElementById('avAvatarFile');
  if (errEl) errEl.style.display = 'none';

  const ad = document.getElementById('avAd').value?.trim();
  const soyad = document.getElementById('avSoyad').value?.trim();
  const sehir = document.getElementById('avSehir').value;
  const telefon = document.getElementById('avTelefon').value?.trim();
  const bio = document.getElementById('avBio').value?.trim();

  if (!ad || !soyad || !sehir) {
    if (errEl) { errEl.textContent = 'Ad, soyad ve şehir zorunludur.'; errEl.style.display = 'block'; }
    return;
  }

  btn.disabled = true; btn.textContent = 'Kaydediliyor...';

  try {
    let finalAvatar = selectedAvatar;

    // 1. Yeni fotoğraf seçildiyse önce yükle
    if (fileInput && fileInput.files[0]) {
      const formData = new FormData();
      formData.append('avatar', fileInput.files[0]);

      const uploadRes = await fetch('/api/auth/upload-avatar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('hp_token')}` },
        body: formData
      });

      if (!uploadRes.ok) {
        let errMsg = 'Fotoğraf yüklenemedi.';
        const contentType = uploadRes.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const upErr = await uploadRes.json();
          errMsg = upErr.error || errMsg;
        }
        throw new Error(errMsg);
      }
      const uploadData = await uploadRes.json();
      finalAvatar = uploadData.avatar;
    }

    // 2. Profil bilgilerini kaydet
    const result = await _apiCall()('PUT', '/auth/profil', {
      ad, soyad, sehir, telefon, bio, avatar: finalAvatar
    });
    _Auth().setAuth(_Auth().getToken(), result.user);
    _avProfilData = null;
    const infoEl = document.getElementById('avProfilBilgi');
    if (infoEl) delete infoEl.dataset.loaded;
    _showToast()('Profiliniz güncellendi! ✅', 'success');
    await loadAvProfil();
    switchAvProfilTab('bilgi');
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  } finally {
    btn.disabled = false; btn.textContent = 'Kaydet';
  }
};

window.avSifreDegistir = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('avSifreBtn');
  const errEl = document.getElementById('avSifreError');
  if (errEl) errEl.style.display = 'none';

  const eskiSifre = document.getElementById('avEskiSifre').value;
  const yeniSifre = document.getElementById('avYeniSifre').value;
  const yeniSifreConfirm = document.getElementById('avYeniSifreConfirm').value;

  if (!eskiSifre || !yeniSifre || !yeniSifreConfirm) {
    if (errEl) { errEl.textContent = 'Tüm alanlar zorunludur.'; errEl.style.display = 'block'; }
    return;
  }

  btn.disabled = true; btn.textContent = 'Değiştiriliyor...';
  try {
    await _apiCall()('PUT', '/auth/sifre-degistir', { eskiSifre, yeniSifre, yeniSifreConfirm });
    _showToast()('Şifreniz başarıyla değiştirildi! 🔒', 'success');
    document.getElementById('avSifreForm').reset();
    setTimeout(() => switchAvProfilTab('bilgi'), 1000);
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  } finally {
    btn.disabled = false; btn.textContent = 'Şifreyi Değiştir';
  }
};

// ---- GLOBAL EXPOSE ----
window.avukatSection = avukatSection;
window.goTeklifVer = goTeklifVer;
window.toggleUcretFields = toggleUcretFields;
window.submitTeklif = submitTeklif;
window.avMesajYukle = avMesajYukle;
window.avSendMesaj = avSendMesaj;
window.loadAvMesajlar = loadAvMesajlar;
