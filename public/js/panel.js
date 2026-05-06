// =============================================
// HakPortal - Kullanıcı Panel JS
// =============================================

function getHP() { return window.HakPortal || {}; }
const _Auth = () => getHP().Auth || window.Auth;
const _apiCall = () => getHP().apiCall || window.apiCall;
const _showToast = () => getHP().showToast || window.showToast;
const _formatTL = () => getHP().formatTL || window.formatTL;
const _formatDate = () => getHP().formatDate || window.formatDate;

let activeCaseId = null;
let activeOfferId = null;
let mesajInterval = null;

// Yükleme kilitleri - aynı anda birden fazla istek gitmesin
const _loading = {};

let selectedAvatar = '👤';

// ---- GİRİŞ KONTROLÜ ----
document.addEventListener('DOMContentLoaded', () => {
  const Auth = _Auth();
  if (!Auth || !Auth.isLoggedIn() || Auth.getRole() !== 'kullanici') {
    window.location.href = '/';
    return;
  }

  const user = Auth.getUser();
  const navName = document.getElementById('navUserName');
  if (navName) navName.textContent = `${user?.ad || ''} ${user?.soyad || ''}`;
  const sideName = document.getElementById('sideUserName');
  if (sideName) sideName.textContent = `${user?.ad || ''} ${user?.soyad || ''}`;

  // Kart numarası otomatik biçimlendir
  const kartNoEl = document.getElementById('kartNo');
  if (kartNoEl) {
    kartNoEl.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 16);
      e.target.value = val.replace(/(.{4})/g, '$1 ').trim();
    });
  }

  // Son kullanma tarihi otomatik biçimlendir (MM / YY)
  const sonKulEl = document.getElementById('sonKullanma');
  if (sonKulEl) {
    sonKulEl.addEventListener('input', e => {
      let val = e.target.value.replace(/\D/g, '').substring(0, 4);
      if (val.length > 2) val = val.substring(0, 2) + ' / ' + val.substring(2, 4);
      e.target.value = val;
    });
  }

  // Panel hesaplama form
  setupPanelHesaplamaForm();

  // İlk yükleme
  showSection('davalarim');

  // Bildirim sistemi başlat
  loadNotifCount();
  setInterval(loadNotifCount, 30000); // 30 saniyede bir kontrol

  // Okunmamış mesaj badge'i başlat
  loadMesajBadge();
  setInterval(loadMesajBadge, 30000); // 30 saniyede bir kontrol

  // Herhangi bir yere tıklayınca dropdown'ı kapat
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('notifWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      const dd = document.getElementById('notifDropdown');
      if (dd) dd.style.display = 'none';
    }
  });
});

// ---- SECTION YÖNETİMİ ----
// currentSection takip et - gereksiz reload'ları engelle
let currentSection = null;

function showSection(name) {
  const sections = ['Davalarim', 'YeniHesaplama', 'Mesajlarim', 'Profil', 'Teklifler', 'Odeme'];
  sections.forEach(s => {
    const el = document.getElementById(`section${s}`);
    if (el) el.style.display = 'none';
  });

  const key = name.charAt(0).toUpperCase() + name.slice(1);
  const target = document.getElementById(`section${key}`);
  if (!target) { console.warn('Section yok: section' + key); return; }

  // Mesajlar açılınca badge sıfırla
  if (name === 'mesajlarim') {
    const badge = document.getElementById('mesajBadge');
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
  }
  target.style.display = 'block';

  // Sidebar active
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`sidebar${key}`)?.classList.add('active');

  const prev = currentSection;
  currentSection = name;

  // Mesaj interval'ı sadece mesaj bölümü dışına çıkınca temizle
  if (prev === 'mesajlarim' && name !== 'mesajlarim') {
    if (mesajInterval) { clearInterval(mesajInterval); mesajInterval = null; }
  }

  // Sadece gerektiğinde yükle
  if (name === 'davalarim') loadDavalar();
  if (name === 'profil') loadProfil();
  if (name === 'mesajlarim') loadMesajlar();

  if (name === 'yeniHesaplama') {
    const preCont = document.getElementById('preTestContainer');
    const mainCont = document.getElementById('mainCalcWrapper');
    if (preCont) preCont.style.display = 'block';
    if (mainCont) mainCont.style.display = 'none';

    // Geçmiş veriyi temizle
    document.getElementById('ptKimCikardi').value = '';
    document.getElementById('ptSure').value = '';
    document.getElementById('ptMaas').value = '';

    const panelForm = document.getElementById('panelHesaplamaForm');
    if (panelForm) panelForm.reset();
  }
}

// ---- AKILLI RENDER YARDIMCISI ----
// İçerik zaten varsa spinner gösterme, arka planda güncelle
async function smartRender(containerId, fetchFn, renderFn, emptyFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Kilitli mi? (aynı anda çift istek gitmesin)
  if (_loading[containerId]) return;
  _loading[containerId] = true;

  const isEmpty = !container.dataset.loaded;

  // İlk yüklemede spinner göster, sonrakinde içeriği koru
  if (isEmpty) {
    container.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>Yükleniyor...</p>
      </div>`;
  }

  try {
    const data = await fetchFn();
    if (!data || (Array.isArray(data) && !data.length)) {
      container.innerHTML = emptyFn();
    } else {
      // Render yeni içeriği → sadece değiştiyse DOM'u güncelle (titreme yok)
      const newHTML = renderFn(data);
      if (container.dataset.lastHTML !== newHTML) {
        container.innerHTML = newHTML;
        container.dataset.lastHTML = newHTML;
      }
    }
    container.dataset.loaded = '1';
  } catch (err) {
    if (isEmpty) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-title">Yüklenemedi: ${err.message}</div>
          <div class="empty-sub"><button class="btn-ghost" onclick="loadDavalar()">Tekrar Dene</button></div>
        </div>`;
    }
    // Hata varsa eski içerik korunur (titreme yok)
  } finally {
    _loading[containerId] = false;
  }
}

