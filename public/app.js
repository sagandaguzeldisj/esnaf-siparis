// Müşteri Menüsü, Kupon ve WhatsApp Entegrasyon Mantığı (Çoklu Restoran Destekli)

const urlParams = new URLSearchParams(window.location.search);
const currentStoreSlug = (urlParams.get('store') || 'lagabla').toLowerCase().trim();

let storeData = {
  store: {},
  categories: [],
  products: [],
  coupons: []
};

let cart = []; // [{ product, quantity }]
let activeCategory = 'all';
let appliedCoupon = null; // { code, discountPercent }

// Sayfa Yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
  await loadStoreData();
  loadCartFromStorage();
  setupEventListeners();
  setupCategoryScroll();
  renderProducts();
  updateCartUI();
});

// Bilgisayarda Fare Tekerleği & Sürükleme ile Kategori Kaydırma
function setupCategoryScroll() {
  const tabs = document.getElementById('category-tabs');
  if (!tabs) return;

  // Fare tekerleğiyle sağa/sola akıcı kaydırma
  tabs.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      tabs.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // Fareyle basılı tutup sağa/sola çekme (Drag-to-scroll)
  let isDown = false;
  let startX;
  let scrollLeft;

  tabs.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - tabs.offsetLeft;
    scrollLeft = tabs.scrollLeft;
  });

  tabs.addEventListener('mouseleave', () => { isDown = false; });
  tabs.addEventListener('mouseup', () => { isDown = false; });

  tabs.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - tabs.offsetLeft;
    const walk = (x - startX) * 1.5;
    tabs.scrollLeft = scrollLeft - walk;
  });
}

// Menü ve Dükkan Verisini Çek
async function loadStoreData() {
  try {
    const res = await fetch(`/api/data?store=${encodeURIComponent(currentStoreSlug)}`);
    if (res.ok) {
      storeData = await res.json();
      applyStoreInfo();
      renderCategories();
      return;
    }
  } catch (err) {
    console.warn("Sunucu verisi alınamadı", err);
  }
}

// Dükkan Bilgilerini Ekrana Bas
function applyStoreInfo() {
  const s = storeData.store || {};
  document.getElementById('store-name').textContent = s.name || 'Dükkan Menüsü';
  document.getElementById('store-slogan').textContent = s.slogan || '';
  document.getElementById('delivery-time').textContent = s.deliveryTime || '30-45 dk';
  document.getElementById('min-order').textContent = (s.minOrder || 0) + ' TL';

  const ratingEl = document.getElementById('store-rating');
  if (ratingEl && s.rating) ratingEl.textContent = s.rating;
  const reviewsEl = document.getElementById('store-reviews');
  if (reviewsEl && s.reviewCount) reviewsEl.textContent = s.reviewCount;

  const adminLink = document.getElementById('header-admin-link');
  if (adminLink) adminLink.href = `/admin.html?store=${encodeURIComponent(currentStoreSlug)}`;

  const logoEl = document.getElementById('store-logo');
  if (logoEl && s.logo) logoEl.src = s.logo;

  const statusBadge = document.getElementById('store-status');
  const statusText = document.getElementById('status-text');
  if (s.isOpen !== false) {
    statusBadge.className = 'status-badge open';
    statusText.textContent = 'Sipariş Alıyor';
  } else {
    statusBadge.className = 'status-badge closed';
    statusText.textContent = 'Şu An Kapalı';
  }
}

// Kategorileri Oluştur
function renderCategories() {
  const tabs = document.getElementById('category-tabs');
  tabs.innerHTML = '<button class="category-chip active" data-category="all">Tümü</button>';

  (storeData.categories || []).forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-chip';
    btn.dataset.category = cat.id;
    btn.textContent = cat.name;
    tabs.appendChild(btn);
  });
}

// Ürünleri Listele
function renderProducts(searchQuery = '') {
  const list = document.getElementById('product-list');
  list.innerHTML = '';

  const q = searchQuery.toLowerCase().trim();

  const filtered = (storeData.products || []).filter(p => {
    const matchesCat = (activeCategory === 'all' || p.category === activeCategory);
    const matchesQuery = !q || p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
    return matchesCat && matchesQuery;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <p style="font-size: 32px; margin-bottom: 8px;">🍽️</p>
        <p style="font-weight: 600;">Aradığınız ürün bulunamadı.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';

    const cartItem = cart.find(c => c.product.id === p.id);
    const inCartQty = cartItem ? cartItem.quantity : 0;

    card.innerHTML = `
      <div class="product-img-wrap">
        <img src="${p.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80'}" alt="${p.name}" class="product-img" loading="lazy">
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
      </div>
      <div class="product-details">
        <h3 class="product-name">${p.name}</h3>
        <p class="product-desc">${p.description || ''}</p>
        <div class="product-bottom">
          <span class="product-price">${p.price} TL</span>
          ${p.isAvailable !== false ? `
            <button class="add-btn" onclick="addToCart('${p.id}')">
              ${inCartQty > 0 ? `<span>✓ (${inCartQty})</span> +` : '+ Ekle'}
            </button>
          ` : `
            <span class="sold-out-badge">Tükendi</span>
          `}
        </div>
      </div>
    `;

    list.appendChild(card);
  });
}

