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
  const session = activeSessions.get(token);
  if (typeof session === 'object' && session !== null) {
    return session.storeId;
  }
  return session;
}

function checkSuperAdminAuth(req, parsedUrl) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const session = activeSessions.get(token);
  if (session && (session.role === 'superadmin' || session === 'superadmin')) {
    return true;
  }
  const key = req.headers['x-super-admin'] || (parsedUrl && parsedUrl.searchParams.get('key'));
  if (key === SUPER_ADMIN_KEY || key === '1923' || key === 'patron2026') {
    return true;
  }
  return false;
}

// --- GÜVENLİK: BRUTE-FORCE RATE LIMITING (Kaba Kuvvet Koruması) ---
const pinAttemptMap = new Map(); // ip -> { count, lockedUntil }

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function isRateLimited(ip) {
  const now = Date.now();
  const attempt = pinAttemptMap.get(ip);
  if (!attempt) return false;
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    return true;
  }
  if (attempt.lockedUntil && attempt.lockedUntil <= now) {
    pinAttemptMap.delete(ip);
    return false;
  }
  return false;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const attempt = pinAttemptMap.get(ip) || { count: 0, firstAttempt: now };
  attempt.count++;
  if (attempt.count >= 5) {
    attempt.lockedUntil = now + (15 * 60 * 1000); // 15 dakika kilitle
  }
  pinAttemptMap.set(ip, attempt);
}

function clearRateLimit(ip) {
  pinAttemptMap.delete(ip);
}

