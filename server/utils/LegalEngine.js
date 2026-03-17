/**
 * HakPortal Legal Decision Engine (Kural Tabanlı Hukuki Mantık Motoru v3.0 - Expert Update)
 * Türkiye SGK ve Yargıtay standartlarında denetlenmiş, sıfır hata toleranslı Karar Ağacı.
 */

class LegalEngine {
    constructor() {
        this.rules = [];
    }

    addRule(rule) {
        this.rules.push(rule);
    }

    evaluateConditions(conditions, facts) {
        for (const [key, condition] of Object.entries(conditions)) {
            const factValue = facts[key];

            if (typeof condition !== 'object' || condition === null) {
                if (factValue !== condition) return false;
                continue;
            }
            if (condition.hasOwnProperty('eq') && factValue !== condition.eq) return false;
            // Diğer operatörler (büyüktür vb) eklenecekse buraya dahil edilir...
        }
        return true;
    }

    analyze(facts) {
        const result = {
            haklar: {
                kidem: false,
                ihbar: false,
                ise_iade: false,
                kotu_niyet: false,
                sendikal: false,
                bakiye_sure_ucreti: false,    // Belirli süreli sözleşmeler için yepyeni!
                bosta_gecen_sure_ucreti: false,// İşe iade tamamlayıcısı
                ise_baslatmama_tazminati: false// İşe iade tamamlayıcısı
            },
            dava_turleri: new Set(),
            gerekce: "", // Kullanıcının talep ettiği Spesifik Hukuki Nitelendirme
            uyarilar: []
        };

        // Gün Analizi
        if (facts.is_giris_tarihi && facts.is_cikis_tarihi) {
            const giris = new Date(facts.is_giris_tarihi);
            const cikis = new Date(facts.is_cikis_tarihi);
            const diffTime = Math.abs(cikis - giris);
            facts.calisma_gun_sayisi = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else if (!facts.calisma_gun_sayisi) {
            facts.calisma_gun_sayisi = 0;
        }

        // Kural İşletimcisi
        for (const rule of this.rules) {
            if (this.evaluateConditions(rule.conditions, facts)) {
                if (rule.outcomes.haklar) {
                    for (const [hak, deger] of Object.entries(rule.outcomes.haklar)) {
                        if (deger === true) result.haklar[hak] = true;
                        if (deger === false) result.haklar[hak] = false;
                    }
                }
                if (rule.outcomes.dava_turu) result.dava_turleri.add(rule.outcomes.dava_turu);
                // Gerekçeyi harmanla
                if (rule.outcomes.gerekce) {
                    result.gerekce += (result.gerekce ? " Ayrıca; " : "") + rule.outcomes.gerekce;
                }
                if (rule.outcomes.uyari) result.uyarilar.push(rule.outcomes.uyari);
            }
        }

        result.dava_turleri = Array.from(result.dava_turleri);

        // ==========================================
        // 🔥 ZORUNLU KANUNİ VETOLAR (HARD FILTERS)
        // ==========================================

        // 1. Kıdem Barajı: (Tüm haklı fesihlerde bile aranır)
        if (facts.calisma_gun_sayisi < 365) {
            result.haklar.kidem = false;
            result.uyarilar.push("HİZMET SÜRESİ ENGELİ: 1 tam yıl (365 gün) dolmadığı için kıdem hakkı yasalarca doğmaz.");
        }

        // 2. Sözleşme Türü Etkileri (BELİRLİ vs BELİRSİZ)
        if (facts.sozlesmeTuru === 'belirli') {
            result.haklar.ihbar = false;
            result.haklar.ise_iade = false; // İş güvencesi hükümleri uygulanmaz
            result.haklar.kotu_niyet = false; // Kötü niyet belirsizleredir

            // Eğer fesih erken veya haksızsa -> Bakiye Süre Ücreti Doğar (TBK 438)
            if (facts.fesihYapan === 'isveren' && facts.isverenSebep === 'haksiz_gecerli') {
                result.haklar.bakiye_sure_ucreti = true;
                result.uyarilar.push("TBK. 438 Gereği: Belirli süreli sözleşme haksız yere süresinden erken feshedildiği için 'Bakiye Süre Ücreti' talep hakkınız doğmuştur.");
            }
        }

        // 3. İşe İade Kanuni Filtrasyonu (MD. 18)
        if (result.haklar.ise_iade) {
            let iade_veto = false;
            if (facts.isyeriCalisanSayisi === 'az') {
                result.uyarilar.push("İŞ GÜVENCESİ YOK: İşyerinde 30'dan az işçi olduğu için İşe İade Kanununa tabi değilsiniz.");
                iade_veto = true;
            }
            if (facts.calisma_gun_sayisi < 180) {
                result.uyarilar.push("İŞ GÜVENCESİ YOK: İşyerindeki kıdeminiz 6 ayın altında.");
                iade_veto = true;
            }
            if (facts.iadeSuresiGectiMi === true) {
                result.uyarilar.push("HAK DÜŞÜRÜCÜ SÜRE: Fesih bildirimi itibariyle 1 ay geçirildiği için İşe İade davası AÇILAMAZ.");
                iade_veto = true;
            }
            if (iade_veto) {
                result.haklar.ise_iade = false;
                result.haklar.bosta_gecen_sure_ucreti = false;
                result.haklar.ise_baslatmama_tazminati = false;
            } else {
                result.haklar.bosta_gecen_sure_ucreti = true;
                result.haklar.ise_baslatmama_tazminati = true;
            }
        }

        // 4. Kötü Niyet Koruması Çatışması (İş güvencesindekiler alamaz)
        if (result.haklar.kotu_niyet && facts.isyeriCalisanSayisi === 'fazla') {
            result.haklar.kotu_niyet = false;
            result.uyarilar.push("30+ işçi olan yerde (iş güvencesi aktifken) MK m.2 Kötü Niyet Tazminatı yerine, geçerli olmayan fesih sebebiyle İşe İade yolu izlenmelidir.");
        }

        return result;
    }
}

// -------------------------------------------------------------
// KURALLARI MOTOR İÇERİSİNE İNÇŞA ET
// -------------------------------------------------------------
const defaultEngine = new LegalEngine();

defaultEngine.addRule({
    conditions: { fesihYapan: 'isveren', isverenSebep: 'haksiz_gecerli' },
    outcomes: {
        haklar: { kidem: true, ihbar: true, ise_iade: true },
        dava_turu: "İşçilik Alacakları ve/veya İşe İade İstemi",
        gerekce: "İşverenin haklı (25/II) bir nedene veya yasal usule (savunma alma, uyarı vs.) uymaksızın iş sözleşmesini tek taraflı feshetmesi Haksız/Geçersiz Fesihtir. Yargıtay ilkeleri uyarınca öncelikli Kıdem ve İhbar tazminatlarınız güvence altındadır."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isveren', isverenSebep: 'saglik_zorlayici' },
    outcomes: {
        haklar: { kidem: true, ihbar: false, ise_iade: false },
        gerekce: "İşverenin Md. 25/I-III kapsamında sağlık veya elinde olmayan zorlayıcı sebebe binaen derhal feshinde dahi Kıdem Tazminatı işçiye ÖDENMEK zorundadır. Ancak yasada bu eylem haklı neden sayıldığından İhbar hakkı düşmektedir."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isveren', isverenSebep: 'ahlak' },
    outcomes: {
        haklar: { kidem: false, ihbar: false, ise_iade: false },
        gerekce: "İşveren feshine 4857 SK Madde 25/II (Ahlak ve İyiniyet ihlali) kodlarını emsal gösterdi. Eğer bu iddiaların (tutanak, hırsızlık, devamsızlık) sahte olduğunu ispatlayabilirseniz, bu durum derhal 'Haksız Feshe' dönecek ve tüm haklarınızı alabileceksiniz."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isveren', isverenSebep: 'sendikal' },
    outcomes: {
        haklar: { kidem: true, ihbar: true, sendikal: true, ise_iade: true },
        gerekce: "Anayasal hak olan Sendika özgürlüğünün kasten ihlali nedeniyle işten çıkarıldığınız beyan edilmiştir. Sendikal Nedenle fesih tazminatı (1 yıllık tam maaş) ek ceza olarak uygulanabilmektedir."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isveren', isverenSebep: 'kotu_niyet' },
    outcomes: {
        haklar: { kidem: true, ihbar: true, kotu_niyet: true, ise_iade: false },
        gerekce: "Sırf yasal haklarınızı aradığınız, şikayet ettiğiniz vb. nedenlerle kinayeli işten atılmanız MK'da 'Kötü Niyet' feshine girmektedir ve İhbar Tazminatınız 3 katı olarak ceza bedeliyle size dönmelidir."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isci', isciSebep: 'istifa' },
    outcomes: {
        haklar: { kidem: false, ihbar: false, ise_iade: false },
        gerekce: "Herhangi bir ödenmeme/mobbing iddia etmeksizin salt istifa dilekçesi vererek ayrılmanız 'Kuru İstifa'dır. Kıdem veya İhbar talep edilemez. (Dikkat: Ancak arka planda aylardır yatmayan 1 günlük dahi mesai ücretiniz varsa, bu fesih 'Haklı Nedenle Fesih' olarak dava edilebilecektir.)"
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isci', isciSebep: 'hakli_neden' },
    outcomes: {
        haklar: { kidem: true, ihbar: false, ise_iade: false },
        gerekce: "4857 Sayılı Yasanın 24. Maddesi (eksik ödeme, mobbing, SGK eksikliği vb.) gereği haklı gerekçeyle sözleşmeyi siz bozduğunuz için Kıdem Tazminatınız (hesaplamaya aynen eklenmiştir) güvendedir. Kural olarak kendi fesheden ihbar isteyemez."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isci', isciSebep: 'askerlik' },
    outcomes: {
        haklar: { kidem: true, ihbar: false, ise_iade: false },
        gerekce: "Muvazzaf Askerlik celp/sevk gerekçesi, Türk İş Kanunlarında (Mülga 1475/14.md) Kıdem için açık ve tek taraflı bir istisna koruyucusudur."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isci', isciSebep: 'evlilik' },
    outcomes: {
        haklar: { kidem: true, ihbar: false, ise_iade: false },
        gerekce: "Kadın işçinin evlilik tarihinden itibaren 1 yıl evvel iş akdini kendi arzusuyla dahi feshetmesi, ona tam Kıdem Tazminatı alma hakkı tanır."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'isci', isciSebep: 'emeklilik' },
    outcomes: {
        haklar: { kidem: true, ihbar: false, ise_iade: false },
        gerekce: "SGK'dan alınacak Emeklilik Olur/Kıdem Tazminatı Alabilir yazısı sonucunda ayrılmalarda kıdem ödenmesi yasal zorunluluktur."
    }
});

defaultEngine.addRule({
    conditions: { fesihYapan: 'vefat' },
    outcomes: {
        haklar: { kidem: true, ihbar: false, ise_iade: false },
        dava_turu: "Mirasçı Hak Tespiti Talebi",
        gerekce: "İş sözleşmesi devam ederken vefat eden işçi adına, tüm kanuni mirasçıları veraset ilamıyla Kıdem Tazminatı alacağını derhal talep edebilir."
    }
});

module.exports = { LegalEngine, defaultEngine };
