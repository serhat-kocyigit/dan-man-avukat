/**
 * HakPortal Akıllı Dava Asistanı - Frontend Wizard Motoru v2.0 (Expert Level)
 */

class LegalWizard {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.factsInput = document.getElementById('aiFacts');
        // Geriye dönük API uyumluluğu için hala tutuyoruz
        this.cikisSekliInput = document.getElementById('cikisSekli');

        this.state = {
            step: 2,
            answers: {},
            history: []
        };

        this.questions = {

            2: {
                text: "İş sözleşmesini fiilen kim sona erdirdi?",
                options: [
                    { label: "İşveren çıkardı", actions: { fesihYapan: 'isveren' }, next: 3 },
                    { label: "Ben ayrıldım (İstifa/Fesih)", actions: { fesihYapan: 'isci' }, next: 6 },
                    { label: "İşçi Vefat Etti", actions: { fesihYapan: 'vefat' }, next: 7 }
                ]
            },
            3: { // İŞVEREN NEDENİ
                text: "İşveren sizi işten çıkarırken hangi gerekçeyi öne sürdü?",
                options: [
                    { label: "Herhangi bir gerekçe göstermedi veya işler azaldı, küçülme var, performans düşük vb. dedi. (Geçerli/Haksız Neden)", actions: { isverenSebep: 'haksiz_gecerli' }, next: 4 },
                    { label: "Hırsızlık, devamsızlık, hakaret, güveni kötüye kullanma (Ahlak/İyiniyet İhlali - Md 25/II)", actions: { isverenSebep: 'ahlak' }, next: 4 },
                    { label: "Uzun süreli sağlık sorunu veya işyeri dışında zorlayıcı sebepler (Md 25/I-III)", actions: { isverenSebep: 'saglik_zorlayici' }, next: 4 },
                    { label: "Sırf sendikaya üye olduğum için çıkardı (Sendikal Neden)", actions: { isverenSebep: 'sendikal' }, next: 4 },
                    { label: "Maaşımı istedim/şikayet ettiğim için sırf inat/kötü niyetle çıkardı", actions: { isverenSebep: 'kotu_niyet' }, next: 4 }
                ]
            },
            4: { // İŞYERİ ÇALIŞAN SAYISI
                text: "Çalıştığınız işyerinde (tüm şubeleri dahil) 30 veya daha fazla işçi bulunuyor muydu?",
                options: [
                    { label: "Evet, 30'dan fazlaydık", actions: { isyeriCalisanSayisi: 'fazla' }, next: 5 },
                    { label: "Hayır, 30'dan azdık", actions: { isyeriCalisanSayisi: 'az' }, next: 5 }
                ]
            },
            5: { // ZAMAN AŞIMI KONTROLÜ
                text: "İşten çıkarılma tarihinizin (tebliğ tarihinin) üzerinden ne kadar zaman geçti?",
                options: [
                    { label: "1 (Bir) Ay henüz DOLMADI", actions: { iadeSuresiGectiMi: false }, next: 7 },
                    { label: "1 (Bir) Ay veya daha FAZLA geçti", actions: { iadeSuresiGectiMi: true }, next: 7 }
                ]
            },
            6: { // İŞÇİ NEDENİ
                text: "İşi neden siz bıraktınız (kendi feshiniz)? Hukuki dayanağınız nedir?",
                options: [
                    { label: "Kişisel sebeplerimle / Kendi mesleğim kariyerim vs. için baska ise gectim (Kuru İstifa)", actions: { isciSebep: 'istifa' }, next: 7 },
                    { label: "Maaşım, mesailerim, SGK'm eksik yattı / Mobbing, hakaret gördüm (4857 Md 24 - Haklı Neden)", actions: { isciSebep: 'hakli_neden' }, next: 7 },
                    { label: "Muvazzaf Askerlik görevim sebebiyle", actions: { isciSebep: 'askerlik' }, next: 7 },
                    { label: "Evlilik sebebiyle (Nikah sonrası 1 yıl içinde) - Kadın İşçi", actions: { isciSebep: 'evlilik' }, next: 7 },
                    { label: "Emeklilik (Yaşlılık aylığı veya 15 yıl 3600 gün şartı) tablosuna uyduğum için", actions: { isciSebep: 'emeklilik' }, next: 7 }
                ]
            },
            7: { // TİCARİ TAHSİL RİSKİ
                text: "Eski işvereninizin firmanın ticari ölçeği nasıldı? (Davayı kazandığınızda paranın tahsili için)",
                options: [
                    { label: "Büyük Şirket / Kurumsal Firma / Holding", actions: { isverenTuru: 'kurumsal' }, next: 8 },
                    { label: "Orta ve Küçük Ölçekli İşletme (KOBİ)", actions: { isverenTuru: 'kobi' }, next: 8 },
                    { label: "Küçük Esnaf (Market, Bakkal, Berber, Atölye)", actions: { isverenTuru: 'kucuk_esnaf' }, next: 8 },
                    { label: "Şirket/Dükkan Kapandı veya İflas Etti", actions: { isverenTuru: 'iflas_kapali' }, next: 8 }
                ]
            },
            8: { // İSPAT: ELDEN MAAŞ
                text: "Çalışırken maaşınızın bir bölümü (Asgari ücretin üstü) banka yerine 'Elden' veriliyor muydu?",
                options: [
                    { label: "Evet, bir kısmı tarafıma elden veriliyordu (Düşük SGK Prime esas)", actions: { eldenOdeme: 'evet' }, next: 9 },
                    { label: "Hayır, çalışma bedelinin tamamı resmi (Banka hesabı vb.) ödeniyordu", actions: { eldenOdeme: 'hayir' }, next: 9 }
                ]
            },
            9: { // İSPAT: YAZILI BELGE
                text: "İşten çıkışınıza dair elinizde resmi bir belge veya yazılı bildirim var mı? (İhtarname, Yazılı Fesih Belgesi, Sms vb.)",
                options: [
                    { label: "Evet, yazılı olarak (Evrak, Mail, Mesaj, Noter) belgelerim var", actions: { yaziliFesihBelgesi: 'evet' }, next: 95 },
                    { label: "Hayır, olay sadece sözlü gelişti. Şahitlerle kanıtlayabilirim", actions: { yaziliFesihBelgesi: 'hayir' }, next: 10 }
                ]
            },
            95: { // EVRAK YÜKLEME EKRANI
                text: "✨ Harika! Yazılı ispat belgeleriniz davanızın %80 daha hızlı ve çok daha yüksek avukat değerlendirmesiyle alınmasını sağlar.",
                customHtml: `
                    <style>
                      #wizardDropZone {
                        border: 2px dashed var(--primary);
                        border-radius: 12px;
                        padding: 24px 16px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.2s;
                        background: rgba(255,255,255,0.02);
                        margin-bottom: 12px;
                        position: relative;
                      }
                      #wizardDropZone:hover, #wizardDropZone.drag-over {
                        background: rgba(0,217,163,0.07);
                        border-color: var(--accent);
                      }
                      #wizardDropZone input[type=file] {
                        position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
                      }
                      .wiz-file-item {
                        display: flex; align-items: center; gap: 10px;
                        padding: 9px 12px;
                        background: rgba(0,217,163,0.06);
                        border: 1px solid rgba(0,217,163,0.25);
                        border-radius: 8px;
                        margin-bottom: 8px;
                        animation: fadeIn 0.2s ease;
                      }
                      .wiz-file-icon { font-size: 1.5rem; flex-shrink: 0; }
                      .wiz-file-name { flex: 1; font-size: 0.82rem; font-weight: 600; color: var(--text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                      .wiz-file-size { font-size: 0.72rem; color: var(--text-muted); flex-shrink: 0; }
                      .wiz-file-del { background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 1rem; padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
                      .wiz-file-del:hover { background: rgba(255,107,107,0.12); }
                      #wizardSlotInfo { font-size: 0.78rem; color: var(--text-muted); text-align: center; margin-bottom: 10px; }
                    </style>

                    <div id="wizardDropZone" onclick="document.getElementById('wizardEvrakUpload').click()">
                      <input type="file" id="wizardEvrakUpload" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple style="display:none;" onchange="window._wizHandleFiles(this.files)">
                      <div style="font-size: 2.4rem; margin-bottom: 8px; pointer-events:none;">📂</div>
                      <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-color); margin-bottom: 4px; pointer-events:none;">Belge seçmek için tıklayın veya sürükleyin</div>
                      <div style="font-size: 0.75rem; color: var(--text-muted); pointer-events:none;">PDF, JPG, PNG, WEBP kabul edilir • Maks. 5 MB/dosya</div>
                    </div>

                    <div id="wizardSlotInfo">0 / 3 belge eklendi</div>
                    <div id="wizardFileList"></div>

                    <button type="button" class="btn-primary btn-block" onclick="window.legalWizard.stashFilesAndContinue()" id="wizardUploadBtn" style="margin-top:4px;">
                      Belgeleri Ekle ve Hesaplamaya Geç ➔
                    </button>
                    <button type="button" class="btn-ghost btn-block" onclick="window.legalWizard.handleSelect({next:10})" style="margin-top:8px; font-size:0.85rem;">
                      Belge olmadan devam et
                    </button>
                `,
                customInit: function () {
                    window._wizFiles = window._wizFiles || [];
                    var input = document.getElementById('wizardEvrakUpload');
                    var dz = document.getElementById('wizardDropZone');
                    if (!input || !dz) return;
                    input.addEventListener('change', function () {
                        window._wizHandleFiles(this.files);
                        this.value = '';
                    });
                    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
                    dz.addEventListener('dragleave', function () { dz.classList.remove('drag-over'); });
                    dz.addEventListener('drop', function (e) {
                        e.preventDefault(); dz.classList.remove('drag-over');
                        window._wizHandleFiles(e.dataTransfer.files);
                    });
                    window._wizHandleFiles = function (newFiles) {
                        for (var i = 0; i < newFiles.length; i++) {
                            var f = newFiles[i];
                            if (window._wizFiles.length >= 3) {
                                window.HakPortal && window.HakPortal.showToast('En fazla 3 belge ekleyebilirsiniz.', 'error');
                                break;
                            }
                            if (f.size > 5242880) {
                                window.HakPortal && window.HakPortal.showToast(f.name + ' - 5 MB sinirini asiyor.', 'error');
                                continue;
                            }
                            var dup = false;
                            for (var j = 0; j < window._wizFiles.length; j++) {
                                if (window._wizFiles[j].name === f.name && window._wizFiles[j].size === f.size) { dup = true; break; }
                            }
                            if (!dup) window._wizFiles.push(f);
                        }
                        window._wizRenderFiles();
                    };
                    window._wizRenderFiles = function () {
                        var list = document.getElementById('wizardFileList');
                        var info = document.getElementById('wizardSlotInfo');
                        var dropZ = document.getElementById('wizardDropZone');
                        var count = window._wizFiles.length;
                        if (info) info.textContent = count + ' / 3 belge eklendi';
                        if (dropZ) {
                            dropZ.style.opacity = count >= 3 ? '0.4' : '1';
                            dropZ.style.pointerEvents = count >= 3 ? 'none' : '';
                        }
                        if (!list) return;
                        var html = '';
                        for (var i = 0; i < window._wizFiles.length; i++) {
                            var f = window._wizFiles[i];
                            var ext = f.name.split('.').pop().toLowerCase();
                            var icon = ext === 'pdf' ? '📄 PDF' : (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') ? '🖼 IMG' : '📁 DOC';
                            var size = f.size < 1048576 ? Math.round(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB';
                            html += '<div class="wiz-file-item">'
                                + '<span class="wiz-file-icon">' + icon + '</span>'
                                + '<span class="wiz-file-name" title="' + f.name + '">' + f.name + '</span>'
                                + '<span class="wiz-file-size">' + size + '</span>'
                                + '<button class="wiz-file-del" onclick="window._wizRemoveFile(' + i + ')" title="Kaldir">x</button>'
                                + '</div>';
                        }
                        list.innerHTML = html;
                    };
                    window._wizRemoveFile = function (idx) {
                        window._wizFiles.splice(idx, 1);
                        window._wizRenderFiles();
                    };
                    window._wizRenderFiles();
                }
            }

        };

        if (this.container) this.render();
    }

    handleSelect(option) {
        // Option üzerinde belirtilen Actions var ise kaydet
        if (option.actions) {
            this.state.answers = { ...this.state.answers, ...option.actions };
        }

        if (option.next === 10) {
            this.renderFinish();
        } else if (option.next) {
            this.state.history.push(this.state.step); // Geri tuşu için
            this.state.step = option.next;
            this.render();
        }
    }

    goBack() {
        if (this.state.history.length > 0) {
            this.state.step = this.state.history.pop();
            this.render();
        }
    }

    async stashFilesAndContinue() {
        const btn = document.getElementById('wizardUploadBtn');

        // Yeni UI: window._wizFiles array'ini kullan
        // Eski fallback: eski input elemanını kullan
        let files = (window._wizFiles && window._wizFiles.length > 0)
            ? window._wizFiles
            : (() => {
                const inp = document.getElementById('wizardEvrakUpload');
                return (inp && inp.files && inp.files.length > 0) ? Array.from(inp.files) : [];
            })();

        if (files.length > 0) {
            if (files.length > 3) {
                window.HakPortal?.showToast('En fazla 3 dosya seçebilirsiniz.', 'error');
                return;
            }
            for (const f of files) {
                if (f.size > 5 * 1024 * 1024) {
                    window.HakPortal?.showToast(`${f.name} boyutu 5MB'dan büyük olamaz.`, 'error');
                    return;
                }
            }
            window._wizardStashedFiles = files;

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = `<span style="display:inline-block; animation:spin 1s linear infinite">⏳</span> Yapay Zeka Evrakları İnceliyor...`;
            }

            try {
                const token = localStorage.getItem('hp_token') || '';
                let allDates = [], allMoneys = [], allLabels = [];
                let dominantFesihTur = null; // ← YENİ: belgenin tespit ettiği fesih türü

                for (const file of files) {
                    const formData = new FormData();
                    formData.append('dosya', file);
                    const res = await fetch('/api/analyzer/scan', {
                        method: 'POST', body: formData,
                        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.analysis) {
                            allDates.push(...(data.analysis.dates || []));
                            allMoneys.push(...(data.analysis.moneys || []));
                            allLabels.push(...(data.analysis.labels || []));
                            // ← Belgenin dominant fesih türünü al (sadece ilk non-null olanı)
                            if (!dominantFesihTur && data.analysis.fesihTuru) {
                                dominantFesihTur = data.analysis.fesihTuru;
                            }
                        }
                    }
                }

                allDates = [...new Set(allDates)];
                allMoneys = [...new Set(allMoneys)];
                allLabels = [...new Set(allLabels)];

                // OCR sonuçlarını aiFacts'e göm (fesihTuru dahil!)
                this.state.answers.ocrSonuclari = {
                    tarihler: allDates,
                    ucretler: allMoneys,
                    etiketler: allLabels,
                    fesihTuru: dominantFesihTur   // ← KRİTİK: backend'in alternatif senaryo üretmesi için
                };

                // ─── Kullanıcının beyanıyla karşılaştır ─────────────────────────
                const userSebep = this.state.answers.isciSebep || this.state.answers.isverenSebep || this.state.answers.cikisSekli || '';

                // Fesih Türü → Okunabilir Türkçe etiket
                const fesihTurLabel = {
                    'ISVEREN_FESHI_GECERLI': 'İşveren Geçerli Fesih (4857/17)',
                    'ISVEREN_FESHI_AHLAK': 'İşveren Haklı Fesih / Ahlak-25/2',
                    'ISCI_ISTIFASI': 'İşçi İstifası',
                    'IKALE_IBRANAME': 'İkale/İbraname'
                }[dominantFesihTur] || dominantFesihTur;

                // Beyan → Okunabilir
                const userLabel = {
                    'askerlik': 'Askerlik',
                    'emeklilik': 'Emeklilik',
                    'istifa': 'İstifa',
                    'hakli_neden': 'Haklı Neden (24.md)',
                    'haksiz_gecerli': 'İşveren Haksız Fesih',
                    'ahlak': 'İşveren 25/2 Fesih',
                    'saglik': 'Sağlık Sebebi'
                }[userSebep] || userSebep;

                // Çelişki tespiti
                const cakisma = dominantFesihTur &&
                    !((userSebep === 'askerlik' || userSebep === 'emeklilik' || userSebep === 'hakli_neden') && dominantFesihTur === 'ISVEREN_FESHI_GECERLI') &&
                    !((userSebep === 'haksiz_gecerli') && dominantFesihTur === 'ISVEREN_FESHI_GECERLI') &&
                    !((userSebep === 'istifa') && dominantFesihTur === 'ISCI_ISTIFASI') &&
                    !((userSebep === 'ahlak') && dominantFesihTur === 'ISVEREN_FESHI_AHLAK');

                // ─── Sonuç Kartı ─────────────────────────────────────────────────
                let html = `<div style="text-align:left;">`;

                if (cakisma && dominantFesihTur) {
                    // 🔴 ÇAKIŞMA KARTI
                    html += `
                    <div style="border:2px solid #e63946; border-radius:12px; overflow:hidden; margin-bottom:14px;">
                      <div style="background:#e63946; color:#fff; padding:10px 14px; font-weight:700; font-size:0.9rem; display:flex; align-items:center; gap:8px;">
                        🛑 BELGE & BEYAN ÇAKIŞMASI TESPİT EDİLDİ
                      </div>
                      <div style="display:grid; grid-template-columns:1fr 1fr; background:rgba(0,0,0,0.15);">
                        <div style="padding:12px; border-right:1px dashed rgba(255,255,255,0.1);">
                          <div style="font-size:0.7rem; color:rgba(255,255,255,0.5); text-transform:uppercase; margin-bottom:4px;">Beyanınız</div>
                          <div style="font-size:1rem; font-weight:700; color:#fff;">📋 ${userLabel || '—'}</div>
                          <div style="font-size:0.75rem; color:rgba(255,255,255,0.6); margin-top:4px;">Formda işaretlediğiniz çıkış sebebi</div>
                        </div>
                        <div style="padding:12px; background:rgba(230,57,70,0.15);">
                          <div style="font-size:0.7rem; color:#fca311; text-transform:uppercase; margin-bottom:4px;">Belgede Görünen</div>
                          <div style="font-size:1rem; font-weight:700; color:#fca311;">📄 ${fesihTurLabel}</div>
                          <div style="font-size:0.75rem; color:rgba(255,200,100,0.7); margin-top:4px;">Evraktan optik okuma ile tespit</div>
                        </div>
                      </div>
                      <div style="padding:10px 14px; background:rgba(230,57,70,0.1); font-size:0.8rem; color:rgba(255,255,255,0.75); line-height:1.4;">
                        ⚡ Sistem her iki senaryoyu da ayrı ayrı hesaplayacak. Hesaplama tamamlandığında iki farklı tazminat tutarını yan yana göreceksiniz. Avukatınız gerçek senaryoyu belirleyecektir.
                      </div>
                    </div>`;
                } else if (dominantFesihTur) {
                    // ✅ UYUM KARTI
                    html += `
                    <div style="border:2px solid var(--accent); border-radius:12px; overflow:hidden; margin-bottom:14px;">
                      <div style="background:var(--accent); color:#000; padding:10px 14px; font-weight:700; font-size:0.9rem;">
                        ✅ BELGE VE BEYANINIZ UYUMLU
                      </div>
                      <div style="padding:12px; background:rgba(0,0,0,0.1); font-size:0.85rem; color:var(--text-primary); line-height:1.5;">
                        Belgeden okunan fesih türü (<b>${fesihTurLabel}</b>) beyanınızla örtüşüyor. İspat gücünüz yüksek.
                      </div>
                    </div>`;
                }

                // Genel OCR bulgular
                html += `<div style="background:rgba(255,255,255,0.04); padding:12px; border-radius:8px; margin-bottom:14px; font-size:0.82rem; line-height:1.6;">`;
                if (allMoneys.length > 0) html += `💰 <b>Para Değerleri:</b> ${allMoneys.join(' · ')}<br>`;
                if (allDates.length > 0) html += `📅 <b>Tarih İbareleri:</b> ${allDates.join(' · ')}<br>`;
                if (allLabels.length > 0) html += `🏷️ <b>Hukuki Nitelendirmeler:</b> ${allLabels.join(' · ')}`;
                if (!allMoneys.length && !allDates.length && !allLabels.length) {
                    html += `<span style="color:var(--text-muted);">Net metin/tarih okunamadı. Avukatlarımız belgeyi manuel inceleyecektir.</span>`;
                }
                html += `</div>`;

                html += `<button type="button" class="btn-primary btn-block" onclick="window.legalWizard.handleSelect({next:10})">
                    ${cakisma ? '🔢 Her İki Senaryoyu Hesapla →' : '✅ Hesaplamaya Geç →'}
                </button>`;
                html += `</div>`;

                this.container.innerHTML = html;
                return;

            } catch (e) {
                console.error("OCR Analysis error:", e);
                this.handleSelect({ next: 10 });
            }

        } else {
            window._wizardStashedFiles = null;
            window._wizFiles = [];
            this.handleSelect({ next: 10 });
        }
    }