function renderDetayliDavaRaporu(data) {
  if (!data) return '';

  let html = `
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

  html += `</div></div>`;
  return html;
}

// ---- DAVALAR ----
async function loadDavalar() {
  await smartRender(
    'davalarListesi',
    () => _apiCall()('GET', '/cases/benim'),
    (davalar) => {
      const statusLabels = {
        KAYITLI: '📁 Kayıtlı',
        AVUKAT_ARANIYOR: '🧐 Yanıt Bekleniyor',
        ACTIVE: '🟢 Aktif Müvekkil',
        PRE_CASE_REVIEW: '🧐 Dosya İnceleniyor',
        PENDING_USER_AUTH: '⏳ Vekalet İsteniyor',
        AUTHORIZED: '✅ Vekalet Verildi',
        DAVA_NO_BEKLIYOR: '🏗️ Dosya No Onayı',
        FILED_IN_COURT: '🏛️ Dava Açıldı',
        IN_PROGRESS: '💬 İşlemde',
        DURUSMA: '🏛️ Duruşma Süreci',
        TAHSIL: '💰 Tahsil Edildi',
        CLOSED: '🛑 Kapatıldı',
        CANCELED: '🚫 İptal'
      };

      return `<div class="dava-grid">` +
        davalar.map(d => `
          <div class="dava-card">
            <div class="dava-card-header">
              <div>
                <div class="dava-card-title">${d.davaTuru || 'Kıdem/İhbar Davası'}</div>
                <div class="dava-card-sub">${d.sehir} • ${_formatDate()(d.createdAt)}</div>
              </div>
              <span class="status-badge status-${d.status}">${statusLabels[d.status] || d.status}</span>
            </div>
            <div class="dava-card-body">
              <div class="dava-detail-row">
                <span>Tahmini Alacak</span>
                <span class="alacak">${_formatTL()(d.tahminiAlacak)}</span>
              </div>
              <div class="dava-detail-row">
                <span>Bekleyen Talepler</span>
                <span>${d.bekleyenTalepSayisi || 0}</span>
              </div>
              ${renderDetayliDavaRaporu(d.hesaplamaVerisi)}
            </div>
            <div class="dava-card-actions">${buildDavaActions(d)}</div>
          </div>`).join('') + `</div>`;
    },
    () => `
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-title">Henüz dava dosyanız yok.</div>
        <div class="empty-sub">Hesaplama yapın ve şehrinizdeki avukatları listeleyerek iletişime geçin.</div>
        <br/>
        <button class="btn-primary" onclick="showSection('yeniHesaplama')">Yeni Dosya Oluştur</button>
      </div>`
  );
}

function buildDavaActions(d) {
  let actions = '';

  if (d.status === 'KAYITLI') {
    actions += `<button class="btn-primary" style="width:100%"
              onclick="loadAvukatBul('${d.id}')">🔍 Avukat Bul & İletişime Geç</button>`;
  }
  else if (d.status === 'AVUKAT_ARANIYOR') {
    actions += `
        <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.3);border-radius:10px;padding:12px;margin-bottom:8px;font-size:0.85rem;color:#ffc107;line-height:1.4">
          🧐 <strong>Yanıt Bekleniyor...</strong><br/>
          Avukata gönderdiğiniz iletişim talebi değerlendiriliyor.
        </div>`;
    actions += `<button class="btn-ghost" style="width:100%" onclick="loadAvukatBul('${d.id}')">Başka Avukat Ara</button>`;
  }
  else if (d.status === 'PENDING_USER_AUTH') {
    actions += `
        <div style="background:rgba(0,217,163,0.08);border:1px solid rgba(0,217,163,0.3);border-radius:10px;padding:12px;margin-bottom:8px;font-size:0.85rem;color:var(--accent);line-height:1.4">
          📋 <strong>Avukat Vekalet İstiyor</strong><br/>
          Avukatınız evrakları yeterli buldu ve sizden resmi vekalet onayını bekliyor.
        </div>
        <button class="btn-primary" style="background:#00d9a3;color:#000;width:100%;font-weight:700" onclick="window.approveUserAuth('${d.id}')">✅ Vekaleti Onayla ve Yetkilendir</button>
        <button class="btn-ghost" style="width:100%" onclick="loadMesaj('${d.id}', '${d.status}')">💬 Mesajlaş</button>`;
  }
  else if (d.status === 'DAVA_NO_BEKLIYOR') {
    actions += `
        <div style="background:rgba(255,179,0,0.08);border:1px solid rgba(255,179,0,0.3);border-radius:10px;padding:12px;margin-bottom:8px;font-size:0.85rem;color:#ffb300;line-height:1.4">
          🏛️ <strong>Mahkeme Dosya Numaranız: ${d.davaNo || 'Belirtilmedi'}</strong><br/>
          <span style="opacity:0.8">Avukatınız dava numarasını iletti. Kendi belgelerinizle örtüşüyor mu? Lütfen kontrol edip onaylayın.</span>
        </div>
        <button class="btn-primary" style="background:#ffb300;color:#000;width:100%;font-weight:700" onclick="window.confirmDavaNo('${d.id}', '${d.davaNo || ''}')">✔️ Numara Doğru - Onayla</button>
        <button class="btn-ghost" style="color:#ff6b6b;border-color:rgba(255,107,107,0.3);width:100%" onclick="window.rejectDavaNo('${d.id}')">❌ Teyit Edilmiyor</button>`;
  }
  else if (d.status === 'TAHSIL') {
    const safeAciklama = (d.tahsilAciklama || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    actions += `<button class="btn-primary" style="background:#e91e63;color:#fff;width:100%;font-weight:700;" onclick="window.confirmCollectionModal('${d.id}', '${safeAciklama}')">✔️ Tahsilatı Onayla ve Kapat</button>
                <button class="btn-ghost" style="width:100%" onclick="loadMesaj('${d.id}', '${d.status}')">💬 Mesajlaş</button>`;
  } else if (['ACTIVE', 'PRE_CASE_REVIEW', 'AUTHORIZED', 'IN_PROGRESS', 'FILED_IN_COURT', 'DURUSMA'].includes(d.status)) {
    actions += `<button class="btn-ghost" style="width:100%"
              onclick="loadMesaj('${d.id}', '${d.status}')">💬 Mesajlaş</button>`;
  } else if (['CLOSED', 'CANCELED'].includes(d.status)) {
    actions += `<button class="btn-ghost" style="width:100%;color:#ff6b6b;border-color:rgba(255,107,107,0.3);background:rgba(255,107,107,0.05);cursor:not-allowed;" disabled>🔒 Dava Dosyası Kapandı</button>`;
  }

  if (d.status === 'KAYITLI') {
    actions += `<button class="btn-ghost" style="color:#ff4d4f;margin-top:4px;border:none;background:transparent"
                onclick="window.davaSil('${d.id}')">🗑️ Dosyayı Sil</button>`;
  }

  return actions;
}


window.davaSil = async function (caseId) {
  const isConfirmed = await window.HakPortal.showConfirm('Bu dava ilanını kalıcı olarak silmek istediğinize emin misiniz?\n(Bu işlem geri alınamaz)');
  if (!isConfirmed) return;

  try {
    await _apiCall()('DELETE', `/cases/${caseId}`);
    _showToast()('Dava ilanı başarıyla silindi.', 'success');

    // Listeyi yenilemek için cache'i temizle
    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }
    loadDavalar();
  } catch (err) {
    _showToast()(err.message, 'error');
  }
}

// ---- DAVA NO ONAY / RED ----
window.confirmDavaNo = async function (caseId, davaNo) {
  const isConfirmed = await window.HakPortal.showConfirm(
    `Mahkeme dosya numarasını onaylıyorsunuz:\n\n"${davaNo}"\n\nBu numaranın doğru olduğunu ve kendi bilgilerinizle örtüştüğünü teyit ediyor musunuz?`
  );
  if (!isConfirmed) return;
  try {
    await _apiCall()('PUT', `/cases/${caseId}/status`, {
      status: 'FILED_IN_COURT',
      aciklama: `Kullanıcı mahkeme dosya numarasını doğruladı: ${davaNo}`
    });
    _showToast()('🏛️ Dava numarası onaylandı! Süreç devam ediyor.', 'success');
    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }
    loadDavalar();
  } catch (err) {
    _showToast()(err.message, 'error');
  }
};

window.rejectDavaNo = async function (caseId) {
  const isConfirmed = await window.HakPortal.showConfirm(
    'Girilen dava numarasının yanlış olduğunu bildirmek istiyorsunuz.\n\nAvukatınıza mesaj gönderip durumu bildireceksiniz. Onay veriyor musunuz?'
  );
  if (!isConfirmed) return;
  try {
    // Durumu AUTHORIZED'a geri al (avukat yeniden dava no girebilsin)
    await _apiCall()('PUT', `/cases/${caseId}/status`, {
      status: 'AUTHORIZED',
      aciklama: 'Kullanıcı girilen mahkeme dosya numarasının yanlış olduğunu bildirdi. Avukat yeniden giriş yapmalı.'
    });
    _showToast()('❌ Numara yanlış olarak bildirildi. Avukatınızla mesajlaşarak bilgi verin.', 'info');
    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }
    loadDavalar();
  } catch (err) {
    _showToast()(err.message, 'error');
  }
};

window.approveUserAuth = async function (caseId) {
  const isConfirmed = await window.HakPortal.showConfirm('Avukatınıza resmi vekaleti verdiğinizi ve davayı üstlenmesi için yetkilendirdiğinizi onaylıyor musunuz?\n\n* Onayladığınızda avukat yetkilenip mahkemede davanızı açacaktır.');
  if (!isConfirmed) return;

  try {
    await _apiCall()('PUT', `/cases/${caseId}/status`, { status: 'AUTHORIZED', aciklama: 'Kullanıcı avukata vekalet verdiğini ve yetkilendirdiğini onayladı.' });
    _showToast()('Vekalet Avukata Onaylandı! ✅', 'success');
    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }
    loadDavalar();
    loadMesajlar();
  } catch (err) {
    _showToast()(err.message, 'error');
  }
};

window.confirmCollectionModal = function (caseId, aciklama) {
  const match = aciklama.match(/(\d+)\s*TL/i);
  const miktar = match ? match[1] + ' TL' : 'Bilinmeyen Tutar';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="width:100%; max-width:400px; padding:24px; border-radius:12px; border:2px solid #e91e63;">
      <div style="font-size:3rem; text-align:center; margin-bottom:10px;">💰</div>
      <h2 style="font-size:1.3rem; margin-bottom:16px; text-align:center;">Dava Kapanış Onayı</h2>
      <p style="font-size:0.95rem; color:var(--text-secondary); text-align:center; margin-bottom:20px;">
        Avukatınız bu davanın başarıyla sonuçlandığını (veya anlaşıldığını) bildirdi.
      </p>
      
      <div style="background:var(--bg-card-2); padding:16px; border-radius:8px; text-align:center; margin-bottom:20px; border:1px solid var(--border);">
        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:4px;">Tahsil Edilen Toplam Tutar:</div>
        <div style="font-size:1.5rem; font-weight:bold; color:var(--accent);">${miktar}</div>
      </div>
      
      <div style="background:#fff3cd; color:#856404; padding:12px; border-radius:6px; font-size:0.85rem; margin-bottom:16px; border:1px solid #ffeeba; text-align:left;">
        <strong>Önemli Uyarı:</strong> Yukarıdaki tutar fiilen anlaştığınız tutar ile uyuşmuyorsa onaylamayınız ve müşteri hizmetleri ile iletişime geçiniz. Herhangi bir kandırma işleminde sistemdeki kayıtlar delil sayılacaktır.
      </div>
      
      <div style="margin-bottom:16px;">
        <label style="display:block; text-align:center; font-size:0.95rem; font-weight:bold; margin-bottom:8px;">Avukatınızı Değerlendirin</label>
        <div id="starContainer" style="display:flex; justify-content:center; gap:8px; font-size:1.8rem; cursor:pointer; margin-bottom:12px;">
          <span class="star" data-val="1" style="color:gold">★</span>
          <span class="star" data-val="2" style="color:gold">★</span>
          <span class="star" data-val="3" style="color:gold">★</span>
          <span class="star" data-val="4" style="color:gold">★</span>
          <span class="star" data-val="5" style="color:gold">★</span>
        </div>
        <input type="hidden" id="avukatPuan" value="5">
        <textarea id="avukatYorum" rows="3" placeholder="Avukatınız hakkındaki düşüncelerinizi diğer kullanıcılarla paylaşın..." style="width:100%; border-radius:6px; border:1px solid var(--border); padding:10px; font-size:0.85rem; display:block; resize:vertical; background:var(--bg-card); color:var(--text-color);"></textarea>
      </div>

      <p style="font-size:0.85rem; color:var(--text-muted); text-align:center; margin-bottom:24px;">
        * Herhangi bir ekstra platform komisyonu olmaksızın, dava dosyanızı tamamen sistem üzerinde Kapatmak istediğinize emin misiniz?
      </p>

      <div style="display:flex; gap:12px;">
        <button class="btn-ghost" style="flex:1" onclick="this.closest('.modal-overlay').remove()">Hayır, İptal</button>
        <button class="btn-primary" style="flex:1; background:#e91e63;" id="finalCloseBtn_${caseId}">Evet, Onayla & Kapat</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Yıldız Seçimi Etkileşimi
  const stars = modal.querySelectorAll('.star');
  const puanInput = modal.querySelector('#avukatPuan');
  stars.forEach(star => {
    star.addEventListener('click', function () {
      const val = parseInt(this.getAttribute('data-val'));
      puanInput.value = val;
      stars.forEach((s, idx) => {
        s.style.color = idx < val ? 'gold' : '#ccc';
      });
    });
  });

  document.getElementById(`finalCloseBtn_${caseId}`).onclick = async function () {
    try {
      const gidenPuan = puanInput.value;
      const gidenYorum = modal.querySelector('#avukatYorum').value.trim();

      this.disabled = true; this.textContent = '...';
      await _apiCall()('PUT', `/cases/${caseId}/status`, {
        status: 'CLOSED',
        aciklama: 'Müvekkil davanın sonuçlandığını onayladı. Dosya karşılıklı olarak kapatıldı.',
        puan: gidenPuan,
        yorum: gidenYorum
      });
      _showToast('Dava başarıyla kapatıldı! Puanlamanız için teşekkürler. 🎉', 'success');
      modal.remove();
      const davaCont = document.getElementById('davalarListesi');
      if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }
      loadDavalar();
      loadMesajlar();
    } catch (err) {
      this.disabled = false; this.textContent = 'Evet, Onayla & Kapat';
      _showToast(err.message, 'error');
    }
  };
};

// ---- AVUKAT BUL ----
async function loadAvukatBul(caseId) {
  activeCaseId = caseId;
  showSection('avukatBul');

  const container = document.getElementById('avukatlarListesi');
  if (!container) return;

  container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Bölgenizdeki avukatlar listeleniyor...</p></div>`;

  try {
    const caseData = await _apiCall()('GET', `/cases/${caseId}`);
    const sehir = caseData.sehir || 'İstanbul'; // Varsayılan

    const avukatlar = await _apiCall()('GET', `/offers/avukatlar?sehir=${encodeURIComponent(sehir)}&caseId=${caseId}`);

    if (!avukatlar.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">😢</div>
          <div class="empty-title">Avukat Bulunamadı</div>
          <div class="empty-sub">${sehir} şehrinde henüz kayıtlı avukatımız bulunmuyor.</div>
        </div>`;
      return;
    }

    window._cachedAvukatlar = avukatlar;

    const html = `<div class="teklif-grid">` +
      avukatlar.map((a, i) => `
        <div class="teklif-card">
          <div class="teklif-header">
            <span class="teklif-no">⚖️ ${a.unvan || 'Av.'} ${a.ad} ${a.soyad}</span>
            <span class="status-badge status-ACTIVE">${a.sehir}</span>
          </div>
          <div style="text-align:center; margin:10px 0;">
            <div style="color:gold; font-size:1.1rem; margin-bottom:4px;">${'★'.repeat(Math.round(a.ortalamaPuan || 0))}${'☆'.repeat(5 - Math.round(a.ortalamaPuan || 0))} <span style="color:var(--text-color); font-size:0.9rem; font-weight:600;">${a.ortalamaPuan}</span></div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">${a.yorumSayisi} Değerlendirme</div>
          </div>
          <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4; margin-bottom:12px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
            ${a.bio || 'İş hukuku ve işçi alacakları konusunda deneyimli avukat.'}
          </div>
          <div style="margin-bottom:12px;">
            ${(a.uzmanlik || []).map(u => `<span style="display:inline-block; background:var(--bg-main); padding:3px 8px; border-radius:4px; font-size:0.75rem; margin:0 4px 4px 0; border:1px solid var(--border);">${u}</span>`).join('')}
          </div>
          <button class="btn-primary btn-block" 
            ${a.talepGonderildi ? 'disabled style="background:var(--border); color:var(--text-muted); cursor:not-allowed; border-color:var(--border);"' : `onclick="iletisimTalebiGonderModal('${a.id}')"`}>
            ${a.talepGonderildi ? '✅ Talep Gönderildi' : 'İletişim Talebi Gönder →'}
          </button>
        </div>`).join('') + `</div>`;

    container.innerHTML = html;
  } catch (err) {
    _showToast()(err.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">${err.message}</div></div>`;
  }
}

