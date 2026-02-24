'use strict';
// Levi's India — Chatbot Widget Engine

/* ── DOM ── */
const cw = document.getElementById('cw');
const cwPopup = document.getElementById('cwPopup');
const cwToggle = document.getElementById('cwToggle');
const cwBadge = document.getElementById('cwBadge');
const iconChat = document.getElementById('iconChat');
const iconDown = document.getElementById('iconDown');

/* Screens */
const screenHome = document.getElementById('cwScreenHome');
const screenChats = document.getElementById('cwScreenChats');
const screenOffers = document.getElementById('cwScreenOffers');
const screenForm = document.getElementById('cwScreenForm');
const SCREENS = { Home: screenHome, Chats: screenChats, Offers: screenOffers, Form: screenForm };

/* Chat elements */
const cwMessages = document.getElementById('cwMessages');
const cwInput = document.getElementById('cwInput');
const cwSendBtn = document.getElementById('cwSendBtn');
const cwBackBtn = document.getElementById('cwBackBtn');

/* Offers */
const cwOffersBody = document.getElementById('cwOffersBody');

/* Form */
const cwFormSubmit = document.getElementById('cwFormSubmit');
const cwFormNote = document.getElementById('cwFormNote');

/* Tabs */
const cwTabs = document.querySelectorAll('.cw-tab');

/* Home buttons */
const cwAskBtn = document.getElementById('cwAskBtn');
const cwTrackBtn = document.getElementById('cwTrackBtn');
const cwTryBtn = document.getElementById('cwTryBtn');
const cwConvCard = document.getElementById('cwConvCard');
const cwWhatsappBtn = document.getElementById('cwWhatsappBtn');
const cwOffersBtn = document.getElementById('cwOffersBtn');
const cwHumanBtn = document.getElementById('cwHumanBtn');

/* ── State ── */
const S = { open: false, flow: null, step: 0, data: {}, lang: 'en' };

/* ── Data ── */
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

const FAQS = {
  fabric: 'Levi\'s uses premium ring-spun denim and cotton blends — authentic quality since 1853! 🧶',
  'wash care': 'Machine wash cold (30°C) inside out. Tumble dry low. Do not bleach or dry clean. 🫧',
  return: 'Hassle-free 30-day returns at any Levi\'s store or via courier. Item must be unworn & unwashed. 📦',
  exchange: 'Free size exchange within 15 days of delivery. Visit any store or WhatsApp us. 🔄',
  delivery: 'Pan-India delivery in 4–7 business days. Express delivery (2–3 days) available at checkout. 🚀',
  shipping: 'Free shipping on orders above ₹999. Express shipping starts at ₹99. 🚚',
  size: 'Levi\'s follows international sizing (XS–XXL). For jeans, check waist & length on our Size Guide. 📏',
  payment: 'We accept UPI, Credit/Debit Cards, Net Banking, Wallets & COD up to ₹5,000. 💳',
  cancel: 'Orders can be cancelled within 2 hours. After dispatch, initiate a return once delivered. ❌',
  cod: 'Yes! Cash on Delivery available for orders up to ₹5,000 across India. 💰',
  jeans: 'Our 501® Original, 511™ Slim & 512™ Taper jeans are bestsellers. Check them out! 👖',
};

const SIZE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function getSizeIdx(h, w) {
  if (w < 50 || h < 155) return 0;
  if (w < 60 || h < 162) return 1;
  if (w < 70 || h < 170) return 2;
  if (w < 80 || h < 178) return 3;
  if (w < 90 || h < 185) return 4;
  return 5;
}
const FIT_TIPS = {
  slim: 'Slim frames look great in Levi\'s 511™ Slim or 510™ Skinny — sharp and modern!',
  regular: 'Regular builds suit the classic 501® Original or 505™ Regular — timeless style.',
  athletic: 'Athletic builds do great in 512™ Taper — extra room in thigh, tapered at ankle.',
  curvy: 'Levi\'s Curve ID jeans are designed for your shape — check them out!',
};
const STYLING_TIPS = [
  'Pair your 501® jeans with a classic white tee and sneakers for iconic Levi\'s style.',
  'A denim jacket over a printed tee is a timeless double-denim look.',
  'Roll up the hem of your jeans slightly for a relaxed, styled finish.',
  'Levi\'s chinos with a crisp shirt make a smart casual look that\'s hard to beat.',
];

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

