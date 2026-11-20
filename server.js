const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Güvenli Oturum Havuzu (Memory-based Session Tokens)
const activeSessions = new Set();

function isAuthenticated(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.headers['x-admin-token'];
  return token && activeSessions.has(token);
}

// Başlangıç Demo Verileri (Türk Esnafı için gerçekçi örnek)
const DEFAULT_DATA = {
  store: {
    name: "Meşhur Usta Pide & Kebap",
    slogan: "1994'ten Beri Değişmeyen Lezzet",
    phone: "905551234567", // WhatsApp sipariş hattı
    minOrder: 150,
    deliveryTime: "30-45 dk",
    isOpen: true,
    address: "Atatürk Cad. No:42/A, Kadıköy / İstanbul",
    instagram: "@meshurustapide",
    logo: "https://cdn-icons-png.flaticon.com/512/3075/3075977.png",
    pin: "1234"
  },
  coupons: [
    { code: "ILK10", discountPercent: 10, minCart: 100 },
    { code: "ESNAF15", discountPercent: 15, minCart: 200 }
  ],
  categories: [
    { id: "pideler", name: "Pideler" },
    { id: "kebaplar", name: "Kebap & Dürümler" },
    { id: "lahmacun", name: "Lahmacun" },
    { id: "icecekler", name: "İçecekler" },
    { id: "tatlilar", name: "Tatlılar" }
  ],
  products: [
    {
      id: "1",
      name: "Kuşbaşılı Kaşarlı Pide",
      category: "pideler",
      price: 240,
      description: "Özel marine edilmiş dana kuşbaşı, taze kaşar peyniri ve tereyağı ile taş fırında.",
      image: "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    },
    {
      id: "2",
      name: "Kıymalı Yumurtalı Pide",
      category: "pideler",
      price: 210,
      description: "Geleneksel kıymalı harç ve köy yumurtası ile enfes lezzet.",
      image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    },
    {
      id: "3",
      name: "Çıtır Lahmacun",
      category: "lahmacun",
      price: 85,
      description: "Taş fırında incecik açılmış çıtır hamur, zırh kıyması, domates ve maydanoz.",
      image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    },
    {
      id: "4",
      name: "Adana Dürüm",
      category: "kebaplar",
      price: 220,
      description: "Zırhta çekilmiş acılı kuzu-dana kıyması, közlenmiş biber, sumaklı soğan ve lavaş.",
      image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    },
    {
      id: "5",
      name: "Urfa Dürüm (Acısız)",
      category: "kebaplar",
      price: 220,
      description: "Özel baharatlı zırh kıyması, lavaş, közlenmiş domates ve yeşillik.",
      image: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    },
    {
      id: "6",
      name: "Fıstıklı Künefe",
      category: "tatlilar",
      price: 150,
      description: "Hatay peynirli, bol şerbetli ve hakiki Antep fıstıklı sıcak künefe.",
      image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    },
    {
      id: "7",
      name: "Kutu Kola (330ml)",
      category: "icecekler",
      price: 45,
      description: "Soğuk servis edilir.",
      image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    },
    {
      id: "8",
      name: "Büyük Boy Yayık Ayran (300ml)",
      category: "icecekler",
      price: 35,
      description: "Bol köpüklü taze yayık ayranı.",
      image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
      isAvailable: true
    }
  ],
  orders: []
};

// Veritabanı başlat veya yükle
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
    return DEFAULT_DATA;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return DEFAULT_DATA;
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// MIME türleri
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // CORS başlıkları
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // --- API ENDPOINTLERİ ---

  // GET /api/data (Halka Açık Menü - PIN ve Siparişler ASLA SIZDIRILMAZ)
  if (pathname === '/api/data' && req.method === 'GET') {
    const data = loadData();
    const safeStore = { ...data.store };
    delete safeStore.pin; // Müşteriye PIN asla gitmez!
    
    const publicData = {
      store: safeStore,
      categories: data.categories || [],
      products: data.products || [],
      coupons: data.coupons || []
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicData));
    return;
  }

  // GET /api/admin-data (Sadece PIN ile giriş yapmış Esnafa özel tam veri)
  if (pathname === '/api/admin-data' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim. Lütfen giriş yapın.' }));
      return;
    }
    const data = loadData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // POST /api/verify-pin (PIN doğrulama ve güvenli Token üretme)
  if (pathname === '/api/verify-pin' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { pin } = JSON.parse(body);
        const data = loadData();
        const correctPin = String((data.store && data.store.pin) || '1234');
        if (String(pin).trim() === correctPin) {
          const token = crypto.randomBytes(24).toString('hex');
          activeSessions.add(token);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Hatalı PIN kodu' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz istek' }));
      }
    });
    return;
  }

  // POST /api/store (Dükkan bilgilerini güncelleme - GÜVENLİK KORUMALI)
  if (pathname === '/api/store' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newStore = JSON.parse(body);
        const data = loadData();
        data.store = { ...data.store, ...newStore };
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, store: data.store }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz veri' }));
      }
    });
    return;
  }

  // POST /api/products (Ürün ekle/güncelle - GÜVENLİK KORUMALI)
  if (pathname === '/api/products' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const item = JSON.parse(body);
        const data = loadData();
        if (item.id) {
          const idx = data.products.findIndex(p => p.id === item.id);
          if (idx !== -1) {
            data.products[idx] = { ...data.products[idx], ...item };
          } else {
            data.products.push(item);
          }
        } else {
          item.id = Date.now().toString();
          data.products.push(item);
        }
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, products: data.products }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz ürün verisi' }));
      }
    });
    return;
  }

  // DELETE /api/products (Ürün silme - GÜVENLİK KORUMALI)
  if (pathname === '/api/products' && req.method === 'DELETE') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    const id = parsedUrl.searchParams.get('id');
    const data = loadData();
    data.products = data.products.filter(p => p.id !== id);
    saveData(data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, products: data.products }));
    return;
  }

  // POST /api/categories (Kategori ekle - GÜVENLİK KORUMALI)
  if (pathname === '/api/categories' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newCat = JSON.parse(body);
        const data = loadData();
        data.categories = data.categories || [];
        if (!newCat.id) newCat.id = 'cat_' + Date.now();
        data.categories.push(newCat);
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, categories: data.categories }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz kategori verisi' }));
      }
    });
    return;
  }

  // DELETE /api/categories (Kategori silme - GÜVENLİK KORUMALI)
  if (pathname === '/api/categories' && req.method === 'DELETE') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    const id = parsedUrl.searchParams.get('id');
    const data = loadData();
    data.categories = (data.categories || []).filter(c => c.id !== id);
    saveData(data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, categories: data.categories }));
    return;
  }

  // GET /api/orders (Siparişler - GÜVENLİK KORUMALI, KVKK UYUMLU)
  if (pathname === '/api/orders' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim. Siparişleri sadece yetkili esnaf görebilir.' }));
      return;
    }
    const data = loadData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data.orders || []));
    return;
  }

  // POST /api/coupons (Kupon listesini güncelleme)
  if (pathname === '/api/coupons' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const coupons = JSON.parse(body);
        const data = loadData();
        data.coupons = coupons;
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, coupons: data.coupons }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz kupon verisi' }));
      }
    });
    return;
  }

  // POST /api/orders (Sipariş log kaydı)
  if (pathname === '/api/orders' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const order = JSON.parse(body);
        order.id = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
        order.createdAt = new Date().toISOString();
        const data = loadData();
        data.orders = data.orders || [];
        data.orders.unshift(order);
        if (data.orders.length > 50) data.orders = data.orders.slice(0, 50); // son 50 sipariş
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, orderId: order.id }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz sipariş verisi' }));
      }
    });
    return;
  }

  // --- STATİK DOSYA SUNUCUSU ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Güvenlik: Dizin dışına çıkışı engelle
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Erişim reddedildi');
    return;
  }

  // Dosya uzantısı yoksa html olarak dene (örn: /admin -> /admin.html)
  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath += '.html';
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 - Sayfa Bulunamadı</h1><p><a href="/">Ana Sayfaya Dön</a></p>');
      } else {
        res.writeHead(500);
        res.end(`Sunucu Hatası: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// Başlangıçta veritabanını hazırla
loadData();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 Esnaf Sipariş Sistemi Çalışıyor!`);
  console.log(`📱 Müşteri Menüsü : http://localhost:${PORT}`);
  console.log(`⚙️  Esnaf Paneli   : http://localhost:${PORT}/admin.html`);
  console.log(`===============================================`);
});
