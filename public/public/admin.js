// Esnaf Yönetim Paneli Mantığı

let currentData = {
  store: {},
  products: []
};

let knownOrderIds = new Set();
let isFirstOrderLoad = true;

document.addEventListener('DOMContentLoaded', async () => {
  setupPinAuth();
  await fetchAdminData();
  setupAdminForms();
  setupCategoryEvents();
  setupOrderPolling();

  document.getElementById('test-bell-btn').addEventListener('click', () => {
    playOrderChime();
    showOrderNotification("🔔 Test Zili: Yeni sipariş geldiğinde böyle çalacak!");
  });
});

// --- 🔒 GÜVENLİK VE YETKİLENDİRME YARDIMCILARI ---
function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (sessionStorage.getItem('esnaf_token') || '')
  };
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// --- 🔒 PIN KODU GÜVENLİK KONTROLÜ ---
function setupPinAuth() {
  const pinModal = document.getElementById('pin-modal');
  const pinInput = document.getElementById('pin-input');
  const pinBtn = document.getElementById('pin-submit-btn');
  const pinError = document.getElementById('pin-error');

  // Oturumda zaten token var mı?
  if (sessionStorage.getItem('esnaf_token')) {
    pinModal.style.display = 'none';
    return;
  }

  async function checkPin() {
    const val = pinInput.value.trim();
    try {
      const res = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: val })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem('esnaf_token', data.token);
        pinModal.style.display = 'none';
        await fetchAdminData();
      } else {
        pinError.style.display = 'block';
        pinInput.value = '';
      }
    } catch (e) {
      pinError.style.display = 'block';
    }
  }

  pinBtn.addEventListener('click', checkPin);
  pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPin();
  });
}

// Sipariş Fişi Yazdırma (Mutfak & Kurye için)
window.printOrderReceipt = function(orderId) {
  fetch('/api/orders', { headers: getAuthHeaders() })
    .then(r => r.json())
    .then(orders => {
      const order = orders.find(o => o.id === orderId) || orders[0];
      if (!order) return;

      const itemsHtml = (order.items || []).map(i => `
        <tr>
          <td style="padding: 4px 0;">${escapeHtml(i.quantity)}x ${escapeHtml(i.product.name)}</td>
          <td style="text-align: right;">${i.product.price * i.quantity} TL</td>
        </tr>
      `).join('');

      const printWin = window.open('', '', 'width=400,height=600');
      printWin.document.write(`
        <html>
          <head>
            <title>Sipariş Fişi - #${escapeHtml(order.id || '')}</title>
            <style>
              body { font-family: monospace; padding: 15px; font-size: 13px; color: #000; }
              .center { text-align: center; }
              hr { border: none; border-top: 1px dashed #000; margin: 10px 0; }
              table { width: 100%; border-collapse: collapse; }
            </style>
          </head>
          <body>
            <div class="center">
              <h2 style="margin: 0;">${escapeHtml(currentData.store.name || 'SİPARİŞ FİŞİ')}</h2>
              <p style="margin: 4px 0;">${new Date(order.createdAt || Date.now()).toLocaleString('tr-TR')}</p>
            </div>
            <hr>
            <p><strong>Müşteri:</strong> ${escapeHtml(order.customer ? order.customer.name : '')}</p>
            <p><strong>Telefon:</strong> ${escapeHtml(order.customer ? order.customer.phone : '')}</p>
            <p><strong>Adres:</strong> ${escapeHtml(order.customer ? order.customer.address : '')}</p>
            ${order.customer && order.customer.note ? `<p><strong>Not:</strong> ${escapeHtml(order.customer.note)}</p>` : ''}
            <p><strong>Ödeme:</strong> ${escapeHtml(order.payment || '')}</p>
            <hr>
            <table>${itemsHtml}</table>
            <hr>
            <h3 style="text-align: right; margin: 0;">TOPLAM: ${order.total} TL</h3>
            <hr>
            <div class="center" style="font-size: 11px;">Afiyet Olsun!</div>
            <script>window.onload = function() { window.print(); window.close(); }<\/script>
          </body>
        </html>
      `);
      printWin.document.close();
    });
};

// Kristal Netliğinde "Ding-Dong!" 🔔 Sipariş Zili (Web Audio Sentezleyici)
function playOrderChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // 1. Ton: Ding (Sol notası - 784 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(784, now);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // 2. Ton: Dong (Do notası - 1046 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1046, now + 0.15);
    gain2.gain.setValueAtTime(0.6, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 1.2);
  } catch (e) {
    console.warn("Ses çalınamadı", e);
  }
}

// Canlı Sipariş Takibi ve Polling (Her 3.5 saniyede kontrol)
function setupOrderPolling() {
  pollOrders();
  setInterval(pollOrders, 3500);
}