/* ── Toggle ── */
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
  S.flow = 'ask'; S.step = 0; S.data = {};
  goToChat();
  addBotMsg('Great! Ask me anything about Levi\'s products, denim, sizes, delivery, or returns. 😊', chips([
    ['🧶 Fabric', 'ask:fabric'], ['🚚 Delivery', 'ask:delivery'],
    ['📦 Returns', 'ask:return'], ['💳 Payment', 'ask:payment'],
    ['📏 Sizing', 'ask:size'], ['👖 Jeans Info', 'ask:jeans'],
  ]));
});

cwTrackBtn.addEventListener('click', () => {
  S.flow = 'track'; S.step = 1; S.data = {};
  goToChat();
  addBotMsg('Sure! Let\'s track your Levi\'s order. 📦\n\nPlease enter your <b>Order ID</b>.\n<i style="font-size:.78rem;color:#999">e.g. LV123456</i>');
});

cwTryBtn.addEventListener('click', () => {
  S.flow = 'tryon'; S.step = 0; S.data = {};
  goToChat();
  startTryOn();
});

cwConvCard.addEventListener('click', () => {
  S.flow = 'ask'; goToChat();
  addBotMsg('Welcome back! 👋 What can I help you with?', chips([
    ['💬 Ask Question', 'ask:general'], ['📦 Track Order', 'flow:track'],
    ['👗 Size Finder', 'flow:tryon'], ['🏷️ Offers', 'flow:offers'],
  ]));
});

cwWhatsappBtn.addEventListener('click', () => {
  goToChat();
  addBotMsg('Connect with us instantly on WhatsApp! 💬');
  setTimeout(() => {
    const div = document.createElement('div');
    div.innerHTML = `<a href="https://wa.me/919999999999?text=Hello+Levi's+India!" target="_blank"
      style="display:flex;align-items:center;gap:12px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:12px 14px;text-decoration:none;color:#111;margin-top:6px">
      <span style="font-size:1.6rem">💚</span>
      <div><div style="font-weight:700;font-size:.88rem">Chat on WhatsApp</div>
      <div style="font-size:.72rem;color:#666">Levi's India · Mon–Sat 10AM–7PM</div></div>
      <span style="margin-left:auto;font-size:1.1rem;color:#16a34a">→</span></a>`;
    appendBubble('bot', div);
  }, 500);
  S.flow = null;
});

cwOffersBtn.addEventListener('click', () => {
  switchToTab('Offers');
  renderOffers();
});

