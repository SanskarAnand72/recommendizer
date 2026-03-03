'use strict';
/**
 * Levi's India Chatbot
 * Smart fashion assistant with intent detection,
 * domain gating, conversational mode, and AI product search.
 */

/* ── CONFIG ── */
const PROXY =
  window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : "https://recommendizer.onrender.com";

/* ── DOM ── */
const cw = document.getElementById('cw');
const cwPopup = document.getElementById('cwPopup');
const cwToggle = document.getElementById('cwToggle');
const cwBadge = document.getElementById('cwBadge');
const iconChat = document.getElementById('iconChat');
const iconDown = document.getElementById('iconDown');

const screenHome = document.getElementById('cwScreenHome');
const screenChats = document.getElementById('cwScreenChats');
const screenOffers = document.getElementById('cwScreenOffers');
const screenForm = document.getElementById('cwScreenForm');
const SCREENS = { Home: screenHome, Chats: screenChats, Offers: screenOffers, Form: screenForm };

const cwMessages = document.getElementById('cwMessages');
const cwInput = document.getElementById('cwInput');
const cwSendBtn = document.getElementById('cwSendBtn');
const cwBackBtn = document.getElementById('cwBackBtn');
const cwOffersBody = document.getElementById('cwOffersBody');
const cwFormSubmit = document.getElementById('cwFormSubmit');
const cwFormNote = document.getElementById('cwFormNote');
const cwTabs = document.querySelectorAll('.cw-tab');

const cwAskBtn = document.getElementById('cwAskBtn');
const cwTrackBtn = document.getElementById('cwTrackBtn');
const cwTryBtn = document.getElementById('cwTryBtn');
const cwConvCard = document.getElementById('cwConvCard');
const cwWhatsappBtn = document.getElementById('cwWhatsappBtn');
const cwOffersBtn = document.getElementById('cwOffersBtn');
const cwHumanBtn = document.getElementById('cwHumanBtn');

/* ── State ── */
const S = { open: false, flow: null, step: 0, data: {}, lastFilters: {} };

/* ── Static data ── */
const OFFERS = [
  { icon: '🔥', title: 'FLAT 30% OFF', desc: 'On all new arrivals & denim. Limited time!', code: 'LEVIS30', color: '#C8102E' },
  { icon: '👖', title: 'BUY 1 GET 1', desc: 'On select 501® jeans & chinos collections.', code: 'BOGO501', color: '#1d4ed8' },
  { icon: '🚚', title: 'FREE SHIPPING', desc: 'On all orders above ₹999 across India.', code: 'FREESHIP', color: '#0891b2' },
  { icon: '🎉', title: 'SEASONAL SALE', desc: 'Up to 50% off on jackets & winterwear!', code: 'WINTER50', color: '#16a34a' },
];

const ORDERS = {
  'LV123456': { status: 'shipped', courier: 'Delhivery', eta: 'Feb 24, 2026', link: '#' },
  'LV654321': { status: 'delivered', courier: 'BlueDart', eta: 'Feb 20, 2026', link: '#' },
  'LV999000': { status: 'processing', courier: 'DTDC', eta: 'Feb 27, 2026', link: '#' },
};

const SIZE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const FIT_TIPS = {
  slim: "Slim frames look great in Levi's 511 Slim or 510 Skinny.",
  regular: "Regular builds suit the classic 501 Original or 505 Regular.",
  athletic: "Athletic builds do great in 512 Taper — extra room in thigh, tapered at ankle.",
  curvy: "Levi's Curve ID jeans are designed for your shape.",
};