    restart() {
        this.state.step = 2;
        this.state.history = [];
        this.state.answers = {};
        if (this.factsInput) this.factsInput.value = "{}";
        if (this.cikisSekliInput) this.cikisSekliInput.value = "";
        this.render();
    }

    render() {
        const q = this.questions[this.state.step];
        if (!q) return;

        let html = `
            <div style="animation: fadeIn 0.3s ease-in-out;">
                ${this.state.history.length > 0 ?
                `<button type="button" onclick="window.legalWizard.goBack()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.85rem; padding:0 0 10px 0;">← Geri</button>`
                : ''}
                <p style="font-weight:600; font-size:1.05rem; color:var(--text-primary); margin-bottom:15px;">🔍 ${q.text}</p>
                <div style="display:flex; flex-direction:column; gap:10px;">
        `;

        if (q.customHtml) {
            html += q.customHtml;
        } else {
            q.options.forEach((opt, idx) => {
                // Buton HTML inşası - Object'ten JSON üretirken tırnaklara çok dikkat!
                const actStr = JSON.stringify(opt.actions || {}).replace(/"/g, '&quot;');
                html += `
                    <button type="button" 
                            onclick='window.legalWizard.handleSelect({ next: ${opt.next || 10}, actions: ${actStr} })'
                            style="text-align:left; padding:12px 15px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--text-primary); cursor:pointer; transition:all 0.2s; font-size:0.95rem;">
                        ${opt.label}
                    </button>
                `;
            });
        }

        html += `</div></div>`;
        this.container.innerHTML = html;

        // customInit varsa innerHTML DOM'a eklendikten SONRA cagir
        // (innerHTML icindeki script taglar tarayici tarafindan calistirilmaz)
        if (q.customInit) {
            setTimeout(() => q.customInit(), 0);
        }

        const btns = this.container.querySelectorAll('button');
        btns.forEach(b => {
            // Sadece ok tuşu olmayan butonlara hover ekle
            if (b.innerText.includes('←')) return;
            b.addEventListener('mouseover', () => { b.style.borderColor = 'var(--primary)'; b.style.backgroundColor = 'var(--bg-surface)'; });
            b.addEventListener('mouseout', () => { b.style.borderColor = 'var(--border)'; b.style.backgroundColor = 'var(--bg)'; });
        });
    }

    renderFinish() {
        // Gelen yanıtları DOM'daki gizli alana bas
        if (this.factsInput) {
            this.factsInput.value = JSON.stringify(this.state.answers);
        }

        // Geriye Dönük API'yi yanıltmamak adına bir legacy 'cikisSekli' string'i üret:
        let legacyCikis = "isverenTarafindan";
        if (this.state.answers.fesihYapan === 'isci') {
            legacyCikis = (this.state.answers.isciSebep === 'hakli_neden') ? 'hakliFesihIsci' :
                (this.state.answers.isciSebep === 'istifa') ? 'isciIstifasi' : this.state.answers.isciSebep;
        } else if (this.state.answers.isverenSebep === 'ahlak') {
            legacyCikis = "asilliNeden";
        }
        if (this.cikisSekliInput) this.cikisSekliInput.value = legacyCikis;

        this.container.innerHTML = `
            <div style="animation: fadeIn 0.3s ease-in-out; padding:15px; background:rgba(45,106,79,0.15); border:1px solid #2d6a4f; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-size:1.2rem; margin-right:8px;">✅</span>
                    <strong style="color:#52b788;">Hukuki Olgularınız Analiz Edildi.</strong> 
                    <div style="color:#74c69d; font-size:0.85rem; margin-top:5px;">Sistem sizin için en uygun hak ediş modelini otomatik hesaplayacaktır. Puan: 10/10</div>
                </div>
                <button type="button" onclick="window.legalWizard.restart()" style="background:transparent; border:none; color:var(--primary-light); cursor:pointer; text-decoration:underline; font-size:0.85rem;">Değiştir</button>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('aiWizardContainer');
    if (container) window.legalWizard = new LegalWizard('aiWizardContainer');

    // Panel hesaplama formu için güvenlik önlemi
    const checkWizard = (e) => {
        const cikisVal = document.getElementById('cikisSekli')?.value;
        const factsVal = document.getElementById('aiFacts')?.value;
        if (!cikisVal || factsVal === "{}") {
            e.preventDefault();
            window.HakPortal.showToast("Lütfen Akıllı Karar Asistanı adımlarını cevaplayın.", "error");
        }
    };

    const hForm = document.getElementById('hesaplamaForm');
    if (hForm) hForm.addEventListener('submit', checkWizard);

    const pForm = document.getElementById('panelHesaplamaForm');
    if (pForm) pForm.addEventListener('submit', checkWizard);
});