// Sepete Ekle
window.addToCart = function(productId) {
  const prod = storeData.products.find(p => p.id === productId);
  if (!prod) return;

  const existing = cart.find(c => c.product.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ product: prod, quantity: 1 });
  }

  saveCartToStorage();
  updateCartUI();
  renderProducts(document.getElementById('search-input').value);
};

// Sepetten Adet Güncelle
window.changeQuantity = function(productId, delta) {
  const idx = cart.findIndex(c => c.product.id === productId);
  if (idx === -1) return;

  cart[idx].quantity += delta;
  if (cart[idx].quantity <= 0) {
    cart.splice(idx, 1);
  }

  saveCartToStorage();
  updateCartUI();
  renderProducts(document.getElementById('search-input').value);
};

// Sepet Arayüzünü ve Fiyatları Güncelle
function updateCartUI() {
  const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  // İndirim Hesabı
  let discountAmount = 0;
  if (appliedCoupon) {
    discountAmount = Math.round((subtotal * appliedCoupon.discountPercent) / 100);
  }
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const cartBar = document.getElementById('cart-bar');
  const cartTotalQty = document.getElementById('cart-total-qty');
  const cartBarTotal = document.getElementById('cart-bar-total');

  const drawerSubtotal = document.getElementById('drawer-subtotal');
  const drawerDiscount = document.getElementById('drawer-discount');
  const discountRow = document.getElementById('discount-row');
  const discountCodeName = document.getElementById('discount-code-name');
  const drawerTotal = document.getElementById('drawer-total-amount');

  if (totalQty > 0) {
    cartBar.style.display = 'flex';
    cartTotalQty.textContent = totalQty;
    cartBarTotal.textContent = finalTotal + ' TL';
    if (drawerSubtotal) drawerSubtotal.textContent = subtotal + ' TL';

    if (discountRow) {
      if (appliedCoupon && discountAmount > 0) {
        discountRow.style.display = 'flex';
        discountCodeName.textContent = `%${appliedCoupon.discountPercent} (${appliedCoupon.code})`;
        drawerDiscount.textContent = `-${discountAmount} TL`;
      } else {
        discountRow.style.display = 'none';
      }
    }

    if (drawerTotal) drawerTotal.textContent = finalTotal + ' TL';
  } else {
    cartBar.style.display = 'none';
    closeCart();
    if (drawerSubtotal) drawerSubtotal.textContent = '0 TL';
    if (discountRow) discountRow.style.display = 'none';
    if (drawerTotal) drawerTotal.textContent = '0 TL';
  }

  // Ücretsiz Teslimat İlerleme Çubuğu Güncellemesi
  const freeDeliveryThreshold = 400;
  const progressFill = document.getElementById('delivery-progress-fill');
  const progressText = document.getElementById('free-delivery-text');
  if (progressFill && progressText) {
    if (subtotal === 0) {
      progressFill.style.width = '0%';
      progressText.innerHTML = `🎁 <strong>${freeDeliveryThreshold} TL</strong> üzerine Ücretsiz Teslimat!`;
    } else if (subtotal < freeDeliveryThreshold) {
      const pct = Math.min(100, Math.round((subtotal / freeDeliveryThreshold) * 100));
      const remaining = freeDeliveryThreshold - subtotal;
      progressFill.style.width = pct + '%';
      progressText.innerHTML = `🎁 Ücretsiz teslimata <strong>${remaining} TL</strong> kaldı!`;
    } else {
      progressFill.style.width = '100%';
      progressText.innerHTML = `🎉 <strong>Tebrikler!</strong> Ücretsiz Teslimat Kazandınız!`;
    }
  }

  // Minimum Paket Uyarısı
  const minOrder = (storeData.store && storeData.store.minOrder) || 0;
  const warning = document.getElementById('min-order-warning');
  if (finalTotal < minOrder && totalQty > 0) {
    warning.style.display = 'block';
    warning.textContent = `⚠️ Minimum paket tutarı ${minOrder} TL'dir (${minOrder - finalTotal} TL daha ekleyin).`;
  } else {
    warning.style.display = 'none';
  }

  renderCartItems();
}