/* ── Helpers ── */
const now = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function parseH(s) {
  const fi = s.match(/(\d+)'(\d+)/); if (fi) return Math.round(+fi[1] * 30.48 + +fi[2] * 2.54);
  const cm = s.match(/(\d+)\s*cm/i); if (cm) return +cm[1];
  const n = s.match(/^(\d+)$/); if (n && +n[1] > 100 && +n[1] < 250) return +n[1];
  return null;
}
function parseW(s) {
  const kg = s.match(/(\d+)\s*kg/i); if (kg) return +kg[1];
  const n = s.match(/^(\d+)/); if (n) return +n[1];
  return null;
}
function getSizeIdx(h, w) {
  if (w < 50 || h < 155) return 0; if (w < 60 || h < 162) return 1;
  if (w < 70 || h < 170) return 2; if (w < 80 || h < 178) return 3;
  if (w < 90 || h < 185) return 4; return 5;
}

/* ══════════════════════════════════════════════════════════════
   CORE AI PIPELINE
══════════════════════════════════════════════════════════════ */

/**
 * Main message processor — all user input flows through here.
 */
async function processMessage(rawInput) {
  const input = rawInput.trim();
  if (!input) return;

  // Show typing while we detect intent
  showTypingIndicator();

  try {
    // Step 1 — Detect intent via proxy
    const intentRes = await fetch(`${PROXY}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input }),
    });
    const { intent, filters, occasion } = await intentRes.json();

    switch (intent) {
      case 'greeting':
        await handleGreeting();
        break;

      case 'off_topic':
        await handleFashionChat(input, 'off_topic');
        break;

      case 'occasion_query':
        await handleOccasionQuery(input, occasion, filters);
        break;

      case 'product_query':
        await handleProductQuery(input, filters);
        break;

      case 'fashion_chat':
      default:
        await handleFashionChat(input);
        break;
    }
  } catch (err) {
    hideTyping();
    console.error('[Antigravity AI]', err);
    addBotMsg('Something went wrong. Please try again in a moment.');
  }
}

/* ── Greeting handler ── */
async function handleGreeting() {
  try {
    const res = await fetch(`${PROXY}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'hi', intent: 'greeting' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    hideTyping();
    addBotMsg(data.response, chips([
      ['Jeans', 'search:jeans'],
      ['Jackets', 'search:jackets'],
      ['Shirts', 'search:shirts'],
      ['Offers', 'flow:offers'],
    ]));
  } catch (err) {
    console.error('[handleGreeting]', err);
    hideTyping();
    addBotMsg('Hi 👋 What are you looking for today? Jeans, jackets, or shirts?');
  }
}

/* ── Occasion query handler ── */
/**
 * Step 0: Ask first clarifying question (via Groq, occasion_query intent).
 * Step 1: User answers q1 → ask a 2nd question OR go straight to search.
 * Step 2: User answers q2 → trigger product search.
 * Max 2 clarifying questions, then products are shown.
 */
async function handleOccasionQuery(input, occasion, filters = {}) {
  S.flow = 'occasion';
  S.step = 1;
  S.data.occasionInput   = input;
  S.data.occasion        = occasion || input;
  S.data.occasionFilters = filters;
  S.data.occasionAnswers = [];

  try {
    const res = await fetch(`${PROXY}/chat`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ query: input, intent: 'occasion_query' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    hideTyping();
    addBotMsg(data.response);
  } catch (err) {
    console.error('[handleOccasionQuery]', err);
    hideTyping();
    addBotMsg('Nice! Is this for men or women?');
  }
}

async function handleOccasionStep(input) {
  S.data.occasionAnswers = S.data.occasionAnswers || [];
  S.data.occasionAnswers.push(input);

  if (S.step >= 2) {
    // Already asked 2 questions — time to search
    S.flow = null; S.step = 0;
    const searchQuery = [S.data.occasion, ...S.data.occasionAnswers].join(' ');
    showTypingIndicator();
    await handleProductQuery(searchQuery, S.data.occasionFilters || {});
  } else {
    // Ask one follow-up (max), then on next answer search immediately
    S.step = 2;  // after this, next answer always triggers search
    showTypingIndicator();
    try {
      const res = await fetch(`${PROXY}/chat`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          query : `Occasion: ${S.data.occasion}. User said: ${input}`,
          intent: 'occasion_followup',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      hideTyping();
      addBotMsg(data.response + ' Let me pull up some great options now — just tell me what you like!');
    } catch (err) {
      console.error('[handleOccasionStep]', err);
      hideTyping();
      // Skip second question and go straight to search
      S.flow = null; S.step = 0;
      const searchQuery = [S.data.occasion, ...S.data.occasionAnswers].join(' ');
      showTypingIndicator();
      await handleProductQuery(searchQuery, S.data.occasionFilters || {});
    }
  }
}

/* ── Fashion chat handler (also handles off_topic) ── */
async function handleFashionChat(input, intent = 'fashion_chat') {
  try {
    const res = await fetch(`${PROXY}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input, intent }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    hideTyping();
    addBotMsg(data.response);
  } catch (err) {
    console.error('[handleFashionChat]', err);
    hideTyping();
    addBotMsg("I'm here to help you find fashion products from our store 👕 Let me know what you're looking for.");
  }
}

/* ── Product query handler ── */
async function handleProductQuery(input, filters = {}) {
  S.lastFilters = filters;
  try {
    const res = await fetch(`${PROXY}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input, filters }),
    });

    let data;
    try {
      data = await res.json();
    } catch (jsonErr) {
      hideTyping();
      console.error('[Product Search] JSON parse failed:', jsonErr);
      addBotMsg('Search returned an unreadable response. Please try again.',
        chips([['Retry', `search:${input}`]]));
      return;
    }
    hideTyping();

    console.log('[Product Search] HTTP', res.status, '| data:', JSON.stringify(data).slice(0, 300));

    if (!res.ok) {
      console.error('[Product Search] Server error:', data);
      addBotMsg(
        `Search service error: ${data.error || 'Unknown error'}`,
        chips([['Try Again', `search:${input}`], ['Browse', 'flow:search']])
      );
      return;
    }

    // ── No product found ──
    if (data.type === 'no_product') {
      addBotMsg(
        data.message || "Sorry, we couldn't find matching products right now.",
        chips([
          ['Try Something Else', 'flow:search'],
          ['View Offers', 'flow:offers'],
        ])
      );
      if (data.suggestion) {
        setTimeout(() => addBotMsg(data.suggestion), 400);
      }
      return;
    }

    // ── Product list — accept products from either key ──
    const productArray = data.products || data.items || data.results;
    if ((data.type === 'product_list' || productArray) && Array.isArray(productArray) && productArray.length > 0) {
      renderProductCards(productArray, filters);
      return;
    }

    // ── product_list with empty array — treat as no_product ──
    if (data.type === 'product_list' && Array.isArray(productArray) && productArray.length === 0) {
      addBotMsg(
        "Sorry, we couldn't find any matching products right now.",
        chips([['Try Something Else', 'flow:search'], ['View Offers', 'flow:offers']])
      );
      return;
    }

    // ── Truly unexpected shape (log to console only, show friendly message) ──
    console.warn('[Product Search] Unexpected response shape:', JSON.stringify(data).slice(0, 300));
    addBotMsg(
      "Sorry, something went wrong with your search. Please try again.",
      chips([['Try Again', 'flow:search'], ['View Offers', 'flow:offers']])
    );

  } catch (err) {
    hideTyping();
    console.error('[Product Search] Fetch error:', err);
    addBotMsg('I had trouble searching right now. Please try again in a moment.',
      chips([['Retry', `search:${input}`]]));
  }
}

/* ══════════════════════════════════════════════════════════════
   PRODUCT CARD RENDERER
   Accepts the flat product_list format returned by server v3:
   { name, price, rating, image, buy_url, try_on_enabled }
══════════════════════════════════════════════════════════════ */

/**
 * renderProductCards(products, filters)
 * products — array from server { name, price, rating, image, buy_url, try_on_enabled }
 */
function renderProductCards(products, filters = {}) {
  const count      = products.length;
  const colorLabel = filters.color ? ` ${filters.color}` : '';
  addBotMsg(`Here are ${count > 1 ? `${count}` : 'a'} great${colorLabel} pick${count > 1 ? 's' : ''} for you:`);

  products.forEach((product, i) => {
    setTimeout(() => {
      const card = buildProductCard({
        name    : product.name    || "Levi's Product",
        price   : product.price   || '',
        rating  : product.rating  || '',
        imageUrl: product.image   || '',
        prodUrl : product.buy_url || '#',
        isLast  : i === count - 1,
      });
      cwMessages.appendChild(card);
      scrollBottom();
    }, i * 350);
  });
}

/**
 * buildProductCard({ name, price, rating, imageUrl, prodUrl, isLast })
 * Builds a single product card DOM element.
 */
function buildProductCard({ name, price, rating, imageUrl, prodUrl, isLast }) {
  const row  = makeRow('bot');
  const wrap = row.querySelector('.cw-msg-wrap');

  // ── Product image ──
  const imgHtml = imageUrl
    ? `<div class="cw-prod-img-wrap">
         <img src="${imageUrl}" alt="${name}" class="cw-prod-img"
              onerror="this.parentElement.style.display='none'" />
       </div>`
    : `<div class="cw-prod-img-wrap cw-prod-img-placeholder">
         <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="1.5">
           <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
         </svg>
       </div>`;

  // ── Price ──
  const priceHtml = price
    ? `<span class="cw-prod-price">${String(price).startsWith('₹') ? '' : '₹'}${price}</span>`
    : '';

  // ── Rating ──
  const ratingNum  = parseFloat(rating);
  const ratingHtml = ratingNum
    ? `<span class="cw-prod-rating">★ ${ratingNum.toFixed(1)}</span>`
    : '';

  const priceRatingHtml = (priceHtml || ratingHtml)
    ? `<div class="cw-prod-price-row">${priceHtml}${ratingHtml}</div>`
    : '';

  // ── Card ──
  const card = document.createElement('div');
  card.className = 'cw-product-card';
  card.innerHTML = `
    ${imgHtml}
    <div class="cw-prod-body">
      <div class="cw-prod-name-row">
        <span class="cw-prod-name">${name}</span>
      </div>
      ${priceRatingHtml}
      <div class="cw-prod-actions">
        <a href="${prodUrl}" target="_blank" rel="noopener noreferrer" class="cw-btn-buy">Buy Now</a>
        <button class="cw-btn-tryon" data-name="${name}" data-img="${imageUrl}">Try On</button>
      </div>
    </div>
  `;

  card.querySelector('.cw-btn-tryon').addEventListener('click', () => {
    launchTryOn(name, imageUrl);
  });

  const t = document.createElement('span');
  t.className = 'cw-msg-time'; t.textContent = now();

  wrap.appendChild(card);
  wrap.appendChild(t);

  if (isLast) {
    wrap.appendChild(chips([
      ['Search Again', 'flow:search'],
      ['View Offers', 'flow:offers'],
      ['Home', 'flow:home'],
    ]));
  }

  return row;
}

/**
 * Try On — placeholder UI (future: photo upload + overlay)
 */
function launchTryOn(productName, productImage) {
  goToChat();
  addBotMsg(`Virtual Try-On for <b>${productName}</b> is coming soon. You will be able to upload your photo and see the product on you.`,
    chips([['Find More Products', 'flow:search'], ['View Offers', 'flow:offers']])
  );
}

/* ══════════════════════════════════════════════════════════════
   WIDGET TOGGLE
══════════════════════════════════════════════════════════════ */

cwToggle.addEventListener('click', () => {
  S.open = !S.open;
  cwPopup.classList.toggle('open', S.open);
  iconChat.classList.toggle('hidden', S.open);
  iconDown.classList.toggle('hidden', !S.open);
  cwBadge.classList.add('hidden');
});

/* ── Tabs ── */
cwTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const scr = tab.dataset.scr;
    switchScreen(scr);
    cwTabs.forEach(t => t.classList.toggle('active', t === tab));
    if (scr === 'Offers') renderOffers();
  });
});

