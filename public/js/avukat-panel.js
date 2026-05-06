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

  avukatSection('gelenTalepler');

  // Bildirim sistemi başlat
  loadNotifCount();
  setInterval(loadNotifCount, 30000);

  // Okunmamis mesaj badge'i basalt
  loadAvMesajBadge();
  setInterval(loadAvMesajBadge, 30000);

  // Herhangi bir yere tıklayınca bildirim dropdown'ı kapat
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('notifWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      const dd = document.getElementById('notifDropdown');
      if (dd) dd.style.display = 'none';
    }
  });
});

// ---- SECTION ----
function avukatSection(name) {
  const sections = ['GelenTalepler', 'AktivDavalar', 'KapananDavalar', 'Mesajlar', 'Profil', 'YzAsistan'];
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

  if (name === 'gelenTalepler') { loadGelenTalepler(); document.getElementById('sbTalepler')?.classList.add('active'); }
  if (name === 'aktivDavalar') { loadAktivDavalar(); document.getElementById('sbAktif')?.classList.add('active'); }
  if (name === 'kapananDavalar') { loadAvKapananDavalar(); document.getElementById('sbKapanan')?.classList.add('active'); }
  if (name === 'yzAsistan') { 
    document.getElementById('sbYzAsistan')?.classList.add('active'); 
    initRagChat(); 
    loadRagHistory();
  }
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

// ---- PROFİL FOTOĞRAFI ÖNİZLEME + UPLOAD ----
async function previewAvProfilePhoto(input) {
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];

  // 1. Lokal önizleme (anında göster)
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = document.getElementById('avAvatarImg');
    if (img) img.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // 2. Server'a yükle
  const btn = document.getElementById('avProfilSaveBtn');
  const oldText = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Fotoğraf yükleniyor...'; }

  try {
    const token = localStorage.getItem('hp_token');
    if (!token) throw new Error('Oturum kapalı');

    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch('/api/auth/upload-avatar', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Yükleme başarısız (' + res.status + ')');
    }

    const data = await res.json();
    const newAvatar = data.avatar;

    // Tüm avatar görsellerini güncelle
    const img = document.getElementById('avAvatarImg');
    if (img) img.src = newAvatar;

    const sidebarName = document.getElementById('avSidebarName');
    const parent = sidebarName?.closest('.sidebar-mobile-profile');
    const smpIcon = parent?.querySelector('.smp-icon');
    if (smpIcon) {
      smpIcon.innerHTML = `<img src="${newAvatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`;
    }

    // Auth cache'i güncelle
    const Auth = _Auth();
    if (Auth && Auth.updateUser) {
      Auth.updateUser({ ...Auth.getUser(), avatar: newAvatar });
    }

    _showToast()('Profil fotoğrafı güncellendi', 'success');
  } catch (err) {
    _showToast()(err.message || 'Fotoğraf yüklenemedi', 'error');
    console.error('Avatar upload hatası:', err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || 'Kaydet'; }
    input.value = ''; // Aynı dosyayı tekrar seçebilmek için
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
        skorInfo.ispatBelgeleri.map(belge => `<li style="margin-bottom:4px;"><a href="${belge.url}" target="_blank" style="color:var(--accent); text-decoration:underline; font-weight:600; word-break: break-all;">📄 ${belge.name}</a></li>`).join('') +
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

// ---- GELEN TALEPLER ----
async function loadGelenTalepler() {
  const container = document.getElementById('gelenTaleplerListesi');
  if (!container) return;
  if (_avLoading['gelenTalepler']) return;
  _avLoading['gelenTalepler'] = true;
  if (!container.dataset.loaded) {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>';
  }

  try {
    const talepler = await _apiCall()('GET', '/offers/gelen-talepler');

    if (!talepler.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">Henüz iletişim talebi yok.</div>
          <div class="empty-sub">Profilinizi güncel tutun. Kullanıcılar şehrinizdeki avukatları listelediğinde sizi görecekler.</div>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="dava-grid">` +
      talepler.map(t => `
        <div class="dava-card" style="${t.status === 'KABUL' ? 'border-color:var(--accent);' : (t.status === 'REDDEDILDI' || t.status === 'IPTAL') ? 'border-color:rgba(255,107,107,0.4);opacity:0.7;' : ''}">
          <div class="dava-card-header">
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="width:42px;height:42px;border-radius:50%;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;color:#fff;flex-shrink:0;border:2px solid rgba(0,217,163,0.2);">
                ${t.kullanici?.ad?.charAt(0) || '?'}
              </div>
              <div>
                <div class="dava-card-title">${t.kullanici?.ad || ''} ${t.kullanici?.soyad || ''}</div>
                <div class="dava-card-sub">${t.dava ? t.dava.davaTuru + ' · ' : ''}${_formatDate()(t.createdAt)}</div>
              </div>
            </div>
            <span class="status-badge status-${t.status === 'BEKLIYOR' ? 'PENDING' : t.status === 'KABUL' ? 'ACTIVE' : 'REJECTED'}">${t.status === 'BEKLIYOR' ? '⏳ Bekliyor' : t.status === 'KABUL' ? '✅ Kabul Edildi' : t.status === 'IPTAL' ? '🚫 İptal Edildi' : '❌ Reddedildi'}</span>
          </div>

          ${t.kullanici?.email ? `
          <div style="margin:0 0 10px 0;padding:10px 14px;background:rgba(0,217,163,0.07);border:1px solid rgba(0,217,163,0.2);border-radius:8px;font-size:0.82rem;">
            <div style="font-size:0.7rem;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">✅ İletişim Bilgileri Açıldı</div>
            <div style="color:var(--text-color);margin-bottom:2px;">📧 ${t.kullanici.email}</div>
            <div style="color:var(--text-color);">📞 ${t.kullanici.telefon || '—'}</div>
          </div>
          ` : ''}

          <div class="dava-card-body" style="padding-top:0">
            ${t.not ? `
            <div style="padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid rgba(99,102,241,0.6);margin-bottom:12px;">
              <div style="font-size:0.7rem;color:#818cf8;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">📝 Kullanıcı Mesajı</div>
              <div style="font-size:0.87rem;color:var(--text-color);line-height:1.5;">${t.not}</div>
            </div>
            ` : ''}

            ${t.dava ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
              <div style="padding:10px 12px;border-radius:8px;background:rgba(0,217,163,0.06);border:1px solid rgba(0,217,163,0.15);text-align:center;">
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">Tahmini Alacak</div>
                <div style="font-size:1.05rem;font-weight:800;color:var(--accent);">${_formatTL()(t.dava.tahminiAlacak)}</div>
              </div>
              ${t.dava.skorToplam !== undefined && t.dava.skorToplam !== null ? `
              <div style="padding:10px 12px;border-radius:8px;background:rgba(255,179,0,0.07);border:1px solid rgba(255,179,0,0.2);text-align:center;">
                <div style="font-size:0.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px;">YZ Dosya Skoru</div>
                <div style="font-size:1.05rem;font-weight:800;color:#ffb300;">${t.dava.skorToplam}<span style="font-size:0.65rem;color:var(--text-muted)">/100</span></div>
              </div>
              ` : ''}
            </div>
            <button onclick="event.stopPropagation(); const d=document.getElementById('talep-detay-${t.id}'); const ic=document.getElementById('talep-ico-${t.id}'); if(d.style.display==='none'){d.style.display='block';ic.textContent='▲ Küçült';}else{d.style.display='none';ic.textContent='▼ Dava Analizini Göster';}"
              style="width:100%;text-align:left;padding:9px 14px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.82rem;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span>📊 Tüm Dava Analizini Gör</span>
              <span id="talep-ico-${t.id}" style="font-size:0.75rem;color:var(--accent);">▼ Dava Analizini Göster</span>
            </button>
            <div id="talep-detay-${t.id}" style="display:none;">
              ${renderDetayliDavaRaporu(t.dava.hesaplamaVerisi, t.dava)}
            </div>
            ` : `
            <div style="padding:12px;text-align:center;color:var(--text-muted);font-size:0.85rem;border:1px dashed var(--border);border-radius:8px;">
              Bu talep bir dava dosyasıyla ilişkili değil.
            </div>
            `}
          </div>

          <div class="dava-card-actions">
            ${t.status === 'BEKLIYOR' ? `
            <button class="btn-primary" style="font-size:0.88rem;padding:11px 16px;width:100%;margin-bottom:8px;background:linear-gradient(135deg,#00d9a3,#00b489);color:#000;font-weight:700;" onclick="iletisimTalebiKabulEt('${t.id}')">✅ Kabul Et – İletişim Bilgilerini Aç</button>
            <button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%;color:#ff6b6b;border-color:rgba(255,107,107,0.4);" onclick="iletisimTalebiReddet('${t.id}')">❌ Temsili Reddet</button>
            ` : `
              <button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%;cursor:not-allowed;" disabled>
                ${t.status === 'KABUL' ? '✅ Talebi Kabul Ettiniz' : t.status === 'IPTAL' ? '🚫 Talep İptal Edildi' : '❌ Talebi Reddettiniz'}
              </button>
            `}
          </div>
        </div>
      `).join('') + `</div>`;

    container.dataset.loaded = '1';
  } catch (err) {
    _showToast()(err.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">${err.message}</div></div>`;
  } finally {
    _avLoading['gelenTalepler'] = false;
  }
}

window.iletisimTalebiKabulEt = async function (talepId) {
  const isConfirmed = await window.HakPortal.showConfirm('İletişim talebini onaylamak ve kullanıcının iletişim bilgilerini açmak istediğinize emin misiniz? (Kullanıcıya bildirim gönderilecektir.)');
  if (!isConfirmed) return;
  try {
    await _apiCall()('PUT', `/offers/talep/${talepId}/kabul`);
    _showToast()('Talep kabul edildi! İletişim bilgileri aktif müvekkiller alanında görülebilir.', 'success');
    delete document.getElementById('gelenTaleplerListesi')?.dataset?.loaded;
    loadGelenTalepler();
    if (document.getElementById('avAktivListesi')) delete document.getElementById('avAktivListesi').dataset.loaded;
  } catch (err) {
    _showToast()(err.message, 'error');
  }
}

window.iletisimTalebiReddet = async function (talepId) {
  const yorum = prompt('Lütfen reddetme sebebini kısaca belirtin (Müvekkile iletilir, şart değil):');
  if (yorum === null) return;
  try {
    await _apiCall()('PUT', `/offers/talep/${talepId}/reddet`, { aciklama: yorum });
    _showToast()('Talep reddedildi.', 'info');
    delete document.getElementById('gelenTaleplerListesi')?.dataset?.loaded;
    loadGelenTalepler();
  } catch (err) {
    _showToast()(err.message, 'error');
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
    const davalar = await _apiCall()('GET', '/cases/avukat/tum-dosyalar');
    const aktifDavalar = davalar.filter(c => !['CANCELED', 'CLOSED'].includes(c.status));

    if (!aktifDavalar.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <div class="empty-title">Henüz aktif davanız yok.</div>
          <div class="empty-sub">Gelen talepleri kabul ettiğinizde burada görünecekler.</div>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="dava-grid">` +
      aktifDavalar.map(t => `
        <div class="dava-card" style="border-color:var(--accent)">
          <div class="dava-card-header">
            <div>
              <div class="dava-card-title">${t.davaTuru || 'Dava'}</div>
              <div class="dava-card-sub">${t.sehir} · ${_formatDate()(t.createdAt)}</div>
            </div>
            <span class="status-badge status-ACTIVE">${t.status === 'PRE_CASE_REVIEW' ? '🧐 Ön İnceleme' : t.status === 'PENDING_USER_AUTH' ? '⏳ Vekalet İsteğinde' : t.status === 'AUTHORIZED' ? '✅ Vekalet Onaylı' : t.status === 'FILED_IN_COURT' ? '🏛️ Dava Açıldı' : '🟢 Aktif'}</span>
          </div>
          <div class="dava-card-body">
            ${t.kullanici?.ad ? `
            <div style="padding:12px;border-radius:10px;background:rgba(0,217,163,0.06);border:1px solid rgba(0,217,163,0.18);margin-bottom:12px;display:flex;gap:10px;align-items:center;">
              <div style="width:44px;height:44px;border-radius:50%;overflow:hidden;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.2rem;color:#fff;flex-shrink:0;">
                ${t.kullanici.avatar ? `<img src="${t.kullanici.avatar}" style="width:100%;height:100%;object-fit:cover;">` : t.kullanici.ad.charAt(0)}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.7rem;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px;">Müvekkil</div>
                <div style="font-size:0.95rem;font-weight:700;">${t.kullanici.ad} ${t.kullanici.soyad}</div>
                ${t.kullanici.email ? `
                  <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:3px;word-break:break-all;">📧 ${t.kullanici.email}</div>
                  <div style="font-size:0.8rem;color:var(--text-secondary);">📞 ${t.kullanici.telefon || '—'}</div>
                ` : `
                  <div style="margin-top:4px;font-size:0.75rem;color:var(--text-muted);padding:3px 7px;background:rgba(255,255,255,0.04);border-radius:4px;border:1px dashed rgba(255,255,255,0.1);display:inline-block;">🔒 İletişim bilgileri henüz gizli</div>
                `}
              </div>
            </div>
            ` : ''}

            <!-- Dava Detayları Açılır Bölüm -->
            <div>
              <button onclick="event.stopPropagation(); const d=document.getElementById('avaktif-detay-${t.id}'); const ic=document.getElementById('avaktif-detay-ico-${t.id}'); if(d.style.display==='none'){d.style.display='block';ic.textContent='▲';}else{d.style.display='none';ic.textContent='▼';}"
                style="width:100%;text-align:left;padding:9px 12px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.82rem;color:var(--text-secondary);display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span>📊 Dava Analizi ve Detaylar</span>
                <span id="avaktif-detay-ico-${t.id}" style="font-size:0.7rem;">▼</span>
              </button>
              <div id="avaktif-detay-${t.id}" style="display:none;">
                ${renderDetayliDavaRaporu(t.hesaplamaVerisi, t)}
              </div>
            </div>
          </div>
          <div class="dava-card-actions">
            ${['ACTIVE', 'PRE_CASE_REVIEW'].includes(t.status) ? `<button class="btn-primary btn-block" style="background:#00d9a3;color:#000;font-size:0.85rem;padding:10px;margin-bottom:8px;" onclick="window.requestUserAuth('${t.id}')">✅ Evraklar Yeterli (Vekalet İste)</button>` : ''}
            ${t.status === 'AUTHORIZED' ? `<button class="btn-primary btn-block" style="background:#ffb300;color:#000;font-size:0.85rem;padding:10px;margin-bottom:8px;" onclick="window.fileInCourt('${t.id}')">🏛️ Dava Açıldı (Dosya No Gir)</button>` : ''}
            ${t.status === 'DAVA_NO_BEKLIYOR' ? `<div style="padding:10px 12px;background:rgba(255,179,0,0.09);border:1px solid rgba(255,179,0,0.3);border-radius:8px;font-size:0.82rem;color:#ffb300;margin-bottom:8px;">⏳ Dosya numarası müvekkile bildirildi. Müvekkil doğrulama yapması bekleniyor...</div>` : ''}
            ${['FILED_IN_COURT', 'IN_PROGRESS', 'DURUSMA'].includes(t.status) ? `<button class="btn-primary btn-block" style="background:#4caf50;color:#fff;font-size:0.85rem;padding:10px;margin-bottom:8px;" onclick="window.reportCollectionModal('${t.id}')">💰 Tahsilat Bildir (Dava Bitti)</button>` : ''}
            <button class="btn-ghost btn-block" style="font-size:0.85rem;padding:10px;width:100%;"
              onclick="avMesajYukle('${t.id}', false, '${t.status}')">
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

// ---- KAPANAN DAVALAR ----
async function loadAvKapananDavalar() {
  const container = document.getElementById('avKapananListesi');
  if (!container) return;
  if (_avLoading['kapananDavalar']) return;
  _avLoading['kapananDavalar'] = true;
  if (!container.dataset.loaded) {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>';
  }

  try {
    const davalar = await _apiCall()('GET', '/cases/avukat/tum-dosyalar');
    const kapanan = davalar.filter(c => ['CANCELED', 'CLOSED'].includes(c.status));

    if (!kapanan.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🛑</div>
          <div class="empty-title">Henüz kapanan dosyanız yok.</div>
          <div class="empty-sub">Sonuçlanan veya iptal edilen dosyalarınız burada listelenecektir.</div>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="dava-grid">` +
      kapanan.map(t => `
        <div class="dava-card" style="border-color:rgba(255,107,107,0.5)">
          <div class="dava-card-header">
            <div>
              <div class="dava-card-title" style="color:#aaa">${t.davaTuru || 'Dava'}</div>
              <div class="dava-card-sub">${t.sehir}</div>
            </div>
            <span class="status-badge status-REJECTED">🔒 Dava Dosyası Kapandı</span>
          </div>
          <div class="dava-card-body">
            <div class="dava-detail-row">
              <span style="color:#888">Tahmini Alacak</span>
              <span class="alacak" style="color:#888">${_formatTL()(t.tahminiAlacak)}</span>
            </div>
            ${t.kullanici?.ad ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border); display:flex; gap:10px; align-items:center;">
              <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:#333;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.1rem;color:#777;">
                ${t.kullanici.ad.charAt(0)}
              </div>
              <div style="opacity: 0.7;">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Müvekkil İletişim Bilgileri:</div>
                <div style="font-size:0.9rem;font-weight:700">Gizli Müvekkil</div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;padding:4px 8px;background:rgba(255,255,255,0.04);border-radius:4px;border:1px dashed rgba(255,255,255,0.1);">
                  🔒 Dosya Kapandığı İçin İletişim Bilgileri Gizlenmiştir
                </div>
              </div>
            </div>
            ` : ''}

          </div>
          <div class="dava-card-actions">
            <button class="btn-ghost btn-block" style="font-size:0.85rem;padding:10px;width:100%;color:#ff6b6b;border-color:rgba(255,107,107,0.3);background:rgba(255,107,107,0.05);cursor:not-allowed;" disabled>
              🔒 Dosya Kapandı
            </button>
          </div>
        </div>
      `).join('') + `</div>`;
    container.dataset.loaded = '1';
  } catch (err) {
    _showToast()(err.message, 'error');
  } finally {
    _avLoading['kapananDavalar'] = false;
  }
}

window.requestUserAuth = async function (caseId) {
  const isConfirmed = await window.HakPortal.showConfirm('Evrakların yeterli olduğunu onaylayıp, kullanıcıdan resmi vekalet talep etmek istediğinize emin misiniz?');
  if (!isConfirmed) return;
  try {
    await _apiCall()('PUT', `/cases/${caseId}/status`, { status: 'PENDING_USER_AUTH', aciklama: 'Avukat evrakları inceledi ve uygun bularak vekalet talep etti.' });
    _showToast()('Vekalet talebi gönderildi.', 'success');
    delete document.getElementById('avAktivListesi')?.dataset?.loaded;
    loadAktivDavalar();
  } catch (err) {
    _showToast()(err.message, 'error');
  }
};

window.fileInCourt = async function (caseId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = 'display:flex;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--bg-card);border:2px solid #ffb300;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 0 40px rgba(255,179,0,0.25);">
      <div style="text-align:center;font-size:3rem;margin-bottom:12px;">🏛️</div>
      <h2 style="text-align:center;font-size:1.2rem;font-weight:800;margin-bottom:8px;color:#ffb300;">Mahkeme Dosya Numarası Gir</h2>
      <p style="text-align:center;font-size:0.87rem;color:var(--text-secondary);margin-bottom:20px;line-height:1.6;">
        Mahkemeye başvurduktan sonra edindiğiniz <strong>esas numarasını</strong> girin. Bu numara müvekkilinize bildirilecek ve teyit etmesi istenecektir.
      </p>
      <div style="margin-bottom:8px;">
        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:6px;">Mahkeme Esas / Dosya Numarası</label>
        <input id="_davaNoInput" type="text" placeholder="Örn: 2025/1234 E." maxlength="100"
          style="width:100%;padding:12px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-color);font-size:1rem;outline:none;box-sizing:border-box;"/>
      </div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:20px;padding:8px 10px;background:rgba(255,179,0,0.07);border-radius:6px;border:1px solid rgba(255,179,0,0.2);">
        📌 Müvekkil bu numarayı kendi bilgileriyle karşılaştırıp onaylayana kadar süreç ilerlemez.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <button onclick="this.closest('.modal-overlay').remove()"
          style="padding:12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-color);cursor:pointer;font-size:0.9rem;">İptal</button>
        <button id="_davaNoSubmitBtn"
          style="padding:12px;border-radius:8px;border:none;background:linear-gradient(135deg,#ffb300,#e65100);color:#000;cursor:pointer;font-size:0.9rem;font-weight:800;">Gönder & Bildir</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const input = modal.querySelector('#_davaNoInput');
  const btn = modal.querySelector('#_davaNoSubmitBtn');
  input.focus();

  btn.onclick = async function () {
    const davaNo = input.value.trim();
    if (!davaNo) { input.style.borderColor = '#e63946'; input.focus(); return; }
    btn.disabled = true; btn.textContent = '⏳ Kaydediliyor...';
    try {
      await _apiCall()('PUT', `/cases/${caseId}/dava-no`, { davaNo });
      _showToast()('📬 Dava numarası müvekkile gönderildi. Onayı bekleniyor.', 'success');
      modal.remove();
      _avLoading['aktivDavalar'] = false;
      delete document.getElementById('avAktivListesi')?.dataset?.loaded;
      loadAktivDavalar();
    } catch (err) {
      _showToast()(err.message, 'error');
      btn.disabled = false; btn.textContent = 'Gönder & Bildir';
    }
  };
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
      delete document.getElementById('avAktivListesi')?.dataset?.loaded;
      loadAktivDavalar();
    } catch (err) {
      this.disabled = false; this.textContent = 'Evet, Bildir & Kapat';
      _showToast()(err.message, 'error');
    }
  };
};

// ---- MESAJLAR ----

// Mesajlar için global state
let _avMesajState = {
  activeTab: 'aktif', // 'aktif' | 'gecmis'
  searchQuery: '',
  allCases: [],
  lastMessages: {} // caseId -> son mesaj
};

// --- MESAJLAŞMA SİSTEMİ v3.0 (MÜKEMMELLEŞTİRİLMİŞ) ---

async function loadAvMesajlar() {
  const container = document.getElementById('avMesajContainer');
  if (!container) {
    console.error('Hata: avMesajContainer bulunamadı!');
    return;
  }

  // Yükleme durumu
  container.innerHTML = `
    <div style="padding:60px 20px; text-align:center;">
      <div class="loading-spinner" style="width:50px; height:50px; margin:0 auto 20px;"></div>
      <p style="color:var(--text-muted);">Mesajlar yükleniyor...</p>
    </div>`;

  try {
    const token = localStorage.getItem('hp_token');
    if (!token) throw new Error('Oturum kapalı. Lütfen tekrar giriş yapın.');

    // Tüm davaları çek (aktif ve kapalı)
    const response = await fetch('/api/cases/avukat/tum-dosyalar', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!response.ok) throw new Error('Sunucudan mesaj listesi alınamadı (Hata: ' + response.status + ')');

    const davalar = await response.json();
    if (!davalar || !Array.isArray(davalar)) throw new Error('Sunucudan geçersiz veri formatı alındı.');

    // Son mesajları çek
    await _loadLastMessages(davalar.map(d => d.id), token);

    _avMesajState.allCases = davalar;
    _renderMesajlarUI();

  } catch (err) {
    console.error('loadAvMesajlar hatası:', err);
    container.innerHTML = `
      <div class="error-state" style="text-align:center;padding:60px 20px;">
        <div style="font-size:3rem;margin-bottom:15px;">⚠️</div>
        <h3 style="margin-bottom:10px;color:#e63946;">${err.message}</h3>
        <button onclick="loadAvMesajlar()" class="btn-primary" style="margin-top:20px;">🔄 Tekrar Dene</button>
      </div>`;
  }
}

async function _loadLastMessages(caseIds, token) {
  try {
    for (const caseId of caseIds) {
      const res = await fetch('/api/messages/' + caseId + '?limit=1', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const messages = await res.json();
        if (messages.length > 0) {
          _avMesajState.lastMessages[caseId] = messages[messages.length - 1];
        }
      }
    }
  } catch (e) {
    console.warn('Son mesajlar yüklenirken hata:', e);
  }
}

function _getStatusLabel(status) {
  const labels = {
    'PRE_CASE_REVIEW': { text: '📋 Ön İnceleme', color: '#6366f1' },
    'PENDING_USER_AUTH': { text: '⏳ Vekalet Bekliyor', color: '#f59e0b' },
    'AUTHORIZED': { text: '✅ Vekalet Onaylı', color: '#10b981' },
    'FILED_IN_COURT': { text: '🏛️ Dava Açıldı', color: '#8b5cf6' },
    'IN_PROGRESS': { text: '🔄 Süreç Devam Ediyor', color: '#3b82f6' },
    'DURUSMA': { text: '⚖️ Duruşma', color: '#ec4899' },
    'TAHSIL': { text: '💰 Tahsilat', color: '#14b8a6' },
    'CLOSED': { text: '🔒 Kapandı', color: '#6b7280' },
    'CANCELED': { text: '❌ İptal Edildi', color: '#ef4444' }
  };
  return labels[status] || { text: status, color: '#9ca3af' };
}

function _formatMesajTarih(tarih) {
  if (!tarih) return '';
  const date = new Date(tarih);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor(diff / (1000 * 60));
      return minutes < 1 ? 'Şimdi' : `${minutes} dk önce`;
    }
    return `${hours} saat önce`;
  } else if (days === 1) {
    return 'Dün';
  } else if (days < 7) {
    return `${days} gün önce`;
  }
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function _renderMesajlarUI() {
  const container = document.getElementById('avMesajContainer');
  if (!container) return;

  const aktifDurumlar = ['PRE_CASE_REVIEW', 'PENDING_USER_AUTH', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL'];
  const kapaliDurumlar = ['CLOSED', 'CANCELED', 'KAPANDI'];

  // Filtrele
  let filteredCases = _avMesajState.allCases;
  if (_avMesajState.searchQuery) {
    const q = _avMesajState.searchQuery.toLowerCase();
    filteredCases = filteredCases.filter(d => {
      const k = d.kullanici || {};
      return (k.ad || '').toLowerCase().includes(q) ||
             (k.soyad || '').toLowerCase().includes(q) ||
             (d.davaTuru || '').toLowerCase().includes(q) ||
             (d.sehir || '').toLowerCase().includes(q);
    });
  }

  const aktifSohbetler = filteredCases.filter(d => aktifDurumlar.includes(d.status));
  const gecmisSohbetler = filteredCases.filter(d => kapaliDurumlar.includes(d.status));

  // Toplam okunmamış
  const totalUnread = _avMesajState.allCases.reduce((sum, d) => sum + (d.okunmamisMesaj || 0), 0);
  const aktifUnread = aktifSohbetler.reduce((sum, d) => sum + (d.okunmamisMesaj || 0), 0);

  let html = `
    <div style="max-width:1200px; margin:0 auto;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:15px;">
        <div>
          <h2 style="font-size:1.5rem; font-weight:700; margin-bottom:4px;">💬 Mesajlar</h2>
          <p style="color:var(--text-muted); font-size:0.9rem;">Müvekkillerinizle iletişim</p>
        </div>
        ${totalUnread > 0 ? `<div style="background:#e63946; color:#fff; padding:6px 14px; border-radius:20px; font-size:0.85rem; font-weight:600;">🔔 ${totalUnread} Okunmamış</div>` : ''}
      </div>

      <!-- Arama -->
      <div style="margin-bottom:24px;">
        <div style="position:relative; max-width:400px;">
          <input type="text" 
                 id="mesajSearchInput" 
                 placeholder="Müvekkil veya dava ara..." 
                 value="${_avMesajState.searchQuery}"
                 oninput="_onMesajSearch(this.value)"
                 style="width:100%; padding:12px 16px 12px 44px; border-radius:12px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-color); font-size:0.95rem; outline:none; transition:all 0.2s;">
          <span style="position:absolute; left:16px; top:50%; transform:translateY(-50%); font-size:1.1rem;">🔍</span>
          ${_avMesajState.searchQuery ? `<button onclick="_onMesajSearch('')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; font-size:1.2rem; color:var(--text-muted);">×</button>` : ''}
        </div>
      </div>

      <!-- Tablar -->
      <div style="display:flex; gap:8px; margin-bottom:24px; border-bottom:2px solid var(--border); padding-bottom:0;">
        <button onclick="_switchMesajTab('aktif')" 
                style="padding:12px 24px; border:none; background:none; font-size:0.95rem; font-weight:600; cursor:pointer; position:relative; color:${_avMesajState.activeTab === 'aktif' ? 'var(--accent)' : 'var(--text-muted)'}; transition:all 0.2s;">
          🟢 Aktif Sohbetler
          ${aktifUnread > 0 ? `<span style="background:#e63946; color:#fff; padding:2px 8px; border-radius:10px; font-size:0.7rem; margin-left:6px;">${aktifUnread}</span>` : ''}
          ${_avMesajState.activeTab === 'aktif' ? '<span style="position:absolute; bottom:-2px; left:0; right:0; height:3px; background:var(--accent); border-radius:3px 3px 0 0;"></span>' : ''}
        </button>
        <button onclick="_switchMesajTab('gecmis')" 
                style="padding:12px 24px; border:none; background:none; font-size:0.95rem; font-weight:600; cursor:pointer; position:relative; color:${_avMesajState.activeTab === 'gecmis' ? 'var(--accent)' : 'var(--text-muted)'}; transition:all 0.2s;">
          📁 Geçmiş Sohbetler
          ${_avMesajState.activeTab === 'gecmis' ? '<span style="position:absolute; bottom:-2px; left:0; right:0; height:3px; background:var(--accent); border-radius:3px 3px 0 0;"></span>' : ''}
        </button>
      </div>
  `;

  // Aktif Sekme
  if (_avMesajState.activeTab === 'aktif') {
    if (aktifSohbetler.length === 0) {
      html += `
        <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border-radius:16px; border:1px dashed var(--border);">
          <div style="font-size:4rem; margin-bottom:20px;">💬</div>
          <h3 style="font-size:1.3rem; margin-bottom:10px;">Aktif Sohbet Bulunmuyor</h3>
          <p style="color:var(--text-muted); max-width:400px; margin:0 auto;">
            ${_avMesajState.searchQuery ? 'Arama kriterlerine uygun sohbet bulunamadı.' : 'Gelen talepleri kabul ettikten sonra mesajlaşma başlar. "Gelen Talepler" menüsünden talepleri yönetebilirsiniz.'}
          </p>
          ${_avMesajState.searchQuery ? '<button onclick="_onMesajSearch(")" class="btn-ghost" style="margin-top:20px;">Aramayı Temizle</button>' : ''}
        </div>`;
    } else {
      html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:20px;">`;
      aktifSohbetler.forEach(d => {
        html += _renderMesajCard(d, true);
      });
      html += `</div>`;
    }
  }

  // Geçmiş Sekme
  if (_avMesajState.activeTab === 'gecmis') {
    if (gecmisSohbetler.length === 0) {
      html += `
        <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border-radius:16px; border:1px dashed var(--border);">
          <div style="font-size:4rem; margin-bottom:20px;">📁</div>
          <h3 style="font-size:1.3rem; margin-bottom:10px;">Geçmiş Sohbet Bulunmuyor</h3>
          <p style="color:var(--text-muted); max-width:400px; margin:0 auto;">
            ${_avMesajState.searchQuery ? 'Arama kriterlerine uygun sohbet bulunamadı.' : 'Kapanmış veya iptal edilmiş dava mesajlarınız burada görünür. Bu mesajları okuyabilirsiniz ancak yeni mesaj gönderemezsiniz.'}
          </p>
          ${_avMesajState.searchQuery ? '<button onclick="_onMesajSearch(")" class="btn-ghost" style="margin-top:20px;">Aramayı Temizle</button>' : ''}
        </div>`;
    } else {
      html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:20px;">`;
      gecmisSohbetler.forEach(d => {
        html += _renderMesajCard(d, false);
      });
      html += `</div>`;
    }
  }

  html += `</div>`;
  container.innerHTML = html;
}

function _renderMesajCard(d, isActive) {
  const kullanici = d.kullanici || {};
  const statusInfo = _getStatusLabel(d.status);
  const lastMsg = _avMesajState.lastMessages[d.id];
  const unread = d.okunmamisMesaj || 0;

  return `
    <div onclick="avMesajYukle('${d.id}', false, '${d.status}')" 
         style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:20px; cursor:pointer; transition:all 0.2s; position:relative; ${unread > 0 ? 'box-shadow:0 0 0 2px #e63946;' : ''}"
         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.15)'${unread > 0 ? ', 0 0 0 2px #e63946' : ''};"
         onmouseout="this.style.transform=''; this.style.boxShadow=''${unread > 0 ? '0 0 0 2px #e63946' : ''}';"">
      
      ${unread > 0 ? `<div style="position:absolute; top:-8px; right:-8px; background:#e63946; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:700; box-shadow:0 2px 8px rgba(230,57,70,0.4);">${unread}</div>` : ''}
      
      <div style="display:flex; align-items:flex-start; gap:14px; margin-bottom:16px;">
        <img src="${kullanici.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (kullanici.ad || 'user')}" 
             style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid ${statusInfo.color}; flex-shrink:0;">
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <h4 style="font-weight:700; font-size:1rem; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${kullanici.ad || ''} ${kullanici.soyad || ''}</h4>
            ${lastMsg ? `<span style="font-size:0.75rem; color:var(--text-muted); flex-shrink:0;">${_formatMesajTarih(lastMsg.tarih)}</span>` : ''}
          </div>
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">${d.davaTuru || 'Hukuki İşlem'}</div>
          <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
            <span style="width:8px; height:8px; border-radius:50%; background:${statusInfo.color};"></span>
            <span style="font-size:0.8rem; color:${statusInfo.color}; font-weight:500;">${statusInfo.text}</span>
          </div>
        </div>
      </div>

      ${lastMsg ? `
        <div style="background:var(--bg-surface); border-radius:10px; padding:12px; margin-top:12px;">
          <div style="font-size:0.9rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <strong style="color:var(--text-color);">${lastMsg.gonderenId === (JSON.parse(atob(localStorage.getItem('hp_token').split('.')[1])).id) ? 'Siz:' : 'Müvekkil:'}</strong> 
            ${lastMsg.icerik}
          </div>
        </div>
      ` : `
        <div style="background:var(--bg-surface); border-radius:10px; padding:12px; margin-top:12px; text-align:center;">
          <span style="font-size:0.85rem; color:var(--text-muted);">Henüz mesaj yok - Sohbeti başlatın</span>
        </div>
      `}

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted);">📍 ${d.sehir || 'Belirsiz'}</div>
          <div style="font-size:0.8rem; margin-top:4px; color:var(--accent); font-weight:600;">
            ${d.tahminiAlacak ? '💰 ' + _formatTL()(d.tahminiAlacak) : 'Tutar belirtilmemiş'}
          </div>
        </div>
        <button class="btn-primary" style="padding:8px 16px; font-size:0.85rem;">
          ${isActive ? '💬 Sohbeti Aç' : '📋 Geçmişi Gör'}
        </button>
      </div>
    </div>
  `;
}

function _onMesajSearch(query) {
  _avMesajState.searchQuery = query;
  _renderMesajlarUI();
}

function _switchMesajTab(tab) {
  _avMesajState.activeTab = tab;
  _renderMesajlarUI();
}

// Global fonksiyonları window'a ata
window._onMesajSearch = _onMesajSearch;
window._switchMesajTab = _switchMesajTab;

async function avMesajYukle(caseId, isAuto = false, status = '') {
  if (!isAuto) {
    // UI geçişini zorla
    const sections = ['GelenTalepler', 'AktivDavalar', 'KapananDavalar', 'Mesajlar', 'Profil', 'YzAsistan'];
    sections.forEach(s => {
      const el = document.getElementById('avSection' + s);
      if (el) el.style.display = 'none';
    });
    const msglr = document.getElementById('avSectionMesajlar');
    if (msglr) msglr.style.display = 'block';
    activeCaseId = caseId;
  }

  const container = document.getElementById('avMesajContainer');
  if (!container) return;

  const isClosed = ['CLOSED', 'KAPANDI', 'CANCELED'].includes(status);
  const statusInfo = _getStatusLabel(status);

  container.innerHTML = `
    <div style="max-width:900px; margin:0 auto; background:var(--bg-card); border-radius:16px; overflow:hidden; border:1px solid var(--border);">
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; background:var(--bg-surface); border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:12px;">
          <button class="btn-ghost" onclick="loadAvMesajlar()" style="padding:8px 12px; font-size:0.85rem;">← Listeye Dön</button>
          <div style="width:1px; height:24px; background:var(--border);"></div>
          <div>
            <div style="font-weight:700; font-size:1rem;">Müvekkil Sohbeti</div>
            <div style="font-size:0.8rem; color:${statusInfo.color}; display:flex; align-items:center; gap:6px;">
              <span style="width:6px; height:6px; border-radius:50%; background:${statusInfo.color};"></span>
              ${statusInfo.text}
            </div>
          </div>
        </div>
        ${isClosed ? `<div style="background:#6b7280; color:#fff; padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:600;">🔒 Arşiv</div>` : ''}
      </div>

      ${isClosed ? `
        <!-- Kapalı Dosya Uyarısı -->
        <div style="padding:12px 20px; background:rgba(107,114,128,0.1); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.2rem;">📁</span>
          <span style="font-size:0.85rem; color:var(--text-secondary);">
            Bu dava dosyası <strong>${statusInfo.text}</strong> durumundadır. Mesaj geçmişini görüntüleyebilirsiniz ancak yeni mesaj gönderemezsiniz.
          </span>
        </div>
      ` : ''}

      <!-- Mesajlar Alanı -->
      <div id="avMsgBody" style="height:500px; overflow-y:auto; padding:20px; background:var(--bg-card);">
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <div class="loading-spinner" style="width:40px; height:40px; margin:0 auto 15px;"></div>
          Mesajlar yükleniyor...
        </div>
      </div>

      <!-- Input Alanı -->
      ${!isClosed ? `
        <div style="padding:16px 20px; background:var(--bg-surface); border-top:1px solid var(--border); display:flex; gap:12px;">
          <input type="text" 
                 id="avMsgInput" 
                 placeholder="Mesajınızı yazın..." 
                 style="flex:1; padding:12px 16px; border-radius:12px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-color); font-size:0.95rem; outline:none;"
                 onkeydown="if(event.key==='Enter') avSendMesaj('${caseId}')">
          <button class="btn-primary" onclick="avSendMesaj('${caseId}')" style="padding:12px 24px; display:flex; align-items:center; gap:8px;">
            <span>Gönder</span>
            <span>➤</span>
          </button>
        </div>
      ` : `
        <div style="padding:16px 20px; background:var(--bg-surface); border-top:1px solid var(--border); text-align:center;">
          <span style="font-size:0.85rem; color:var(--text-muted);">
            🔒 Bu dosyaya mesaj gönderilemez. Dosya ${statusInfo.text.toLowerCase()} durumundadır.
          </span>
        </div>
      `}
    </div>`;

  await avFetchMesajlar(caseId);

  // Interval sadece aktif dosyalarda
  if (window.avMesajInterval) clearInterval(window.avMesajInterval);
  if (!isClosed) {
    window.avMesajInterval = setInterval(() => {
      if (activeCaseId === caseId) avFetchMesajlar(caseId);
    }, 10000);
  }
}

async function avFetchMesajlar(caseId) {
  const body = document.getElementById('avMsgBody');
  if (!body) return;
  
  // Yükleme durumunu sadece ilk yüklemede göster
  const isFirstLoad = body.innerHTML.includes('Mesajlar yükleniyor');
  
  try {
    const token = localStorage.getItem('hp_token');
    if (!token) throw new Error('Oturum kapalı');
    
    const response = await fetch('/api/messages/' + caseId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (!response.ok) {
      if (response.status === 403) throw new Error('Bu davaya mesaj erişim yetkiniz yok.');
      if (response.status === 404) throw new Error('Dava bulunamadı.');
      throw new Error('Mesajlar alınamadı (' + response.status + ')');
    }
    
    const messages = await response.json();
    
    if (messages.length === 0) {
      body.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Henüz mesaj yok.<br><span style="font-size:0.8rem;">İlk mesajı siz gönderin!</span></div>';
      return;
    }

    // Token'dan kullanıcı ID'sini güvenli şekilde al
    let myId = '';
    try {
      const tokenData = JSON.parse(atob(token.split('.')[1]));
      myId = tokenData.id;
    } catch (e) {
      console.error('Token parse hatası:', e);
    }
    
    // Mevcut scroll pozisyonunu koru (kullanıcı yukarıdayken güncelleme yapma)
    const shouldScroll = body.scrollHeight - body.scrollTop <= body.clientHeight + 50;

    body.innerHTML = messages.map(m => {
      const isMine = m.gonderenId === myId;
      const avatar = m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.gonderenAd || 'user'}`;
      const initial = (m.gonderenAd || 'U').charAt(0).toUpperCase();

      return `
      <div style="display:flex; gap:10px; margin-bottom:20px; ${isMine ? 'flex-direction:row-reverse; justify-content:flex-start;' : ''}">
        <!-- Avatar (mesaj balonunun yanında, alt hizalı) -->
        <div style="flex-shrink:0; width:40px; height:40px; border-radius:50%; overflow:hidden; background:var(--primary-dark); border:2px solid ${isMine ? 'var(--accent)' : '#6366f1'}; align-self:flex-end; margin-bottom:22px;">
          <img src="${avatar}" style="width:100%; height:100%; object-fit:cover;" alt="${m.gonderenAd || 'Kullanıcı'}" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:bold;color:#fff;font-size:1rem;\\'>${initial}</span>';">
        </div>

        <!-- Mesaj Balonu -->
        <div style="max-width:75%; min-width:120px;">
          <!-- Gönderen Adı (balonun üstünde) -->
          <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:5px; font-weight:500; ${isMine ? 'text-align:right;' : 'text-align:left;'}">
            ${m.gonderenAd || (isMine ? 'Siz' : 'Müvekkil')}
          </div>

          <!-- Balon -->
          <div style="${isMine
            ? 'background:linear-gradient(135deg, var(--accent), #00b489); color:#000; border-radius:18px 18px 4px 18px;'
            : 'background:var(--bg-surface); color:var(--text-color); border:1px solid var(--border); border-radius:18px 18px 18px 4px;'
          } padding:14px 18px; box-shadow:0 2px 10px rgba(0,0,0,0.1); display:inline-block; min-width:80px;">
            <div style="font-size:0.95rem; line-height:1.5; word-break:break-word;">${m.icerik}</div>
            <div style="font-size:0.75rem; opacity:0.8; margin-top:8px; text-align:right;">
              ${new Date(m.tarih).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

    // Sadece kullanıcı en alttaysa otomatik kaydır
    if (shouldScroll || isFirstLoad) {
      body.scrollTop = body.scrollHeight;
    }
  } catch (e) {
    console.error('Mesaj yükleme hatası:', e);
    if (isFirstLoad) {
      body.innerHTML = '<div style="text-align:center; padding:40px; color:#e63946;">⚠️ ' + e.message + '<br><button onclick="avFetchMesajlar(\'' + caseId + '\')" class="btn-primary" style="margin-top:10px;">Tekrar Dene</button></div>';
    }
  }
}

async function avSendMesaj(caseId) {
  const input = document.getElementById('avMsgInput');
  const icerik = input?.value?.trim();
  if (!icerik) return;

  // Gönder butonunu devre dışı bırak
  const btn = document.querySelector('.messages-input button');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const token = localStorage.getItem('hp_token');
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ caseId, icerik })
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Mesaj gönderilemedi (' + response.status + ')');
    }
    
    input.value = '';
    await avFetchMesajlar(caseId);
  } catch (e) {
    _showToast()(e.message || 'Mesaj gönderilemedi.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Gönder'; }
  }
}

// Window exportları
window.avukatSection = avukatSection;

// ---- PROFİL ----
async function loadAvProfil() {
  try {
    const token = localStorage.getItem('hp_token');
    if (!token) return;

    // Serverdan profil çek
    const res = await fetch('/api/avukat/profil', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Profil alınamadı');

    const avukat = await res.json();
    _avProfilData = avukat;

    // DÜZENLE formundaki inputları doldur (gerçek HTML ID'ler)
    const elAd = document.getElementById('avAdEdit');
    if (elAd) elAd.value = avukat.ad || '';

    const elSoyad = document.getElementById('avSoyadEdit');
    if (elSoyad) elSoyad.value = avukat.soyad || '';

    const elUnvan = document.getElementById('avUnvanEdit');
    if (elUnvan) elUnvan.value = avukat.unvan || '';

    const elSehir = document.getElementById('avSehirEdit');
    if (elSehir) elSehir.value = avukat.sehir || '';

    const elBaro = document.getElementById('avBaroEdit');
    if (elBaro) elBaro.value = avukat.baro || '';

    const elBaroNo = document.getElementById('avBaroNoEdit');
    if (elBaroNo) elBaroNo.value = avukat.baroNo || '';

    const elSicilNo = document.getElementById('avSicilNoEdit');
    if (elSicilNo) elSicilNo.value = avukat.sicilNo || '';

    const elMezuniyet = document.getElementById('avMezuniyetEdit');
    if (elMezuniyet) elMezuniyet.value = avukat.mezuniyetYili || '';

    const elDeneyim = document.getElementById('avDeneyimEdit');
    if (elDeneyim) elDeneyim.value = avukat.deneyimYil || '';

    const elTelefon = document.getElementById('avTelefonEdit');
    if (elTelefon) elTelefon.value = avukat.telefon || '';

    const elUzmanlik = document.getElementById('avUzmanlikEdit');
    if (elUzmanlik) {
      const uzmanlikText = Array.isArray(avukat.uzmanlik) ? avukat.uzmanlik.join(', ') : (avukat.uzmanlik || '');
      elUzmanlik.value = uzmanlikText;
    }

    const elBio = document.getElementById('avBioEdit');
    if (elBio) elBio.value = avukat.bio || '';

    // Avatarları güncelle
    const avatarImg = document.getElementById('avAvatarImg');
    if (avatarImg) {
      avatarImg.src = avukat.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avukat.ad || 'avukat'}`;
    }

    const sidebarName = document.getElementById('avSidebarName');
    if (sidebarName) {
      sidebarName.textContent = `Av. ${avukat.ad || ''} ${avukat.soyad || ''}`;
    }

    // BİLGİ (görüntüleme) sekmesini doldur
    const bilgiDiv = document.getElementById('avProfilBilgi');
    if (bilgiDiv) {
      const uzmanlikHTML = Array.isArray(avukat.uzmanlik) && avukat.uzmanlik.length > 0
        ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${avukat.uzmanlik.map(u => `<span style="background:rgba(0,217,163,0.1);color:var(--accent);padding:3px 10px;border-radius:12px;font-size:0.8rem;">${u}</span>`).join('')}</div>`
        : '';

      bilgiDiv.innerHTML = `
        <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">
          <!-- Sol: Avatar ve İsim -->
          <div style="text-align:center;min-width:180px;">
            <img src="${avukat.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avukat.ad || 'avukat'}`}" 
                 style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid var(--accent);margin-bottom:12px;"
                 onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${avukat.ad || 'avukat'}'">
            <h2 style="font-size:1.2rem;font-weight:700;margin:0;">Av. ${avukat.ad || ''} ${avukat.soyad || ''}</h2>
            ${avukat.unvan ? `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:4px;">${avukat.unvan}</p>` : ''}
            ${avukat.profil_onay ? '<div style="display:inline-flex;align-items:center;gap:5px;background:rgba(16,185,129,0.1);color:#10b981;padding:4px 12px;border-radius:20px;font-size:0.75rem;margin-top:8px;"><span>✅</span> Onaylı Profil</div>' : ''}
          </div>

          <!-- Sağ: Detaylar -->
          <div style="flex:1;min-width:260px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="background:var(--bg-surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">📧 E-Posta</div>
                <div style="font-weight:600;font-size:0.9rem;">${avukat.email || '-'}</div>
              </div>
              <div style="background:var(--bg-surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">📞 Telefon</div>
                <div style="font-weight:600;font-size:0.9rem;">${avukat.telefon || '-'}</div>
              </div>
              <div style="background:var(--bg-surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">📍 Şehir</div>
                <div style="font-weight:600;font-size:0.9rem;">${avukat.sehir || '-'}</div>
              </div>
              ${avukat.baro ? `
              <div style="background:var(--bg-surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">⚖️ Baro</div>
                <div style="font-weight:600;font-size:0.9rem;">${avukat.baro || '-'} ${avukat.baroNo ? `(${avukat.baroNo})` : ''}</div>
              </div>` : ''}
              ${avukat.sicilNo ? `
              <div style="background:var(--bg-surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">🔢 Sicil No</div>
                <div style="font-weight:600;font-size:0.9rem;">${avukat.sicilNo}</div>
              </div>` : ''}
              ${avukat.mezuniyetYili ? `
              <div style="background:var(--bg-surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">🎓 Mezuniyet</div>
                <div style="font-weight:600;font-size:0.9rem;">${avukat.mezuniyetYili}</div>
              </div>` : ''}
              ${avukat.deneyimYil ? `
              <div style="background:var(--bg-surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);">
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">💼 Deneyim</div>
                <div style="font-weight:600;font-size:0.9rem;">${avukat.deneyimYil} Yıl</div>
              </div>` : ''}
            </div>

            ${avukat.bio ? `
            <div style="background:var(--bg-surface);padding:16px;border-radius:12px;border:1px solid var(--border);margin-top:12px;">
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">📝 Hakkımda</div>
              <div style="font-size:0.9rem;line-height:1.6;">${avukat.bio}</div>
            </div>` : ''}

            ${uzmanlikHTML}
          </div>
        </div>`;
    }
  } catch (err) {
    console.error('Profil yükleme hatası:', err);
    const bilgiDiv = document.getElementById('avProfilBilgi');
    if (bilgiDiv) {
      bilgiDiv.innerHTML = `<div style="text-align:center;padding:40px;color:#e63946;">⚠️ Profil bilgileri yüklenemedi: ${err.message}<br><button onclick="loadAvProfil()" class="btn-primary" style="margin-top:10px;">Tekrar Dene</button></div>`;
    }
  }
}

// Profil tab değiştir
window.switchAvProfilTab = function(tab) {
  document.getElementById('avProfilTabBilgi').style.display = tab === 'bilgi' ? 'block' : 'none';
  document.getElementById('avProfilTabDuzenle').style.display = tab === 'duzenle' ? 'block' : 'none';
  document.getElementById('avProfilTabSifre').style.display = tab === 'sifre' ? 'block' : 'none';

  document.getElementById('avTabBilgi').classList.toggle('active', tab === 'bilgi');
  document.getElementById('avTabDuzenle').classList.toggle('active', tab === 'duzenle');
  document.getElementById('avTabSifre').classList.toggle('active', tab === 'sifre');
};

// Profil kaydet (HTML'deki form submit)
window.avProfilKaydet = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('avProfilSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor...'; }

  try {
    const uzmanlikVal = document.getElementById('avUzmanlikEdit')?.value;
    const uzmanlikArr = uzmanlikVal ? uzmanlikVal.split(',').map(s => s.trim()).filter(Boolean) : [];

    const payload = {
      ad: document.getElementById('avAdEdit')?.value,
      soyad: document.getElementById('avSoyadEdit')?.value,
      unvan: document.getElementById('avUnvanEdit')?.value,
      sehir: document.getElementById('avSehirEdit')?.value,
      telefon: document.getElementById('avTelefonEdit')?.value,
      baro: document.getElementById('avBaroEdit')?.value,
      baro_no: document.getElementById('avBaroNoEdit')?.value,
      sicil_no: document.getElementById('avSicilNoEdit')?.value,
      mezuniyet_yili: document.getElementById('avMezuniyetEdit')?.value || null,
      deneyim_yil: document.getElementById('avDeneyimEdit')?.value || null,
      bio: document.getElementById('avBioEdit')?.value,
      uzmanlik_alani: uzmanlikArr
    };

    await _apiCall()('PUT', '/avukat/profil', payload);
    _showToast()('Profil bilgileri güncellendi', 'success');

    // Auth cache'i güncelle
    const Auth = _Auth();
    if (Auth && Auth.updateUser) {
      Auth.updateUser({ ...Auth.getUser(), ...payload });
    }

    switchAvProfilTab('bilgi');
    loadAvProfil();
  } catch (err) {
    const errorDiv = document.getElementById('avProfilError');
    if (errorDiv) { errorDiv.textContent = err.message; errorDiv.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Kaydet'; }
  }
};

// ---- YZ ASİSTAN (RAG) ----
let _currentRagSessionId = null;
let _ragSessions = [];

function initRagChat() {
  // Chat alanı başlangıç durumunda
  const messagesDiv = document.getElementById('ragMessages');
  const emptyState = document.getElementById('ragEmptyState');
  if (messagesDiv && emptyState) {
    messagesDiv.innerHTML = '';
    messagesDiv.appendChild(emptyState);
    emptyState.style.display = 'block';
  }
  _currentRagSessionId = null;
}

async function loadRagHistory() {
  try {
    const token = localStorage.getItem('hp_token');
    if (!token) return;

    const res = await fetch('/api/rag/sessions', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;

    _ragSessions = await res.json();
    renderRagSessions();
  } catch (e) {
    console.error('RAG geçmişi yüklenemedi:', e);
  }
}

function renderRagSessions() {
  const list = document.getElementById('ragSessionsList');
  if (!list) return;

  if (_ragSessions.length === 0) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.85rem;">Henüz sohbet yok.<br>Yeni sohbet başlatın.</div>`;
    return;
  }

  list.innerHTML = _ragSessions.map(s => `
    <div style="padding:10px 14px;cursor:pointer;border-radius:8px;margin-bottom:4px;transition:all 0.2s;position:relative;${_currentRagSessionId === s.id ? 'background:rgba(99,102,241,0.15);border-left:3px solid #6366f1;' : 'background:var(--bg-surface);border-left:3px solid transparent;'}">
      <div onclick="selectRagSession(${s.id})" style="display:flex; align-items:center; justify-content:space-between;">
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.85rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.title || 'Sohbet #' + s.id}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">${s.created_at ? new Date(s.created_at).toLocaleDateString('tr-TR') : ''}</div>
        </div>
      </div>
      <button onclick="event.stopPropagation(); deleteRagSession(${s.id})" 
              title="Sohbeti Sil"
              style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; padding:6px; border-radius:50%; opacity:0; transition:all 0.2s; color:#e63946; font-size:1rem;"
              onmouseover="this.style.opacity='1';this.style.background='rgba(230,57,70,0.1)';"
              onmouseout="this.style.opacity='0';this.style.background='none';"
              >🗑️</button>
    </div>
  `).join('');

  // Hover ile silme butonunu göster
  setTimeout(() => {
    list.querySelectorAll('div[style*="position:relative"]').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const btn = el.querySelector('button');
        if (btn) btn.style.opacity = '1';
      });
      el.addEventListener('mouseleave', () => {
        const btn = el.querySelector('button');
        if (btn) btn.style.opacity = '0';
      });
    });
  }, 0);
}