window.iletisimTalebiGonderModal = function (avukatId) {
  const avukat = window._cachedAvukatlar?.find(a => a.id === avukatId);
  if (!avukat) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="width:100%; max-width:450px;">
      <h3 class="modal-title" style="font-size:1.1rem;">İletişim Talebi</h3>
      <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:16px;">
        ${avukat.unvan || 'Av.'} ${avukat.ad} ${avukat.soyad}'a davanızla ilgilenmesi için talep göndereceksiniz.
      </p>
      <div class="form-group">
        <label class="form-label">Avukata Notunuz (İsteğe bağlı)</label>
        <textarea id="talepNot" class="form-input" rows="3" placeholder="Davanız hakkında kısa bilgi verebilirsiniz. Lütfen telefon veya e-posta YAZMAYIN, aksi takdirde sistem engeller."></textarea>
      </div>
      <div style="background:rgba(230,57,70,0.08);border:1px dashed rgba(230,57,70,0.3);padding:10px;border-radius:6px;font-size:0.8rem;color:var(--text-secondary);margin-bottom:16px;">
        ⚠️ Not alanına iletişim bilgilerinizi yazarsanız talebiniz reddedilir. Avukat talebinizi kabul ettiğinde iletişim bilgileriniz karşılıklı açılacaktır.
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-ghost" style="flex:1" onclick="this.closest('.modal-overlay').remove()">İptal</button>
        <button class="btn-primary" style="flex:1" id="talepGonderBtn" onclick="iletisimTalebiGonder('${avukatId}', this)">Talebi Gönder</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.iletisimTalebiGonder = async function (avukatId, btn) {
  const not = document.getElementById('talepNot')?.value?.trim();
  btn.disabled = true;
  btn.textContent = 'Gönderiliyor...';

  try {
    const res = await _apiCall()('POST', '/offers/iletisim-talebi', { avukatId, caseId: activeCaseId, not });
    _showToast()(res.message || 'İletişim talebi başarıyla gönderildi!', 'success');
    btn.closest('.modal-overlay').remove();

    // Dava durumunu pending (AVUKAT_ARANIYOR) yap (manuel güncelleme)
    await _apiCall()('PUT', `/cases/${activeCaseId}/status`, { status: 'AVUKAT_ARANIYOR', aciklama: 'Kullanıcı iletişim talebi gönderdi.' });

    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }
    showSection('davalarim');
  } catch (err) {
    _showToast()(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Talebi Gönder';
  }
}

// ---- MESAJLAR ----

// Mesajlar için global state (avukat paneliyle aynı)
let _kullaniciMesajState = {
  activeTab: 'aktif',
  searchQuery: '',
  allCases: [],
  lastMessages: {}
};

async function loadMesajlar() {
  const container = document.getElementById('mesajlarListesi');
  if (!container) return;

  // Zaten mesaj sohbeti açıksa tekrar listeleme yapma
  if (container.querySelector('.messages-container')) return;

  container.innerHTML = `
    <div style="padding:60px 20px; text-align:center;">
      <div class="loading-spinner" style="width:50px; height:50px; margin:0 auto 20px;"></div>
      <p style="color:var(--text-muted);">Mesajlar yükleniyor...</p>
    </div>`;

  try {
    const token = localStorage.getItem('hp_token');
    if (!token) throw new Error('Oturum kapalı');

    // Tüm davaları çek
    const davalar = await _apiCall()('GET', '/cases/benim');
    if (!davalar || !Array.isArray(davalar)) throw new Error('Geçersiz veri');

    // Son mesajları çek
    await _loadKullaniciLastMessages(davalar.map(d => d.id), token);

    _kullaniciMesajState.allCases = davalar;
    _renderKullaniciMesajlarUI();

    container.dataset.loaded = '1';
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state" style="text-align:center;padding:60px 20px;">
        <div style="font-size:3rem;margin-bottom:15px;">⚠️</div>
        <h3 style="margin-bottom:10px;color:#e63946;">${err.message}</h3>
        <button onclick="loadMesajlar()" class="btn-primary" style="margin-top:20px;">🔄 Tekrar Dene</button>
      </div>`;
  }
}

async function _loadKullaniciLastMessages(caseIds, token) {
  try {
    for (const caseId of caseIds) {
      const res = await fetch('/api/messages/' + caseId + '?limit=1', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const messages = await res.json();
        if (messages.length > 0) {
          _kullaniciMesajState.lastMessages[caseId] = messages[messages.length - 1];
        }
      }
    }
  } catch (e) {
    console.warn('Son mesajlar yüklenirken hata:', e);
  }
}

function _getKullaniciStatusLabel(status) {
  const labels = {
    'PRE_CASE_REVIEW': { text: '📋 Ön İnceleme', color: '#6366f1' },
    'PENDING_USER_AUTH': { text: '⏳ Vekalet Bekliyor', color: '#f59e0b' },
    'AUTHORIZED': { text: '✅ Vekalet Onaylı', color: '#10b981' },
    'FILED_IN_COURT': { text: '🏛️ Dava Açıldı', color: '#8b5cf6' },
    'IN_PROGRESS': { text: '🔄 Süreç Devam Ediyor', color: '#3b82f6' },
    'DURUSMA': { text: '⚖️ Duruşma', color: '#ec4899' },
    'TAHSIL': { text: '💰 Tahsilat', color: '#14b8a6' },
    'CLOSED': { text: '🔒 Kapandı', color: '#6b7280' },
    'CANCELED': { text: '❌ İptal Edildi', color: '#ef4444' },
    'KAPANDI': { text: '🔒 Kapandı', color: '#6b7280' }
  };
  return labels[status] || { text: status, color: '#9ca3af' };
}

function _formatKullaniciMesajTarih(tarih) {
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

function _renderKullaniciMesajlarUI() {
  const container = document.getElementById('mesajlarListesi');
  if (!container) return;

  const aktifDurumlar = ['PRE_CASE_REVIEW', 'PENDING_USER_AUTH', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL'];
  const kapaliDurumlar = ['CLOSED', 'CANCELED', 'KAPANDI'];

  // Filtrele
  let filteredCases = _kullaniciMesajState.allCases;
  if (_kullaniciMesajState.searchQuery) {
    const q = _kullaniciMesajState.searchQuery.toLowerCase();
    filteredCases = filteredCases.filter(d => {
      const avukat = d.avukatAd || '';
      return avukat.toLowerCase().includes(q) ||
             (d.davaTuru || '').toLowerCase().includes(q) ||
             (d.sehir || '').toLowerCase().includes(q);
    });
  }

  const aktifSohbetler = filteredCases.filter(d => aktifDurumlar.includes(d.status));
  const gecmisSohbetler = filteredCases.filter(d => kapaliDurumlar.includes(d.status));

  // Toplam okunmamış
  const totalUnread = _kullaniciMesajState.allCases.reduce((sum, d) => sum + (d.okunmamisMesaj || 0), 0);
  const aktifUnread = aktifSohbetler.reduce((sum, d) => sum + (d.okunmamisMesaj || 0), 0);

  let html = `
    <div style="max-width:1200px; margin:0 auto;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-wrap:wrap; gap:15px;">
        <div>
          <h2 style="font-size:1.5rem; font-weight:700; margin-bottom:4px;">💬 Mesajlar</h2>
          <p style="color:var(--text-muted); font-size:0.9rem;">Avukatınızla iletişim</p>
        </div>
        ${totalUnread > 0 ? `<div style="background:#e63946; color:#fff; padding:6px 14px; border-radius:20px; font-size:0.85rem; font-weight:600;">� ${totalUnread} Okunmamış</div>` : ''}
      </div>

      <!-- Arama -->
      <div style="margin-bottom:24px;">
        <div style="position:relative; max-width:400px;">
          <input type="text"
                 id="kullaniciMesajSearchInput"
                 placeholder="Avukat veya dava ara..."
                 value="${_kullaniciMesajState.searchQuery}"
                 oninput="_onKullaniciMesajSearch(this.value)"
                 style="width:100%; padding:12px 16px 12px 44px; border-radius:12px; border:1px solid var(--border); background:var(--bg-card); color:var(--text-color); font-size:0.95rem; outline:none;">
          <span style="position:absolute; left:16px; top:50%; transform:translateY(-50%); font-size:1.1rem;">🔍</span>
          ${_kullaniciMesajState.searchQuery ? `<button onclick="_onKullaniciMesajSearch('')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; font-size:1.2rem; color:var(--text-muted);">×</button>` : ''}
        </div>
      </div>

      <!-- Tablar -->
      <div style="display:flex; gap:8px; margin-bottom:24px; border-bottom:2px solid var(--border); padding-bottom:0;">
        <button onclick="_switchKullaniciMesajTab('aktif')"
                style="padding:12px 24px; border:none; background:none; font-size:0.95rem; font-weight:600; cursor:pointer; position:relative; color:${_kullaniciMesajState.activeTab === 'aktif' ? 'var(--accent)' : 'var(--text-muted)'}; transition:all 0.2s;">
          � Aktif Sohbetler
          ${aktifUnread > 0 ? `<span style="background:#e63946; color:#fff; padding:2px 8px; border-radius:10px; font-size:0.7rem; margin-left:6px;">${aktifUnread}</span>` : ''}
          ${_kullaniciMesajState.activeTab === 'aktif' ? '<span style="position:absolute; bottom:-2px; left:0; right:0; height:3px; background:var(--accent); border-radius:3px 3px 0 0;"></span>' : ''}
        </button>
        <button onclick="_switchKullaniciMesajTab('gecmis')"
                style="padding:12px 24px; border:none; background:none; font-size:0.95rem; font-weight:600; cursor:pointer; position:relative; color:${_kullaniciMesajState.activeTab === 'gecmis' ? 'var(--accent)' : 'var(--text-muted)'}; transition:all 0.2s;">
          📁 Geçmiş Sohbetler
          ${_kullaniciMesajState.activeTab === 'gecmis' ? '<span style="position:absolute; bottom:-2px; left:0; right:0; height:3px; background:var(--accent); border-radius:3px 3px 0 0;"></span>' : ''}
        </button>
      </div>
  `;

  // Aktif Sekme
  if (_kullaniciMesajState.activeTab === 'aktif') {
    if (aktifSohbetler.length === 0) {
      html += `
        <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border-radius:16px; border:1px dashed var(--border);">
          <div style="font-size:4rem; margin-bottom:20px;">💬</div>
          <h3 style="font-size:1.3rem; margin-bottom:10px;">Aktif Sohbet Bulunmuyor</h3>
          <p style="color:var(--text-muted); max-width:400px; margin:0 auto;">
            ${_kullaniciMesajState.searchQuery ? 'Arama kriterlerine uygun sohbet bulunamadı.' : 'Aktif davanız bulunmamaktadır. Ödeme tamamlandıktan sonra mesajlaşmaya başlayabilirsiniz.'}
          </p>
          ${_kullaniciMesajState.searchQuery ? '<button onclick="_onKullaniciMesajSearch(\'\')" class="btn-ghost" style="margin-top:20px;">Aramayı Temizle</button>' : `<button class="btn-primary" onclick="showSection('davalarim')" style="margin-top:20px;">📋 Davalarıma Git</button>`}
        </div>`;
    } else {
      html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:20px;">`;
      aktifSohbetler.forEach(d => {
        html += _renderKullaniciMesajCard(d, true);
      });
      html += `</div>`;
    }
  }

  // Geçmiş Sekme
  if (_kullaniciMesajState.activeTab === 'gecmis') {
    if (gecmisSohbetler.length === 0) {
      html += `
        <div style="text-align:center; padding:60px 20px; background:var(--bg-card); border-radius:16px; border:1px dashed var(--border);">
          <div style="font-size:4rem; margin-bottom:20px;">📁</div>
          <h3 style="font-size:1.3rem; margin-bottom:10px;">Geçmiş Sohbet Bulunmuyor</h3>
          <p style="color:var(--text-muted); max-width:400px; margin:0 auto;">
            ${_kullaniciMesajState.searchQuery ? 'Arama kriterlerine uygun sohbet bulunamadı.' : 'Kapanmış veya iptal edilmiş dava mesajlarınız burada görünür.'}
          </p>
          ${_kullaniciMesajState.searchQuery ? '<button onclick="_onKullaniciMesajSearch(\'\')" class="btn-ghost" style="margin-top:20px;">Aramayı Temizle</button>' : ''}
        </div>`;
    } else {
      html += `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:20px;">`;
      gecmisSohbetler.forEach(d => {
        html += _renderKullaniciMesajCard(d, false);
      });
      html += `</div>`;
    }
  }

  html += `</div>`;
  container.innerHTML = html;
}