// --- GÜVENLİK: XSS & PAYLOAD TEMİZLEME (Sanitization) ---
function sanitizeString(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '') // HTML script taglerini bertaraf et
    .trim()
    .slice(0, maxLen);
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
  storeId = (storeId || 'lagabia').toLowerCase().trim();
  if (storeId === 'lagabla') storeId = 'lagabia';
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

  // Modern Güvenlik Başlıkları (Android, iOS Safari, Masaüstü Tarayıcı Koruması)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const clientIp = getClientIp(req);
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  let storeQuery = (parsedUrl.searchParams.get('store') || 'lagabia').toLowerCase().trim();
  if (storeQuery === 'lagabla') storeQuery = 'lagabia';

  // --- SÜPER PATRON API'LERİ ---
  if (pathname === '/api/super-admin/login' && req.method === 'POST') {
    if (isRateLimited(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: '⚠️ Çok fazla hatalı deneme yapıldı! Güvenlik nedeniyle 15 dakika kilitlendi.' }));
      return;
    }

    let body = '';
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 10240) { req.destroy(); }
      body += c;
    });
    req.on('end', () => {
      try {
        const { pin } = JSON.parse(body || '{}');
        const validPins = ['1923', 'patron2026', SUPER_ADMIN_KEY];
        if (validPins.includes(String(pin).trim())) {
          clearRateLimit(clientIp);
          const token = crypto.randomBytes(32).toString('hex');
          activeSessions.set(token, { role: 'superadmin' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token }));
        } else {
          recordFailedAttempt(clientIp);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Hatalı Süper PIN Kodu!' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz veri' }));
      }
    });
    return;
  }

  if ((pathname === '/api/super-admin/stores' || pathname === '/api/super-admin/shops') && req.method === 'GET') {
    if (!checkSuperAdminAuth(req, parsedUrl)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim. Geçersiz patron şifresi.' }));
      return;
    }
    const data = loadData();
    let totalRevenue = 0;
    let activeStores = 0;
    let totalOrders = 0;
    const list = Object.keys(data.stores || {}).map(slug => {
      const s = data.stores[slug] || {};
      const st = s.store || {};
      const isAct = (st.subscriptionStatus !== 'suspended' && st.isOpen !== false);
      const fee = Number(st.monthlyFee) || (slug === 'lagabia' ? 1500 : 750);
      if (isAct) {
        activeStores++;
        totalRevenue += fee;
      }
      const oCount = (s.orders && s.orders.length) || 0;
      totalOrders += oCount;
      return {
        id: slug,
        slug: slug,
        name: st.name || slug,
        phone: st.phone || '',
        pin: st.pin || '1234',
        monthlyFee: fee,
        subscriptionStatus: isAct ? 'active' : 'suspended',
        isOpen: isAct,
        orderCount: oCount,
        appointmentCount: oCount,
        productCount: (s.products && s.products.length) || 0,
        logo: st.logo || '/logo_square.svg'
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      totalStores: list.length,
      totalShops: list.length,
      totalMonthlyRevenue: totalRevenue,
      activeStores: activeStores,
      activeShops: activeStores,
      totalOrders: totalOrders,
      totalAppointments: totalOrders,
      stores: list,
      shops: list
    }));
    return;
  }

  if ((pathname === '/api/super-admin/stores' || pathname === '/api/super-admin/shops') && req.method === 'POST') {
    if (!checkSuperAdminAuth(req, parsedUrl)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { id, name, slug: inputSlug, phone, pin, monthlyFee } = JSON.parse(body || '{}');
        const slug = (inputSlug || id || name || 'restoran').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
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
            name: name || 'Yeni Restoran',
            slogan: 'Taze ve Lezzetli Gurme Menü',
            phone: (phone || '905551234567').replace(/\D/g, ''),
            minOrder: 200,
            deliveryTime: '30-45 dk',
            isOpen: true,
            subscriptionStatus: 'active',
            monthlyFee: Number(monthlyFee) || 750,
            address: 'Kadıköy / İstanbul',
            instagram: '@' + slug,
            logo: '/logo_square.svg',
            pin: String(pin || '1234')
          },
          coupons: [{ code: 'HOSGELDIN', discountPercent: 10, minCart: 100 }],
          categories: [{ id: 'menu', name: 'Öne Çıkanlar' }],
          products: [],
          orders: []
        };
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, storeId: slug, slug }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz veri' }));
      }
    });
    return;
  }

  if (
    (pathname.startsWith('/api/super-admin/stores/') || pathname.startsWith('/api/super-admin/shops/')) &&
    pathname.endsWith('/status') &&
    req.method === 'PUT'
  ) {
    if (!checkSuperAdminAuth(req, parsedUrl)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Yetkisiz erişim' }));
      return;
    }
    const parts = pathname.split('/');
    const slug = parts[4];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { status } = JSON.parse(body || '{}');
        const data = loadData();
        if (!data.stores || !data.stores[slug]) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Restoran bulunamadı' }));
          return;
        }
        data.stores[slug].store = data.stores[slug].store || {};
        data.stores[slug].store.subscriptionStatus = status;
        data.stores[slug].store.isOpen = (status === 'active');
        saveData(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz istek' }));
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
    if (isRateLimited(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '⚠️ Çok fazla hatalı deneme yapıldı! Güvenlik nedeniyle 15 dakika kilitlendi.' }));
      return;
    }

    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 10240) req.destroy();
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { pin, store } = JSON.parse(body || '{}');
        const targetStoreId = (store || storeQuery || 'lagabla').toLowerCase().trim();
        const data = loadData();
        const st = data.stores && data.stores[targetStoreId];
        const correctPin = String((st && st.store && st.store.pin) || '1234');
        
        if (String(pin).trim() === correctPin) {
          clearRateLimit(clientIp);
          const token = crypto.randomBytes(24).toString('hex');
          activeSessions.set(token, targetStoreId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, token, storeId: targetStoreId }));
        } else {
          recordFailedAttempt(clientIp);
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
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 65536) req.destroy(); // 64KB'dan büyük sahte siparişleri engelle
      body += chunk;
    });
    req.on('end', () => {
      try {
        const order = JSON.parse(body || '{}');
        const targetStoreId = (order.store || storeQuery || 'lagabla').toLowerCase().trim();
        const data = loadData();
        const st = data.stores && data.stores[targetStoreId];
        if (st) {
          const cust = order.customer || {};
          const cleanOrder = {
            id: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
            createdAt: new Date().toISOString(),
            customer: {
              name: sanitizeString(cust.name, 80) || 'Müşteri',
              phone: sanitizeString(cust.phone, 30),
              address: sanitizeString(cust.address, 400),
              note: sanitizeString(cust.note, 200)
            },
            items: Array.isArray(order.items) ? order.items.slice(0, 30).map(it => ({
              product: {
                id: sanitizeString(it.product && it.product.id, 20),
                name: sanitizeString(it.product && it.product.name, 100),
                price: Number(it.product && it.product.price) || 0
              },
              quantity: Math.min(50, Math.max(1, Number(it.quantity) || 1))
            })) : [],
            payment: sanitizeString(order.payment, 50),
            coupon: sanitizeString(order.coupon, 30),
            discount: Number(order.discount) || 0,
            total: Number(order.total) || 0
          };

          st.orders = st.orders || [];
          st.orders.unshift(cleanOrder);
          if (st.orders.length > 50) st.orders = st.orders.slice(0, 50);
          saveData(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, orderId: cleanOrder.id }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Restoran bulunamadı' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Geçersiz sipariş verisi' }));
      }
    });
    return;
  }

  // --- STATİK DOSYA SUNUCUSU & GÜVENLİK FİLTRESİ ---
  const FORBIDDEN_FILES = [
    'data.json',
    'server.js',
    'package.json',
    'package-lock.json',
    'render.yaml',
    'proje_durumu.md',
    '.env',
    '.gitignore'
  ];

  // Path Traversal saldırılarını önle (../ engelle)
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let targetFile = safePath === '/' ? 'index.html' : safePath.replace(/^\/+/, '');
  const fileName = path.basename(targetFile).toLowerCase();

  // Hassas dosya veya nokta ile başlayan gizli dosyalara doğrudan erişim yasak
  if (FORBIDDEN_FILES.includes(fileName) || fileName.startsWith('.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 - Erişim Yasaklandı');
    return;
  }

  // İzin verilen uzantılar kontrolü (Manifest.json hariç json indirilmesi engelli)
  const ext = path.extname(targetFile).toLowerCase();
  const ALLOWED_EXTS = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.webmanifest'];
  if (ext === '.json' && fileName !== 'manifest.json') {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 - Güvenlik Nedeniyle Erişim Engellendi');
    return;
  }
  if (ext && !ALLOWED_EXTS.includes(ext) && ext !== '.json') {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 - Geçersiz Dosya Türü');
    return;
  }

  let filePath = path.join(PUBLIC_DIR, targetFile);

  if (!fs.existsSync(filePath)) {
    // Eğer public klasöründe yoksa ana dizine de bak (GitHub upload kolaylığı)
    const rootCandidate = path.join(__dirname, targetFile);
    if (fs.existsSync(rootCandidate) && !fs.statSync(rootCandidate).isDirectory()) {
      filePath = rootCandidate;
    }
  }

  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath += '.html';
    } else if (fs.existsSync(path.join(PUBLIC_DIR, targetFile + '.html'))) {
      filePath = path.join(PUBLIC_DIR, targetFile + '.html');
    } else if (fs.existsSync(path.join(__dirname, targetFile + '.html'))) {
      filePath = path.join(__dirname, targetFile + '.html');
    }
  }

  if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Erişim reddedildi');
    return;
  }

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
