// =============================================
// HakPortal – Admin Panel JS  v3.0
// =============================================

if (!window.HakPortal?.Auth?.isLoggedIn() || window.HakPortal?.Auth?.getRole() !== 'admin') {
  window.location.href = '/';
}

// ─── 81 il ───────────────────────────────────────────────
const TR_ILLER = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin',
  'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale',
  'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum',
  'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta', 'Mersin',
  'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir', 'Kocaeli',
  'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla', 'Muş',
  'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak', 'Van', 'Yozgat', 'Zonguldak',
  'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman', 'Şırnak', 'Bartın', 'Ardahan',
  'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye', 'Düzce'
];

// ─── Status ───────────────────────────────────────────────
const S_LABEL = {
  OPEN: 'Açık', PENDING_OFFER: 'Teklif Bekleniyor', OFFER_MADE: 'Teklif Yapıldı',
  WAITING_PAYMENT: 'Ödeme Bekleniyor', PRE_CASE_REVIEW: 'Ön İnceleme',
  PENDING_USER_AUTH: 'Kullanıcı Yanıtı', AUTHORIZED: 'Yetkilendirildi',
  ACTIVE: 'Aktif', LAWYER_ASSIGNED: 'Avukat Atandı', IN_PROGRESS: 'Devam Ediyor',
  ILK_GORUSME: 'İlk Görüşme', DAVA_ACILDI: 'Dava Açıldı',
  DURUSMA: 'Duruşma', TAHSIL: 'Tahsil', FILED_IN_COURT: 'Mahkemede',
  CLOSED: 'Kapatıldı', KAPANDI: 'Kapandı'
};

const S_COLOR = {
  OPEN: 'orange', PENDING_OFFER: 'yellow', OFFER_MADE: 'yellow',
  WAITING_PAYMENT: 'yellow', PRE_CASE_REVIEW: 'blue',
  ACTIVE: 'green', IN_PROGRESS: 'green', LAWYER_ASSIGNED: 'green',
  ILK_GORUSME: 'blue', DAVA_ACILDI: 'blue',
  DURUSMA: 'purple', TAHSIL: 'green', FILED_IN_COURT: 'purple',
  CLOSED: 'red', KAPANDI: 'red', PENDING_USER_AUTH: 'yellow', AUTHORIZED: 'blue'
};

function sBadge(s) {
  const c = S_COLOR[s] || 'gray';
  const l = S_LABEL[s] || s;
  return `<span class="badge ${c}">${l}</span>`;
}

function initials(ad, soyad) {
  return ((ad || '?')[0] + (soyad || '?')[0]).toUpperCase();
}

// ─── Önbellekler ──────────────────────────────────────────
let _avData = [], _kulData = [], _davaData = [], _odemeData = [];
let _pageSize = 25;
let _avPage = 1, _kulPage = 1, _davaPage = 1, _odemePage = 1;