function _renderKullaniciMesajCard(d, isActive) {
  const avukatAd = d.avukatAd || 'Avukat';
  const avukatSoyad = d.avukatSoyad || '';
  const avatar = d.avukatAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${avukatAd}`;
  const statusInfo = _getKullaniciStatusLabel(d.status);
  const lastMsg = _kullaniciMesajState.lastMessages[d.id];
  const unread = d.okunmamisMesaj || 0;

  return `
    <div onclick="loadMesaj('${d.id}', '${d.status}')"
         style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:20px; cursor:pointer; transition:all 0.2s; position:relative; ${unread > 0 ? 'box-shadow:0 0 0 2px #e63946;' : ''}"
         onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.15)'${unread > 0 ? ', 0 0 0 2px #e63946' : ''};"
         onmouseout="this.style.transform=''; this.style.boxShadow=''${unread > 0 ? '0 0 0 2px #e63946' : ''};"">

      ${unread > 0 ? `<div style="position:absolute; top:-8px; right:-8px; background:#e63946; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:700; box-shadow:0 2px 8px rgba(230,57,70,0.4);">${unread}</div>` : ''}

      <div style="display:flex; align-items:flex-start; gap:14px; margin-bottom:16px;">
        <img src="${avatar}"
             style="width:52px; height:52px; border-radius:50%; object-fit:cover; border:2px solid ${statusInfo.color}; flex-shrink:0;"
             onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:52px;height:52px;border-radius:50%;background:${statusInfo.color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:1.2rem;border:2px solid ${statusInfo.color};\\'>${avukatAd.charAt(0)}</div>';">

        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <h4 style="font-weight:700; font-size:1rem; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${avukatAd} ${avukatSoyad}</h4>
            ${lastMsg ? `<span style="font-size:0.75rem; color:var(--text-muted); flex-shrink:0;">${_formatKullaniciMesajTarih(lastMsg.tarih)}</span>` : ''}
          </div>
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">${d.davaTuru || 'Hukuki Danışmanlık'}</div>
          <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
            <span style="width:8px; height:8px; border-radius:50%; background:${statusInfo.color};"></span>
            <span style="font-size:0.8rem; color:${statusInfo.color}; font-weight:500;">${statusInfo.text}</span>
          </div>
        </div>
      </div>

      ${lastMsg ? `
        <div style="background:var(--bg-surface); border-radius:10px; padding:12px; margin-top:12px;">
          <div style="font-size:0.9rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <strong style="color:var(--text-color);">${lastMsg.gonderenId === (JSON.parse(atob(localStorage.getItem('hp_token').split('.')[1])).id) ? 'Siz:' : 'Avukat:'}</strong>
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
            ${_formatTL()(d.tahminiAlacak)}
          </div>
        </div>
        <button class="btn-primary" style="padding:8px 16px; font-size:0.85rem;">
          ${isActive ? '💬 Sohbeti Aç' : '📋 Geçmişi Gör'}
        </button>
      </div>
    </div>
  `;
}

function _onKullaniciMesajSearch(query) {
  _kullaniciMesajState.searchQuery = query;
  _renderKullaniciMesajlarUI();
}

function _switchKullaniciMesajTab(tab) {
  _kullaniciMesajState.activeTab = tab;
  _renderKullaniciMesajlarUI();
}

// Global fonksiyonları window'a ata
window._onKullaniciMesajSearch = _onKullaniciMesajSearch;
window._switchKullaniciMesajTab = _switchKullaniciMesajTab;

async function loadMesaj(caseId, status = '') {
  // Zaten bu dava açıksa tekrar yükleme
  if (activeCaseId === caseId && mesajInterval) return;
  activeCaseId = caseId;

  // showSection('mesajlarim') cagirirsak API asenkron loadMesajlar() ceker, chat ekranini ezer!
  // O yuzden sadece sekmeyi gorsel olarak aciyoruz:
  const sections = ['Davalarim', 'YeniHesaplama', 'Mesajlarim', 'Profil', 'Teklifler', 'Odeme'];
  sections.forEach(s => {
    const el = document.getElementById(`section${s}`);
    if (el) el.style.display = 'none';
  });
  const msglr = document.getElementById('sectionMesajlarim');
  if (msglr) msglr.style.display = 'block';

  // Sol menü aktivasyonu
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById('sbMesaj')?.classList.add('active');
  currentSection = 'mesajlarim';

  const container = document.getElementById('mesajlarListesi');
  if (!container) return;

  container.innerHTML = `
    <div class="messages-container">
      <div class="messages-header">
        <button class="btn-ghost" style="padding:6px 12px;font-size:0.82rem"
          onclick="clearMesaj(); loadMesajlar()">← Geri</button>
        <span style="font-size:0.9rem;color:var(--text-secondary)">Dava Mesajları</span>
      </div>
      <div class="messages-body" id="messagesBody">
        <div class="loading-spinner"><div class="spinner"></div></div>
      </div>
      <div class="messages-input" style="display:${['CLOSED', 'KAPANDI'].includes(status) ? 'none' : 'flex'}; align-items:center;">
        <label style="cursor:pointer; margin-right:8px; font-size:1.2rem; display:flex; align-items:center;" title="Belge / Evrak Yükle">
          📎
          <input type="file" id="msgFile" style="display:none" onchange="window.uploadFile('${caseId}')"/>
        </label>
        <input type="text" id="mesajInput" placeholder="Mesajınızı veya evrağınızı gönderin..." style="flex:1" />
        <button class="btn-primary" id="sendBtn" onclick="sendMesaj()" style="padding:10px 20px;white-space:nowrap">
          ➤<span class="send-text"> Gönder</span>
        </button>
      </div>
      ${['CLOSED', 'KAPANDI'].includes(status) ? `<div style="text-align:center; padding:12px; font-size:0.85rem; color:#856404; background:#fff3cd; border-top:1px solid #ffeeba;">Platform üzerindeki dosya süreci kapanmıştır. Yeni mesaj veya evrak gönderimi yapılamaz. Mevcut kayıtlar, ilgili mevzuat kapsamında güvenli şekilde saklanmaktadır.</div>` : ''}
    </div>`;

  document.getElementById('mesajInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendMesaj();
  });

  await fetchMesajlar(caseId);

  if (mesajInterval) clearInterval(mesajInterval);
  mesajInterval = setInterval(() => {
    if (!document.hidden && currentSection === 'mesajlarim') fetchMesajlar(caseId);
  }, 10000);
}