async function pollOrders() {
  if (!sessionStorage.getItem('esnaf_token')) return;
  try {
    const res = await fetch('/api/orders', { headers: getAuthHeaders() });
    if (!res.ok) {
      if (res.status === 401) {
        sessionStorage.removeItem('esnaf_token');
        document.getElementById('pin-modal').style.display = 'flex';
      }
      return;
    }
    const orders = await res.json();

    const countEl = document.getElementById('live-order-count');
    if (countEl) countEl.textContent = orders.length;

    let hasNewOrder = false;
    let latestOrder = null;

    orders.forEach(o => {
      if (!knownOrderIds.has(o.id)) {
        knownOrderIds.add(o.id);
        if (!isFirstOrderLoad) {
          hasNewOrder = true;
          latestOrder = o;
        }
      }
    });

    if (hasNewOrder && latestOrder) {
      playOrderChime();
      const custName = (latestOrder.customer && latestOrder.customer.name) || 'Müşteri';
      showOrderNotification(`🎉 YENİ SİPARİŞ: ${custName} (${latestOrder.total} TL)`);
    }

    isFirstOrderLoad = false;
    renderLiveOrders(orders);
  } catch (e) {}
}

function renderLiveOrders(orders) {
  const container = document.getElementById('orders-list');
  const noText = document.getElementById('no-order-text');
  if (!container) return;

  if (orders.length === 0) {
    if (noText) noText.style.display = 'block';
    container.innerHTML = '';
    return;
  }

  if (noText) noText.style.display = 'none';

  container.innerHTML = orders.slice(0, 10).map(o => {
    const itemsDesc = (o.items || []).map(i => `${escapeHtml(i.quantity)}x ${escapeHtml(i.product.name)}`).join(', ');
    const time = new Date(o.createdAt || Date.now()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const custName = escapeHtml((o.customer && o.customer.name) || 'Müşteri');
    const custAddr = escapeHtml((o.customer && o.customer.address) || '');
    const payment = escapeHtml(o.payment || '');

    return `
      <div style="background: white; border: 1px solid var(--border); border-left: 4px solid var(--primary); padding: 10px 14px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 800; font-size: 14px;">${custName} <span style="font-size: 11px; font-weight: normal; color: var(--text-muted);">(${time})</span></div>
          <div style="font-size: 12px; color: var(--text-muted);">${itemsDesc}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">📍 ${custAddr} • 💳 ${payment}</div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <div style="font-size: 15px; font-weight: 800; color: var(--primary);">${escapeHtml(o.total)} TL</div>
          <button onclick="printOrderReceipt('${escapeHtml(o.id || '')}')" style="background: #f1f5f9; border: 1px solid var(--border); border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; font-weight: 600;">🖨️ Fiş Yazdır</button>
        </div>
      </div>
    `;
  }).join('');
}

function showOrderNotification(text) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 9999;
    background: #065f46; color: white; padding: 14px 20px;
    border-radius: 12px; font-weight: 800; font-size: 14px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25); border: 2px solid #34d399;
    animation: slideIn 0.3s ease-out;
  `;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 6000);
}

async function fetchAdminData() {
  if (!sessionStorage.getItem('esnaf_token')) return;
  try {
    const res = await fetch('/api/admin-data', { headers: getAuthHeaders() });
    if (res.ok) {
      currentData = await res.json();
      populateStoreForm();
      renderProductTable();
    } else if (res.status === 401) {
      sessionStorage.removeItem('esnaf_token');
      document.getElementById('pin-modal').style.display = 'flex';
    }
  } catch (err) {
    alert("Veriler yüklenirken hata oluştu.");
  }
}

function populateStoreForm() {
  const s = currentData.store || {};
  document.getElementById('adm-store-name').value = s.name || '';
  document.getElementById('adm-store-phone').value = s.phone || '';
  document.getElementById('adm-min-order').value = s.minOrder || 0;
  document.getElementById('adm-delivery-time').value = s.deliveryTime || '';
  document.getElementById('adm-pin').value = s.pin || '1234';
  document.getElementById('adm-logo').value = s.logo || '';
  
  const isOpenCheckbox = document.getElementById('adm-is-open');
  isOpenCheckbox.checked = s.isOpen !== false;
  updateOpenStatusLabel(isOpenCheckbox.checked);

  isOpenCheckbox.addEventListener('change', (e) => {
    updateOpenStatusLabel(e.target.checked);
  });

  renderCategories();
}

// Kategorileri Yönetim Kutusunda ve Ürün Ekleme Seçiminde Göster
function renderCategories() {
  const chipsContainer = document.getElementById('category-chips-list');
  const catSelect = document.getElementById('p-category');
  if (!chipsContainer || !catSelect) return;

  chipsContainer.innerHTML = '';
  catSelect.innerHTML = '';

  const categories = currentData.categories || [];

  categories.forEach(cat => {
    // Kategori Çipi
    const chip = document.createElement('div');
    chip.style.cssText = 'background: white; border: 1px solid var(--border); padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px;';
    chip.innerHTML = `
      <span>${cat.name}</span>
      <button onclick="deleteCategory('${cat.id}')" style="background: none; border: none; color: #ef4444; font-size: 14px; cursor: pointer; font-weight: bold;">&times;</button>
    `;
    chipsContainer.appendChild(chip);

    // Ürün Ekle Dropdown Seçeneği
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    catSelect.appendChild(opt);
  });
}

function setupCategoryEvents() {
  document.getElementById('add-cat-btn').addEventListener('click', async () => {
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if (!name) return;

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ id, name })
      });
      if (res.ok) {
        input.value = '';
        await fetchAdminData();
      }
    } catch (e) {
      alert("Kategori eklenemedi");
    }
  });
}

window.deleteCategory = async function(id) {
  if (!confirm("Bu kategoriyi silmek istediğinize emin misiniz?")) return;
  try {
    const res = await fetch(`/api/categories?id=${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      await fetchAdminData();
    } else {
      alert("Kategori silinemedi. Lütfen sunucuyu yeniden başlatın.");
    }
  } catch (e) {
    alert("Bağlantı hatası oluştu.");
  }
};