// Sepetteki Öğeleri Çiz
function renderCartItems() {
  const container = document.getElementById('cart-items-container');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px 0;">Sepetiniz boş.</p>';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item-row">
      <div>
        <div class="cart-item-name">${item.product.name}</div>
        <div class="cart-item-price">${item.product.price} TL × ${item.quantity} = <strong>${item.product.price * item.quantity} TL</strong></div>
      </div>
      <div class="quantity-control">
        <button class="qty-btn" onclick="changeQuantity('${item.product.id}', -1)">-</button>
        <span style="font-weight: 700; font-size: 14px; min-width: 16px; text-align: center;">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQuantity('${item.product.id}', 1)">+</button>
      </div>
    </div>
  `).join('');
}

// Kupon Uygula
function applyCoupon() {
  const codeInput = document.getElementById('coupon-input');
  const msgEl = document.getElementById('coupon-message');
  if (!codeInput) return;

  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    appliedCoupon = null;
    msgEl.style.display = 'none';
    updateCartUI();
    return;
  }

  const coupons = storeData.coupons || [
    { code: "ILK10", discountPercent: 10, minCart: 100 },
    { code: "ESNAF15", discountPercent: 15, minCart: 200 }
  ];

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const found = coupons.find(c => c.code === code);

  if (!found) {
    msgEl.style.display = 'block';
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = '❌ Geçersiz kupon kodu!';
    appliedCoupon = null;
  } else if (subtotal < (found.minCart || 0)) {
    msgEl.style.display = 'block';
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = `❌ Bu kupon en az ${found.minCart} TL siparişlerde geçerlidir.`;
    appliedCoupon = null;
  } else {
    appliedCoupon = found;
    msgEl.style.display = 'block';
    msgEl.style.color = 'var(--primary)';
    msgEl.textContent = `🎉 %${found.discountPercent} indirim uygulandı!`;
  }

  updateCartUI();
}

// Olay Dinleyicileri
function setupEventListeners() {
  document.getElementById('search-input').addEventListener('input', (e) => {
    renderProducts(e.target.value);
  });

  document.getElementById('category-tabs').addEventListener('click', (e) => {
    if (e.target.classList.contains('category-chip')) {
      document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      activeCategory = e.target.dataset.category;
      renderProducts(document.getElementById('search-input').value);
    }
  });

  document.getElementById('open-cart-btn').addEventListener('click', openCart);
  document.getElementById('close-cart-btn').addEventListener('click', closeCart);

  const applyBtn = document.getElementById('apply-coupon-btn');
  if (applyBtn) applyBtn.addEventListener('click', applyCoupon);

  document.getElementById('send-whatsapp-btn').addEventListener('click', submitOrderViaWhatsApp);
}

function openCart() {
  document.getElementById('cart-modal').classList.add('open');
}

function closeCart() {
  document.getElementById('cart-modal').classList.remove('open');
}

// --- WHATSAPP MESAJI OLUŞTURUCU ---
async function submitOrderViaWhatsApp() {
  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const address = document.getElementById('cust-address').value.trim();
  const note = document.getElementById('cust-note').value.trim();
  const payment = document.getElementById('cust-payment').value;

  if (!name || !address) {
    alert("Lütfen adınızı ve teslimat adresinizi eksiksiz doldurunuz!");
    return;
  }

  if (cart.length === 0) {
    alert("Sepetinizde ürün bulunmamaktadır!");
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  let discountAmount = 0;
  if (appliedCoupon) {
    discountAmount = Math.round((subtotal * appliedCoupon.discountPercent) / 100);
  }
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const minOrder = (storeData.store && storeData.store.minOrder) || 0;
  if (finalTotal < minOrder) {
    alert(`Minimum paket tutarı ${minOrder} TL'dir.`);
    return;
  }

  const itemsText = cart.map(item => `• ${item.quantity}x ${item.product.name} (${item.product.price * item.quantity} TL)`).join('\n');

  let discountText = '';
  if (appliedCoupon && discountAmount > 0) {
    discountText = `🎟️ *Kupon:* ${appliedCoupon.code} (-${discountAmount} TL, %${appliedCoupon.discountPercent})\n`;
  }

  const message = 
`🔔 *YENİ SİPARİŞ VAR!*
━━━━━━━━━━━━━━━━━━
👤 *Müşteri:* ${name}
📞 *Telefon:* ${phone || 'Belirtilmedi'}
📍 *Adres:* ${address}
${note ? `📝 *Not:* ${note}\n` : ''}💳 *Ödeme:* ${payment}
━━━━━━━━━━━━━━━━━━
*SİPARİŞ DETAYI:*
${itemsText}
━━━━━━━━━━━━━━━━━━
Ara Toplam: ${subtotal} TL
${discountText}💰 *ÖDENECEK TUTAR:* *${finalTotal} TL*

_Siparişi onaylıyor musunuz?_`;

  // Sunucuya kaydet (admin panelde canlı zil çalması için)
  try {
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: currentStoreSlug,
        customer: { name, phone, address, note },
        items: cart,
        payment,
        coupon: appliedCoupon ? appliedCoupon.code : null,
        discount: discountAmount,
        total: finalTotal
      })
    }).catch(() => {});
  } catch (e) {}

  const storePhone = (storeData.store && storeData.store.phone) ? storeData.store.phone.replace(/[^0-9]/g, '') : '905551234567';
  const waUrl = `https://wa.me/${storePhone}?text=${encodeURIComponent(message)}`;

  window.open(waUrl, '_blank');

  cart = [];
  appliedCoupon = null;
  saveCartToStorage();
  updateCartUI();
  closeCart();
}

function saveCartToStorage() {
  localStorage.setItem('esnaf_cart', JSON.stringify(cart));
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem('esnaf_cart');
    if (raw) cart = JSON.parse(raw);
  } catch (e) {
    cart = [];
  }
}
