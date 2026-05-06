# HakPortal - Yapay Zeka Destekli Hukuk ve Avukat Eşleştirme Platformu

![HakPortal Banner](https://via.placeholder.com/1000x300.png?text=HakPortal+Legal+AI+Assistant+and+Marketplace)

HakPortal; işçi hakları, tazminat hesaplamaları ve hukuki uyuşmazlıklar konusunda uzmanlaşmış, **RAG (Retrieval-Augmented Generation)** teknolojisi ile güçlendirilmiş hibrit bir hukuk platformudur. İşçiler ile uzman avukatları modern bir pazar yerinde buluştururken, taraflara yapay zeka destekli hukuki analiz araçları sunar.

---

## 🌟 Öne Çıkan Özellikler

### 🤖 Gelişmiş Hukuk Asistanı (RAG)
Sadece genel bir yapay zeka değil, Türkiye Cumhuriyeti mevzuatına ve Yargıtay kararlarına hakim bir asistan:
- **Mevzuat Analizi:** 700.000+ satırlık mevzuat verisi içinden anlık sorgulama.
- **Yargıtay Kararları:** Benzer vakalar için emsal kararların tespiti.
- **Dinamik Sohbet:** Oturum bazlı, geçmişi hatırlayan AI sohbet deneyimi.
- **Kaynak Gösterimi:** AI yanıtlarında hangi kanun maddesine veya karara dayanıldığının şeffaf gösterimi.

### ⚖️ Avukat ve Dosya Yönetimi
- **Vaka Oluşturma:** Kullanıcılar için detaylı dosya (case) açma ve evrak yükleme.
- **Teklif Sistemi:** Avukatların dosyaları inceleyerek profesyonel teklifler sunması.
- **Panel Yönetimi:** Avukatlar ve kullanıcılar için ayrı, modern ve kullanıcı dostu kontrol panelleri.
- **Mesajlaşma:** Dosya bazlı güvenli iletişim kanalı.

### 🛡️ Güvenlik ve Altyapı
- **RBAC (Role-Based Access Control):** Kullanıcı, Avukat ve Admin rolleri için sıkı yetkilendirme.
- **OCR Desteği:** Yüklenen PDF ve görsel belgelerden otomatik metin çıkarımı.
- **Güvenli API:** JWT tabanlı kimlik doğrulama ve hız sınırlama (rate-limiting).

---

## 🛠️ Teknoloji Yığını

- **Backend:** [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/)
- **Database:** [MySQL 8.0+](https://www.mysql.com/)
- **AI Engine:** [Ollama](https://ollama.com/) (Llama 3 / Mistral) & RAG Mimarisi
- **Frontend:** HTML5, Modern CSS3 (Vanilla), JavaScript (ES6+)
- **OCR & Parsing:** Tesseract.js & PDF-Parse
- **Auth:** JSON Web Tokens (JWT) & BCrypt

---

## 🚀 Kurulum ve Başlangıç

### Gereksinimler
- Node.js (v16+)
- MySQL
- Ollama (RAG özellikleri için yerelde çalışıyor olmalıdır)

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/serhat-kocyigit/dan-man-avukat.git
cd dan-man-avukat
```

### 2. Bağımlılıkları Kurun
```bash
npm install
```

### 3. Ortam Değişkenlerini Ayarlayın
`.env` dosyasını ana dizinde oluşturun ve aşağıdaki bilgileri projenize göre düzenleyin:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASS=şifreniz
DB_NAME=hakportal
JWT_SECRET=gizli_anahtar
RAG_URL=http://localhost:3010/api/chat
```

### 4. Veritabanı Kurulumu
SQL şemalarını içe aktarın ve başlangıç verilerini oluşturun:
```bash
npm run db:setup
```

### 5. Uygulamayı Başlatın
```bash
npm run dev
```

---

## 📂 Proje Yapısı

```text
├── public/             # Frontend dosyaları (HTML, CSS, JS)
│   ├── js/             # İstemci tarafı mantığı (app.js, panel.js vb.)
│   └── css/            # Modern UI tasarımları
├── server/             # Backend (Node.js/Express)
│   ├── db/             # Veritabanı bağlantısı ve SQL şemaları
│   ├── middleware/     # Auth ve yetkilendirme katmanları
│   └── routes/         # API uç noktaları (RAG, Avukat, Dava işlemleri)
├── .env.example        # Örnek yapılandırma
└── package.json        # Bağımlılıklar ve scriptler
```

---

## ⚖️ Yasal Uyarı ve Telif Hakkı

**© 2024-2025 HakPortal. Tüm Hakları Saklıdır.**

Bu proje, açık kaynaklı (open-source) bir yazılım **değildir**. Yazılımın mimarisi, kaynak kodları, veritabanı şemaları ve RAG algoritmaları dahil olmak üzere tüm fikri hakları proje sahibine (**Serhat Koçyiğit**) aittir.

İzinsiz kopyalanması, çoğaltılması veya ticari amaçla kullanılması durumunda yasal işlem başlatılacaktır.