function switchScreen(name) {
  Object.values(SCREENS).forEach(s => s.classList.remove('active'));
  SCREENS[name]?.classList.add('active');
}

/* ── Home buttons ── */
cwAskBtn.addEventListener('click', () => {
  S.flow = 'chat'; S.step = 0; S.data = {};
  goToChat();
  addBotMsg(
    "I'm your personal <b>Levi's AI Assistant</b>.<br><br>" +
    "Tell me what you're looking for and I'll find the perfect match.",
    chips([
      ['Men\'s Slim Jeans',  'search:mens slim fit jeans'],
      ['Women\'s Jeans',     'search:womens jeans'],
      ['Black Jeans',        'search:black jeans'],
      ['Blue Denim Jeans',   'search:blue denim jeans'],
      ['Women\'s Trousers',  'search:womens trousers'],
      ['Men\'s Trousers',    'search:mens trousers'],
    ])
  );
});

cwTrackBtn.addEventListener('click', () => {
  S.flow = 'track'; S.step = 1; S.data = {};
  goToChat();
  addBotMsg('Enter your <b>Order ID</b> to track your order.<br><i style="font-size:.78rem;color:#aaa">e.g. LV123456</i>');
});

cwTryBtn.addEventListener('click', () => {
  S.flow = 'tryon'; S.step = 0; S.data = {};
  goToChat();
  startTryOn();
});

