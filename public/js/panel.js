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
        OPEN: '⏱️ Teklif Bekleniyor',
        MATCHING: '🧐 Avukat İnceliyor',
        WAITING_USER_DEPOSIT: '✅ 99 TL Güven Bedeli Bekleniyor',
        WAITING_PAYMENT: '💳 Avukat Ödemesi Bekleniyor',
        WAITING_LAWYER_PAYMENT: '💳 Avukat Ödemesi Bekleniyor',
        PRE_CASE_REVIEW: '🧐 Ön İnceleme',
        PENDING_USER_AUTH: '⏳ Vekalet İsteği',
        AUTHORIZED: '✅ Vekalet Onaylı',
        FILED_IN_COURT: '🏛️ Dava Açıldı',
        LAWYER_ASSIGNED: '✅ Avukat Atandı',
        IN_PROGRESS: '💬 İşlemde',
        ACTIVE: '🟢 Aktif',
        KAPANDI: '🛑 Kapatıldı',
        ILK_GORUSME: '🤝 İlk Görüşme',
        DAVA_ACILDI: '⚖️ Dava Açıldı',
        DURUSMA: '🏛️ Duruşma',
        TAHSIL: '💰 Tahsil Edildi'
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
                <span>Teklif Sayısı</span>
                <span>${d.teklifSayisi || 0} avukat</span>
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
        <div class="empty-sub">Hesaplama yapın ve avukat teklifleri alın.</div>
        <br/>
        <button class="btn-primary" onclick="showSection('yeniHesaplama')">Hesaplamaya Başla</button>
      </div>`
  );
}

function buildDavaActions(d) {
  let actions = '';

  if (d.status === 'OPEN' && d.teklifSayisi > 0)
    actions += `<button class="btn-primary" style="font-size:0.85rem;padding:10px 16px"
              onclick="loadTeklifler('${d.id}')">Teklifleri Gör (${d.bekleyenTeklif || d.teklifSayisi})</button>`;
  else if (d.status === 'OPEN')
    actions += `<span style="font-size:0.83rem;color:var(--text-muted)">⏳ Avukat teklifi bekleniyor...</span>`;
  else if (d.status === 'MATCHING') {
    // DOĞRU AKIŞ: Avukat önce kabul etmeli → biz engagement durumuna bakıyoruz
    // engagementStatus: 'WAITING_LAWYER_REVIEW' = avukat inceliyor
    // engagementStatus: 'WAITING_USER_DEPOSIT' = avukat kabul etti, kullanıcı ödeme yapacak
    if (d.engagementStatus === 'WAITING_USER_DEPOSIT') {
      actions += `
        <div style="background:rgba(0,217,163,0.08);border:1px solid rgba(0,217,163,0.3);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:0.82rem;color:#00d9a3;">
          ✅ Avukatınız belgeleri inceleyip dosyayı kabul etti! 99 TL güven bedelini ödeyerek süreci başlatın.
        </div>
        <button class="btn-primary" style="background:linear-gradient(135deg,#00d9a3,#00b386);color:#000;font-size:0.85rem;padding:10px 16px;width:100%;font-weight:700;"
                onclick="goOdeme('${d.id}')">✅ 99 TL Güven Bedeli Öde</button>`;
    } else {
      // Avukat henüz inceliyor (WAITING_LAWYER_REVIEW)
      actions += `
        <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.3);border-radius:8px;padding:10px 12px;font-size:0.82rem;color:#ffc107;">
          🧐 Seçtiğiniz avukat belgelerinizi inceliyor... Kabul ederse bildirim alacaksınız.
        </div>`;
    }
  }
  else if (d.status === 'WAITING_PAYMENT' || d.status === 'WAITING_LAWYER_PAYMENT')
    actions += `<span style="font-size:0.83rem;color:var(--text-muted)">⏳ Avukat platform bedelini ödüyor...</span>`;
  else if (d.status === 'PENDING_USER_AUTH')
    actions += `<button class="btn-primary" style="background:#00d9a3;color:#000;font-size:0.85rem;padding:10px 16px;margin-bottom:8px;width:100%" onclick="window.approveUserAuth('${d.id}')">⚠️ Avukata Vekalet Ver (Onayla)</button>
                <button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%" onclick="loadMesaj('${d.id}', '${d.status}')">💬 Mesajlaş</button>`;
  else if (d.status === 'TAHSIL') {
    const safeAciklama = (d.tahsilAciklama || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    actions += `<button class="btn-primary" style="background:#e91e63;color:#fff;font-size:0.85rem;padding:10px 16px;margin-bottom:8px;width:100%" onclick="window.confirmCollectionModal('${d.id}', '${safeAciklama}')">✔️ Tahsilatı Onayla ve Dosyayı Kapat</button>
                <button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%" onclick="loadMesaj('${d.id}', '${d.status}')">💬 Mesajlaş</button>`;
  } else if (['PRE_CASE_REVIEW', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'CLOSED', 'KAPANDI'].includes(d.status))
    actions += `<button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px"
              onclick="loadMesaj('${d.id}', '${d.status}')">💬 Mesajlaş</button>`;

  // Sadece henüz bedeli ödenmemiş aşamalarda "Sil" butonuna izin veriyoruz
  if (d.status === 'OPEN') {
    actions += ` <button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;color:#ff4d4f;margin-left:auto;"
                onclick="window.davaSil('${d.id}')">🗑️ İlanı Sil</button>`;
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

// ---- TEKLİFLER ----
async function loadTeklifler(caseId) {
  activeCaseId = caseId;

  // Önce section'ı aç
  showSection('teklifler');

  const container = document.getElementById('tekliflerListesi');
  if (!container) return;

  // Önceki bu davaya ait içerik varsa koru, yoksa spinner
  if (container.dataset.caseId !== caseId) {
    container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Teklifler yükleniyor...</p></div>`;
    container.dataset.caseId = caseId;
    delete container.dataset.lastHTML;
  }

  try {
    const teklifler = await _apiCall()('GET', `/offers/case/${caseId}`);
    const bekleyenler = teklifler.filter(t => t.status === 'PENDING');

    const subtitle = document.getElementById('teklifSubtitle');
    if (subtitle) subtitle.textContent = `${bekleyenler.length} avukattan teklif geldi.`;

    if (!bekleyenler.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⏳</div>
          <div class="empty-title">Henüz teklif gelmedi.</div>
          <div class="empty-sub">Avukatlar tekliflerini hazırlıyor.</div>
          <br/>
          <button class="btn-ghost" onclick="showSection('davalarim')">← Davalara Dön</button>
        </div>`;
      return;
    }

    // Cache in global offers context mapping reviews efficiently.
    window._cachedTeklifler = bekleyenler;

    const newHTML = `<div class="teklif-grid">` +
      bekleyenler.map((t, i) => `
        <div class="teklif-card" id="teklif-${t.id}">
          <div class="teklif-header">
            <span class="teklif-no">⚖️ Anonim Avukat ${i + 1}</span>
            <span class="status-badge status-PENDING">Beklemede</span>
          </div>
          
          <div style="background:var(--bg-main); padding:8px; border-radius:6px; margin:10px 0; text-align:center; display:flex; flex-direction:column; align-items:center; border:1px solid rgba(0,0,0,0.05);">
             <div style="color:gold; font-size:1.1rem; margin-bottom:4px;">${'★'.repeat(Math.round(t.ortalamaPuan || 0))}${'☆'.repeat(5 - Math.round(t.ortalamaPuan || 0))} <span style="color:var(--text-color); font-size:0.9rem; font-weight:600;">${t.ortalamaPuan}</span></div>
             <a href="javascript:void(0)" onclick="showAvukatYorumlari('${t.id}')" style="font-size:0.8rem; color:var(--primary); text-decoration:underline;">
               💬 ${t.yorumSayisi} Müvekkil Yorumunu Oku
             </a>
          </div>

          <div class="teklif-ucret">
            ${t.ucretModeli === 'yuzde' ? `%${t.oran}` : _formatTL()(Number(t.sabitUcret) || 0)}
          </div>
          <div class="teklif-model">
            ${t.ucretModeli === 'yuzde' ? 'Yüzde usulü ücret' : 'Sabit ücret'} &nbsp;•&nbsp;
            ${t.onOdeme ? '⚠️ Ön ödeme var' : '✅ Ön ödeme yok'}
          </div>
          <div class="teklif-detail">
            <div class="teklif-detail-row">
              <span>Tahmini Süre</span><span>${t.tahminiSure}</span>
            </div>
          </div>
          ${t.aciklama ? `<div class="teklif-aciklama">"${t.aciklama}"</div>` : ''}
          <button class="btn-primary btn-block" onclick="teklifSec('${t.id}')">
            Bu Teklifi Seç →
          </button>
        </div>`).join('') + `</div>`;

    if (container.dataset.lastHTML !== newHTML) {
      container.innerHTML = newHTML;
      container.dataset.lastHTML = newHTML;
    }
  } catch (err) {
    _showToast()(err.message, 'error');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">${err.message}</div></div>`;
  }
}

window.showAvukatYorumlari = function (teklifId) {
  const teklif = (window._cachedTeklifler || []).find(t => t.id === teklifId);
  if (!teklif || !teklif.yorumlar || !teklif.yorumlar.length) {
    _showToast()('Bu avukat için henüz hiç yorum bulunmuyor.', 'info');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';

  let commentsHtml = teklif.yorumlar.map(y => `
    <div style="background:var(--bg-main); padding:12px; border-radius:8px; margin-bottom:12px; border:1px solid var(--border);">
       <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <strong style="font-size:0.85rem; color:var(--text-color);">Müvekkil Yorumu</strong>
          <span style="color:gold; font-size:0.9rem;">${'★'.repeat(y.puan)}${'☆'.repeat(5 - y.puan)}</span>
       </div>
       <div style="font-size:0.9rem; color:var(--text-secondary); line-height:1.4;">"${y.yorum || 'Yorum yazılmamış.'}"</div>
       <div style="font-size:0.75rem; color:var(--text-muted); text-align:right; margin-top:8px;">${new Date(y.created_at || y.tarih).toLocaleDateString('tr-TR')}</div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div class="modal" style="width:100%; max-width:500px; padding:24px; border-radius:12px; max-height:80vh; display:flex; flex-direction:column;">
      <h2 style="font-size:1.2rem; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:12px;">⚖️ Avukat Değerlendirmeleri</h2>
      <div style="overflow-y:auto; flex:1; padding-right:8px;">
         ${commentsHtml}
      </div>
      <button class="btn-ghost" style="width:100%; margin-top:16px; padding:12px;" onclick="this.closest('.modal-overlay').remove()">Kapat</button>
    </div>
  `;
  document.body.appendChild(modal);
};

async function teklifSec(offerId) {
  const isConfirmed = await window.HakPortal.showConfirm(
    'Bu teklifi seçmek istediğinizden emin misiniz?\n\nDiğer teklifler reddedilecek ve seçtiğiniz avukata belgeleriniz iletilecektir.\nAvukat dosyanızı inceleyip kabul ederse size bildirim gönderilecektir.'
  );
  if (!isConfirmed) return;

  const btn = document.querySelector(`#teklif-${offerId} .btn-primary`);
  if (btn) { btn.disabled = true; btn.textContent = 'İşleniyor...'; }

  try {
    const result = await _apiCall()('PUT', `/offers/${offerId}/sec`);
    activeOfferId = offerId;

    // Ödeme ekranına GİTME — avukat önce belgeleri inceleyip kabul etmeli
    _showToast()('Teklif seçildi! ✅ Avukat belgelerinizi inceleyecek. Kabul ederse bildirim alacaksınız.', 'success');

    // Dava listesini yenile ve o sayfaya dön
    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }

    setTimeout(() => showSection('davalarim'), 1500);
  } catch (err) {
    _showToast()(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Bu Teklifi Seç →'; }
  }
}

// ---- ÖDEME ----
function loadOdeme(offerId, tutar, caseId) {
  activeOfferId = offerId;
  showSection('odeme');

  const infoCard = document.getElementById('odemeInfoCard');
  if (infoCard) {
    infoCard.innerHTML = `
      <h3 style="margin-bottom:16px;font-size:1rem;font-weight:700">⚖️ Güven (Ciddiyet) Ödemesi</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="dava-detail-row"><span>Hizmet</span><span>Platform Ciddiyet Bedeli</span></div>
        <div class="dava-detail-row"><span>Kapsam</span><span>Avukatla Eşleşme Güvencesi</span></div>
        <div style="margin-top:8px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">Toplam</span>
          <span style="font-size:1.8rem;font-weight:900;color:var(--accent)">${_formatTL()(99)}</span>
        </div>
      </div>
      <div style="margin-top:16px;padding:12px;background:rgba(0,217,163,0.08);border-radius:8px;font-size:0.82rem;color:var(--accent)">
        ✅ Avukat atamayı yapmazsa paranız cüzdanınıza %100 oranında iade edilecektir.
      </div>`;
  }

  const odemeBtn = document.getElementById('odemeBtn');
  if (odemeBtn) {
    odemeBtn.dataset.offerId = offerId;
    odemeBtn.style.display = 'block';
    odemeBtn.disabled = false;
    odemeBtn.textContent = 'Ödemeyi Tamamla';
  }

  ['kartNo', 'sonKullanma', 'cvv', 'kartSahibi'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

async function goOdeme(caseId) {
  try {
    const caseData = await _apiCall()('GET', `/cases/${caseId}`);
    const secilenTeklif = caseData.teklifler?.find(t => t.status === 'SELECTED');
    if (secilenTeklif) {
      loadOdeme(secilenTeklif.id, 99, caseId);
    } else {
      _showToast()('Seçili teklif bulunamadı.', 'error');
    }
  } catch (err) {
    _showToast()(err.message, 'error');
  }
}

async function doOdeme() {
  const odemeBtn = document.getElementById('odemeBtn');
  const offerId = odemeBtn?.dataset.offerId;
  if (!offerId) { _showToast()('Teklif bilgisi eksik.', 'error'); return; }

  const kartNo = document.getElementById('kartNo')?.value.replace(/\s/g, '');
  const sonKullanma = document.getElementById('sonKullanma')?.value;
  const cvv = document.getElementById('cvv')?.value;
  const kartSahibi = document.getElementById('kartSahibi')?.value;

  if (!kartNo || kartNo.length < 16) { _showToast()('Geçerli kart numarası girin.', 'error'); return; }
  if (!sonKullanma || !sonKullanma.includes('/')) { _showToast()('Son kullanma tarihi eksik.', 'error'); return; }
  if (!cvv || cvv.length < 3) { _showToast()('CVV eksik.', 'error'); return; }
  if (!kartSahibi?.trim() || kartSahibi.trim().length < 3) { _showToast()('Kart sahibi adı eksik.', 'error'); return; }

  odemeBtn.disabled = true;
  odemeBtn.textContent = '⏳ İşleniyor...';

  try {
    const result = await _apiCall()('POST', `/offers/${offerId}/kullanici-odeme`, { kartNo, kartSahibi, sonKullanma, cvv });
    _showToast()('Güven ödemesi başarılı! 🎉', 'success');

    const infoCard = document.getElementById('odemeInfoCard');
    if (infoCard) {
      infoCard.innerHTML = `
        <div style="text-align:center;padding:20px">
          <div style="font-size:3.5rem;margin-bottom:16px">⏳</div>
          <h3 style="font-size:1.3rem;font-weight:800;margin-bottom:8px;color:var(--accent)">Avukat Onayı Bekleniyor!</h3>
          <p style="color:var(--text-secondary);margin-bottom:20px;font-size:0.9rem">
            Siz ciddiyet bedelini ödediniz. Şimdi avukatınız 24 saat içerisinde platform hizmet bedelini ödeyip sizinle doğrudan iletişime geçecektir.
          </p>
          <button class="btn-primary btn-block" style="margin-top:20px" onclick="loadDavalar(); showSection('davalarim')">
            📋 Davalarıma Dön
          </button>
        </div>`;
    }
    if (odemeBtn) odemeBtn.style.display = 'none';

    // Dava listesi cache'ini temizle - güncel durum için
    const davaCont = document.getElementById('davalarListesi');
    if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }

  } catch (err) {
    _showToast()(err.message, 'error');
    odemeBtn.disabled = false;
    odemeBtn.textContent = 'Ödemeyi Tamamla';
  }
}

// ---- MESAJLAR ----
async function loadMesajlar() {
  const container = document.getElementById('mesajlarListesi');
  if (!container) return;

  // Zaten mesaj sohbeti açıksa tekrar listeleme yapma
  if (container.querySelector('.messages-container')) return;

  if (!container.innerHTML.trim() || !container.dataset.loaded) {
    container.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Yükleniyor...</p></div>`;
  }

  try {
    const davalar = await _apiCall()('GET', '/cases/benim');
    const aktif = davalar.filter(d =>
      ['PRE_CASE_REVIEW', 'PENDING_USER_AUTH', 'AUTHORIZED', 'ACTIVE', 'LAWYER_ASSIGNED', 'FILED_IN_COURT', 'IN_PROGRESS', 'ILK_GORUSME', 'DAVA_ACILDI', 'DURUSMA', 'TAHSIL', 'CLOSED', 'KAPANDI'].includes(d.status)
    );

    container.dataset.loaded = '1';

    if (!aktif.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <div class="empty-title">Aktif dava yok.</div>
          <div class="empty-sub">Ödeme tamamlandıktan sonra mesajlaşabilirsiniz.</div>
          <br/>
          <button class="btn-primary" onclick="showSection('davalarim')">📋 Davalarıma Git</button>
        </div>`;
      return;
    }

    if (aktif.length === 1) {
      loadMesaj(aktif[0].id, aktif[0].status);
    } else {
      container.innerHTML = `
        <h3 style="font-size:1rem;font-weight:600;margin-bottom:12px">Hangi dava ile mesajlaşmak istiyorsunuz?</h3>
        <div class="dava-grid">
          ${aktif.map(d => {
        const kisaltilmisTarih = new Date(d.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        return `
            <div class="dava-card" style="cursor:pointer; border-left:4px solid var(--primary-light);" onclick="loadMesaj('${d.id}', '${d.status}')">
              ${d.avukatAd ? `
              <div style="margin-bottom:12px;display:flex; gap:10px; align-items:center;">
                <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.1rem;color:#fff;">
                  ${d.avukatAvatar ? `<img src="${d.avukatAvatar}" style="width:100%;height:100%;object-fit:cover;">` : d.avukatAd.charAt(0)}
                </div>
                <div>
                  <div style="font-size:0.9rem;font-weight:700">${d.avukatAd} ${d.avukatSoyad}</div>
                  <div style="font-size:0.75rem;color:var(--text-secondary)">Avukat</div>
                </div>
              </div>` : ''}
              <div class="dava-card-title">${d.davaTuru || 'Hukuki Danışmanlık'}</div>
              <div class="dava-card-sub">${d.sehir} • ${kisaltilmisTarih}</div>
              <div style="font-size:0.8rem; margin-top:8px; color:var(--text-light);">
                Toplam Alacak: <strong style="color:var(--accent)">${_formatTL()(d.tahminiAlacak)}</strong>
              </div>
              <div class="dava-card-actions" style="margin-top:12px; position:relative;">
                ${d.okunmamisMesaj > 0 ? `<div style="position:absolute; top:-35px; right:0px; background:#e63946; color:#fff; font-size:0.7rem; font-weight:bold; padding:4px 8px; border-radius:12px; box-shadow:0 0 10px rgba(230,57,70,0.6); animation: pulse 1.5s infinite;">🔔 ${d.okunmamisMesaj} Yeni Mesaj</div>` : ''}
                <button class="btn-primary" style="font-size:0.85rem;padding:8px 14px; width:100%">💬 Sohbeti Aç</button>
              </div>
            </div>`;
      }).join('')}
        </div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><div class="empty-title">${err.message}</div></div>`;
  }
}

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

async function loadNotifCount() {
  try {
    const data = await _apiCall()('GET', '/notifications/count');
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (data.sayi > 0) {
      badge.textContent = data.sayi > 9 ? '9+' : data.sayi;
      badge.style.display = 'block';
      // Hafif titreşim efekti
      badge.style.animation = 'none';
      setTimeout(() => { badge.style.animation = ''; }, 10);
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    // Sessizce yut - bildirim tablosu henüz yoksa hata çıkabilir
  }
}

// ---- MESAJ BADGE: Okunmamış sohbet sayısını sidebar'da göster ----
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
  } catch (e) {
    // Sessizce yut
  }
}

window.toggleNotifDropdown = async function () {
  const dd = document.getElementById('notifDropdown');
  if (!dd) return;
  if (dd.style.display === 'none' || !dd.style.display) {
    dd.style.display = 'block';
    await loadNotifler();
  } else {
    dd.style.display = 'none';
  }
};

async function loadNotifler() {
  const listesi = document.getElementById('notifListesi');
  if (!listesi) return;

  try {
    const notifler = await _apiCall()('GET', '/notifications');

    if (!notifler.length) {
      listesi.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.85rem;">
        <div style="font-size:2rem;margin-bottom:8px;">🔕</div>
        Henüz bildirim yok
      </div>`;
      return;
    }

    const tipIkonlar = {
      'AVUKAT_KABUL': '✅',
      'AVUKAT_VAZGECTI': '⚠️',
      'GENEL': '🔔'
    };

    listesi.innerHTML = notifler.map(n => `
      <div id="notif-${n.id}" onclick="tekBildirimOku('${n.id}', '${n.case_id || ''}')"
        style="padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;${n.okundu ? 'opacity:0.6;' : 'background:rgba(0,217,163,0.04);'}"
        onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='${n.okundu ? 'transparent' : 'rgba(0,217,163,0.04)'}'"
      >
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="font-size:1.3rem;flex-shrink:0;">${tipIkonlar[n.tip] || '🔔'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.85rem;font-weight:${n.okundu ? '500' : '700'};color:var(--text-color);margin-bottom:4px;">${n.baslik}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.4;">${n.mesaj}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">${new Date(n.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          ${!n.okundu ? '<div style="width:8px;height:8px;border-radius:50%;background:#00d9a3;flex-shrink:0;margin-top:4px;"></div>' : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    listesi.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.82rem;">Bildirimler yüklenemedi.</div>`;
  }
}

window.tekBildirimOku = async function (notifId, caseId) {
  try {
    // Bildirimi okundu işaretle
    await _apiCall()('PUT', `/notifications/${notifId}/oku`);
    // Badge'i güncelle
    await loadNotifCount();
    // Dropdown'ı kapat
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.style.display = 'none';
    // Eğer ilişkili bir dava varsa davalar bölümüne git ve listeyi yenile
    if (caseId) {
      const davaCont = document.getElementById('davalarListesi');
      if (davaCont) { delete davaCont.dataset.loaded; delete davaCont.dataset.lastHTML; }
      showSection('davalarim');
    }
  } catch (e) {
    // sessizce yut
  }
};

window.tumunuOku = async function () {
  try {
    await _apiCall()('PUT', '/notifications/tumunu-oku');
    await loadNotifCount();
    await loadNotifler();
  } catch (e) {
    // sessizce yut
  }
};



