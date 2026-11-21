const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_KEY || 'patron2026';

// Güvenli Oturum Havuzu (Memory-based Session Tokens per store)
const activeSessions = new Map(); // token -> storeId

function getSessionStore(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.headers['x-admin-token'];
  return activeSessions.get(token);
}

// Varsayılan Veritabanı
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { stores: {} };
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.stores) {
      return { stores: { lagabla: parsed } };
    }
    return parsed;
  } catch (err) {
    return { stores: {} };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getStore(data, storeId) {
  storeId = (storeId || 'lagabla').toLowerCase().trim();
  if (!data.stores[storeId]) {
    const keys = Object.keys(data.stores);
    if (keys.length > 0) return { id: keys[0], ...data.stores[keys[0]] };
    return null;
  }
  return { id: storeId, ...data.stores[storeId] };
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token, X-Super-Admin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const storeQuery = parsedUrl.searchParams.get('store') || 'lagabla';

  // --- SÜPER PATRON API'LERİ ---
  if (pathname === '/api/super-admin/stores' && req.method === 'GET') {
    const key = req.headers['x-super-admin'] || parsedUrl.searchParams.get('key');
    if (key !== SUPER_ADMIN_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim. Geçersiz patron şifresi.' }));
      return;
    }
    const data = loadData();
    const list = Object.keys(data.stores || {}).map(k => {
      const s = data.stores[k];
      return {
        id: k,
        name: (s.store && s.store.name) || k,
        phone: (s.store && s.store.phone) || '',
        orderCount: (s.orders && s.orders.length) || 0,
        productCount: (s.products && s.products.length) || 0,
        isOpen: (s.store && s.store.isOpen) !== false
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stores: list }));
    return;
  }

  if (pathname === '/api/super-admin/stores' && req.method === 'POST') {
    const key = req.headers['x-super-admin'] || parsedUrl.searchParams.get('key');
    if (key !== SUPER_ADMIN_KEY) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, name, phone, pin } = JSON.parse(body);
        const slug = (id || name || 'dükkan').toLowerCase().replace(/[^a-z0-9]/g, '');
        const data = loadData();
        data.stores = data.stores || {};
        if (data.stores[slug]) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bu dükkan kodu zaten kayıtlı!' }));
          return;
        }
        data.stores[slug] = {
          store: {
            id: slug,
            name: name || 'Yeni Esnaf',
            slogan: 'Taze ve Lezzetli',
            phone: phone || '905551234567',
            minOrder: 150,
            deliveryTime: '30-45 dk',
            isOpen: true,
            address: 'Kadıköy / İstanbul',
            instagram: '@esnaf',
            logo: 'https://cdn-icons-png.flaticon.com/512/3075/3075977.png',
            pin: String(pin || '1234')
          },
          coupons: [{ code: 'HOSGELDIN', discountPercent: 10, minCart: 100 }],
          categories: [{ id: 'menu', name: 'Menü' }],
          products: [],
          orders: []
        };
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, storeId: slug }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz veri' }));
      }
    });
    return;
  }

  // --- HALKA AÇIK MENÜ API'Sİ (GET /api/data) ---
  if (pathname === '/api/data' && req.method === 'GET') {
    const data = loadData();
    const st = getStore(data, storeQuery);
    if (!st || !st.store) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Dükkan bulunamadı' }));
      return;
    }
    const safeStore = { ...st.store };
    delete safeStore.pin; // Müşteriye PIN asla sızdırılmaz!
    
    const publicData = {
      store: safeStore,
      categories: st.categories || [],
      products: st.products || [],
      coupons: st.coupons || []
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(publicData));
    return;
  }

  // --- PIN DOĞRULAMA (POST /api/verify-pin) ---
  if (pathname === '/api/verify-pin' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { pin, store } = JSON.parse(body);
        const targetStoreId = (store || storeQuery || 'lagabla').toLowerCase().trim();
        const data = loadData();
        const st = data.stores && data.stores[targetStoreId];
        const correctPin = String((st && st.store && st.store.pin) || '1234');
        
        if (String(pin).trim() === correctPin) {
          const token = crypto.randomBytes(24).toString('hex');
          activeSessions.set(token, targetStoreId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token, storeId: targetStoreId }));
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

  // --- ESNAF PANELİ TAM VERİ (GET /api/admin-data) ---
  if (pathname === '/api/admin-data' && req.method === 'GET') {
    const sessionStoreId = getSessionStore(req);
    if (!sessionStoreId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim. Lütfen giriş yapın.' }));
      return;
    }
    const data = loadData();
    const st = data.stores && data.stores[sessionStoreId];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(st || {}));
    return;
  }

  // --- ESNAF BİLGİ GÜNCELLEME (POST /api/store) ---
  if (pathname === '/api/store' && req.method === 'POST') {
    const sessionStoreId = getSessionStore(req);
    if (!sessionStoreId) {
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
        if (data.stores && data.stores[sessionStoreId]) {
          data.stores[sessionStoreId].store = { ...data.stores[sessionStoreId].store, ...newStore };
          saveData(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, store: data.stores[sessionStoreId].store }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz veri' }));
      }
    });
    return;
  }

  // --- ÜRÜN EKLE / GÜNCELLE (POST /api/products) ---
  if (pathname === '/api/products' && req.method === 'POST') {
    const sessionStoreId = getSessionStore(req);
    if (!sessionStoreId) {
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
        const st = data.stores && data.stores[sessionStoreId];
        if (st) {
          st.products = st.products || [];
          if (item.id) {
            const idx = st.products.findIndex(p => p.id === item.id);
            if (idx !== -1) st.products[idx] = { ...st.products[idx], ...item };
            else st.products.push(item);
          } else {
            item.id = Date.now().toString();
            st.products.push(item);
          }
          saveData(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, products: st.products }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz ürün verisi' }));
      }
    });
    return;
  }

  // --- ÜRÜN SİL (DELETE /api/products) ---
  if (pathname === '/api/products' && req.method === 'DELETE') {
    const sessionStoreId = getSessionStore(req);
    if (!sessionStoreId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    const id = parsedUrl.searchParams.get('id');
    const data = loadData();
    const st = data.stores && data.stores[sessionStoreId];
    if (st) {
      st.products = (st.products || []).filter(p => p.id !== id);
      saveData(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, products: st.products }));
    }
    return;
  }

  // --- KATEGORİ EKLE (POST /api/categories) ---
  if (pathname === '/api/categories' && req.method === 'POST') {
    const sessionStoreId = getSessionStore(req);
    if (!sessionStoreId) {
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
        const st = data.stores && data.stores[sessionStoreId];
        if (st) {
          st.categories = st.categories || [];
          if (!newCat.id) newCat.id = 'cat_' + Date.now();
          st.categories.push(newCat);
          saveData(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, categories: st.categories }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz kategori verisi' }));
      }
    });
    return;
  }

  // --- KATEGORİ SİL (DELETE /api/categories) ---
  if (pathname === '/api/categories' && req.method === 'DELETE') {
    const sessionStoreId = getSessionStore(req);
    if (!sessionStoreId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    const id = parsedUrl.searchParams.get('id');
    const data = loadData();
    const st = data.stores && data.stores[sessionStoreId];
    if (st) {
      st.categories = (st.categories || []).filter(c => c.id !== id);
      saveData(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, categories: st.categories }));
    }
    return;
  }

  // --- SİPARİŞLER (GET /api/orders) ---
  if (pathname === '/api/orders' && req.method === 'GET') {
    const sessionStoreId = getSessionStore(req);
    if (!sessionStoreId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    const data = loadData();
    const st = data.stores && data.stores[sessionStoreId];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify((st && st.orders) || []));
    return;
  }

  // --- SİPARİŞ KAYDET (POST /api/orders) ---
  if (pathname === '/api/orders' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const order = JSON.parse(body);
        const targetStoreId = (order.store || storeQuery || 'lagabla').toLowerCase().trim();
        order.id = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
        order.createdAt = new Date().toISOString();
        const data = loadData();
        const st = data.stores && data.stores[targetStoreId];
        if (st) {
          st.orders = st.orders || [];
          st.orders.unshift(order);
          if (st.orders.length > 50) st.orders = st.orders.slice(0, 50);
          saveData(data);
        }
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
  
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Erişim reddedildi');
    return;
  }

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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 Çoklu Restoran (SaaS) Sipariş Sistemi Hazır!`);
  console.log(`📱 Müşteri Menüsü : http://localhost:${PORT}`);
  console.log(`⚙️  Esnaf Paneli   : http://localhost:${PORT}/admin.html`);
  console.log(`👑 Patron Paneli  : http://localhost:${PORT}/super-admin.html`);
  console.log(`===============================================`);
});
