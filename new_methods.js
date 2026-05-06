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
        <div class="dava-card">
          <div class="dava-card-header">
            <div>
              <div class="dava-card-title">${t.kullanici?.ad} ${t.kullanici?.soyad}</div>
              <div class="dava-card-sub">${_formatDate()(t.createdAt)}</div>
            </div>
            <span class="status-badge status-${t.status}">${t.status === 'BEKLIYOR' ? '⏳ Bekliyor' : t.status === 'KABUL' ? '✅ Kabul Edildi' : '❌ Reddedildi'}</span>
          </div>
          <div class="dava-card-body">
            ${t.dava ? `<div class="dava-detail-row">
              <span>İlgili Dava Dosyası</span>
              <span>${t.dava.davaTuru} (${_formatTL()(t.dava.tahminiAlacak)})</span>
            </div>` : ''}
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;margin-top:8px;">
               <strong>Kullanıcı Mesajı:</strong><br/>
               ${t.not || 'Mesaj bırakılmamış.'}
            </div>
          </div>
          <div class="dava-card-actions">
            ${t.status === 'BEKLIYOR' ? `
            <button class="btn-primary" style="font-size:0.85rem;padding:10px 16px;width:100%;margin-bottom:8px;" onclick="iletisimTalebiKabulEt('${t.id}')">✅ Kabul Et (İletişim Bilgilerini Gör)</button>
            <button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%;color:#ff6b6b;border-color:#ff6b6b;" onclick="iletisimTalebiReddet('${t.id}')">❌ Temsili Reddet</button>
            ` : `
              <button class="btn-ghost" style="font-size:0.85rem;padding:10px 16px;width:100%;" disabled>
                ${t.status === 'KABUL' ? '✅ Talebi Kabul Ettiniz' : '❌ Talebi Reddettiniz'}
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
              <div class="dava-card-sub">${t.sehir}</div>
            </div>
            <span class="status-badge status-ACTIVE">${t.status === 'PRE_CASE_REVIEW' ? '🧐 Ön İnceleme' : t.status === 'PENDING_USER_AUTH' ? '⏳ Vekalet İsteğinde' : t.status === 'AUTHORIZED' ? '✅ Vekalet Onaylı' : t.status === 'FILED_IN_COURT' ? '🏛️ Dava Açıldı' : '🟢 Aktif'}</span>
          </div>
          <div class="dava-card-body">
            <div class="dava-detail-row">
              <span>Tahmini Alacak</span>
              <span class="alacak">${_formatTL()(t.tahminiAlacak)}</span>
            </div>
            ${t.kullanici?.ad ? `
            <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border); display:flex; gap:10px; align-items:center;">
              <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;background:var(--primary-dark);display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:1.1rem;color:#fff;">
                ${t.kullanici.avatar ? `<img src="${t.kullanici.avatar}" style="width:100%;height:100%;object-fit:cover;">` : t.kullanici.ad.charAt(0)}
              </div>
              <div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Müvekkil İletişim Bilgileri:</div>
                <div style="font-size:0.9rem;font-weight:700">${t.kullanici.ad} ${t.kullanici.soyad}</div>
                ${t.kullanici.email ? `
                  <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px; word-break:break-all;">
                    📧 ${t.kullanici.email}
                  </div>
                  <div style="font-size:0.8rem;color:var(--text-secondary);">
                    📞 ${t.kullanici.telefon || '—'}
                  </div>
                ` : `
                  <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;padding:4px 8px;background:rgba(255,255,255,0.04);border-radius:4px;border:1px dashed rgba(255,255,255,0.1);">
                    🔒 İletişim bilgileri henüz gizli
                  </div>
                `}
              </div>
            </div>
            ` : ''}

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