// ─── 81 il dropdown doldur ────────────────────────────────
function fillIlDropdown(id) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  TR_ILLER.forEach(il => {
    const o = document.createElement('option');
    o.value = il; o.textContent = il;
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

function clearFilter(prefix) {
  ['Ara', 'Sehir', 'Durum', 'Tur'].forEach(s => {
    const el = document.getElementById(prefix + s);
    if (el) el.value = '';
  });
  if (prefix === 'av') { _avPage = 1; filterAvukatlar(); }
  if (prefix === 'kul') { _kulPage = 1; filterKullanicilar(); }
  if (prefix === 'dava') { _davaPage = 1; filterDavalar(); }
  if (prefix === 'odeme') { _odemePage = 1; filterOdemeler(); }
}

// ─── Pagination yardımcısı ────────────────────────────────
function pgHtml(total, cur, onchange) {
  const pages = Math.max(1, Math.ceil(total / _pageSize));
  const visAll = pages <= 7;
  const visible = visAll
    ? Array.from({ length: pages }, (_, i) => i + 1)
    : [...new Set([1, 2, cur - 1, cur, cur + 1, pages - 1, pages].filter(p => p >= 1 && p <= pages))].sort((a, b) => a - b);

  let nums = '';
  let prev = 0;
  visible.forEach(p => {
    if (prev && p - prev > 1) nums += `<span class="pg-btn" style="pointer-events:none;opacity:.35;cursor:default">…</span>`;
    nums += `<button class="pg-btn ${p === cur ? 'active' : ''}" onclick="${onchange}(${p})">${p}</button>`;
    prev = p;
  });

  return `<div class="pagination">
      <span class="pg-info">${total} kayıt &nbsp;·&nbsp; Sayfa ${cur} / ${pages}</span>
      <div class="pg-controls">
        <button class="pg-btn" onclick="${onchange}(${cur - 1})" ${cur <= 1 ? 'disabled' : ''}>← Önceki</button>
        ${nums}
        <button class="pg-btn" onclick="${onchange}(${cur + 1})" ${cur >= pages ? 'disabled' : ''}>Sonraki →</button>
      </div>
      <div class="pg-size">
        <select onchange="changePageSize(this.value,'${onchange}')">
          ${[10, 25, 50, 100].map(n => `<option value="${n}" ${n === _pageSize ? 'selected' : ''}>${n} / sayfa</option>`).join('')}
        </select>
      </div>
    </div>`;
}

function changePageSize(n, fn) {
  _pageSize = parseInt(n);
  _avPage = _kulPage = _davaPage = _odemePage = 1;
  window[fn]?.(1);
}

// ─── Section ──────────────────────────────────────────────
function adminSection(name) {
  ['Dashboard', 'Avukatlar', 'Kullanicilar', 'Davalar', 'Odemeler', 'Ayarlar'].forEach(s => {
    const el = document.getElementById(`adminSection${s}`);
    if (el) el.style.display = 'none';
  });
  const cap = name[0].toUpperCase() + name.slice(1);
  const el = document.getElementById(`adminSection${cap}`);
  if (el) { el.style.display = 'block'; el.classList.add('anim-in'); }
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const map = {
    dashboard: 'sbDash', avukatlar: 'sbAvukatlar', kullanicilar: 'sbKullanici',
    davalar: 'sbDavalar', odemeler: 'sbOdemeler', ayarlar: 'sbAyarlar'
  };
  document.getElementById(map[name])?.classList.add('active');

  if (name === 'dashboard') loadDashboard();
  if (name === 'avukatlar') loadAvukatlar();
  if (name === 'kullanicilar') loadKullanicilar();
  if (name === 'davalar') { _davaPage = 1; loadDavalar(); }
  if (name === 'odemeler') loadOdemeler();
  if (name === 'ayarlar') loadAyarlar();
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  const c = document.getElementById('dashboardStats');
  c.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">
      <div class="shimmer-row" style="height:100px;border-radius:16px"></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        ${Array(8).fill('<div class="shimmer-row"></div>').join('')}
      </div></div>`;
  try {
    const s = await apiCall('GET', '/admin/istatistik');

    // sidebar badge
    const sb = document.getElementById('sbAvBadge');
    if (sb) { sb.textContent = s.bekleyenAvukat; sb.style.display = s.bekleyenAvukat > 0 ? 'inline-block' : 'none'; }

    c.innerHTML = `
          ${s.bekleyenAvukat > 0 ? `<div class="alert-card warn">
            <span>⚠️ &nbsp;<strong>${s.bekleyenAvukat} avukat</strong> profil onayı bekliyor.</span>
            <button class="btn-xs orange" onclick="adminSection('avukatlar')">İncele →</button>
          </div>` : ''}

          <div class="stat-grid">
            <div class="stat-card blue">
              <span class="stat-icon">👥</span>
              <div class="stat-num blue">${s.kullaniciSayisi.toLocaleString('tr-TR')}</div>
              <div class="stat-label">Kullanıcı</div>
            </div>
            <div class="stat-card purple">
              <span class="stat-icon">⚖️</span>
              <div class="stat-num purple">${s.avukatSayisi.toLocaleString('tr-TR')}</div>
              <div class="stat-label">Avukat</div>
              <div class="stat-sub">Onay bekleyen: <strong style="color:var(--admin-yellow)">${s.bekleyenAvukat}</strong></div>
            </div>
            <div class="stat-card orange">
              <span class="stat-icon">📋</span>
              <div class="stat-num orange">${s.toplamDava.toLocaleString('tr-TR')}</div>
              <div class="stat-label">Toplam Dava</div>
            </div>
            <div class="stat-card red">
              <span class="stat-icon">🔴</span>
              <div class="stat-num red">${s.acikDava.toLocaleString('tr-TR')}</div>
              <div class="stat-label">Açık Dava</div>
            </div>
            <div class="stat-card green">
              <span class="stat-icon">🟢</span>
              <div class="stat-num green">${s.aktifDava.toLocaleString('tr-TR')}</div>
              <div class="stat-label">Aktif Süreç</div>
            </div>
            <div class="stat-card green" style="grid-column:span 2">
              <span class="stat-icon">💰</span>
              <div class="stat-num green" style="font-size:1.6rem">${formatTL(s.toplamOdeme)}</div>
              <div class="stat-label">Toplam Platform Geliri</div>
            </div>
            <div class="stat-card blue">
              <span class="stat-icon">🧮</span>
              <div class="stat-num blue">${(s.toplamHesaplama || 0).toLocaleString('tr-TR')}</div>
              <div class="stat-label">Hesaplama</div>
            </div>
          </div>

          <div class="qs-row">
            <div class="qs-card">
              <h4>📊 En Çok Dava Açılan Şehirler</h4>
              <div class="city-list" id="cityStats"><div class="shimmer-row"></div></div>
            </div>
            <div class="qs-card">
              <h4>⚡ Hızlı Erişim</h4>
              <div style="display:flex;flex-direction:column;gap:8px">
                <button class="btn-xs green" style="padding:10px 14px;font-size:0.82rem" onclick="adminSection('avukatlar')">⚖️ &nbsp;Avukat Yönetimi →</button>
                <button class="btn-xs blue"  style="padding:10px 14px;font-size:0.82rem" onclick="adminSection('kullanicilar')">👥 &nbsp;Kullanıcılar →</button>
                <button class="btn-xs orange" style="padding:10px 14px;font-size:0.82rem" onclick="adminSection('davalar')">📋 &nbsp;Dava Listesi →</button>
                <button class="btn-xs purple" style="padding:10px 14px;font-size:0.82rem" onclick="adminSection('odemeler')">💰 &nbsp;Ödeme Geçmişi →</button>
                <button class="btn-xs gray"   style="padding:10px 14px;font-size:0.82rem" onclick="adminSection('ayarlar')">⚙️ &nbsp;Sistem Ayarları →</button>
              </div>
            </div>
          </div>`;

    loadCityStats();
  } catch (err) { showToast(err.message, 'error'); }
}

async function loadCityStats() {
  try {
    const list = await apiCall('GET', '/admin/davalar');
    const counts = {};
    list.forEach(d => { counts[d.sehir] = (counts[d.sehir] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = sorted[0]?.[1] || 1;
    document.getElementById('cityStats').innerHTML = sorted.map(([s, n]) =>
      `<div class="city-item">
              <span class="city-name">${s}</span>
              <div class="city-bar-bg"><div class="city-bar" style="width:${Math.round(n / max * 100)}%"></div></div>
              <span class="city-count">${n}</span>
            </div>`
    ).join('');
  } catch { }
}

// ═══════════════════════════════════════════════════════════
//  AVUKATLAR
// ═══════════════════════════════════════════════════════════
async function loadAvukatlar() {
  document.getElementById('avukatlarTable').innerHTML = shimmerTable(6);
  try {
    _avData = await apiCall('GET', '/admin/avukatlar');
    fillIlDropdown('avSehir');
    _avPage = 1;
    filterAvukatlar();
  } catch (e) { showToast(e.message, 'error'); }
}

function filterAvukatlar() {
  const ara = v('avAra').toLowerCase();
  const sehir = v('avSehir');
  const durum = v('avDurum');

  let list = _avData.filter(a => {
    const t = !ara || `${a.ad} ${a.soyad} ${a.email}`.toLowerCase().includes(ara);
    const s = !sehir || a.sehir === sehir;
    let d = true;
    const isBanli = !a.isActive && a.onayTarihi !== null;
    const isOnayli = !!a.profilOnay && a.isActive;
    const isBekliyor = !isOnayli && !isBanli;

    if (durum === 'bekliyor') d = isBekliyor;
    else if (durum === 'onaylı') d = isOnayli;
    else if (durum === 'banlı') d = isBanli;
    return t && s && d;
  });

  document.getElementById('avInfo').textContent = `${list.length} sonuç`;
  document.getElementById('avSubInfo').textContent = `${list.length} avukat listeleniyor`;
  renderAvukatlar(list);
}

function renderAvukatlar(list) {
  const c = document.getElementById('avukatlarTable');
  if (!list.length) { c.innerHTML = emptyState('⚖️', 'Avukat bulunamadı.'); return; }
  const start = (_avPage - 1) * _pageSize, slice = list.slice(start, start + _pageSize);
  c.innerHTML = `
      <div class="data-table-wrap anim-in">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Avukat</th><th>Şehir</th><th>Baro · No</th>
            <th>Uzmanlık</th><th>Kayıt</th><th>Durum</th><th>İşlem</th>
          </tr></thead>
          <tbody>
          ${slice.map((a, i) => {
    const num = start + i + 1;
    const isBanli = !a.isActive && a.onayTarihi !== null;
    const isOnayli = !!a.profilOnay && a.isActive;
    const isBekliyor = !isOnayli && !isBanli;
    const d = isBanli
      ? `<span class="badge red">🚫 Banlı</span>`
      : isOnayli
        ? `<span class="badge green">✅ Onaylı</span>`
        : `<span class="badge yellow">⏳ Bekliyor</span>`;
    return `<tr>
              <td style="color:var(--text-muted);font-size:0.75rem">${num}</td>
              <td>
                <div class="user-cell">
                  <div class="user-avatar-sm">${initials(a.ad, a.soyad)}</div>
                  <div>
                    <div class="user-name">${a.ad} ${a.soyad}</div>
                    <div class="user-email">${a.email}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge gray">${a.sehir || '—'}</span></td>
              <td style="font-size:0.8rem">${a.baro || '—'}<br><span style="color:var(--text-muted);font-size:0.72rem">${a.baroNo || ''}</span></td>
              <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.8rem" title="${a.uzmanlik || ''}">${a.uzmanlik || '—'}</td>
              <td style="font-size:0.78rem;color:var(--text-muted)">${formatDate(a.createdAt)}</td>
              <td>${d}</td>
              <td>
                <div class="action-group">
                  <button class="btn-xs blue" onclick="avDetay('${a.id}')">🔍 Detay</button>
                  ${isBekliyor ? `<button class="btn-xs green" onclick="onayla('${a.id}')">✓ Onayla</button>` : ''}
                  ${isOnayli ? `<button class="btn-xs red" onclick="reddet('${a.id}')">✗ Askıya Al</button>` : ''}
                  ${isBanli ? `<button class="btn-xs orange" onclick="onayla('${a.id}')">↺ Aktifleştir</button>` : ''}
                </div>
              </td>
            </tr>`;
  }).join('')}
          </tbody>
        </table>
        ${pgHtml(list.length, _avPage, 'setAvPage')}
      </div>`;
}

function setAvPage(p) { _avPage = p; filterAvukatlar(); scrollTop(); }

async function onayla(id) {
  try { const r = await apiCall('PUT', `/admin/avukat/${id}/onayla`); showToast(r.message, 'success'); loadAvukatlar(); }
  catch (e) { showToast(e.message, 'error'); }
}
async function reddet(id) {
  if (!await window.HakPortal.showConfirm('Bu avukatı askıya almak istediğinizden emin misiniz?')) return;
  try { const r = await apiCall('PUT', `/admin/avukat/${id}/reddet`); showToast(r.message, 'success'); loadAvukatlar(); }
  catch (e) { showToast(e.message, 'error'); }
}
function avDetay(id) {
  const a = _avData.find(x => x.id === id); if (!a) return;
  const isBanli = !a.isActive && a.onayTarihi !== null;
  const isOnayli = !!a.profilOnay && a.isActive;
  const isBekliyor = !isOnayli && !isBanli;

  document.getElementById('avukatDetayBody').innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">Kişisel Bilgiler</div>
        <div class="detail-row">
          <div class="detail-item"><div class="di-label">Ad</div><div class="di-val">${a.ad}</div></div>
          <div class="detail-item"><div class="di-label">Soyad</div><div class="di-val">${a.soyad}</div></div>
          <div class="detail-item"><div class="di-label">E-posta</div><div class="di-val" style="font-size:0.82rem">${a.email}</div></div>
          <div class="detail-item"><div class="di-label">Şehir</div><div class="di-val">${a.sehir || '—'}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Mesleki Bilgiler</div>
        <div class="detail-row">
          <div class="detail-item"><div class="di-label">Baro</div><div class="di-val">${a.baro || '—'}</div></div>
          <div class="detail-item"><div class="di-label">Baro No</div><div class="di-val">${a.baroNo || '—'}</div></div>
          <div class="detail-item" style="grid-column:span 2"><div class="di-label">Uzmanlık</div><div class="di-val">${a.uzmanlik || '—'}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Hesap Durumu</div>
        <div class="detail-row">
          <div class="detail-item"><div class="di-label">Profil Onayı</div><div class="di-val">${a.profilOnay ? '<span style="color:var(--admin-green)">✅ Onaylandı</span>' : '<span style="color:var(--admin-yellow)">⏳ Bekliyor</span>'}</div></div>
          <div class="detail-item"><div class="di-label">Hesap Aktifliği</div><div class="di-val">${a.isActive ? '<span style="color:var(--admin-green)">Aktif</span>' : '<span style="color:var(--admin-red)">Deaktif/Banlı</span>'}</div></div>
          <div class="detail-item"><div class="di-label">Kayıt Tarihi</div><div class="di-val">${formatDate(a.createdAt)}</div></div>
          <div class="detail-item"><div class="di-label">Onay Tarihi</div><div class="di-val">${a.onayTarihi ? formatDate(a.onayTarihi) : '—'}</div></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
        ${isBekliyor ? `<button class="btn-xs green" onclick="onayla('${a.id}');closeAdminModal('avukatDetayModal')">✓ Profili Onayla</button>` : ''}
        ${isOnayli ? `<button class="btn-xs red" onclick="reddet('${a.id}');closeAdminModal('avukatDetayModal')">✗ Askıya Al</button>` : ''}
        ${isBanli ? `<button class="btn-xs orange" onclick="onayla('${a.id}');closeAdminModal('avukatDetayModal')">↺ Aktifleştir</button>` : ''}
      </div>`;
  document.getElementById('avukatDetayModal').style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════
//  KULLANICILAR
// ═══════════════════════════════════════════════════════════
async function loadKullanicilar() {
  document.getElementById('kullanicilarTable').innerHTML = shimmerTable(5);
  try {
    _kulData = await apiCall('GET', '/admin/kullanicilar');
    fillIlDropdown('kulSehir');
    _kulPage = 1;
    filterKullanicilar();
  } catch (e) { showToast(e.message, 'error'); }
}

function filterKullanicilar() {
  const ara = v('kulAra').toLowerCase();
  const sehir = v('kulSehir');
  const durum = v('kulDurum');
  let list = _kulData.filter(u => {
    const t = !ara || `${u.ad} ${u.soyad} ${u.email}`.toLowerCase().includes(ara);
    const s = !sehir || u.sehir === sehir;
    let d = true;
    if (durum === 'aktif') d = u.isActive; else if (durum === 'banlı') d = !u.isActive;
    return t && s && d;
  });
  document.getElementById('kulInfo').textContent = `${list.length} sonuç`;
  document.getElementById('kulSubInfo').textContent = `${list.length} kullanıcı listeleniyor`;
  renderKullanicilar(list);
}

function renderKullanicilar(list) {
  const c = document.getElementById('kullanicilarTable');
  if (!list.length) { c.innerHTML = emptyState('👥', 'Kullanıcı bulunamadı.'); return; }
  const start = (_kulPage - 1) * _pageSize, slice = list.slice(start, start + _pageSize);
  c.innerHTML = `
      <div class="data-table-wrap anim-in">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Kullanıcı</th><th>Şehir</th><th>Kayıt Tarihi</th><th>Durum</th><th>İşlem</th>
          </tr></thead>
          <tbody>
          ${slice.map((u, i) => {
    const num = start + i + 1;
    return `<tr>
              <td style="color:var(--text-muted);font-size:0.75rem">${num}</td>
              <td>
                <div class="user-cell">
                  <div class="user-avatar-sm" style="background:linear-gradient(135deg,var(--admin-purple),var(--admin-blue))">${initials(u.ad, u.soyad)}</div>
                  <div>
                    <div class="user-name">${u.ad} ${u.soyad}</div>
                    <div class="user-email">${u.email}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge gray">${u.sehir || '—'}</span></td>
              <td style="font-size:0.78rem;color:var(--text-muted)">${formatDate(u.createdAt)}</td>
              <td>${u.isActive ? '<span class="badge green">✅ Aktif</span>' : '<span class="badge red">🚫 Banlı</span>'}</td>
              <td>
                <div class="action-group">
                  <button class="btn-xs blue" onclick="kulDetay('${u.id}')">🔍 Detay</button>
                  ${u.isActive
        ? `<button class="btn-xs red" onclick="banKullanici('${u.id}')">🚫 Banla</button>`
        : `<button class="btn-xs orange" onclick="unbanKullanici('${u.id}')">↺ Aktifleştir</button>`}
                </div>
              </td>
            </tr>`;
  }).join('')}
          </tbody>
        </table>
        ${pgHtml(list.length, _kulPage, 'setKulPage')}
      </div>`;
}

function setKulPage(p) { _kulPage = p; filterKullanicilar(); scrollTop(); }

async function banKullanici(id) {
  if (!await window.HakPortal.showConfirm('Bu kullanıcıyı banlamak istediğinizden emin misiniz?')) return;
  try { const r = await apiCall('PUT', `/admin/kullanici/${id}/ban`); showToast(r.message, 'success'); loadKullanicilar(); }
  catch (e) { showToast(e.message, 'error'); }
}
async function unbanKullanici(id) {
  try { const r = await apiCall('PUT', `/admin/kullanici/${id}/aktif`); showToast(r.message, 'success'); loadKullanicilar(); }
  catch (e) { showToast(e.message, 'error'); }
}
function kulDetay(id) {
  const u = _kulData.find(x => x.id === id); if (!u) return;
  document.getElementById('kulDetayBody').innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">Profil</div>
        <div class="detail-row">
          <div class="detail-item"><div class="di-label">Ad</div><div class="di-val">${u.ad}</div></div>
          <div class="detail-item"><div class="di-label">Soyad</div><div class="di-val">${u.soyad}</div></div>
          <div class="detail-item"><div class="di-label">E-posta</div><div class="di-val" style="font-size:0.82rem">${u.email}</div></div>
          <div class="detail-item"><div class="di-label">Şehir</div><div class="di-val">${u.sehir || '—'}</div></div>
          <div class="detail-item"><div class="di-label">Kayıt</div><div class="di-val">${formatDate(u.createdAt)}</div></div>
          <div class="detail-item"><div class="di-label">Durum</div><div class="di-val">${u.isActive ? '<span style="color:var(--admin-green)">Aktif</span>' : '<span style="color:var(--admin-red)">Banlı</span>'}</div></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        ${u.isActive ? `<button class="btn-xs red" onclick="banKullanici('${u.id}');closeAdminModal('kulDetayModal')">🚫 Banla</button>`
      : `<button class="btn-xs orange" onclick="unbanKullanici('${u.id}');closeAdminModal('kulDetayModal')">↺ Aktifleştir</button>`}
      </div>`;
  document.getElementById('kulDetayModal').style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════
//  DAVALAR
// ═══════════════════════════════════════════════════════════
async function loadDavalar() {
  document.getElementById('davalarTable').innerHTML = shimmerTable(8);
  try {
    _davaData = await apiCall('GET', '/admin/davalar');
    fillIlDropdown('davaSehir');
    // Dava türleri
    const turSel = document.getElementById('davaTur');
    if (turSel) {
      const turler = [...new Set(_davaData.map(d => d.davaTuru).filter(Boolean))].sort();
      while (turSel.options.length > 1) turSel.remove(1);
      turler.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; turSel.appendChild(o); });
    }
    _davaPage = 1;
    filterDavalar();
  } catch (e) { showToast(e.message, 'error'); }
}

function filterDavalar() {
  const ara = v('davaAra').toLowerCase();
  const sehir = v('davaSehir');
  const durum = v('davaDurum');
  const tur = v('davaTur');
  let list = _davaData.filter(d => {
    const t = !ara || `${d.kullaniciAd || ''} ${d.kullaniciSoyad || ''} ${d.kullaniciEmail || ''}`.toLowerCase().includes(ara);
    const s = !sehir || d.sehir === sehir;
    const du = !durum || d.status === durum;
    const tu = !tur || d.davaTuru === tur;
    return t && s && du && tu;
  });
  document.getElementById('davaInfo').textContent = `${list.length} sonuç`;
  document.getElementById('davaSubInfo').textContent = `${list.length} dava · Sayfa ${_davaPage}/${Math.max(1, Math.ceil(list.length / _pageSize))}`;
  renderDavalar(list);
}

function renderDavalar(list) {
  const c = document.getElementById('davalarTable');
  if (!list.length) { c.innerHTML = emptyState('📋', 'Dava bulunamadı.'); return; }
  const start = (_davaPage - 1) * _pageSize, slice = list.slice(start, start + _pageSize);
  c.innerHTML = `
      <div class="data-table-wrap anim-in">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Kullanıcı</th><th>Şehir</th><th>Dava Türü</th>
            <th>Tahmini Alacak</th><th>Avukat</th><th>Durum</th><th>Tarih</th><th>İşlem</th>
          </tr></thead>
          <tbody>
          ${slice.map((d, i) => {
    const num = start + i + 1;
    return `<tr>
              <td style="color:var(--text-muted);font-size:0.75rem">${num}</td>
              <td>
                <div class="user-cell">
                  <div class="user-avatar-sm" style="background:linear-gradient(135deg,var(--admin-orange),var(--admin-red))">${initials(d.kullaniciAd, d.kullaniciSoyad)}</div>
                  <div>
                    <div class="user-name">${d.kullaniciAd || ''} ${d.kullaniciSoyad || ''}</div>
                    <div class="user-email">${d.kullaniciEmail || ''}</div>
                  </div>
                </div>
              </td>
              <td><span class="badge gray">${d.sehir || '—'}</span></td>
              <td style="font-size:0.8rem;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${d.davaTuru || ''}">${d.davaTuru || '—'}</td>
              <td><strong style="color:var(--admin-accent)">${formatTL(d.tahminiAlacak)}</strong></td>
              <td style="font-size:0.8rem;color:var(--text-muted)">${d.avukatAd ? `${d.avukatAd} ${d.avukatSoyad || ''}` : '<span style="opacity:.4">—</span>'}</td>
              <td>${sBadge(d.status)}</td>
              <td style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap">${formatDate(d.createdAt)}</td>
              <td>
                <div class="action-group">
                  <button class="btn-xs blue" onclick="davaDetay('${d.id}')">🔍 Detay</button>
                  ${d.status !== 'KAPANDI' && d.status !== 'CLOSED' ? `<button class="btn-xs red" onclick="kapat('${d.id}')">✗ Kapat</button>` : ''}
                </div>
              </td>
            </tr>`;
  }).join('')}
          </tbody>
        </table>
        ${pgHtml(list.length, _davaPage, 'setDavaPage')}
      </div>`;
}

function setDavaPage(p) { _davaPage = p; filterDavalar(); scrollTop(); }

async function kapat(id) {
  if (!await window.HakPortal.showConfirm('Bu davayı kalıcı olarak kapatmak istediğinizden emin misiniz?')) return;
  const input = prompt('Dava başarıyla bittiyse ve tahsilat gerçekleştiyse, tahsil edilen TL tutarını girin.\n(Boş bırakabilirsiniz):');
  let tahsilat = null;
  if (input !== null && input.trim() !== '') {
    tahsilat = parseFloat(input.replace(',', '.'));
  }
  try { const r = await apiCall('PUT', `/admin/dava/${id}/kapat`, { tahsilat }); showToast(r.message, 'success'); loadDavalar(); }
  catch (e) { showToast(e.message, 'error'); }
}

async function davaDetay(id) {
  const d = _davaData.find(x => x.id === id); if (!d) return;
  document.getElementById('davaDetayModal').style.display = 'flex';
  const body = document.getElementById('davaDetayBody');
  body.innerHTML = shimmerTable(1);

  try {
    const res = await apiCall('GET', `/admin/dava/${id}/detay`);
    const logs = res.logs || [];
    const msgs = res.messages || [];

    let logsHtml = logs.length ? logs.map(l =>
      `<div class="log-box"><strong>${formatDate(l.created_at)}</strong> — ${sBadge(l.status)}<br/>${l.aciklama || ''} <span style="opacity:0.6;margin-left:5px">(${l.ad ? l.ad + ' ' + l.soyad : (l.guncelleyen_rol || 'Sistem')})</span></div>`
    ).join('') : '<div style="font-size:0.8rem;color:var(--text-muted)">Henüz süreç günlüğü yok.</div>';

    let msgHtml = msgs.length ? msgs.map(m => {
      let cls = 'chat-system';
      if (m.gonderen_rol === 'kullanici') cls = 'chat-kullanici';
      else if (m.gonderen_rol === 'avukat') cls = 'chat-avukat';
      return `<div class="chat-bubble ${cls}">
            <div style="font-size:0.7rem;opacity:0.6;margin-bottom:3px;font-weight:600">${m.ad || 'Hesap'} ${m.soyad || 'Silinmiş'} <span style="float:right;font-weight:400;opacity:0.8">${formatDate(m.tarih)}</span></div>
            <div>${m.icerik}</div>
          </div>`;
    }).join('') : '<div style="font-size:0.8rem;color:var(--text-muted)">Henüz mesajlaşma yok.</div>';

    body.innerHTML = `
      <div class="detail-section">
        <div class="detail-section-title">Genel Bilgi</div>
        <div class="detail-row">
          <div class="detail-item" style="grid-column:span 2"><div class="di-label">Dava ID</div><div class="di-val mono">${d.id}</div></div>
          <div class="detail-item"><div class="di-label">Durum</div><div class="di-val">${sBadge(d.status)}</div></div>
          <div class="detail-item"><div class="di-label">Şehir</div><div class="di-val">${d.sehir || '—'}</div></div>
          <div class="detail-item"><div class="di-label">Dava Türü</div><div class="di-val">${d.davaTuru || '—'}</div></div>
          <div class="detail-item"><div class="di-label">Gerçekleşen Tahsilat</div><div class="di-val" style="color:var(--admin-green)">${d.gerceklesenTahsilat ? formatTL(d.gerceklesenTahsilat) : '—'}</div></div>
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Kullanıcı & Avukat</div>
        <div class="detail-row">
          <div class="detail-item"><div class="di-label">Kullanıcı</div><div class="di-val">${d.kullaniciAd || ''} ${d.kullaniciSoyad || ''}</div></div>
          <div class="detail-item"><div class="di-label">E-Posta</div><div class="di-val" style="font-size:0.8rem">${d.kullaniciEmail || '—'}</div></div>
          <div class="detail-item"><div class="di-label">Atanan Avukat</div><div class="di-val">${d.avukatAd ? d.avukatAd : '<span style="opacity:.5">Henüz atanmadı</span>'}</div></div>
        </div>
      </div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="detail-section" style="margin-bottom:0">
          <div class="detail-section-title">Süreç Geçmişi & Loglar</div>
          <div style="max-height:300px;overflow-y:auto;padding-right:10px">${logsHtml}</div>
        </div>
        <div class="detail-section" style="margin-bottom:0">
          <div class="detail-section-title">İletişim & Mesajlar</div>
          <div style="max-height:300px;overflow-y:auto;padding-right:10px">${msgHtml}</div>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-top:20px;padding-top:15px;border-top:1px solid var(--glass-border)">
        ${d.status !== 'KAPANDI' && d.status !== 'CLOSED' ? `<button class="btn-xs red" onclick="kapat('${d.id}');closeAdminModal('davaDetayModal')">✗ Davayı Kapat / Tahsilat Gir</button>` : ''}
      </div>`;
  } catch (e) {
    body.innerHTML = `<div class="alert-card red">Veri çekilirken hata: ${e.message}</div>`;
  }
}


// ═══════════════════════════════════════════════════════════
//  ÖDEMELER
// ═══════════════════════════════════════════════════════════
async function loadOdemeler() {
  document.getElementById('odemelerTable').innerHTML = shimmerTable(7);
  try {
    _odemeData = await apiCall('GET', '/admin/odemeler');
    _odemePage = 1;
    filterOdemeler();
  } catch (e) { showToast(e.message, 'error'); }
}

function filterOdemeler() {
  const ara = v('odemeAra').toLowerCase();
  let list = _odemeData.filter(p => {
    return !ara || `${p.kullaniciEmail || ''} ${p.kartSonDort || ''} ${p.avukatAd || ''}`.toLowerCase().includes(ara);
  });
  const toplam = list.reduce((s, p) => s + (p.tutar || 0), 0);
  document.getElementById('odemeInfo').textContent = `${list.length} ödeme · ${formatTL(toplam)}`;
  document.getElementById('odemeSubInfo').textContent = `${list.length} ödeme · Toplam ${formatTL(toplam)}`;
  renderOdemeler(list, toplam);
}

function renderOdemeler(list, toplam) {
  const c = document.getElementById('odemelerTable');
  if (!list.length) { c.innerHTML = emptyState('💰', 'Ödeme bulunamadı.'); return; }
  const start = (_odemePage - 1) * _pageSize, slice = list.slice(start, start + _pageSize);
  c.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,217,163,0.06);border:1px solid rgba(0,217,163,0.2);border-radius:10px;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <span style="font-size:0.82rem;color:var(--text-muted)">Filtrelenmiş toplam gelir</span>
        <strong style="color:var(--admin-accent);font-size:1.25rem">${formatTL(toplam)}</strong>
      </div>
      <div class="data-table-wrap anim-in">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Ödeme ID</th><th>Kullanıcı</th><th>Dava</th>
            <th>Tutar</th><th>Kart Son 4</th><th>Avukat</th><th>Tarih</th><th>Durum</th>
          </tr></thead>
          <tbody>
          ${slice.map((p, i) => `<tr>
            <td style="color:var(--text-muted);font-size:0.75rem">${start + i + 1}</td>
            <td><code style="font-size:0.72rem;color:var(--text-muted)">${p.id.slice(0, 8)}…</code></td>
            <td style="font-size:0.82rem">${p.kullaniciEmail || '—'}</td>
            <td><code style="font-size:0.72rem;color:var(--text-muted)">${(p.caseId || '').slice(0, 8)}…</code></td>
            <td><strong style="color:var(--admin-accent)">${formatTL(p.tutar)}</strong></td>
            <td style="font-family:monospace;font-size:0.82rem">•••• ${p.kartSonDort || '—'}</td>
            <td style="font-size:0.8rem;color:var(--text-muted)">${p.avukatAd || '—'}</td>
            <td style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap">${formatDate(p.tarih)}</td>
            <td><span class="badge green">${p.status || 'COMPLETED'}</span></td>
          </tr>`).join('')}
          </tbody>
        </table>
        ${pgHtml(list.length, _odemePage, 'setOdemePage')}
      </div>`;
}

function setOdemePage(p) { _odemePage = p; filterOdemeler(); scrollTop(); }

// ═══════════════════════════════════════════════════════════
//  AYARLAR
// ═══════════════════════════════════════════════════════════
async function loadAyarlar() {
  try {
    const s = await apiCall('GET', '/settings/public');
    const el = document.getElementById('kidemTavaniInput'); if (el) el.value = s.kidemTavani || '';
    if (s.hizmetBedeliSkala) {
      document.getElementById('skala1').value = s.hizmetBedeliSkala[0]?.ucret || 750;
      document.getElementById('skala2').value = s.hizmetBedeliSkala[1]?.ucret || 1250;
      document.getElementById('skala3').value = s.hizmetBedeliSkala[2]?.ucret || 2000;
    }
  } catch { }
}
async function kaydetTavan() {
  const kidemTavani = document.getElementById('kidemTavaniInput')?.value;
  try { await apiCall('PUT', '/admin/ayarlar', { kidemTavani }); showToast('Kıdem tavanı güncellendi!', 'success'); }
  catch (e) { showToast(e.message, 'error'); }
}
async function kaydetSkala() {
  const s1 = document.getElementById('skala1')?.value;
  const s2 = document.getElementById('skala2')?.value;
  const s3 = document.getElementById('skala3')?.value;
  try {
    await apiCall('PUT', '/admin/ayarlar', {
      hizmetBedeliSkala: [
        { min: 0, max: 20000, ucret: parseFloat(s1) },
        { min: 20000, max: 50000, ucret: parseFloat(s2) },
        { min: 50000, max: 999999999, ucret: parseFloat(s3) }
      ]
    });
    showToast('Skala güncellendi!', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── Yardımcılar ──────────────────────────────────────────
function v(id) { return (document.getElementById(id)?.value || '').trim(); }
function scrollTop() { document.querySelector('.panel-main')?.scrollTo({ top: 0, behavior: 'smooth' }); }

function shimmerTable(cols) {
  const rows = Array(5).fill(`<tr>${Array(cols).fill('<td><div class="shimmer-row" style="height:20px;margin:0"></div></td>').join('')}</tr>`).join('');
  return `<div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>${Array(cols).fill('<th></th>').join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
}

function emptyState(icon, msg) {
  return `<div class="data-table-wrap"><div class="table-empty">
      <div class="empty-icon">${icon}</div>
      <div class="empty-title">${msg}</div>
    </div></div>`;
}

function closeAdminModal(id) {
  const el = document.getElementById(id); if (el) el.style.display = 'none';
}

// ─── DOMContentLoaded ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  adminSection('dashboard');

  // expose globals
  const fns = {
    adminSection, onayla, reddet, avDetay, banKullanici, unbanKullanici, kulDetay,
    davaDetay, kapat, filterAvukatlar, filterKullanicilar, filterDavalar, filterOdemeler,
    setAvPage, setKulPage, setDavaPage, setOdemePage, changeDavaPage: setDavaPage,
    changePageSize, clearFilter, kaydetTavan, kaydetSkala, closeAdminModal
  };
  Object.assign(window, fns);
});