async function deleteRagSession(sessionId) {
  if (!confirm('Bu sohbeti silmek istediğinize emin misiniz?')) return;

  try {
    const token = localStorage.getItem('hp_token');
    if (!token) return;

    const res = await fetch('/api/rag/sessions/' + sessionId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) throw new Error('Sohbet silinemedi');

    // Frontend listesinden kaldır
    _ragSessions = _ragSessions.filter(s => s.id !== sessionId);

    // Eğer silinen aktif oturumsa chat alanını temizle
    if (_currentRagSessionId === sessionId) {
      _currentRagSessionId = null;
      initRagChat();
    }

    renderRagSessions();
    _showToast()('Sohbet silindi', 'success');
  } catch (err) {
    _showToast()(err.message || 'Sohbet silinemedi', 'error');
  }
}

async function createNewChat() {
  try {
    const token = localStorage.getItem('hp_token');
    if (!token) return;

    const res = await fetch('/api/rag/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ title: 'Yeni Sohbet' })
    });

    if (!res.ok) throw new Error('Oturum oluşturulamadı');

    const session = await res.json();
    _ragSessions.unshift(session);
    renderRagSessions();
    selectRagSession(session.id);
  } catch (err) {
    _showToast()(err.message || 'Yeni sohbet oluşturulamadı', 'error');
  }
}