function clearMesaj() {
  if (mesajInterval) { clearInterval(mesajInterval); mesajInterval = null; }
  activeCaseId = null;
  // mesajlar container'ını sıfırla - tekrar listeye dönebilsin
  const cont = document.getElementById('mesajlarListesi');
  if (cont) { delete cont.dataset.loaded; cont.innerHTML = ''; }
}

async function fetchMesajlar(caseId) {
  try {
    const mesajlar = await _apiCall()('GET', `/messages/${caseId}`);
    const body = document.getElementById('messagesBody');
    if (!body) return;

    const myId = _Auth().getUser()?.id;

    if (!mesajlar.length) {
      body.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:0.9rem">Mesajlaşmaya başlayın 👋</div>`;
      return;
    }

    // Değişiklik yoksa DOM'a dokunma
    const newHTML = mesajlar.map(m => {
      const isMine = m.gonderenId === myId;
      const avatar = m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.gonderenAd || 'user'}`;
      const initial = (m.gonderenAd || 'U').charAt(0).toUpperCase();

      // Dosya/evrak mesajı kontrolü
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
                        <img src="${fileUrl}" style="width:100%; display:block; border-radius:8px;" alt="Resim"/>
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
      <div style="display:flex; gap:10px; margin-bottom:20px; ${isMine ? 'flex-direction:row-reverse; justify-content:flex-start;' : ''}">
        <!-- Avatar (mesaj balonunun yanında, alt hizalı) -->
        <div style="flex-shrink:0; width:40px; height:40px; border-radius:50%; overflow:hidden; background:var(--primary-dark); border:2px solid ${isMine ? 'var(--accent)' : '#6366f1'}; align-self:flex-end; margin-bottom:22px;">
          <img src="${avatar}" style="width:100%; height:100%; object-fit:cover;" alt="${m.gonderenAd || 'Kullanıcı'}" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:bold;color:#fff;font-size:1rem;\\'>${initial}</span>';">
        </div>

        <!-- Mesaj Balonu -->
        <div style="max-width:75%; min-width:120px;">
          <!-- Gönderen Adı (balonun üstünde) -->
          <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:5px; font-weight:500; ${isMine ? 'text-align:right;' : 'text-align:left;'}">
            ${m.gonderenAd || (isMine ? 'Siz' : 'Avukatınız')}
          </div>

          <!-- Balon -->
          <div style="${isMine
            ? 'background:linear-gradient(135deg, var(--accent), #00b489); color:#000; border-radius:18px 18px 4px 18px;'
            : 'background:var(--bg-surface); color:var(--text-color); border:1px solid var(--border); border-radius:18px 18px 18px 4px;'
          } padding:14px 18px; box-shadow:0 2px 10px rgba(0,0,0,0.1); display:inline-block; min-width:80px;">
            <div style="font-size:0.95rem; line-height:1.5; word-break:break-word;">${msgHtml}</div>
            <div style="font-size:0.75rem; opacity:0.8; margin-top:8px; text-align:right;">
              ${new Date(m.tarih).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
            </div>
          </div>
        </div>
      </div>`}).join('');

    if (body.dataset.lastHTML !== newHTML) {
      body.innerHTML = newHTML;
      body.dataset.lastHTML = newHTML;
      body.scrollTop = body.scrollHeight;
    }
  } catch { /* sessizce */ }
}