cwConvCard.addEventListener('click', () => {
  S.flow = 'chat'; goToChat();
  addBotMsg('Welcome back. What can I help you find today?', chips([
    ['Find Products', 'flow:search'],
    ['Track Order', 'flow:track'],
    ['Size Finder', 'flow:tryon'],
    ['Offers', 'flow:offers'],
  ]));
});

cwWhatsappBtn.addEventListener('click', () => {
  goToChat();
  addBotMsg('Connect with us instantly on WhatsApp.');
  setTimeout(() => {
    const div = document.createElement('div');
    div.innerHTML = `<a href="https://wa.me/919999999999?text=Hello+Levi's+India!" target="_blank"
      style="display:flex;align-items:center;gap:12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:12px 14px;text-decoration:none;color:#111;margin-top:6px">
      <span style="font-size:1.5rem">💚</span>
      <div><div style="font-weight:700;font-size:.88rem">Chat on WhatsApp</div>
      <div style="font-size:.72rem;color:#666">Levi's India · Mon–Sat 10AM–7PM</div></div>
      <span style="margin-left:auto;color:#16a34a;font-weight:700">→</span></a>`;
    appendBubble('bot', div);
  }, 400);
  S.flow = null;
});

cwOffersBtn.addEventListener('click', () => {
  switchToTab('Offers');
  renderOffers();
});