async function selectRagSession(sessionId) {
  _currentRagSessionId = sessionId;
  renderRagSessions();

  // Mobil ekranlarda sidebar'ı kapat
  if (window.innerWidth <= 768) {
    toggleRagSidebar();
  }

  // Mesajları yükle
  try {
    const token = localStorage.getItem('hp_token');
    if (!token) return;

    const res = await fetch('/api/rag/sessions/' + sessionId + '/messages', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Mesajlar alınamadı');

    const messages = await res.json();
    renderRagMessages(messages);
  } catch (err) {
    console.error('RAG mesajları yüklenemedi:', err);
  }
}

window.toggleRagSidebar = function() {
  const layout = document.getElementById('ragLayout');
  if (layout) {
    layout.classList.toggle('sidebar-open');
  }
};

function renderRagMessages(messages) {
  const container = document.getElementById('ragMessages');
  if (!container) return;

  const emptyState = document.getElementById('ragEmptyState');
  if (emptyState) emptyState.style.display = 'none';

  if (!messages || messages.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'block';
      container.appendChild(emptyState);
    }
    return;
  }

  // DB'de her kayıt: message (kullanıcı) + response (AI) tek satırda
  let html = '';
  messages.forEach(m => {
    const time = m.created_at ? new Date(m.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'}) : '';

    // Kullanıcı mesajı
    if (m.message) {
      html += `
        <div style="display:flex; gap:10px; margin-bottom:16px; flex-direction:row-reverse;">
          <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:0.9rem;">👤</div>
          <div style="max-width:80%; padding:12px 16px; border-radius:12px; background:var(--accent); color:#000; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <div style="font-size:0.9rem; line-height:1.5;">${m.message}</div>
            ${time ? `<div style="font-size:0.7rem; opacity:0.7; margin-top:6px; text-align:right;">${time}</div>` : ''}
          </div>
        </div>`;
    }

    // AI yanıtı
    if (m.response) {
      let sourcesHtml = '';
      if (m.sources) {
        try {
          const sources = typeof m.sources === 'string' ? JSON.parse(m.sources) : m.sources;
          if (Array.isArray(sources) && sources.length > 0) {
            sourcesHtml = `<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border); font-size:0.75rem; color:var(--text-muted);">📚 Kaynaklar: ${sources.join(', ')}</div>`;
          }
        } catch (e) { /* ignore */ }
      }

      html += `
        <div style="display:flex; gap:10px; margin-bottom:16px;">
          <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:#6366f1; display:flex; align-items:center; justify-content:center; font-size:0.9rem;">🤖</div>
          <div style="max-width:80%; padding:12px 16px; border-radius:12px; background:var(--bg-surface); color:var(--text-color); box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <div style="font-size:0.9rem; line-height:1.5;">${m.response}</div>
            ${sourcesHtml}
          </div>
        </div>`;
    }
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

async function sendRagMessage() {
  const input = document.getElementById('ragInput');
  const message = input?.value?.trim();
  if (!message) return;

  const btn = document.getElementById('ragSendBtn');
  if (btn) { btn.disabled = true; }

  // Kullanıcı mesajını hemen göster
  const container = document.getElementById('ragMessages');
  if (container) {
    const emptyState = document.getElementById('ragEmptyState');
    if (emptyState) emptyState.style.display = 'none';

    const userMsgDiv = document.createElement('div');
    userMsgDiv.innerHTML = `
      <div style="display:flex; gap:10px; margin-bottom:16px; flex-direction:row-reverse;">
        <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:0.9rem;">👤</div>
        <div style="max-width:80%; padding:12px 16px; border-radius:12px; background:var(--accent); color:#000; box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <div style="font-size:0.9rem; line-height:1.5;">${message}</div>
        </div>
      </div>
      <div id="ragTypingIndicator" style="display:flex; gap:10px; margin-bottom:16px;">
        <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:#6366f1; display:flex; align-items:center; justify-content:center; font-size:0.9rem;">🤖</div>
        <div style="padding:12px 16px; border-radius:12px; background:var(--bg-surface); box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <div style="display:flex; gap:4px; align-items:center;">
            <div style="width:8px; height:8px; border-radius:50%; background:#6366f1; animation: bounce 1.4s infinite ease-in-out;"></div>
            <div style="width:8px; height:8px; border-radius:50%; background:#6366f1; animation: bounce 1.4s infinite ease-in-out 0.2s;"></div>
            <div style="width:8px; height:8px; border-radius:50%; background:#6366f1; animation: bounce 1.4s infinite ease-in-out 0.4s;"></div>
          </div>
        </div>
      </div>`;
    container.appendChild(userMsgDiv);
    container.scrollTop = container.scrollHeight;
  }

  if (input) input.value = '';

  try {
    const token = localStorage.getItem('hp_token');
    if (!token) throw new Error('Oturum kapalı');

    const res = await fetch('/api/rag/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ message, sessionId: _currentRagSessionId })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'YZ Asistan yanıt vermedi');
    }

    const data = await res.json();

    // Typing indicator'ı kaldır
    const typing = document.getElementById('ragTypingIndicator');
    if (typing) typing.remove();

    // AI yanıtını göster
    if (container && data.response) {
      const aiMsgDiv = document.createElement('div');
      aiMsgDiv.innerHTML = `
        <div style="display:flex; gap:10px; margin-bottom:16px;">
          <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:#6366f1; display:flex; align-items:center; justify-content:center; font-size:0.9rem;">🤖</div>
          <div style="max-width:80%; padding:12px 16px; border-radius:12px; background:var(--bg-surface); color:var(--text-color); box-shadow:0 2px 8px rgba(0,0,0,0.1);">
            <div style="font-size:0.9rem; line-height:1.5;">${data.response}</div>
            ${data.sources ? `<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border); font-size:0.75rem; color:var(--text-muted);">📚 Kaynak: ${data.sources}</div>` : ''}
          </div>
        </div>`;
      container.appendChild(aiMsgDiv);
      container.scrollTop = container.scrollHeight;
    }

    // Yeni oturum ID'si varsa güncelle
    if (data.sessionId && !_currentRagSessionId) {
      _currentRagSessionId = data.sessionId;
      loadRagHistory();
    }
  } catch (err) {
    const typing = document.getElementById('ragTypingIndicator');
    if (typing) typing.remove();

    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = `
      <div style="display:flex; gap:10px; margin-bottom:16px;">
        <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; background:#e63946; display:flex; align-items:center; justify-content:center; font-size:0.9rem;">⚠️</div>
        <div style="max-width:80%; padding:12px 16px; border-radius:12px; background:rgba(230,57,70,0.1); color:#e63946;">
          <div style="font-size:0.85rem;">${err.message || 'YZ Asistan şu anda yanıt vermiyor.'}</div>
        </div>
      </div>`;
    if (container) {
      container.appendChild(errorDiv);
      container.scrollTop = container.scrollHeight;
    }
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

// Window exportları
window.loadAvMesajlar = loadAvMesajlar;
window.avMesajYukle = avMesajYukle;
window.avSendMesaj = avSendMesaj;
window.avFetchMesajlar = avFetchMesajlar;
window.loadAvProfil = loadAvProfil;
window.loadNotifCount = loadNotifCount;
window.initRagChat = initRagChat;
window.loadRagHistory = loadRagHistory;
window.createNewChat = createNewChat;
window.sendRagMessage = sendRagMessage;
window.selectRagSession = selectRagSession;