cwHumanBtn.addEventListener('click', () => {
  S.flow = 'human'; S.step = 1; goToChat();
  addBotMsg('I\'ll connect you with a real person! 👨‍💼\n\nWhat\'s the reason for contacting us?', chips([
    ['📦 Order Issue', 'human:order'], ['🔄 Return/Exchange', 'human:return'],
    ['💳 Payment', 'human:payment'], ['🛍️ Product Query', 'human:product'],
    ['💬 Other', 'human:other'],
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

/* ── Back button ── */
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

/* ── Router ── */
function routeInput(input) {
  const lo = input.toLowerCase();

  // Chip special actions
  if (input.startsWith('ask:')) { return handleFaq(input.slice(4)); }
  if (input.startsWith('flow:')) {
    const f = input.slice(5);
    if (f === 'track') { S.flow = 'track'; S.step = 1; S.data = {}; return addBotMsg('Please enter your <b>Order ID</b>.\n<i style="font-size:.78rem;color:#999">e.g. LV123456</i>'); }
    if (f === 'tryon') { S.flow = 'tryon'; S.step = 0; S.data = {}; return startTryOn(); }
    if (f === 'offers') { switchToTab('Offers'); renderOffers(); return; }
    if (f === 'home') { S.flow = null; switchScreen('Home'); cwTabs.forEach(t => t.classList.toggle('active', t.dataset.scr === 'Home')); return; }
  }
  if (input.startsWith('human:')) { return handleHumanReason(input.slice(6)); }
  if (input.startsWith('tryon:')) { return handleTryOnChip(input.slice(6)); }

  // Flow routing
  if (S.flow === 'track') return handleTrack(input);
  if (S.flow === 'tryon') return handleTryOnInput(input);
  if (S.flow === 'ask') return handleFaqFreetext(lo);
  if (S.flow === 'human') return;

  // Smart fallback
  if (lo.match(/track|order|shipment|deliver/)) { S.flow = 'track'; S.step = 1; S.data = {}; addBotMsg('Sure! Enter your <b>Order ID</b> to track:'); }
  else if (lo.match(/size|fit|height|weight/)) { S.flow = 'tryon'; S.step = 0; S.data = {}; startTryOn(); }
  else if (lo.match(/offer|deal|discount|coupon/)) { switchToTab('Offers'); renderOffers(); }
  else if (lo.match(/whatsapp|wa\b/)) { cwWhatsappBtn.click(); }
  else if (lo.match(/human|agent|person|support/)) { cwHumanBtn.click(); }
  else if (lo.match(/contact|form|email/)) { switchToTab('Form'); }
  else handleFaqFreetext(lo);
}

/* ── FAQ ── */
function handleFaq(key) {
  const ans = FAQS[key];
  if (ans) {
    addBotMsg(ans + '\n\nAnything else?', chips([['❓ Ask More', 'ask:general'], ['🏠 Home', 'flow:home']]));
  } else {
    addBotMsg('Let me check that for you one moment!');
    setTimeout(() => addBotMsg('Sorry, I couldn\'t find specific info on that. Try contacting our team!', chips([['👨‍💼 Human Agent', 'human:other'], ['🏠 Home', 'flow:home']])), 800);
  }
  S.flow = 'ask';
}

function handleFaqFreetext(lo) {
  for (const key of Object.keys(FAQS)) {
    if (lo.includes(key)) { return handleFaq(key); }
  }
  typingThen(() => addBotMsg('Hmm, could you clarify a bit? 😊', chips([
    ['💬 Ask Question', 'ask:general'], ['📦 Track Order', 'flow:track'],
    ['👗 Size Finder', 'flow:tryon'], ['🏷️ Offers', 'flow:offers'],
    ['👨‍💼 Human Agent', 'human:other'],
  ])));
}

/* ── Track Order ── */
function handleTrack(input) {
  if (S.step === 1) {
    const oid = input.trim().toUpperCase();
    S.data.orderId = oid; S.step = 2;
    addBotMsg('Got it! Now enter your <b>registered Mobile or Email</b>:');
  } else if (S.step === 2) {
    const c = input.trim();
    const valid = /^\d{10}$/.test(c) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
    if (!valid) { addBotMsg('⚠️ Please enter a valid <b>10-digit mobile</b> or <b>email address</b>.'); return; }
    S.data.contact = c;
    typingThen(() => showOrderResult(), 1600);
    S.flow = null;
  }
}

function showOrderResult() {
  const order = ORDERS[S.data.orderId];
  if (!order) {
    addBotMsg(`😔 No order found for <b>${S.data.orderId}</b>.\n\nDouble-check your Levi\'s Order ID (found in your confirmation email).`, chips([
      ['🔄 Try Again', 'flow:track'], ['👨‍💼 Human Agent', 'human:order'], ['🏠 Home', 'flow:home'],
    ]));
    return;
  }
  const cls = { shipped: 's-shipped', delivered: 's-delivered', processing: 's-processing' }[order.status];
  const lbl = { shipped: '🚚 Shipped', delivered: '✅ Delivered', processing: '⚙️ Processing' }[order.status];
  const div = document.createElement('div');
  div.innerHTML = `<div style="font-size:.85rem;margin-bottom:6px">Here's your order status! 📦</div>
    <div class="cw-order-card">
      <span class="cw-status-badge ${cls}">${lbl}</span>
      <div class="cw-ord-row"><span>Order ID</span><span>${S.data.orderId}</span></div>
      <div class="cw-ord-row"><span>Courier</span><span>${order.courier}</span></div>
      <div class="cw-ord-row"><span>Est. Delivery</span><span>${order.eta}</span></div>
      <a href="${order.link}" class="cw-track-link">🔗 Track on ${order.courier}</a>
    </div>`;
  div.className = 'cw-bubble bot';
  div.style.cssText = 'padding:12px 14px;background:#f3f3f3;border-radius:16px;border-bottom-left-radius:4px;';
  appendCustom(div, chips([['🏠 Home', 'flow:home'], ['📞 Support', 'human:order']]));
}

/* ── Try-On ── */
const TO_STEPS = ['gender', 'height', 'weight', 'bodyType', 'fit'];

function startTryOn() {
  addBotMsg('Let\'s find your perfect size! 👗\n\nSelect your <b>Gender</b>:', stepsEl([
    ['♂️ Male', 'tryon:Male'], ['♀️ Female', 'tryon:Female'], ['⚧ Other', 'tryon:Other'],
  ]));
}

function handleTryOnChip(val) {
  const step = TO_STEPS[S.step];
  S.data[step] = val;
  S.step++;
  nextTryOnStep();
}

function handleTryOnInput(input) {
  const step = TO_STEPS[S.step];
  if (step === 'height') {
    const h = parseH(input);
    if (!h || h < 100 || h > 250) { addBotMsg('⚠️ Enter a valid height (e.g. 5\'9", 175cm, or 175).'); return; }
    S.data.height = h;
  } else if (step === 'weight') {
    const w = parseW(input);
    if (!w || w < 30 || w > 250) { addBotMsg('⚠️ Enter a valid weight (e.g. 65kg or 65).'); return; }
    S.data.weight = w;
  }
  S.step++;
  nextTryOnStep();
}

function nextTryOnStep() {
  const step = TO_STEPS[S.step];
  if (step === 'height') addBotMsg('Your <b>Height</b>? <i style="font-size:.78rem;color:#999">(e.g. 5\'10", 175cm, or 175)</i>');
  else if (step === 'weight') addBotMsg('Your <b>Weight</b>? <i style="font-size:.78rem;color:#999">(e.g. 68kg or 68)</i>');
  else if (step === 'bodyType') addBotMsg('Body Type?', stepsEl([['🥢 Slim', 'tryon:slim'], ['🙂 Regular', 'tryon:regular'], ['💪 Athletic', 'tryon:athletic'], ['🌸 Curvy', 'tryon:curvy']]));
  else if (step === 'fit') addBotMsg('Preferred Fit?', stepsEl([['✂️ Slim Fit', 'tryon:slim'], ['👔 Regular Fit', 'tryon:regular'], ['🌬️ Relaxed Fit', 'tryon:relaxed']]));
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
    const style = STYLING_TIPS[Math.floor(Math.random() * STYLING_TIPS.length)];

    const div = document.createElement('div');
    div.innerHTML = `✨ Your personalized size!
      <div class="cw-size-card">
        <div class="cw-size-badge">✅ Recommended: ${rec}</div>
        <div class="cw-size-row"><span>Size</span><span>${rec}</span></div>
        <div class="cw-size-row"><span>Fit Type</span><span>${pf?.charAt(0).toUpperCase() + pf?.slice(1)} Fit</span></div>
        <div class="cw-size-row"><span>Profile</span><span>${g}, ${bt?.charAt(0).toUpperCase() + bt?.slice(1)}</span></div>
        <div class="cw-size-row"><span>Alternative</span><span>${alt} (for more room)</span></div>
        <div class="cw-tip"><strong>💡 Body Tip:</strong> ${tip}</div>
        <div class="cw-tip" style="margin-top:6px"><strong>🎨 Style Tip:</strong> ${style}</div>
      </div>`;
    div.className = 'cw-bubble bot';
    div.style.cssText = 'padding:12px 14px;background:#f3f3f3;border-radius:16px;border-bottom-left-radius:4px;font-size:.85rem;';
    appendCustom(div, chips([['🔄 Try Again', 'flow:tryon'], ['🏷️ Offers', 'flow:offers'], ['🏠 Home', 'flow:home']]));
    S.flow = null;
  }, 1400);
}

/* ── Human Agent ── */
function handleHumanReason(reason) {
  typingThen(() => {
    const div = document.createElement('div');
    div.innerHTML = `Connecting you for <b>${reason.replace(/-/g, ' ')}</b>...
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px;margin-top:8px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#ec4899);display:flex;align-items:center;justify-content:center;font-size:.9rem">👩‍💼</div>
          <div><div style="font-weight:700;font-size:.85rem">Priya Sharma</div><div style="font-size:.7rem;color:#16a34a">● Online · Fashion Expert</div></div>
        </div>
        <button onclick="this.closest('.cw-bubble').nextSibling && this.textContent" style="width:100%;background:#111;color:#fff;border:none;padding:9px;border-radius:100px;font-size:.82rem;font-weight:700;cursor:pointer;font-family:inherit" onclick="confirmAgent(this)">⚡ Connect Now</button>
      </div>`;
    div.className = 'cw-bubble bot';
    div.style.cssText = 'padding:12px 14px;background:#f3f3f3;border-radius:16px;border-bottom-left-radius:4px;font-size:.85rem;';
    const row = makeRow('bot');
    row.querySelector('.cw-msg-wrap').appendChild(div);
    const timeEl = document.createElement('span'); timeEl.className = 'cw-msg-time'; timeEl.textContent = now();
    row.querySelector('.cw-msg-wrap').appendChild(timeEl);

    const conn = div.querySelector('button');
    conn.addEventListener('click', () => {
      conn.textContent = '✅ Connecting... (~2 min wait)';
      conn.disabled = true;
      setTimeout(() => {
        addBotMsg('🎉 You\'re in queue! Est. wait: <b>~2 minutes</b>.\n\nOr reach us instantly on WhatsApp for faster support.', chips([['💚 WhatsApp', 'flow:wa'], ['🏠 Home', 'flow:home']]));
      }, 1000);
    });

    cwMessages.appendChild(row);
    scrollBottom();
    S.flow = null;
  }, 1200);
}

/* ── Offers ── */
function renderOffers() {
  if (cwOffersBody.childElementCount > 0) return;
  cwOffersBody.innerHTML = '';
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
      this.textContent = '✅ Copied!';
      setTimeout(() => { this.textContent = o.code; }, 1800);
    });
    cwOffersBody.appendChild(d);
  });
}