async function sendMesaj() {
  const input = document.getElementById('mesajInput');
  const icerik = input?.value?.trim();
  if (!icerik || !activeCaseId) return;

  const sendBtn = document.getElementById('sendBtn');
  if (sendBtn) { sendBtn.disabled = true; }

  try {
    await _apiCall()('POST', '/messages', { caseId: activeCaseId, icerik });
    if (input) input.value = '';
    await fetchMesajlar(activeCaseId);
  } catch (err) {
    _showToast()(err.message, 'error');
  } finally {
    if (sendBtn) { sendBtn.disabled = false; }
  }
}

window.uploadFile = async function (caseId) {
  const fileInput = document.getElementById('msgFile');
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

    await _apiCall()('POST', '/messages', { caseId: activeCaseId || caseId, icerik: data.url + '|' + (data.originalName || 'Evrak') });
    _showToast()('Evrak iletildi.', 'success');
    await fetchMesajlar(activeCaseId || caseId);
  } catch (err) {
    _showToast()(err.message, 'error');
  } finally {
    fileInput.value = '';
  }
}

// ---- PROFİL ----
let _profilData = null; // profil verisi cache

async function loadProfil() {
  const avatarEl = document.getElementById('profilAvatar');
  const bilgiEl = document.getElementById('profilBilgi');
  if (!avatarEl || !bilgiEl) return;

  const u = _Auth().getUser();
  if (!u) return;

  if (u.avatar && (u.avatar.includes('/') || u.avatar.includes('http'))) {
    avatarEl.innerHTML = `<img src="${u.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
  } else {
    avatarEl.textContent = u.avatar || u.ad?.charAt(0) || '?';
  }

  // Zaten yüklüyse tekrar fetch etme
  if (bilgiEl.dataset.loaded && _profilData) return;

  try {
    const fresh = await _apiCall()('GET', '/auth/me');
    _profilData = fresh;
    bilgiEl.dataset.loaded = '1';

    bilgiEl.innerHTML = `
      <div class="profil-bilgi-item"><span>Ad Soyad</span><span><strong>${fresh.ad} ${fresh.soyad}</strong></span></div>
      <div class="profil-bilgi-item"><span>E-posta</span><span>${fresh.email}</span></div>
      <div class="profil-bilgi-item"><span>Telefon</span><span>${fresh.telefon || '—'}</span></div>
      <div class="profil-bilgi-item"><span>Şehir</span><span>${fresh.sehir || '—'}</span></div>
      <div class="profil-bilgi-item"><span>Rol</span><span class="status-badge ${fresh.role === 'admin' ? 'status-ADMIN' : (fresh.role === 'avukat' ? 'status-AVUKAT' : 'status-ACTIVE')}">
        ${fresh.role === 'admin' ? 'Yönetici' : (fresh.role === 'avukat' ? 'Avukat' : 'Kullanıcı')}
      </span></div>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <button class="btn-ghost" style="font-size:0.85rem;padding:8px 16px" onclick="switchProfilTab('duzenle')">
          ✏️ Profili Düzenle
        </button>
      </div>`;
  } catch {
    if (!bilgiEl.dataset.loaded) {
      bilgiEl.innerHTML = `
        <div class="profil-bilgi-item"><span>Ad Soyad</span><span>${u.ad} ${u.soyad}</span></div>
        <div class="profil-bilgi-item"><span>E-posta</span><span>${u.email}</span></div>`;
    }
  }
}

// ---- PROFİL SEKME GEÇİŞİ ----
function switchProfilTab(tab) {
  const tabs = ['bilgi', 'duzenle', 'sifre'];
  tabs.forEach(t => {
    const tabEl = document.getElementById(`profilTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const btnEl = document.getElementById(`pTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (tabEl) tabEl.style.display = 'none';
    btnEl?.classList.remove('active');
  });

  const activeTabEl = document.getElementById(`profilTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  const activeBtnEl = document.getElementById(`pTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (activeTabEl) activeTabEl.style.display = 'block';
  activeBtnEl?.classList.add('active');

  // Düzenle sekmesini aç → formu mevcut verilerle doldur
  if (tab === 'duzenle' && _profilData) {
    const pImg = document.getElementById('pAvatarImg');

    if (pImg) {
      pImg.src = _profilData.avatar && _profilData.avatar.includes('/')
        ? _profilData.avatar
        : `https://ui-avatars.com/api/?name=${_profilData.ad}+${_profilData.soyad}&background=random`;
    }

    ['Ad', 'Soyad', 'Telefon', 'Sehir', 'Adres'].forEach(f => {
      const el = document.getElementById(`p${f}`);
      if (!el) return;
      const key = f.charAt(0).toLowerCase() + f.slice(1);
      if (el.tagName === 'SELECT') {
        [...el.options].forEach(o => { if (o.value === _profilData[key] || o.text === _profilData[key]) o.selected = true; });
      } else { el.value = _profilData[key] || ''; }
    });
  }
}

// ---- YEREL DOSYA ÖNİZLEME ----
function previewProfilePhoto(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function (e) {
      document.getElementById('pAvatarImg').src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}
window.previewProfilePhoto = previewProfilePhoto;

// ---- PROFİL KAYDET ----
async function profilKaydet(e) {
  e.preventDefault();
  const btn = document.getElementById('profilKaydetBtn');
  const errEl = document.getElementById('profilDuzenleError');
  const fileInput = document.getElementById('pAvatarFile');
  if (errEl) errEl.style.display = 'none';

  const ad = document.getElementById('pAd')?.value?.trim();
  const soyad = document.getElementById('pSoyad')?.value?.trim();
  const sehir = document.getElementById('pSehir')?.value;
  const telefon = document.getElementById('pTelefon')?.value?.trim();
  const adres = document.getElementById('pAdres')?.value?.trim();

  if (!ad || !soyad || !sehir) {
    if (errEl) { errEl.textContent = 'Ad, soyad ve şehir zorunludur.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor...'; }

  try {
    let finalAvatar = _profilData.avatar;

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
        } else {
          console.error('Server error (non-JSON):', await uploadRes.text());
        }
        throw new Error(errMsg);
      }
      const uploadData = await uploadRes.json();
      finalAvatar = uploadData.avatar;
    }

    // 2. Profil bilgilerini kaydet
    const result = await _apiCall()('PUT', '/auth/profil', {
      ad, soyad, sehir, telefon, adres,
      avatar: finalAvatar
    });

    _Auth().setAuth(_Auth().getToken(), result.user);
    _profilData = null;

    const bilgiEl = document.getElementById('profilBilgi');
    if (bilgiEl) { delete bilgiEl.dataset.loaded; bilgiEl.innerHTML = ''; }

    _showToast()('Profiliniz güncellendi! ✅', 'success');
    await loadProfil();
    switchProfilTab('bilgi');
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Değişiklikleri Kaydet'; }
  }
}