cwHumanBtn.addEventListener('click', () => {
  S.flow = 'human'; S.step = 1; goToChat();
  addBotMsg("I'll connect you with a team member. What is this regarding?", chips([
    ['Order Issue', 'human:order'],
    ['Return/Exchange', 'human:return'],
    ['Payment', 'human:payment'],
    ['Product Query', 'human:product'],
    ['Other', 'human:other'],
  ]));
});

function goToChat() {
  switchScreen('Chats');
  cwTabs.forEach(t => t.classList.toggle('active', t.dataset.scr === 'Chats'));
}
function switchToTab(name) {
  switchScreen(name);
  cwTabs.forEach(t => t.classList.toggle('active', t.dataset.scr === name));
}

/* ── Back ── */
cwBackBtn.addEventListener('click', () => {
  S.flow = null; S.step = 0; S.data = {};
  switchScreen('Home');
  cwTabs.forEach(t => t.classList.toggle('active', t.dataset.scr === 'Home'));
});

/* ── Chat input ── */
cwSendBtn.addEventListener('click', sendMsg);
cwInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

function sendMsg() {
  const val = cwInput.value.trim();
  if (!val) return;
  cwInput.value = '';
  addUserMsg(val);
  routeInput(val);
}

/* ══════════════════════════════════════════════════════════════
   ROUTER  —  chip actions + active flows + fallback to AI
══════════════════════════════════════════════════════════════ */

function routeInput(input) {
  // ── Chip shortcuts ──
  if (input.startsWith('search:')) {
    const q = input.slice(7);
    // Route through the full intent pipeline — never bypass category validation
    processMessage(q);
    return;
  }

  if (input.startsWith('flow:')) {
    const f = input.slice(5);
    if (f === 'track') { S.flow = 'track'; S.step = 1; S.data = {}; addBotMsg('Enter your <b>Order ID</b>:'); return; }
    if (f === 'tryon') { S.flow = 'tryon'; S.step = 0; S.data = {}; startTryOn(); return; }
    if (f === 'offers') { switchToTab('Offers'); renderOffers(); return; }
    if (f === 'search') { addBotMsg('What are you looking for? Type a style, color, or category.'); S.flow = 'chat'; return; }
    if (f === 'home') { S.flow = null; switchScreen('Home'); cwTabs.forEach(t => t.classList.toggle('active', t.dataset.scr === 'Home')); return; }
  }

  if (input.startsWith('human:')) { handleHumanReason(input.slice(6)); return; }
  if (input.startsWith('tryon:')) { handleTryOnChip(input.slice(6)); return; }

  // ── Active flows ──
  if (S.flow === 'track') { handleTrack(input); return; }
  if (S.flow === 'tryon') { handleTryOnInput(input); return; }
  if (S.flow === 'human') return;

  // ── Occasion flow ──
  if (S.flow === 'occasion') {
    handleOccasionStep(input).catch(err => {
      console.error('[occasion flow]', err);
      hideTyping();
      addBotMsg('Sorry, something went wrong. What are you looking for?');
      S.flow = null; S.step = 0;
    });
    return;
  }

  // ── Everything else → AI intent pipeline ──
  processMessage(input);
}

/* ══════════════════════════════════════════════════════════════
   ORDER TRACKING
══════════════════════════════════════════════════════════════ */

function handleTrack(input) {
  if (S.step === 1) {
    S.data.orderId = input.trim().toUpperCase(); S.step = 2;
    addBotMsg('Now enter your <b>registered mobile or email</b>:');
  } else if (S.step === 2) {
    const c = input.trim();
    const valid = /^\d{10}$/.test(c) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
    if (!valid) { addBotMsg('Please enter a valid <b>10-digit mobile</b> or <b>email</b>.'); return; }
    S.data.contact = c;
    showTypingIndicator();
    setTimeout(async () => { hideTyping(); await showOrderResult(); }, 1400);
    S.flow = null;
  }
}

