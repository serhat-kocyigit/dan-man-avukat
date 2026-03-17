// =============================================
// HakPortal - Hesaplama Motoru (hesaplama.js)
// =============================================

let lastHesaplamaResult = null;

document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('#isCikisTarihi, #pIsCikisTarihi').forEach(el => el.max = today);
});

const hesaplamaForm = document.getElementById('hesaplamaForm');
if (hesaplamaForm) {
  hesaplamaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await doHesaplama();
  });
}

async function doHesaplama() {
  const btn = document.getElementById('hesaplaBtn');
  const btnText = document.getElementById('hesaplaBtnText');
  const spinner = document.getElementById('hesaplaSpinner');

  const cSecimi = document.getElementById('cikisSekli')?.value;
  const cGercekler = document.getElementById('aiFacts')?.value;
  if (!cSecimi || !cGercekler || cGercekler === '{}') {
    window.HakPortal.showToast('Öncelikle soru-cevap kısmını bitirmeniz bekleniyor.', 'error');
    return;
  }

  const cikisVal = document.getElementById('isCikisTarihi')?.value;
  if (cikisVal && cikisVal > new Date().toISOString().split('T')[0]) {
    window.HakPortal.showToast('İşten çıkış tarihiniz bugünden ileride olamaz.', 'error');
    return;
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (spinner) spinner.style.display = 'inline-block';

  const payload = {
    cikisSekli: document.getElementById('cikisSekli')?.value,
    isGirisTarihi: document.getElementById('isGirisTarihi')?.value,
    isCikisTarihi: document.getElementById('isCikisTarihi')?.value,
    brutMaas: document.getElementById('brutMaas')?.value,
    yanHaklar: document.getElementById('yanHaklar')?.value || '0',
    kullanilmayanIzin: document.getElementById('kullanilmayanIzin')?.value || '0',
    fazlaMesai: document.getElementById('fazlaMesai')?.value || '0',
    odenmemisMaasGun: document.getElementById('odenmemisMaasGun')?.value || '0',
    kumulatifMatrah: document.getElementById('kumulatifMatrah')?.value || '0',
    aiFacts: document.getElementById('aiFacts')?.value || '{}'
  };

  try {
    const result = await window.HakPortal.apiCall('POST', '/hesaplama/kidem-ihbar', payload);
    lastHesaplamaResult = result;
    showResult(result);
    window.HakPortal.showToast('Hesaplama tamamlandı!', 'success');
  } catch (err) {
    window.HakPortal.showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.style.display = 'inline';
    if (spinner) spinner.style.display = 'none';
  }
}

function showResult(result) {
  const resultSide = document.getElementById('calcResultSide');
  const resultSure = document.getElementById('resultSure');
  const resultCards = document.getElementById('resultCards');
  const resultTotal = document.getElementById('resultTotal');
  const avukatBtn = document.getElementById('avukatTeklifBtn');

  if (!resultSide) return;
  resultSide.style.display = 'block';
  resultSide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const fmt = window.HakPortal.formatTL;

  // SKORLAMA BLOGU
  let skorHtml = '';
  if (result.skorlama) {
    const s = result.skorlama;
    const bgKat = s.kategori === 'PREMIUM' ? '#fb5607'
      : s.kategori === 'NORMAL' ? '#3a86ff'
        : s.kategori === 'RISKLI' ? '#ffbe0b'
          : '#ff006e';
    let riskNotesList = '';
    if (s.notlar && s.notlar.length > 0) {
      riskNotesList = '<ul style="margin:10px 0 0 0; padding-left:14px; list-style-type:square; font-size:0.8rem; color:var(--text-secondary); line-height:1.4;">' +
        s.notlar.map(n => `<li><span style="color:#e63946">&#x26A0;&#xFE0F;</span> ${n}</li>`).join('') +
        '</ul>';
    }
    const tahsilatVal = s.tahsilat ?? s.tahsil ?? 0;
    skorHtml = `
      <div style="margin-bottom:20px; padding:15px; background:var(--bg-card); border-left:4px solid ${bgKat}; border-radius:8px;">
        <h4 style="margin:0 0 10px 0; color:${bgKat}; font-size:1.1rem; display:flex; justify-content:space-between; align-items:center;">
          <span>&#x1F916; Dosya Risk ve &#x130;spat Skorunuz</span>
          <span style="color:var(--text-primary); font-size:1.2rem; font-weight:800">${s.toplam}<span style="font-size:0.8rem;color:var(--text-muted)">/100</span></span>
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; border-top:1px dashed rgba(255,255,255,0.05); padding-top:10px;">
          <div style="text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted);">Hak Do&#x11F;umu</div>
            <div style="font-size:1rem; font-weight:700; color:var(--primary-light);">${s.hukuki}/100</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted);">&#x130;spat / Delil</div>
            <div style="font-size:1rem; font-weight:700; color:${s.veri < 50 ? '#e63946' : 'var(--accent)'};">${s.veri}/100</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted);">Tahsilat &#x130;htimali</div>
            <div style="font-size:1rem; font-weight:700; color:${tahsilatVal < 50 ? '#e63946' : 'var(--accent)'};">${tahsilatVal}/100</div>
          </div>
        </div>
        ${riskNotesList}
        <div style="font-size:0.8rem; margin-top:15px; color:var(--text-secondary); line-height:1.4;">Puan&#x131;n&#x131;z avukatlar taraf&#x131;ndan g&#xF6;r&#xFC;lecek ve davan&#x131;z&#x131;n al&#x131;nma h&#x131;z&#x131;n&#x131; etkileyecektir. Eksik evrak/delil beyan&#x131;ndan ka&#xE7;&#x131;n&#x131;n.</div>
      </div>`;
  }

  // HUKUKI GEREKCÉ BLOGU
  let legalHtml = '';
  if (result.legal && result.legal.gerekce) {
    legalHtml = `
      <div style="margin-bottom:20px; padding:15px; background:var(--bg-surface); border-left:4px solid var(--primary); border-radius:8px;">
        <h4 style="margin:0 0 10px 0; color:var(--primary); font-size:1.1rem;">&#x2696;&#xFE0F; Hukuki Gerek&#xE7;e ve Nitelendirme</h4>
        <p style="margin:0; font-size:0.95rem; color:var(--text-primary); line-height:1.5;">${result.legal.gerekce}</p>
        ${result.legal.uyarilar && result.legal.uyarilar.length > 0
        ? `<div style="margin-top:10px; padding:8px; background:rgba(250,173,20,0.15); color:#d48806; font-size:0.85rem; border-radius:5px;">
               <strong>&#x26A0;&#xFE0F; Motor Uyard&#x131;s&#x131;:</strong> ${result.legal.uyarilar.join('<br>')}
             </div>` : ''}
      </div>`;
  }

  // KIDEM + IHBAR
  const kidemHakkedis = result.kidem && result.kidem.net > 0;
  const ihbarHakkedis = result.ihbar && result.ihbar.net > 0;

  // EXTRA KARTLAR
  let extraCards = '';
  if (result.diger) {
    const d = result.diger;
    if (d.izinBrut > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
        <div style="font-size:0.75rem;color:var(--text-muted)">&#x1F334; Kullan&#x131;lmayan Y&#x131;ll&#x131;k &#x130;zin</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--accent)">${fmt(d.izinBrut)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">Br&#xFC;t pro-rata g&#xFC;n hesab&#x131;</div>
      </div>`;
    if (d.mesaiBrut > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
        <div style="font-size:0.75rem;color:var(--text-muted)">&#x23F1;&#xFE0F; Fazla Mesai &#xDC;creti</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--accent)">${fmt(d.mesaiBrut)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">%150 (x1.5) &#xE7;arpan&#x131;yla</div>
      </div>`;
    if (d.odenmemisMaasBrut > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
        <div style="font-size:0.75rem;color:var(--text-muted)">&#x1F4BC; &#xD6;denmemi&#x15F; Maa&#x15F;</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--accent)">${fmt(d.odenmemisMaasBrut)}</div>
      </div>`;
    if (d.kotuNiyetNet > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #ff4d4f;margin-top:12px">
        <div style="font-size:0.75rem;color:#ff4d4f">&#x1F6A8; K&#xF6;t&#xFC; Niyet Tazminat&#x131;</div>
        <div style="font-size:1.1rem;font-weight:700;color:#ff4d4f">${fmt(d.kotuNiyetNet)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">&#x130;hbar Tazminat&#x131;n&#x131;n 3 kat&#x131;</div>
      </div>`;
    if (d.sendikalNet > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #1890ff;margin-top:12px">
        <div style="font-size:0.75rem;color:#1890ff">&#x1F6A9; Sendikal Tazminat</div>
        <div style="font-size:1.1rem;font-weight:700;color:#1890ff">${fmt(d.sendikalNet)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">1 Y&#x131;ll&#x131;k &#xFC;cret tutar&#x131;</div>
      </div>`;
    if (d.bakiyeSureTazminatBrut > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border);margin-top:12px">
        <div style="font-size:0.75rem;color:var(--text-muted)">&#x23F3; Bakiye S&#xFC;re &#xDC;creti</div>
        <div style="font-size:1.1rem;font-weight:700;color:var(--accent)">${fmt(d.bakiyeSureTazminatBrut)}</div>
      </div>`;
    if (d.bostaGecenSureBrut > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #52c41a;margin-top:12px">
        <div style="font-size:0.75rem;color:#52c41a">&#x2696;&#xFE0F; Bo&#x15F;ta Ge&#xE7;en S&#xFC;re (&#x130;&#x15F;e &#x130;ade)</div>
        <div style="font-size:1.1rem;font-weight:700;color:#52c41a">${fmt(d.bostaGecenSureBrut)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">Maks. 4 ay</div>
      </div>`;
    if (d.iseBaslatmamaBrut > 0) extraCards += `
      <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:2px solid #faad14;margin-top:12px">
        <div style="font-size:0.75rem;color:#faad14">&#x2696;&#xFE0F; &#x130;&#x15F;e Ba&#x15F;latmama Tazminat&#x131;</div>
        <div style="font-size:1.1rem;font-weight:700;color:#faad14">${fmt(d.iseBaslatmamaBrut)}</div>
      </div>`;
  }

  // CIFT SENARYO KARTI
  let ciftSenaryoHtml = '';
  if (result.alternatifSenaryo) {
    const alt = result.alternatifSenaryo;
    ciftSenaryoHtml = `
      <div style="margin-top:16px; border:2px solid #e63946; border-radius:10px; overflow:hidden;">
        <div style="background:#e63946; color:#fff; padding:10px 14px; font-size:0.9rem; font-weight:700;">
          &#x1F6D1; &#xC7;AKI&#x15E;AN SENARYO &mdash; Belgedeki Fesih T&#xFC;r&#xFC; Beyan&#x131;n&#x131;zla E&#x15F;le&#x15F;miyor
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr;">
          <div style="padding:14px; border-right:1px dashed rgba(255,255,255,0.1); background:rgba(255,255,255,0.02);">
            <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">Beyan&#x131;n&#x131;za G&#xF6;re</div>
            <div style="font-size:0.85rem; margin-bottom:3px;">K&#x131;dem: <b>${fmt(result.kidem?.net || 0)}</b></div>
            <div style="font-size:0.85rem; margin-bottom:3px;">&#x130;hbar: <b>${fmt(result.ihbar?.net || 0)}</b></div>
            <div style="font-size:0.75rem; color:var(--text-muted);">+ Di&#x11F;er Alacaklar</div>
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1); font-size:1.1rem; font-weight:800; color:var(--accent);">${fmt(result.toplamNet)}</div>
          </div>
          <div style="padding:14px; background:rgba(230,57,70,0.07);">
            <div style="font-size:0.7rem; color:#e63946; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">${alt.aciklama}</div>
            <div style="font-size:0.85rem; margin-bottom:3px;">K&#x131;dem: <b>${fmt(alt.kidem.net)}</b></div>
            <div style="font-size:0.85rem; margin-bottom:3px;">&#x130;hbar: <b>${fmt(alt.ihbar.net)}</b></div>
            <div style="font-size:0.75rem; color:var(--text-muted);">+ Di&#x11F;er Alacaklar</div>
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed rgba(230,57,70,0.3); font-size:1.1rem; font-weight:800; color:#e63946;">${fmt(alt.toplamNet)}</div>
          </div>
        </div>
        <div style="padding:10px 14px; background:rgba(230,57,70,0.07); font-size:0.78rem; color:var(--text-secondary); line-height:1.4;">
          &#x26A1; Belge "<b>${alt.aciklama}</b>" senaryosuna i&#x15F;aret ediyor. Avukat&#x131;n&#x131;z hangi senaryonun ge&#xE7;erli oldu&#x11F;unu belirleyecektir.
        </div>
      </div>`;
  }

  // BIRLESTIR
  if (resultSure) {
    resultSure.innerHTML = `
      ${skorHtml}
      ${legalHtml}
      <div class="result-total">
        <span class="total-label">Tahmini Toplam Net Alacak</span>
        <span class="total-amount">${fmt(result.toplamNet)}</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0">
        <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:0.75rem;color:var(--text-muted)">K&#x131;dem Tazminat&#x131;</div>
          <div style="font-size:1.1rem;font-weight:700;color:${kidemHakkedis ? 'var(--accent)' : 'var(--text-muted)'}">
            ${kidemHakkedis ? fmt(result.kidem.net) : 'Hak yok'}
          </div>
          ${kidemHakkedis ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">Tam Y&#x131;l/K&#x131;smi Y&#x131;l Esas&#x131; (Damga D&#xFC;&#x15F;&#xFC;lm&#xFC;&#x15F;t&#xFC;r)</div>' : ''}
        </div>
        <div style="background:var(--bg-surface);padding:12px;border-radius:10px;border:1px solid var(--border)">
          <div style="font-size:0.75rem;color:var(--text-muted)">&#x130;hbar Tazminat&#x131;</div>
          <div style="font-size:1.1rem;font-weight:700;color:${ihbarHakkedis ? 'var(--primary-light)' : 'var(--text-muted)'}">
            ${ihbarHakkedis ? fmt(result.ihbar.net) : 'Hak yok'}
          </div>
          ${ihbarHakkedis ? '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:6px;">Giydirilmi&#x15F; &#xDC;cret Bazl&#x131; NET Hak edi&#x15F;</div>' : ''}
        </div>
      </div>
      ${extraCards}
      ${ciftSenaryoHtml}
      <div class="result-disclaimer">Bu hesaplama 2026 Gelir Vergisi Dilimleri ile Yarg&#x131;tay Standartlar&#x131;nda net/br&#xFC;t matrah mant&#x131;klar&#x131;na g&#xF6;re haz&#x131;rlanm&#x131;&#x15F;t&#x131;r. Bilgi ama&#xE7;l&#x131;d&#x131;r.</div>`;
  }

  if (resultCards) resultCards.innerHTML = '';
  if (resultTotal) resultTotal.textContent = '';
  if (avukatBtn) avukatBtn.style.display = result.toplamNet > 0 ? 'flex' : 'none';
}

function resetForm() {
  const form = document.getElementById('hesaplamaForm');
  const resultSide = document.getElementById('calcResultSide');
  if (form) form.reset();
  if (resultSide) resultSide.style.display = 'none';
  lastHesaplamaResult = null;
  document.getElementById('hesaplama')?.scrollIntoView({ behavior: 'smooth' });
}

async function avukatTeklifAl() {
  if (!window.HakPortal.Auth.isLoggedIn()) {
    window.HakPortal.showToast('Lütfen teklif almak için önce sisteme giriş yapın veya kayıt olun.', 'info');
    window.openModal('authModal');
    window.switchTab('giris');
    return;
  }
  const role = window.HakPortal.Auth.getRole();
  if (role !== 'kullanici') {
    window.HakPortal.showToast('Bu özellik yalnızca kullanıcı hesapları için geçerlidir.', 'error');
    return;
  }
  window.openModal('teklifModal');
}

async function olusturCase() {
  if (!lastHesaplamaResult) {
    window.HakPortal.showToast('Önce hesaplama yapmanız gerekiyor.', 'error');
    return;
  }
  const user = window.HakPortal.Auth.getUser() || {};
  const sehir = user.sehir || 'İstanbul';
  const davaTuru = document.getElementById('teklifDavaTuru')?.value;
  const errorEl = document.getElementById('teklifError');
  try {
    await window.HakPortal.apiCall('POST', '/cases', {
      sehir,
      davaTuru,
      tahminilAcak: lastHesaplamaResult.toplamNet,
      hesaplamaVerisi: lastHesaplamaResult
    });
    window.closeModal('teklifModal');
    window.HakPortal.showToast('Dava dosyanız oluşturuldu! Avukatlar teklif sunmaya başlayacak.', 'success');
    setTimeout(() => { window.location.href = '/panel.html'; }, 1500);
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
  }
}

// ── ÖN DEĞERLENDİRME TESTİ (Ana Sayfa) ─────────────────────────────────────
function evaluateHomePreTest() {
  const kimCikardi = document.getElementById('hmpKimCikardi')?.value;
  const sure = document.getElementById('hmpSure')?.value;
  const maas = document.getElementById('hmpMaas')?.value;

  if (!kimCikardi || !sure || !maas) {
    window.HakPortal.showToast('Lütfen tüm alanları doldurun.', 'error');
    return;
  }

  // Ön değerlendirme: hak doğar mı?
  const hakkVar = !(kimCikardi === 'ben' && sure === 'az'); // istifa + <6ay => hak zayıf

  const preContainer = document.getElementById('homePreTestContainer');
  const calcWrapper = document.getElementById('homeCalcWrapper');

  if (preContainer) preContainer.style.display = 'none';
  if (calcWrapper) calcWrapper.style.display = 'grid';

  // Öntestten gelen ipuçlarını wizard'a aktar
  if (window.legalWizard) {
    if (kimCikardi === 'isveren') {
      window.legalWizard.state.answers.fesihYapan = 'isveren';
    } else {
      window.legalWizard.state.answers.fesihYapan = 'isci';
    }
  }

  if (!hakkVar) {
    window.HakPortal.showToast('Ön değerlendirme: 6 aydan az çalışıp kendi isteğiyle ayrılanlarda kıdem hakkı genellikle doğmaz. Yine de hesaplayabilirsiniz.', 'info');
  }
}

window.doHesaplama = doHesaplama;
window.resetForm = resetForm;
window.avukatTeklifAl = avukatTeklifAl;
window.olusturCase = olusturCase;
window.evaluateHomePreTest = evaluateHomePreTest;