// ---- ŞİFRE DEĞİŞTİR ----
async function sifreDegistir(e) {
  e.preventDefault();
  const btn = document.getElementById('sifreDegistirBtn');
  const errEl = document.getElementById('sifreHata');
  if (errEl) errEl.style.display = 'none';

  const eskiSifre = document.getElementById('eskiSifre')?.value;
  const yeniSifre = document.getElementById('yeniSifre')?.value;
  const yeniSifreConfirm = document.getElementById('yeniSifreConfirm')?.value;

  if (!eskiSifre || !yeniSifre || !yeniSifreConfirm) {
    if (errEl) { errEl.textContent = 'Tüm alanlar zorunludur.'; errEl.style.display = 'block'; }
    return;
  }
  if (yeniSifre.length < 8) {
    if (errEl) { errEl.textContent = 'Yeni şifre en az 8 karakter olmalı.'; errEl.style.display = 'block'; }
    return;
  }
  if (yeniSifre !== yeniSifreConfirm) {
    if (errEl) { errEl.textContent = 'Yeni şifreler eşleşmiyor.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Değiştiriliyor...'; }

  try {
    await _apiCall()('PUT', '/auth/sifre-degistir', { eskiSifre, yeniSifre, yeniSifreConfirm });
    _showToast()('Şifreniz başarıyla değiştirildi! 🔒', 'success');
    document.getElementById('sifreDegistirForm')?.reset();
    setTimeout(() => switchProfilTab('bilgi'), 1000);
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Şifremi Değiştir'; }
  }
}

// ---- YENİ: FAZ 3 ÖN DEĞERLENDİRME (PRE-TEST) ----
window.evaluatePreTest = function () {
  const kim = document.getElementById('ptKimCikardi')?.value;
  const sure = document.getElementById('ptSure')?.value;
  const maas = document.getElementById('ptMaas')?.value;

  if (!kim || !sure || !maas) {
    if (window.HakPortal && window.HakPortal.showToast) {
      window.HakPortal.showToast('Lütfen tüm ön değerlendirme sorularını yanıtlayınız.', 'warning');
    }
    return;
  }

  // 🚨 OTOMATİK RED MOTORU (Boş ve zayıf davaları filtrele)
  // Kendi isteğiyle ayrılıp, 1 yıldan az (az veya orta) çalışanlar en düşük kazanma ihtimaline sahiptir.
  if (kim === 'ben' && (sure === 'az' || sure === 'orta')) {
    if (window.HakPortal && window.HakPortal.showToast) {
      window.HakPortal.showToast('Dosyanız detaylı incelemeye uygun görünmemektedir. (Kendi isteğiyle çıkış ve 1 yıldan kısa çalışma süresi nedeniyle yasal tazminat hakkı doğmamaktadır).', 'error');
    }
    return; // İlerlemelerine İzin Verme
  }

  // Sınavı Geçti! Asıl Modülü Aç.
  const preCont = document.getElementById('preTestContainer');
  const mainCont = document.getElementById('mainCalcWrapper');
  if (preCont) preCont.style.display = 'none';
  if (mainCont) mainCont.style.display = 'grid';
};

// ---- PANEL HESAPLAMA ----
function setupPanelHesaplamaForm() {
  const panelForm = document.getElementById('panelHesaplamaForm');
  if (!panelForm) return;

  panelForm.addEventListener('submit', async e => {
    e.preventDefault();

    // YENI: Karar Ağacı Doğrulama
    const cSecimi = document.getElementById('cikisSekli')?.value;
    const cGercekler = document.getElementById('aiFacts')?.value;
    if (!cSecimi || !cGercekler || cGercekler === "{}") {
      _showToast()("Öncelikle Soru cevap kısmını bitirmeniz bekleniyor.", "error");
      return;
    }

    const cikisVal = document.getElementById('pIsCikisTarihi')?.value;
    if (cikisVal) {
      const today = new Date().toISOString().split('T')[0];
      if (cikisVal > today) {
        _showToast()("İşten çıkış tarihiniz bugünden ileride bir gün olamaz.", "error");
        return;
      }
    }

    const btn = panelForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Hesaplanıyor...'; }

    const payload = {
      cikisSekli: document.getElementById('cikisSekli')?.value,
      isGirisTarihi: document.getElementById('pIsGirisTarihi')?.value,
      isCikisTarihi: document.getElementById('pIsCikisTarihi')?.value,
      brutMaas: document.getElementById('pBrutMaas')?.value,
      yanHaklar: document.getElementById('pYanHaklar')?.value || "0",
      kullanilmayanIzin: document.getElementById('pKullanilmayanIzin')?.value || "0",
      fazlaMesai: document.getElementById('pFazlaMesai')?.value || "0",
      odenmemisMaasGun: document.getElementById('pOdenmemisMaasGun')?.value || "0",
      kumulatifMatrah: document.getElementById('pKumulatifMatrah')?.value || "0",
      aiFacts: document.getElementById('aiFacts')?.value || "{}"
    };

    try {
      const result = await _apiCall()('POST', '/hesaplama/kidem-ihbar', payload);
      const area = document.getElementById('panelResultArea');
      if (area) {
        area.style.display = 'block';

        // Dinamik ekstra kartlar
        let extraCards = '';
        if (result.diger && result.diger.izinBrut > 0) {
          extraCards += `
            <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
              <div style="font-size:0.75rem;color:var(--text-muted)">🌴 Yıllık İzin Ücreti</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">
                ${_formatTL()(result.diger.izinBrut)}
              </div>
              <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 8px;">Kullanılmayan izinlerinizin brüt yevmiyesi üzerinden hesaplanmıştır.</div>
            </div>`;
        }
        if (result.diger && result.diger.mesaiBrut > 0) {
          extraCards += `
            <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
              <div style="font-size:0.75rem;color:var(--text-muted)">⏱️ Fazla Mesai Ücreti</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">
                ${_formatTL()(result.diger.mesaiBrut)}
              </div>
              <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 8px;">Fazla çalışılan saatler, yasaya uygun olarak %150 zamlı ücretten hesaplanmıştır.</div>
            </div>`;
        }
        if (result.diger && result.diger.odenmemisMaasBrut > 0) {
          extraCards += `
            <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
              <div style="font-size:0.75rem;color:var(--text-muted)">💼 Ödenmemiş Maaş</div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">
                ${_formatTL()(result.diger.odenmemisMaasBrut)}
              </div>
              <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 8px;">Kıstelyevm hesabıyla gün bazlı hak edişiniz.</div>
            </div>`;
        }

        if (result.diger && result.diger.kotuNiyetNet > 0) {
          extraCards += `
              <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #ff4d4f;margin-top:12px">
                <div style="font-size:0.75rem;color:#ff4d4f">🚨 Kötü Niyet Tazminatı</div>
                <div style="font-size:1.1rem;font-weight:700;color:#ff4d4f">
                  ${_formatTL()(result.diger.kotuNiyetNet)}
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; padding-top: 8px; margin-top: 8px;">İhbar Tazminatının 3 katı tutarında emsal ceza.</div>
              </div>`;
        }

        if (result.diger && result.diger.sendikalNet > 0) {
          extraCards += `
              <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #1890ff;margin-top:12px">
                <div style="font-size:0.75rem;color:#1890ff">🚩 Sendikal Tazminat</div>
                <div style="font-size:1.1rem;font-weight:700;color:#1890ff">
                  ${_formatTL()(result.diger.sendikalNet)}
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; padding-top: 8px; margin-top: 8px;">1 Yıllık brüt olmayan çıplak ücret tutarı.</div>
              </div>`;
        }

        if (result.diger && result.diger.bakiyeSureTazminatBrut > 0) {
          extraCards += `
              <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
                <div style="font-size:0.75rem;color:var(--text-muted)">⏳ Bakiye Süre Ücreti</div>
                <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary)">
                  ${_formatTL()(result.diger.bakiyeSureTazminatBrut)}
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; padding-top: 8px; margin-top: 8px;">Belirli Süreli Sözleşme Erken Fesih (Kalan aylar).</div>
              </div>`;
        }

        if (result.diger && result.diger.bostaGecenSureBrut > 0) {
          extraCards += `
              <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #52c41a;margin-top:12px">
                <div style="font-size:0.75rem;color:#52c41a">⚖️ Boşta Geçen Süre Ücreti (İşe İade)</div>
                <div style="font-size:1.1rem;font-weight:700;color:#52c41a">
                  ${_formatTL()(result.diger.bostaGecenSureBrut)}
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; padding-top: 8px; margin-top: 8px;">Maksimum 4 Aya kadar koruma ücreti.</div>
              </div>`;
        }

        if (result.diger && result.diger.iseBaslatmamaBrut > 0) {
          extraCards += `
              <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #faad14;margin-top:12px">
                <div style="font-size:0.75rem;color:#faad14">⚖️ İşe Başlatmama Tazminatı (İşe İade)</div>
                <div style="font-size:1.1rem;font-weight:700;color:#faad14">
                  ${_formatTL()(result.diger.iseBaslatmamaBrut)}
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; padding-top: 8px; margin-top: 8px;">İşe iade kararına rağmen başlatılmama durumunda.</div>
              </div>`;
        }

        const kidemHakkedis = result.kidem && result.kidem.net > 0;
        const ihbarHakkedis = result.ihbar && result.ihbar.net > 0;

        let legalGerekceHtml = '';
        if (result.legal && result.legal.gerekce) {
          legalGerekceHtml = `
            <div style="margin-top:20px; margin-bottom: 20px; padding:15px; background:var(--bg-surface); border-left:4px solid var(--primary); border-radius:8px;">
                <h4 style="margin:0 0 10px 0; color:var(--primary); font-size:1.1rem;">⚖️ Hukuki Gerekçe ve Nitelendirme</h4>
                <p style="margin:0; font-size:0.95rem; color:var(--text-primary); line-height:1.5;">${result.legal.gerekce}</p>
                ${result.legal.uyarilar.length > 0 ?
              `<div style="margin-top:10px; padding:8px; background:rgba(250, 173, 20, 0.15); color:#d48806; font-size:0.85rem; border-radius:5px;">
                        <strong>⚠️ Motor Uyarısı:</strong> ${result.legal.uyarilar.join('<br>')}
                    </div>` : ''}
            </div>
          `;
        }

        let skorlamaHtml = '';
        if (result.skorlama) {
          const s = result.skorlama;
          const bgKat = s.kategori === 'PREMIUM' ? '#fb5607' : s.kategori === 'NORMAL' ? '#3a86ff' : s.kategori === 'RISKLI' ? '#ffbe0b' : '#ff006e';

          let riskNotesList = '';
          if (s.notlar && s.notlar.length > 0) {
            riskNotesList = `<ul style="margin:10px 0 0 0; padding-left:14px; list-style-type:square; font-size:0.8rem; color:var(--text-secondary); line-height:1.4;">` +
              s.notlar.map(not => `<li><span style="color:#e63946">⚠️</span> ${not}</li>`).join('') +
              `</ul>`;
          }

          skorlamaHtml = `
            <div style="margin-top:20px; padding:15px; background:var(--bg-card); border-left:4px solid ${bgKat}; border-radius:8px;">
                <h4 style="margin:0 0 10px 0; color:${bgKat}; font-size:1.1rem; display:flex; justify-content:space-between; align-items:center;">
                    <span>🤖 Dosya Risk ve İspat Skorunuz</span>
                    <span style="color:var(--text-primary); font-size:1.2rem; font-weight:800">${s.toplam}<span style="font-size:0.8rem;color:var(--text-muted)">/100</span></span>
                </h4>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; margin-top:10px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:10px;">
                  <div style="text-align:center;">
                     <div style="font-size:0.75rem; color:var(--text-muted);">Hak Doğumu</div>
                     <div style="font-size:1rem; font-weight:700; color:var(--primary-light);">${s.hukuki}/100</div>
                  </div>
                  <div style="text-align:center;">
                     <div style="font-size:0.75rem; color:var(--text-muted);">İspat / Delil</div>
                     <div style="font-size:1rem; font-weight:700; color:${s.veri < 50 ? '#e63946' : 'var(--accent)'};">${s.veri}/100</div>
                  </div>
                   <div style="text-align:center;">
                      <div style="font-size:0.75rem; color:var(--text-muted);">Tahsilat İhtimali</div>
                      <div style="font-size:1rem; font-weight:700; color:${(s.tahsilat || s.tahsil || 0) < 50 ? '#e63946' : 'var(--accent)'};">${s.tahsilat ?? s.tahsil ?? 0}/100</div>
                   </div>
                </div>
                ${riskNotesList}
                <div style="font-size: 0.8rem; margin-top: 15px; color: var(--text-secondary); line-height: 1.4;">Puanınız avukatlar tarafından görülecek ve davanızın alınma hızını etkileyecektir. Eksik evrak/delil beyanından kaçının.</div>
            </div>
          `;
        }

        area.innerHTML = `
          ${skorlamaHtml}
          ${legalGerekceHtml}
          <div class="result-total">
            <span class="total-label">Tahmini Toplam Net Alacak</span>
            <span class="total-amount">${_formatTL()(result.toplamNet)}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0">
            <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:0.75rem;color:var(--text-muted)">Kıdem Tazminatı</div>
              <div style="font-size:1.1rem;font-weight:700;color:${kidemHakkedis ? 'var(--accent)' : 'var(--text-muted)'}">
                ${kidemHakkedis ? _formatTL()(result.kidem.net) : 'Hak yok'}
              </div>
              ${kidemHakkedis ? `<div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 8px;">Tam Yıl/Kısmi Yıl Esası (Damga Düşülmüştür)</div>` : ''}
            </div>
            <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border)">
              <div style="font-size:0.75rem;color:var(--text-muted)">İhbar Tazminatı</div>
              <div style="font-size:1.1rem;font-weight:700;color:${ihbarHakkedis ? 'var(--primary-light)' : 'var(--text-muted)'}">
                ${ihbarHakkedis ? _formatTL()(result.ihbar.net) : 'Hak yok'}
              </div>
              ${ihbarHakkedis ? `<div style="font-size: 0.7rem; color: var(--text-muted); line-height: 1.4; border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 8px;">Giydirilmiş Ücret Bazlı NET Hakediş</div>` : ''}
            </div>
          </div>
          ${extraCards}
          ${result.alternatifSenaryo ? (() => {
            const alt = result.alternatifSenaryo;
            const fmt = _formatTL();
            return `<div style="margin-top:16px; border:2px solid #e63946; border-radius:10px; overflow:hidden;">
                <div style="background:#e63946; color:#fff; padding:9px 13px; font-size:0.85rem; font-weight:700;">
                  🛑 ÇAKIŞAN SENARYO — Belgedeki Fesih Türü Beyanınızla Eşleşmiyor
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr;">
                  <div style="padding:12px; border-right:1px dashed rgba(255,255,255,0.1);">
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:5px; text-transform:uppercase;">Beyanınıza Göre</div>
                    <div style="font-size:0.8rem;">Kıdem: <b>${fmt(result.kidem?.net || 0)}</b></div>
                    <div style="font-size:0.8rem;">İhbar: <b>${fmt(result.ihbar?.net || 0)}</b></div>
                    <div style="margin-top:8px; font-size:1rem; font-weight:800; color:var(--accent);">${fmt(result.toplamNet)}</div>
                  </div>
                  <div style="padding:12px; background:rgba(230,57,70,0.06);">
                    <div style="font-size:0.7rem; color:#e63946; margin-bottom:5px; text-transform:uppercase;">${alt.aciklama}</div>
                    <div style="font-size:0.8rem;">Kıdem: <b>${fmt(alt.kidem.net)}</b></div>
                    <div style="font-size:0.8rem;">İhbar: <b>${fmt(alt.ihbar.net)}</b></div>
                    <div style="margin-top:8px; font-size:1rem; font-weight:800; color:#e63946;">${fmt(alt.toplamNet)}</div>
                  </div>
                </div>
                <div style="padding:8px 13px; background:rgba(230,57,70,0.07); font-size:0.75rem; color:var(--text-secondary);">
                  ⚡ Avukatınız hangi senaryonun geçerli olduğunu belirleyecek; haklarınız risk altında olabilir.
                </div>
              </div>`;
          })() : ''}
          <div class="result-disclaimer">Bu hesaplama 2026 Gelir Vergisi Dilimleri ile Yargıtay Standartlarında net / brüt matrah mantıklarına göre hazırlanmıştır. Kesin ve resmi kurallardır, bilgi amaçlıdır.</div>
          ${result.toplamNet > 0 ? `
            <button class="btn-primary btn-block" style="margin-top:16px" onclick="goTeklifModal()">
              ⚖️ Avukatlardan Teklif Al →
            </button>` : ''}`;
      }
      window._panelHesaplamaResult = result;
    } catch (err) {
      _showToast()(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Hesapla →'; }
    }
  });
}

async function goTeklifModal() {
  const result = window._panelHesaplamaResult;
  if (!result) { _showToast()('Önce hesaplama yapın.', 'error'); return; }

  if (typeof window.openModal === 'function') {
    window.openModal('teklifModalPanel');
  } else {
    document.getElementById('teklifModalPanel').style.display = 'flex';
  }
}

async function goTeklifModalAPI() {
  const result = window._panelHesaplamaResult;
  if (!result) { _showToast()('Önce hesaplama yapın.', 'error'); return; }

  const user = _Auth().getUser() || {};
  const sehir = user.sehir || 'İstanbul';
  const davaTuru = document.getElementById('pTeklifDavaTuru')?.value || 'kıdem-ihbar';

  try {
    let ispatUrls = [];
    const files = window._wizardStashedFiles;
    if (files && files.length > 0) {
      if (files.length > 3) {
        _showToast()('En fazla 3 dosya yükleyebilirsiniz.', 'error');
        return;
      }
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) {
          _showToast()(`${file.name} 5MB'dan büyük olamaz.`, 'error');
          return;
        }
      }
      _showToast()('İspat belgeleri yükleniyor, lütfen bekleyin...', 'info');
      const token = localStorage.getItem('hp_token');
      for (const file of files) {
        const formData = new FormData();
        formData.append('dosya', file);
        const res = await fetch('/api/messages/upload', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Dosya yüklenemedi.');
        ispatUrls.push({ name: data.originalName, url: data.url });
      }
    }

    await _apiCall()('POST', '/cases', {
      sehir: sehir,
      davaTuru: davaTuru,
      tahminilAcak: result.toplamNet,
      hesaplamaVerisi: result,
      ispatBelgeleri: ispatUrls
    });

    if (typeof window.closeModal === 'function') window.closeModal('teklifModalPanel');
    else document.getElementById('teklifModalPanel').style.display = 'none';

    _showToast()('✅ Dava dosyanız oluşturuldu!', 'success');
    window._panelHesaplamaResult = null;
    window._wizardStashedFiles = null;
    const area = document.getElementById('panelResultArea');
    if (area) area.style.display = 'none';
    document.getElementById('panelHesaplamaForm')?.reset();
    // Dava listesi cache'ini temizle
    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }

    setTimeout(() => showSection('davalarim'), 800);
  } catch (err) {
    _showToast()(err.message, 'error');
  }
}