async function showOrderResult() {
  try {
    const res = await fetch(`${PROXY}/track-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: S.data.orderId, contact: S.data.contact }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (!data.found) {
      addBotMsg(`No order found for <b>${S.data.orderId}</b>. Please double-check your Order ID.`, chips([
        ['Try Again', 'flow:track'], ['Contact Support', 'human:order'], ['Home', 'flow:home'],
      ]));
      return;
    }
    const cls = { shipped: 's-shipped', delivered: 's-delivered', processing: 's-processing' }[data.status] || 's-processing';
    const lbl = { shipped: 'Shipped', delivered: 'Delivered', processing: 'Processing' }[data.status] || data.status;
    const div = document.createElement('div');
    div.innerHTML = `<div style="font-size:.83rem;margin-bottom:6px">Order status:</div>
      <div class="cw-order-card">
        <span class="cw-status-badge ${cls}">${lbl}</span>
        <div class="cw-ord-row"><span>Order ID</span><span>${data.orderId}</span></div>
        <div class="cw-ord-row"><span>Courier</span><span>${data.courier}</span></div>
        <div class="cw-ord-row"><span>Expected</span><span>${data.eta}</span></div>
        <a href="${data.link}" class="cw-track-link">Track on ${data.courier}</a>
      </div>`;
    div.className = 'cw-bubble bot';
    div.style.cssText = 'padding:12px 14px;background:#f3f3f3;border-radius:16px;border-bottom-left-radius:4px;';
    appendCustom(div, chips([['Home', 'flow:home'], ['Need Help', 'human:order']]));
  } catch (err) {
    console.error('[showOrderResult]', err);
    addBotMsg('Could not retrieve order details. Please try again or contact support.', chips([
      ['Try Again', 'flow:track'], ['Contact Support', 'human:order'], ['Home', 'flow:home'],
    ]));
  }
}

/* ══════════════════════════════════════════════════════════════
   SIZE FINDER
══════════════════════════════════════════════════════════════ */

const TO_STEPS = ['gender', 'height', 'weight', 'bodyType', 'fit'];

function startTryOn() {
  addBotMsg('Select your <b>gender</b> to get started:', stepsEl([
    ['Male', 'tryon:Male'], ['Female', 'tryon:Female'], ['Other', 'tryon:Other'],
  ]));
}

function handleTryOnChip(val) {
  S.data[TO_STEPS[S.step]] = val; S.step++;
  nextTryOnStep();
}

function handleTryOnInput(input) {
  const step = TO_STEPS[S.step];
  if (step === 'height') {
    const h = parseH(input);
    if (!h || h < 100 || h > 250) { addBotMsg("Enter a valid height (e.g. 5'9\", 175cm)."); return; }
    S.data.height = h;
  } else if (step === 'weight') {
    const w = parseW(input);
    if (!w || w < 30 || w > 250) { addBotMsg('Enter a valid weight (e.g. 65kg).'); return; }
    S.data.weight = w;
  }
  S.step++;
  nextTryOnStep();
}

function nextTryOnStep() {
  const step = TO_STEPS[S.step];
  if (step === 'height') addBotMsg('Your <b>height</b>? <i style="font-size:.78rem;color:#999">(e.g. 5\'10", 175cm)</i>');
  else if (step === 'weight') addBotMsg('Your <b>weight</b>? <i style="font-size:.78rem;color:#999">(e.g. 68kg)</i>');
  else if (step === 'bodyType') addBotMsg('Body type?', stepsEl([['Slim', 'tryon:slim'], ['Regular', 'tryon:regular'], ['Athletic', 'tryon:athletic'], ['Curvy', 'tryon:curvy']]));
  else if (step === 'fit') addBotMsg('Preferred fit?', stepsEl([['Slim Fit', 'tryon:slim'], ['Regular Fit', 'tryon:regular'], ['Relaxed Fit', 'tryon:relaxed']]));
  else computeSize();
}

function computeSize() {
  typingThen(() => {
    const { height: h, weight: w, bodyType: bt, fit: pf, gender: g } = S.data;
    const fitAdj = { slim: -1, regular: 0, relaxed: 1 }[pf] || 0;
    const idx = clamp(getSizeIdx(h, w) + fitAdj, 0, SIZE_SIZES.length - 1);
    const rec = SIZE_SIZES[idx];
    const alt = SIZE_SIZES[clamp(idx + 1, 0, SIZE_SIZES.length - 1)];
    const tip = FIT_TIPS[bt?.toLowerCase()] || FIT_TIPS.regular;

    const div = document.createElement('div');
    div.innerHTML = `Your recommended size:
      <div class="cw-size-card">
        <div class="cw-size-badge">Size ${rec}</div>
        <div class="cw-size-row"><span>Recommended</span><span>${rec}</span></div>
        <div class="cw-size-row"><span>Fit</span><span>${pf?.charAt(0).toUpperCase() + pf?.slice(1)} Fit</span></div>
        <div class="cw-size-row"><span>Profile</span><span>${g}, ${bt?.charAt(0).toUpperCase() + bt?.slice(1)}</span></div>
        <div class="cw-size-row"><span>Alternative</span><span>${alt} (more room)</span></div>
        <div class="cw-tip"><b>Tip:</b> ${tip}</div>
      </div>`;
    div.className = 'cw-bubble bot';
    div.style.cssText = 'padding:12px 14px;background:#f3f3f3;border-radius:16px;border-bottom-left-radius:4px;font-size:.85rem;';
    appendCustom(div, chips([
      ['Find Products in My Size', `search:${g || ''} ${bt || ''} jeans size ${rec}`],
      ['Home', 'flow:home'],
    ]));
    S.flow = null;
  }, 1200);
}

/* ══════════════════════════════════════════════════════════════
   HUMAN AGENT
══════════════════════════════════════════════════════════════ */

function handleHumanReason(reason) {
  typingThen(() => {
    const div = document.createElement('div');
    div.innerHTML = `Connecting you for <b>${reason.replace(/-/g, ' ')}</b>...
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-top:8px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ec4899);display:flex;align-items:center;justify-content:center;font-size:.9rem">👩‍💼</div>
          <div><div style="font-weight:700;font-size:.85rem">Priya Sharma</div>
               <div style="font-size:.7rem;color:#16a34a">Online · Fashion Expert</div></div>
        </div>
        <button id="connectNowBtn" style="width:100%;background:#111;color:#fff;border:none;padding:9px;border-radius:100px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit">Connect Now</button>
      </div>`;
    div.className = 'cw-bubble bot';
    div.style.cssText = 'padding:12px 14px;background:#f3f3f3;border-radius:16px;border-bottom-left-radius:4px;font-size:.85rem;';
    const row = makeRow('bot');
    const t = document.createElement('span'); t.className = 'cw-msg-time'; t.textContent = now();
    row.querySelector('.cw-msg-wrap').appendChild(div);
    row.querySelector('.cw-msg-wrap').appendChild(t);

    div.querySelector('#connectNowBtn').addEventListener('click', function () {
      this.textContent = 'Connecting... (~2 min wait)';
      this.disabled = true;
      setTimeout(() => addBotMsg('You are in queue. Estimated wait: <b>~2 minutes</b>.', chips([['Home', 'flow:home']])), 1000);
    });

    cwMessages.appendChild(row);
    scrollBottom();
    S.flow = null;
  }, 1000);
}

/* ══════════════════════════════════════════════════════════════
   OFFERS
══════════════════════════════════════════════════════════════ */

function renderOffers() {
  if (cwOffersBody.childElementCount > 0) return;
  OFFERS.forEach(o => {
    const d = document.createElement('div');
    d.className = 'cw-offer-card';
    d.style.setProperty('--oc', o.color);
    d.innerHTML = `<span class="cw-offer-icon">${o.icon}</span>
      <div class="cw-offer-title">${o.title}</div>
      <div class="cw-offer-desc">${o.desc}</div>
      <span class="cw-offer-code" data-code="${o.code}">${o.code}</span>`;
    d.querySelector('.cw-offer-code').addEventListener('click', function (e) {
      e.stopPropagation();
      navigator.clipboard.writeText(o.code).catch(() => { });
      this.textContent = 'Copied!';
      setTimeout(() => { this.textContent = o.code; }, 1800);
    });
    cwOffersBody.appendChild(d);
  });
}

/* ══════════════════════════════════════════════════════════════
   CONTACT FORM
══════════════════════════════════════════════════════════════ */

cwFormSubmit.addEventListener('click', async () => {
  const nm = document.getElementById('cf_name')?.value.trim();
  const em = document.getElementById('cf_email')?.value.trim();
  const mb = document.getElementById('cf_mobile')?.value.trim();
  const ms = document.getElementById('cf_msg')?.value.trim();
  if (!nm || !em || !mb || !ms) { cwFormNote.style.color = '#ef4444'; cwFormNote.textContent = 'Please fill all fields.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { cwFormNote.style.color = '#ef4444'; cwFormNote.textContent = 'Invalid email.'; return; }
  if (!/^\d{10}$/.test(mb)) { cwFormNote.style.color = '#ef4444'; cwFormNote.textContent = 'Invalid mobile number.'; return; }
  cwFormSubmit.disabled = true; cwFormSubmit.textContent = 'Sending...';
  try {
    const res = await fetch(`${PROXY}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nm, email: em, mobile: mb, message: ms }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    cwFormNote.style.color = '#16a34a';
    cwFormNote.textContent = data.message || `Thank you, ${nm}. We will contact you within 24 hours.`;
    cwFormSubmit.textContent = 'Sent ✓';
  } catch (err) {
    console.error('[Contact Form]', err);
    cwFormNote.style.color = '#ef4444';
    cwFormNote.textContent = 'Failed to send. Please try again.';
    cwFormSubmit.disabled = false;
    cwFormSubmit.textContent = 'Send Message';
  }
});