/* ── Form ── */
cwFormSubmit.addEventListener('click', async () => {
  const nm = document.getElementById('cf_name')?.value.trim();
  const em = document.getElementById('cf_email')?.value.trim();
  const mb = document.getElementById('cf_mobile')?.value.trim();
  const ms = document.getElementById('cf_msg')?.value.trim();
  if (!nm || !em || !mb || !ms) { cwFormNote.style.color = '#ef4444'; cwFormNote.textContent = '⚠️ Please fill all fields.'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { cwFormNote.style.color = '#ef4444'; cwFormNote.textContent = '⚠️ Invalid email.'; return; }
  if (!/^\d{10}$/.test(mb)) { cwFormNote.style.color = '#ef4444'; cwFormNote.textContent = '⚠️ Invalid mobile number.'; return; }
  cwFormSubmit.disabled = true; cwFormSubmit.textContent = 'Sending...';
  await delay(1200);
  cwFormNote.style.color = '#16a34a';
  cwFormNote.textContent = `🎉 Thanks, ${nm}! We'll contact you within 24 hours.`;
  cwFormSubmit.textContent = '✅ Sent!';
});

/* ── Message helpers ── */
function makeRow(role) {
  const row = document.createElement('div');
  row.className = `cw-msg-row ${role}`;
  const av = document.createElement('div');
  av.className = `cw-msg-av ${role === 'user' ? 'uav' : ''}`;
  av.textContent = role === 'user' ? 'U' : 'L';
  const wrap = document.createElement('div');
  wrap.className = 'cw-msg-wrap';
  row.appendChild(av); row.appendChild(wrap);
  return row;
}

function addBotMsg(html, extra = null) {
  const row = makeRow('bot');
  const bbl = document.createElement('div');
  bbl.className = 'cw-bubble bot';
  bbl.innerHTML = html.replace(/\n/g, '<br>');
  const t = document.createElement('span');
  t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(bbl);
  if (extra) row.querySelector('.cw-msg-wrap').appendChild(extra);
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function addUserMsg(text) {
  const row = makeRow('user');
  const bbl = document.createElement('div');
  bbl.className = 'cw-bubble user'; bbl.textContent = text;
  const t = document.createElement('span');
  t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(bbl);
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function appendCustom(bbl, extra = null) {
  const row = makeRow('bot');
  const t = document.createElement('span');
  t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(bbl);
  if (extra) row.querySelector('.cw-msg-wrap').appendChild(extra);
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function appendBubble(role, el) {
  const row = makeRow(role);
  row.querySelector('.cw-msg-wrap').appendChild(el);
  const t = document.createElement('span');
  t.className = 'cw-msg-time'; t.textContent = now();
  row.querySelector('.cw-msg-wrap').appendChild(t);
  cwMessages.appendChild(row);
  scrollBottom();
}

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'cw-msg-row bot'; row.id = 'cwTypingRow';
  const av = document.createElement('div'); av.className = 'cw-msg-av'; av.textContent = 'L';
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

/* ── Chip / Step builders ── */
function chips(arr) {
  const wrap = document.createElement('div');
  wrap.className = 'cw-chips';
  arr.forEach(([label, action]) => {
    const btn = document.createElement('button');
    btn.className = 'cw-chip'; btn.textContent = label;
    btn.addEventListener('click', () => {
      addUserMsg(label);
      routeInput(action);
    });
    wrap.appendChild(btn);
  });
  return wrap;
}

function stepsEl(arr) {
  const wrap = document.createElement('div');
  wrap.className = 'cw-chips';
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

/* ── Init ── */
(function init() {
  renderOffers(); // preload offers silently
  // Show badge pulse after 2s
  setTimeout(() => {
    if (!S.open) cwBadge.classList.remove('hidden');
  }, 2000);
})();