// ---- GLOBAL EXPOSE ----
window.showSection = showSection;
window.loadDavalar = loadDavalar;
window.loadTeklifler = loadTeklifler;
window.teklifSec = teklifSec;
window.loadOdeme = loadOdeme;
window.goOdeme = goOdeme;
window.doOdeme = doOdeme;
window.loadMesajlar = loadMesajlar;
window.loadMesaj = loadMesaj;
window.clearMesaj = clearMesaj;
window.sendMesaj = sendMesaj;
window.loadProfil = loadProfil;
window.goTeklifModal = goTeklifModal;
window.switchProfilTab = switchProfilTab;
window.profilKaydet = profilKaydet;
window.sifreDegistir = sifreDegistir;

// Panelde "Yeniden Hesapla" butonu için
window.resetPanelForm = function () {
  const resultArea = document.getElementById('panelResultArea');
  const form = document.getElementById('panelHesaplamaForm');
  if (resultArea) resultArea.style.display = 'none';
  if (form) form.reset();
  window._panelHesaplamaResult = null;
  // Scroll to form
  document.getElementById('mainCalcWrapper')?.scrollIntoView({ behavior: 'smooth' });
};

// =============================================
// ---- BİLDİRİM SİSTEMİ ----
// =============================================

async function loadMesajBadge() {
  try {
    const token = localStorage.getItem('hp_token');
    if (!token) return;
    const res = await fetch('/api/messages/okunmamis-sohbet', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const badge = document.getElementById('mesajBadge');
    if (!badge) return;
    const sayi = parseInt(data.sayi) || 0;
    if (sayi > 0) {
      badge.textContent = sayi > 9 ? '9+' : sayi;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
      badge.textContent = '';
    }
  } catch (e) { }
}

window.showSection = showSection;



