# HakPortal - İşçi Hakları ve Avukat Eşleştirme Platformu

![HakPortal Logo](https://via.placeholder.com/800x200.png?text=HakPortal+-+%C4%B0%C5%9F%C3%A7i+Haklar%C4%B1+ve+Avukat+E%C5%9Fle%C5%9Ftirme+Sistemi)

HakPortal, işçi haklarıyla ilgili uyuşmazlıklar veya alacaklar (örneğin kıdem tazminatı, ihbar tazminatı, fazla mesai) yaşayan işçiler ile bu alanda uzmanlaşmış avukatları bir araya getiren dijital bir platformdur. Amacı, adalete erişimi kolaylaştırmak ve hukuki süreçleri dijitalleştirerek şeffaf bir iletişim ve eşleşme sağlamaktır.

## 🚀 Projenin Amacı ve İşlevi

Çoğu işçi, haklarını ararken doğru avukata ulaşmada zorluk çekebilir veya hukuki süreçlerin maliyetleri konusunda öngörülemezlik yaşayabilir. HakPortal bu sorunları çözmek üzere aşağıdaki işlevleri sunar:

1. **Vakaların (Dava Dosyalarının) Dijitalleşmesi**: İşçiler, sorunlarını sisteme detaylarıyla (tahmini alacaklar, belgeler vb.) yükleyerek bir "dosya/case" oluştururlar.
2. **Akıllı Eşleşme ve Teklif Sistemi**: Sisteme kayıtlı ve onaylı avukatlar, işçilerin anonimleştirilmiş veya temel dosya detaylarını inceleyerek davayı almak için "Teklif" (sabit ücret veya yüzdelik anlaşma) sunarlar.
3. **Güvenli İletişim**: İşçi ve avukat eşleştikten sonra sistem üzerinden güvenli bir şekilde mesajlaşabilir, belge paylaşımı yapabilirler.
4. **Süreç Takibi**: Dava/dosya süreçleri (beklemede, avukat atandı, dava açıldı, tahsilat vb.) sistem üzerinden takip edilebilir ve durum güncellemeleri anlık olarak taraflara bildirilir.
5. **Şeffaf Ödeme ve Geri Bildirim**: Sürecin sonunda veya belirlenen aşamalarda platform üzerinden ödeme/hizmet bedeli işlemleri yönetilir, ayrıca işçiler çalıştıkları avukatları değerlendirebilirler.

## ✨ Temel Özellikler

- **Rol Bazlı Erişim (RBAC)**: Yönetici (Admin), Avukat ve Kullanıcı (İşçi) panelleri.
- **Evrak ve Belge Yönetimi:** PDF ve görsel belgelerinin sisteme yüklenmesi (OCR destekli metin analizi altyapısı mevcuttur).
- **Gerçek Zamanlıya Yakın Mesajlaşma**: Taraflar arasında güvenli iletişim kanalı.
- **Kapsamlı Profil ve Onay Mekanizması**: Avukatların baro, sicil numarası ve deneyimlerine göre onay süreçleri.
- **Dinamik Teklif Modülü**: Sabit veya dava sonucuna dayalı (yüzde) teklif opsiyonları.
- **Dava Skorlama ve Risk Analizi**: Hukuki alacak, veri skoru ve tahsilat başarı oranı üzerine skorlama mantığı.
- **Bildirimler**: Aşamalardaki değişikliklerde otomatik kullanıcı bilgilendirmeleri.

## 🛠️ Kullanılan Teknolojiler (Tech Stack)

### Backend (Sunucu)
- **Node.js & Express.js**: Hızlı ve ölçeklenebilir RESTful API'ler.
- **MySQL**: Güçlü ve ilişkisel veritabanı yönetimi (Kapsamlı şema ve SP desteği).
- **JWT (JSON Web Token)**: Güvenli kimlik doğrulama.
- **Bcrypt.js**: Şifrelerin güvenli bir şekilde hashlenmesi (şifrelenmesi).
- **Multer**: Dosya yükleme (Multipart form-data) işlemleri.
- **Tesseract.js & PDF-Parse**: Yüklenen dokümanlardan (Görsel ve PDF) metin çıkarma ve analizi.

### Frontend (İstemci)
- **HTML5, CSS3, Vanilla JS**: Saf, hızlı ve eklentisiz kullanıcı arayüzü kontrolü.
- **Responsive Design**: Hem mobil hem masaüstü cihazlara tam uyumlu arayüzler.

## ⚙️ Kurulum ve Çalıştırma

Projeyi kendi bilgisayarınızda çalıştırmak için aşağıdaki adımları izleyebilirsiniz.

### 1. Gereksinimler
- **Node.js** (v16 veya üstü önerilir)
- **MySQL** (v8.0 veya üstü)

### 2. Projeyi Klonlayın
```bash
git clone https://github.com/serhat-kocyigit/dan-man-avukat.git
cd dan-man-avukat
```

### 3. Bağımlılıkları Yükleyin
```bash
npm install
```

### 4. Çevre Değişkenleri (.env)
Proje ana dizininde bir `.env` dosyası oluşturun (veya `.env.example` içeriğini kopyalayın) ve veritabanı, JWT gibi ayarlarınızı yapılandırın.
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=veritabani_sifreniz
DB_NAME=hakportal
JWT_SECRET=gizli_anahtariniz
```

### 5. Veritabanı Kurulumu
Veritabanı tablolarını otomatik oluşturmak ve örnek (seed) verileri yüklemek için:
```bash
npm run db:setup
```

### 6. Uygulamayı Başlatın
Geliştirici modunda (nodemon ile) başlatmak için:
```bash
npm run dev
```
Uygulamanız varsayılan olarak `http://localhost:3000` adresinde çalışacaktır.

## 👥 Demo Kullanıcıları

Kurulum (`db:setup`) işleminden sonra aşağıdaki hesaplarla giriş yapıp sistemi test edebilirsiniz:

- **Admin Girişi**: `admin@hakportal.com` | Şifre: `admin123`
- **Temsili Avukat 1**: `av.ahmet@hakportal.com` | Şifre: `admin123`
- **Temsili Avukat 2**: `av.zeynep@hakportal.com` | Şifre: `admin123`

---
*Bu proje, iş hukuku süreçlerini dijitalleştirip kolaylaştırmak için modern bir SaaS / Eşleştirme Platformu örneği olarak geliştirilmektedir.*