/* ══════════════════════════════════════════════════════════════
   MESSAGE HELPERS
══════════════════════════════════════════════════════════════ */

function makeRow(role) {
  const row = document.createElement('div'); row.className = `cw-msg-row ${role}`;
  const av = document.createElement('div'); av.className = `cw-msg-av ${role === 'user' ? 'uav' : ''}`;
  av.textContent = role === 'user' ? 'U' : '✦';
  const wrap = document.createElement('div'); wrap.className = 'cw-msg-wrap';
  row.appendChild(av); row.appendChild(wrap);
  return row;
}

function addBotMsg(html, extra = null) {
  const row = makeRow('bot');
  const bbl = document.createElement('div'); bbl.className = 'cw-bubble bot';
  bbl.innerHTML = html.replace(/\n/g, '<br>');
  const t = document.createElement('span'); t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(bbl);
  if (extra) row.querySelector('.cw-msg-wrap').appendChild(extra);
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function addUserMsg(text) {
  const row = makeRow('user');
  const bbl = document.createElement('div'); bbl.className = 'cw-bubble user'; bbl.textContent = text;
  const t = document.createElement('span'); t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(bbl);
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function appendCustom(bbl, extra = null) {
  const row = makeRow('bot');
  const t = document.createElement('span'); t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(bbl);
  if (extra) row.querySelector('.cw-msg-wrap').appendChild(extra);
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function appendBubble(role, el) {
  const row = makeRow(role);
  row.querySelector('.cw-msg-wrap').appendChild(el);
  const t = document.createElement('span'); t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function showTypingIndicator() {
  if (document.getElementById('cwTypingRow')) return;
  const row = document.createElement('div');
  row.className = 'cw-msg-row bot'; row.id = 'cwTypingRow';
  const av = document.createElement('div'); av.className = 'cw-msg-av'; av.textContent = '✦';
  const wrap = document.createElement('div'); wrap.className = 'cw-msg-wrap';
  const typ = document.createElement('div'); typ.className = 'cw-typing';
  typ.innerHTML = '<div class="cw-dot"></div><div class="cw-dot"></div><div class="cw-dot"></div>';
  wrap.appendChild(typ); row.appendChild(av); row.appendChild(wrap);
  cwMessages.appendChild(row); scrollBottom();
}
function hideTyping() { document.getElementById('cwTypingRow')?.remove(); }

function typingThen(fn, ms = 900) {
  showTypingIndicator();
  setTimeout(() => { hideTyping(); fn(); }, ms);
}

function scrollBottom() { cwMessages.scrollTo({ top: cwMessages.scrollHeight, behavior: 'smooth' }); }

/* ── Chip builders ── */
function chips(arr) {
  const wrap = document.createElement('div'); wrap.className = 'cw-chips';
  arr.forEach(([label, action]) => {
    const btn = document.createElement('button');
    btn.className = 'cw-chip'; btn.textContent = label;
    btn.addEventListener('click', () => { addUserMsg(label); routeInput(action); });
    wrap.appendChild(btn);
  });
  return wrap;
}

function stepsEl(arr) {
  const wrap = document.createElement('div'); wrap.className = 'cw-chips';
  arr.forEach(([label, action]) => {
    const btn = document.createElement('button');
    btn.className = 'cw-chip'; btn.textContent = label;
    btn.addEventListener('click', () => {
      addUserMsg(label);
      wrap.querySelectorAll('.cw-chip').forEach(b => b.disabled = true);
      routeInput(action);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */

(function init() {
  renderOffers();
  setTimeout(() => { if (!S.open) cwBadge.classList.remove('hidden'); }, 2000);
})();
