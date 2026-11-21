# 📱 Esnaf WhatsApp Sipariş Menüsü - Proje Durum Dosyası

Bu dosya, projenin mimarisini, dosya yapısını ve hangi aşamada olduğumuzu özetler. Farklı bir yapay zeka modeline (Claude 3.5 Sonnet, Gemini Pro vb.) geçildiğinde bu dosyayı okutarak sıfırdan anlatma derdi olmadan hemen devam edebilirsiniz.

---

## 🎯 Projenin Amacı
Mahalle esnafının (pideci, çiğ köfteci, kebapçı vb.) Getir/Yemeksepeti/Trendyol'a ödediği %30 komisyondan kurtulmasını sağlayan; müşterilerine uygulama indirtmeden web linki üzerinden Getir kalitesinde sipariş verdiren ve siparişi doğrudan esnafın WhatsApp'ına formatlı fiş olarak düşüren **Mobil Web Tabanlı Sipariş Sistemi (Web App / PWA)**.

---

## 🛠️ Teknoloji ve Mimari
* **Sunucu:** Saf Node.js (`http`, `fs`, `path`). Sıfır harici paket bağımlılığı! Anında 0.1 saniyede açılır.
* **Veritabanı:** `data.json` (Gerektiğinde PostgreSQL / Supabase'e taşınabilir REST API mimarisi kuruldu).
* **Müşteri Arayüzü:** `public/index.html` + `public/styles.css` + `public/app.js` (Yemeksepeti kalitesinde mobil UI, sepet çekmecesi, WhatsApp mesaj üreticisi).
* **Esnaf Yönetim Paneli:** `public/admin.html` + `public/admin.js` (Dükkan adı, açık/kapalı durumu, WhatsApp telefon numarası, minimum paket tutarı, ürün ekleme/silme/tükendi yapma).
* **WhatsApp Entegrasyonu:** `https://wa.me/{telefon}?text={mesaj}` formatında URL-encode edilmiş direkt yönlendirme (API maliyeti sıfır).

---

## 📂 Dosya Yapısı
```
esnaf-siparis/
├── server.js            # Node.js backend & REST API (/api/data, /api/store, /api/products, /api/orders)
├── data.json            # Dükkan ve menü ürün verileri
├── package.json         # Proje ayarları
├── PROJE_DURUMU.md      # Bu dosya (Yol haritası ve özet)
└── public/
    ├── index.html       # Müşteri mobil menüsü & sepet ekranı
    ├── styles.css       # Modern mobil-öncelikli CSS tasarımı
    ├── app.js           # Müşteri sepeti, ürün listeleme ve WhatsApp sipariş mantığı
    ├── admin.html       # Esnaf yönetim paneli
    ├── admin.js         # Dükkan ve ürün güncelleme mantığı
    └── manifest.json    # PWA (Ana Ekrana Ekle) mobil desteği
```

---

## 🚀 Nasıl Çalıştırılır?
Proje dizininde terminali açıp şu komutu çalıştırmak yeterlidir:
```bash
node server.js
```
* **Müşteri Menüsü:** `http://localhost:3000`
* **Esnaf Paneli:** `http://localhost:3000/admin.html`

---

## 📋 Sıradaki Adımlar (Yol Haritası)
1. **Canlıda Test:** `http://localhost:3000` üzerinden sepete ürün ekleyip WhatsApp butonunu denemek.
2. **Kategori Ekleme/Çıkarma:** Admin panelinden yeni kategori oluşturma özelliği eklemek.
3. **Canlıya Alma (Hosting):** Vercel veya Render/Netlify üzerine tek tıkla yükleyip internet linki almak.
4. **İlk Pilot Esnafa Gitmek:** Dükkanın menüsünü girip telefonunda test ettirmek.