function updateOpenStatusLabel(isOpen) {
  const label = document.getElementById('open-status-label');
  label.textContent = isOpen ? 'Dükkan Açık (Sipariş Alıyor)' : 'Dükkan Kapalı (Sipariş Alınmıyor)';
  label.style.color = isOpen ? '#10b981' : '#ef4444';
}

function renderProductTable() {
  const tbody = document.getElementById('admin-product-table');
  const countEl = document.getElementById('prod-count');
  tbody.innerHTML = '';

  const products = currentData.products || [];
  countEl.textContent = products.length;

  products.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${p.image || ''}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;"></td>
      <td><strong>${p.name}</strong><br><small style="color: #64748b;">${p.description || ''}</small></td>
      <td><span style="text-transform: capitalize; background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${p.category}</span></td>
      <td><strong>${p.price} TL</strong></td>
      <td>
        <button onclick="toggleAvailability('${p.id}')" style="border: none; background: ${p.isAvailable !== false ? '#dcfce7' : '#fee2e2'}; color: ${p.isAvailable !== false ? '#15803d' : '#b91c1c'}; padding: 4px 8px; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px;">
          ${p.isAvailable !== false ? 'Satışta' : 'Tükendi'}
        </button>
      </td>
      <td>
        <button class="btn-danger" onclick="deleteProduct('${p.id}')">Sil</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function setupAdminForms() {
  // Dükkan Ayarlarını Kaydet
  document.getElementById('store-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const updatedStore = {
      name: document.getElementById('adm-store-name').value.trim(),
      phone: document.getElementById('adm-store-phone').value.trim().replace(/[^0-9]/g, ''),
      minOrder: Number(document.getElementById('adm-min-order').value),
      deliveryTime: document.getElementById('adm-delivery-time').value.trim(),
      pin: document.getElementById('adm-pin').value.trim() || '1234',
      logo: document.getElementById('adm-logo').value.trim(),
      isOpen: document.getElementById('adm-is-open').checked
    };

    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatedStore)
      });
      if (res.ok) {
        alert("✅ Dükkan ve WhatsApp ayarları başarıyla kaydedildi!");
      }
    } catch (err) {
      alert("Kayıt sırasında hata oluştu.");
    }
  });

  // Yeni Ürün Ekle
  document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newProduct = {
      name: document.getElementById('p-name').value.trim(),
      category: document.getElementById('p-category').value,
      price: Number(document.getElementById('p-price').value),
      image: document.getElementById('p-image').value.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80',
      description: document.getElementById('p-desc').value.trim(),
      isAvailable: true
    };

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        alert("✅ Yeni ürün menüye eklendi!");
        document.getElementById('add-product-form').reset();
        await fetchAdminData();
      }
    } catch (err) {
      alert("Ürün eklenirken hata oluştu.");
    }
  });
}

// Ürünü Satışta / Tükendi Yap
window.toggleAvailability = async function(id) {
  const prod = currentData.products.find(p => p.id === id);
  if (!prod) return;

  prod.isAvailable = prod.isAvailable === false ? true : false;

  await fetch('/api/products', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(prod)
  });

  renderProductTable();
};

// Ürünü Sil
window.deleteProduct = async function(id) {
  if (!confirm("Bu ürünü menüden silmek istediğinize emin misiniz?")) return;

  await fetch(`/api/products?id=${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  await fetchAdminData();
};
