/**
 * Antigravity AI — Proxy Server  v3.0
 * ─────────────────────────────────────────────────────────────
 * ARCHITECTURE
 *   Groq        → Intent detection | Chat responses | Product formatting
 *   HuggingFace → Embeddings ONLY
 *   Pinecone    → Vector search ONLY
 *
 * Routes
 *   GET  /health
 *   POST /intent  { query }              → { intent, filters }
 *   POST /chat    { query, intent }      → { response }
 *   POST /search  { query, filters }     → product_list | no_product JSON
 * ─────────────────────────────────────────────────────────────
 * Run: node server.js
 */

'use strict';

const http  = require('http');
const https = require('https');
const url   = require('url');

/* ══════════════════════════════════════════════════════════════
   CONFIGURATION
   ─ Edit only this block when keys / hosts / models change.
   ─ Missing keys cause an immediate startup error (no silent fail).
══════════════════════════════════════════════════════════════ */

const CFG = {
  groq: {
    key  : process.env.GROQ_API_KEY,
    host : 'api.groq.com',
    model: 'llama-3.3-70b-versatile',
  },

  hf: {
    key  : process.env.HUGGINGFACE_API_KEY,
    host : 'router.huggingface.co',
    model: 'BAAI/bge-large-en-v1.5',
  },

  pinecone: {
    key : process.env.PINECONE_API_KEY,
    host: process.env.PINECONE_HOST,
    topK: 30,   // fetch many; same product indexed multiple times (dedup applied after)
  },
};

const PORT = process.env.PORT || 3001;

/* ── Startup config validation — fail loudly if any env var is missing ── */
(function validateConfig() {
  const required = [
    ['GROQ_API_KEY',        CFG.groq.key],
    ['HUGGINGFACE_API_KEY', CFG.hf.key],
    ['PINECONE_API_KEY',    CFG.pinecone.key],
  ];
  const missing = required.filter(([, v]) => !v || String(v).trim() === '').map(([k]) => k);
  if (missing.length) {
    console.error('\n  ✖ MISSING ENVIRONMENT VARIABLES:');
    missing.forEach(k => console.error(`    → ${k}`));
    console.error('  Set these in your .env file or Render environment settings.\n');
    process.exit(1);
  }
  console.log('  ✔ Environment variables validated');
})();

/* ══════════════════════════════════════════════════════════════
   SHARED HTTPS HELPER
══════════════════════════════════════════════════════════════ */

function httpsPost(hostname, path, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request(
      {
        hostname,
        path,
        method : 'POST',
        headers: {
          'Content-Type'  : 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...extraHeaders,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ══════════════════════════════════════════════════════════════
   GROQ — Intent Detection
   Role: Classify user input into intent + extract search filters.
   Must return JSON. Temperature=0 for deterministic classification.
══════════════════════════════════════════════════════════════ */

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a Levi's India fashion store chatbot called Antigravity AI.

Classify the user message and return ONLY valid JSON — no extra text, no markdown.

JSON schema:
{
  "intent": "<greeting|product_query|occasion_query|fashion_chat|off_topic>",
  "filters": {
    "color"   : "<detected color in lowercase, or null>",
    "gender"  : "<Men|Women|null>",
    "category": "<jeans|trousers|shirts|jacket|tshirt|sweatshirt|sweater|top|shorts|footwear|null>"
  },
  "occasion": "<date|party|office|wedding|casual|formal|club|birthday|null>"
}

⚠️ STORE CATALOG:
This store stocks: Jeans, Trousers, Shirts, Jackets, T-Shirts, Sweatshirts, Sweaters, Tops, Shorts, and Footwear.
Any clothing product query MUST be classified as product_query.

INTENT RULES:
- greeting       : hi, hello, hey, hii, hola, namaste, good morning, etc.
- product_query  : user explicitly names a product TYPE or uses buy/find/show/want/need/suggest
                   combined with a product, color or gender.

- occasion_query : user mentions occasion context WITHOUT naming a product:
                   date, party, office, wedding, birthday, casual outing, formal event, club night.
                   Also: "i have a date", "going to a party", "what should i wear to...".
- fashion_chat   : general fashion questions — style advice, trends, sizing, fits, outfit help.
- off_topic      : weather, cricket, politics, coding, math, recipes, movies — nothing fashion.

CATEGORY DETECTION (only for product_query):
  ALWAYS return the actual category word the user mentioned. NEVER return null for a named product type.
  jeans    → jeans, denim, denims, jean (but NOT "denim jacket" — that is "jacket")
  trousers → trouser, trousers, pants, chinos, formal pant
  shirt    → shirt, shirts, formal shirt, casual shirt
  tshirt   → t-shirt, tshirt, tee, polo, graphic tee
  jacket   → jacket, jackets, denim jacket, bomber, blazer
  top      → top, tops, crop top
  dress    → dress, dresses, skirt
  kurta    → kurta, kurtas
  shorts   → shorts
  hoodie   → hoodie, hoodies, sweatshirt
  null     → ONLY if user mentioned no product type at all (e.g. "show me something nice")

GENDER RULE: Only assign Men or Women if the user EXPLICITLY states gender.
  Men   → man, men, male, boy, gents, his
  Women → woman, women, female, girl, ladies, her
  If not explicitly stated → return null (the chatbot will ask for clarification).

COLOR DETECTION — extract if mentioned: black, white, blue, navy, red, grey, gray, green, brown, pink, yellow, orange, purple, beige, maroon, khaki, cream, indigo, charcoal, cobalt, burgundy. Return lowercase.
GENDER — detect Men or Women ONLY if explicitly stated. Otherwise null.
OCCASION — for occasion_query only. Otherwise null.`;

/**
 * groqIntent(query) → { intent, filters: { color, gender } }
 * Uses Groq LLM for reliable, context-aware intent classification.
 */
async function groqIntent(query, history = []) {
  // Include recent conversation context (last 6 messages) for better follow-up classification
  const contextMessages = history.slice(-6).map(h => ({ role: h.role, content: String(h.content) }));

  const res = await httpsPost(
    CFG.groq.host,
    '/openai/v1/chat/completions',
    { Authorization: `Bearer ${CFG.groq.key}` },
    {
      model          : CFG.groq.model,
      temperature    : 0,
      max_tokens     : 200,
      response_format: { type: 'json_object' },
      messages       : [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        ...contextMessages,
        { role: 'user',   content: query },
      ],
    }
  );

  if (res.status !== 200) {
    console.error(`[Groq/intent] HTTP ${res.status} — Check GROQ_API_KEY`);
    console.error('[Groq/intent] Response:', JSON.stringify(res.body).slice(0, 400));
    throw new Error(`Groq intent classification failed (HTTP ${res.status}). Check GROQ_API_KEY.`);
  }

  const content = res.body?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error('[Groq/intent] Empty content. Full response:', JSON.stringify(res.body).slice(0, 400));
    throw new Error('Groq intent returned empty content. Check model name and API key.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('[Groq/intent] Could not parse JSON. Raw content:', content);
    throw new Error('Groq intent response was not valid JSON.');
  }

  const intent  = parsed.intent  || 'fashion_chat';
  const filters = {
    color   : parsed.filters?.color    || null,
    gender  : parsed.filters?.gender   || null,
    category: parsed.filters?.category || null,
  };
  const occasion = parsed.occasion || null;

  console.log(`[Intent] "${query.slice(0, 60)}" → ${intent} | color=${filters.color} gender=${filters.gender} category=${filters.category} occasion=${occasion}`);
  return { intent, filters, occasion };
}

/* ══════════════════════════════════════════════════════════════
   GROQ — Conversational Chat
   Role: Generate greeting / fashion advice / off-topic redirect responses.
   Never shows products — that is handled by the search pipeline.
══════════════════════════════════════════════════════════════ */

const CHAT_SYSTEM_PROMPT = `You are a shopping assistant for Levi's online store.
Your job is to help users find clothing products using the store's product database.

STRICT RULES:
1. You are NOT a general-purpose AI. You ONLY discuss fashion, style, clothing, and this store.
2. Never show, list, or name specific products — product search is handled separately.
3. Never repeat the same greeting or opening phrase. Adapt every reply.
4. Keep replies concise: 1–3 sentences unless a detailed fashion explanation is needed.
5. Tone: Friendly, modern, helpful — not robotic.
6. NEVER ask more than one clarifying question at a time.
7. Use conversation history to understand follow-up queries (e.g. "black ones" = previous category in black).

STORE INVENTORY:
Jeans, Trousers, Shirts, Jackets, T-Shirts, Tops, and other Levi's clothing (Men & Women).

INTENT-SPECIFIC BEHAVIOR:
- greeting          → Warm, varied welcome. Ask what they're shopping for today. Different phrasing each time.
- fashion_chat      → Helpful conversational fashion advice. Ask a clarifying follow-up if useful.
- off_topic         → Reply ONLY: "I'm here to help you find fashion products from our store 👕 Let me know what you're looking for."
- occasion_query    → User mentioned an occasion (date, party, office, wedding, etc.). Ask EXACTLY ONE clarifying question.
                       Good clarifying questions: "Is this for men or women?" or "What's the vibe — casual or dressed up?"
                       Keep it natural and brief. ONE question only.
- occasion_followup → User answered your clarifying question. Now you have enough info.
                       Respond with ONE short sentence like: "Perfect! Let me find you some great options."
                       DO NOT ask any more questions.

NO-PRODUCT RESPONSE:
If no products are found, respond politely and suggest another category or color.
Example: "Sorry, I couldn't find that exact product. Would you like to see similar options instead?"`;



/**
 * groqChat(query, intent) → string
 * Generates a natural language response for non-product intents.
 */
async function groqChat(query, intent, history = []) {
  const roleNote = {
    greeting          : 'The user sent a greeting. Welcome them warmly and ask what fashion product they are shopping for. Do NOT list products or prices.',
    fashion_chat      : 'The user is asking a fashion-related question. Reply conversationally and helpfully. Do NOT list or show any products.',
    off_topic         : 'The user asked something unrelated to fashion. Reply: "I\'m here to help you find fashion products from our store 👕 Let me know what you\'re looking for."',
    occasion_query    : 'The user mentioned an occasion. Ask exactly ONE clarifying question (men or women? casual or formal?). Be natural and brief.',
    occasion_followup : 'The user just answered your clarifying question. Respond with ONE short enthusiastic sentence like "Perfect! Let me find some great options for you" — then stop. NO more questions.',
  }[intent] || 'Reply helpfully within the fashion domain only.';

  const res = await httpsPost(
    CFG.groq.host,
    '/openai/v1/chat/completions',
    { Authorization: `Bearer ${CFG.groq.key}` },
    {
      model      : CFG.groq.model,
      temperature: 0.8,
      max_tokens : 200,
      messages   : [
        { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\nCurrent intent: ${intent}\nInstruction: ${roleNote}` },
        ...history.slice(-10).map(h => ({ role: h.role, content: String(h.content) })),
        { role: 'user',   content: query },
      ],
    }
  );

  if (res.status !== 200) {
    console.error(`[Groq/chat] HTTP ${res.status}:`, JSON.stringify(res.body).slice(0, 400));
    throw new Error(`Groq chat failed (HTTP ${res.status}). Check GROQ_API_KEY and model.`);
  }

  const content = res.body?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error('[Groq/chat] Empty content. Full response:', JSON.stringify(res.body).slice(0, 400));
    throw new Error('Groq chat returned empty content.');
  }

  return content;
}

/* ══════════════════════════════════════════════════════════════
   GROQ — Product Formatter
   Role: Format raw Pinecone metadata into the required product JSON.
   CRITICAL: Must use ONLY provided data. Must NEVER invent values.
══════════════════════════════════════════════════════════════ */

const FORMAT_SYSTEM_PROMPT = `You are a strict product formatter for a fashion e-commerce chatbot.

You receive raw product metadata from a vector database and must format it into JSON.

CRITICAL RULES:
1. Output ONLY valid JSON — no extra text, no markdown, no explanation.
2. Use ONLY the data provided. NEVER invent, assume, or hallucinate any field.
3. If a field is missing or empty in the source, use "" (empty string) — not a made-up value.
4. The source data does NOT include Price or Rating. Always set both to "".
5. Maximum 5 products in the output.
6. try_on_enabled is always true.
7. Deduplicate: if the same buy_url appears more than once, include it only once.

Required JSON structure — output ONLY this, nothing else:
{
  "type": "product_list",
  "products": [
    {
      "name": "",
      "price": "",
      "rating": "",
      "image": "",
      "buy_url": "",
      "try_on_enabled": true
    }
  ]
}`;

/**
 * groqFormat(metadataArray, searchQuery, requestedColor, requestedCategory) → product_list | no_product
 * Sends Pinecone metadata to Groq for structured JSON formatting.
 * Falls back to direct mapping if Groq fails (logged clearly).
 */
async function groqFormat(metadataArray, searchQuery, requestedColor, requestedCategory) {
  // No results — return no_product immediately without calling Groq
  if (!metadataArray || metadataArray.length === 0) {
    const colorPart = requestedColor    ? `${requestedColor} ` : '';
    // Avoid double-pluralising: "jackets" → "jackets" not "jacketss"
    const catPart   = requestedCategory
      ? (requestedCategory.toLowerCase().endsWith('s') ? requestedCategory : `${requestedCategory}s`)
      : 'products';

    // Bidirectional check: "jacket" matches "jackets" and vice-versa
    const catNorm   = requestedCategory ? requestedCategory.toLowerCase().replace(/[-\s]/g, '') : '';
    const catExists = requestedCategory
      ? CATALOG_CATEGORIES.some(c => {
          const cn = c.replace(/[-\s]/g, '');
          return catNorm.includes(cn) || cn.includes(catNorm);
        })
      : true;

    let message, suggestion;
    if (requestedCategory && !catExists) {
      // Category truly doesn't exist in catalog
      message    = `Sorry, we don't carry ${colorPart}${catPart} in our store right now.`;
      suggestion = `We currently stock Jeans, Jackets, Shirts, T-Shirts, Sweatshirts, Sweaters, Tops, Trousers, Shorts, and Footwear. Can I help you find something from these?`;
    } else if (requestedColor) {
      message    = `Sorry, we don't have ${colorPart}${catPart} available right now.`;
      suggestion = `Try ${requestedColor === 'black' ? 'blue' : 'black'} or grey — we have those in stock.`;
    } else {
      message    = `Sorry, we couldn't find ${catPart} matching your search right now.`;
      suggestion = `Try browsing our Jeans or Jackets collection — we have great options in Blue, Black, and Grey.`;
    }
    return { type: 'no_product', message, suggestion };
  }

  // Build safe product list using ONLY confirmed Pinecone metadata fields
  const safeList = metadataArray.map(m => ({
    name    : m['Product name']     || m['text']         || '',
    category: m['Product Category'] || '',
    color   : m['Product Color']    || '',
    gender  : m['Gender']           || '',
    summary : m['Product Summary']  || '',
    price   : '',   // Not in this Pinecone index
    rating  : '',   // Not in this Pinecone index
    image   : m['Image URL']        || m['image_url']    || '',
    buy_url : (m['product URL ']    || m['product URL']  || m['url'] || '').trim(),
  }));

  const userContent =
    `Search query: "${searchQuery}"\n` +
    `Products from database:\n${JSON.stringify(safeList, null, 2)}`;

  const res = await httpsPost(
    CFG.groq.host,
    '/openai/v1/chat/completions',
    { Authorization: `Bearer ${CFG.groq.key}` },
    {
      model          : CFG.groq.model,
      temperature    : 0,
      max_tokens     : 1500,
      response_format: { type: 'json_object' },
      messages       : [
        { role: 'system', content: FORMAT_SYSTEM_PROMPT },
        { role: 'user',   content: userContent },
      ],
    }
  );

  if (res.status !== 200) {
    console.error(`[Groq/format] HTTP ${res.status}:`, JSON.stringify(res.body).slice(0, 400));
    throw new Error(`Groq product formatter failed (HTTP ${res.status}).`);
  }

  const content = res.body?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    console.error('[Groq/format] Empty content. Full response:', JSON.stringify(res.body).slice(0, 300));
    throw new Error('Groq product formatter returned empty content.');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error('[Groq/format] JSON parse failed. Raw:', content.slice(0, 500));
    throw new Error('Groq product formatter returned invalid JSON.');
  }

  if (!parsed.type || !Array.isArray(parsed.products)) {
    console.error('[Groq/format] Unexpected JSON structure:', JSON.stringify(parsed).slice(0, 300));
    throw new Error('Groq product formatter returned unexpected JSON shape.');
  }

  // Ensure try_on_enabled is always set to true
  parsed.products = parsed.products.slice(0, 5).map(p => ({ ...p, try_on_enabled: true }));

  // Groq returned an empty array — treat as no_product (e.g. gender mismatch caused it to drop all items)
  if (parsed.products.length === 0) {
    console.warn('[Groq/format] Groq returned 0 products — converting to no_product.');
    const colorPart = requestedColor    ? `${requestedColor} ` : '';
    const catPart   = requestedCategory ? `${requestedCategory}s` : 'products';
    return {
      type      : 'no_product',
      message   : `Sorry, we couldn't find ${colorPart}${catPart} matching your search right now.`,
      suggestion: `Try browsing our jeans or trousers collection instead.`,
    };
  }

  console.log(`[Groq/format] Formatted ${parsed.products.length} products`);
  return parsed;
}

/* ══════════════════════════════════════════════════════════════
   HUGGINGFACE — Embeddings ONLY
   Role: Convert search query text into a vector for Pinecone.
══════════════════════════════════════════════════════════════ */

/**
 * hfEmbed(text) → number[]
 * Calls HuggingFace feature-extraction pipeline.
 * Throws with a detailed message on any failure.
 */
async function hfEmbed(text) {
  const res = await httpsPost(
    CFG.hf.host,
    `/hf-inference/models/${CFG.hf.model}/pipeline/feature-extraction`,
    { Authorization: `Bearer ${CFG.hf.key}` },
    { inputs: text, options: { wait_for_model: true } }
  );

  if (res.status !== 200) {
    console.error(`[HuggingFace/embed] HTTP ${res.status} — model="${CFG.hf.model}"`);
    console.error('[HuggingFace/embed] Response:', JSON.stringify(res.body).slice(0, 400));
    throw new Error(
      `HuggingFace embedding failed (HTTP ${res.status}). ` +
      `Check: 1) HF_API_KEY  2) model name "${CFG.hf.model}"  3) HF account limits.`
    );
  }

  const raw    = res.body;
  const vector = Array.isArray(raw[0]) ? raw[0] : raw;  // handles [[...]] or [...]

  if (!Array.isArray(vector) || vector.length === 0) {
    console.error('[HuggingFace/embed] Unexpected shape:', JSON.stringify(raw).slice(0, 200));
    throw new Error(
      `HuggingFace returned an unexpected embedding shape. ` +
      `Check the model "${CFG.hf.model}" supports feature-extraction.`
    );
  }

  console.log(`[HF/embed] OK — vector dim=${vector.length}`);
  return vector;
}

/* ══════════════════════════════════════════════════════════════
   PINECONE — Vector Search ONLY
   Role: Query the index with an embedding vector. Returns raw matches.
══════════════════════════════════════════════════════════════ */

/**
 * pineconeQuery(vector, topK) → match[]
 * Each match: { id, score, metadata }
 */
async function pineconeQuery(vector, topK) {
  const res = await httpsPost(
    CFG.pinecone.host,
    '/query',
    { 'Api-Key': CFG.pinecone.key },
    { vector, topK, includeMetadata: true }
  );

  if (res.status !== 200) {
    console.error(`[Pinecone/query] HTTP ${res.status} — host="${CFG.pinecone.host}"`);
    console.error('[Pinecone/query] Response:', JSON.stringify(res.body).slice(0, 400));
    throw new Error(
      `Pinecone query failed (HTTP ${res.status}). ` +
      `Check: 1) PINECONE_API_KEY  2) PINECONE_HOST "${CFG.pinecone.host}"  3) Index name.`
    );
  }

  const matches = res.body?.matches || [];
  console.log(`[Pinecone/query] Returned ${matches.length} raw matches`);
  return matches;
}

/* ══════════════════════════════════════════════════════════════
   DEDUPLICATION + FILTER  (pure — no API calls)
   Metadata keys confirmed from live Pinecone response:
     "Product Color"   → e.g. "Blue", "Black", "White", "Grey"  (Title Case)
     "Gender"          → "Men" | "Women"
     "Product Category"→ "Jeans", "Shirts", etc.
     "Product name"    → full product title
     "Image URL"       → CDN image URL
     "product URL "    → product link (note trailing space in key)
     "Product Summary" → short description
   NOTE: No Price or Rating fields exist in this index.
══════════════════════════════════════════════════════════════ */

// Catalog ground truth — all categories the store stocks
const CATALOG_CATEGORIES = [
  'jeans',
  'trousers',
  'shirts',
  'jackets',
  'tshirts',
  'sweatshirts',
  'sweaters',
  'tops',
  'shorts',
  'footwear',
];
const CATALOG_COLORS     = ['blue', 'black', 'grey', 'gray', 'mint green', 'white', 'charcoal grey', 'navy blue'];

// Maps a requested color word to the Title Case values stored in Pinecone's "Product Color" field
const COLOR_GROUPS = {
  black  : ['black'],
  white  : ['white', 'ivory', 'cream', 'off-white'],
  blue   : ['blue', 'navy blue', 'navy', 'indigo', 'cobalt', 'denim blue'],
  navy   : ['navy', 'navy blue'],
  red    : ['red', 'maroon', 'burgundy', 'crimson'],
  grey   : ['grey', 'gray', 'charcoal', 'dark grey', 'light grey'],
  gray   : ['grey', 'gray', 'charcoal'],
  green  : ['green', 'olive', 'khaki', 'dark green'],
  brown  : ['brown', 'tan', 'camel', 'beige'],
  pink   : ['pink', 'rose', 'blush', 'light pink'],
  yellow : ['yellow', 'mustard'],
  orange : ['orange', 'rust'],
  purple : ['purple', 'lavender', 'violet'],
  beige  : ['beige', 'tan', 'camel', 'cream'],
  maroon : ['maroon', 'burgundy', 'crimson', 'dark red'],
};

// Maps a requested category keyword to substrings found in Pinecone's "Product Category" and "Product name" fields
const CATEGORY_GROUPS = {
  jeans       : ['jeans', 'denim'],
  shirts      : ['shirt', 'shirts'],
  shirt       : ['shirt', 'shirts'],
  tshirts     : ['t-shirt', 'tshirt', 'tee', 'polo'],
  tshirt      : ['t-shirt', 'tshirt', 'tee', 'polo'],
  tee         : ['t-shirt', 'tshirt', 'tee', 'polo'],
  jackets     : ['jacket', 'jackets'],
  jacket      : ['jacket', 'jackets'],
  trousers    : ['trouser', 'trousers', 'chinos', 'pants'],
  trouser     : ['trouser', 'trousers', 'chinos', 'pants'],
  sweatshirts : ['sweatshirt', 'sweatshirts', 'hoodie', 'hoodies'],
  sweatshirt  : ['sweatshirt', 'sweatshirts', 'hoodie', 'hoodies'],
  sweaters    : ['sweater', 'sweaters', 'pullover', 'knitwear'],
  sweater     : ['sweater', 'sweaters', 'pullover', 'knitwear'],
  tops        : ['top', 'tops', 'crop top'],
  top         : ['top', 'tops', 'crop top'],
  shorts      : ['shorts'],
  footwear    : ['shoes', 'sneakers', 'footwear', 'boots'],
  kurta       : ['kurta', 'kurtas'],
  dress       : ['dress', 'dresses'],
};

/**
 * Deduplicate Pinecone matches by product URL.
 * The same product is often indexed multiple times (multiple vectors).
 */
function deduplicateByUrl(matches) {
  const seen = new Set();
  return matches.filter(m => {
    const url = (
      m.metadata?.['product URL '] ||
      m.metadata?.['product URL']  ||
      m.metadata?.['url']          ||
      m.id
    ).trim();
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/**
 * applyFilters(matches, filters) → filtered matches (max 5)
 *
 * Strategy (STRICT INVENTORY MODE — no semantic fallback):
 *   1. Deduplicate by URL first.
 *   2. Category: if not in CATALOG_CATEGORIES → return [] immediately.
 *      If in catalog but 0 matches found in index → return [].
 *      NEVER cross-show a different category.
 *   3. Color: exact match on "Product Color", then soft (name/summary).
 *      If 0 matches → return [] immediately. NEVER fall back to unfiltered results.
 *   4. Gender: non-destructive — if 0 matches, keep results without gender filter.
 */
function applyFilters(matches, filters) {
  // Step 1 — Deduplicate
  const deduped = deduplicateByUrl(matches);
  console.log(`[Filter] After dedup: ${deduped.length} unique products (was ${matches.length} raw)`);

  let result = deduped;

  // Step 2 — Category filter (STRICT — never mix categories)
  // If user said "shirt" we must ONLY return shirts; if "jeans" we must ONLY return jeans.
  if (filters.category) {
    // Check if the requested category is actually in the catalog
    const catLower  = filters.category.toLowerCase().replace(/[-\s]/g, '');
    // Bidirectional: "jacket" matches "jackets" and vice-versa
    const inCatalog = CATALOG_CATEGORIES.some(c => {
      const cn = c.replace(/[-\s]/g, '');
      return catLower.includes(cn) || cn.includes(catLower);
    });
    if (!inCatalog) {
      // Category doesn't exist in index at all — skip Pinecone filtering, return empty immediately
      console.warn(`[Filter] category="${filters.category}" NOT IN CATALOG. Returning empty (strict mode).`);
      return [];
    }

    const catKey     = catLower;
    const catAliases = CATEGORY_GROUPS[catKey] || CATEGORY_GROUPS[filters.category.toLowerCase()] || [filters.category.toLowerCase()];

    const catMatch = result.filter(m => {
      const cat  = (m.metadata?.['Product Category'] || '').toLowerCase();
      const name = (m.metadata?.['Product name']     || '').toLowerCase();
      return catAliases.some(a => cat.includes(a) || name.includes(a));
    });

    if (catMatch.length > 0) {
      result = catMatch;
      console.log(`[Filter] category="${filters.category}" → ${result.length} products`);
    } else {
      // STRICT: user asked for a category we don't have — return empty, not wrong category
      console.warn(`[Filter] category="${filters.category}" — 0 matches in index. Returning empty (strict mode).`);
      return [];
    }
  }

  // Step 3 — Color filter
  if (filters.color) {
    const aliases = COLOR_GROUPS[filters.color.toLowerCase()] || [filters.color.toLowerCase()];

    // Try exact match on Product Color field
    const exactColorMatch = result.filter(m => {
      const pc = (m.metadata?.['Product Color'] || '').trim().toLowerCase();
      return aliases.some(a => pc === a || pc.includes(a));
    });

    if (exactColorMatch.length > 0) {
      result = exactColorMatch;
      console.log(`[Filter] color="${filters.color}" exact → ${result.length} products`);
    } else {
      // Try soft match in Product name + Summary
      const softColorMatch = result.filter(m => {
        const name    = (m.metadata?.['Product name']    || '').toLowerCase();
        const summary = (m.metadata?.['Product Summary'] || '').toLowerCase();
        return aliases.some(a => name.includes(a) || summary.includes(a));
      });

      if (softColorMatch.length > 0) {
        result = softColorMatch;
        console.log(`[Filter] color="${filters.color}" soft (name/summary) → ${result.length} products`);
      } else {
        // Color not found anywhere — strict mode: never fall back to unfiltered results.
        console.warn(`[Filter] color="${filters.color}" — 0 matches. Returning empty (strict mode).`);
        return [];
      }
    }
  }

  // Step 4 — Gender filter
  // The Pinecone index has no "Gender" metadata field.
  // Gender is detected from the "Product name" field instead:
  //   "Women's ..." or "Woman ..." → women
  //   "Men's ..."  or "Men ..."   → men (must NOT match "women")
  if (filters.gender && result.length > 0) {
    const reqGender = filters.gender.trim().toLowerCase();

    const genderMatch = result.filter(m => {
      const name = (m.metadata?.['Product name'] || '').toLowerCase();
      if (reqGender === 'women') {
        // contains "women" or "woman"
        return name.includes('women') || name.includes('woman');
      }
      if (reqGender === 'men') {
        // contains "men" or "man" but NOT "women" / "woman"
        return (
          (name.includes("men's") || name.includes('men ') || name.startsWith('men')) &&
          !name.includes('women')
        );
      }
      return true; // unknown gender value → no filter
    });

    if (genderMatch.length > 0) {
      result = genderMatch;
      console.log(`[Filter] gender="${filters.gender}" (name-based) → ${result.length} products`);
    } else {
      console.warn(`[Filter] gender="${filters.gender}" — 0 name-based matches. Keeping without gender filter.`);
    }
  }

  const final = result.slice(0, 5);
  console.log(`[Filter] Final output: ${final.length} products`);
  return final;
}

/* ══════════════════════════════════════════════════════════════
   HTTP SERVER
══════════════════════════════════════════════════════════════ */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type'                : 'application/json',
};

function send(res, status, body) {
  res.writeHead(status, CORS_HEADERS);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const parsed = url.parse(req.url, true);

  /* ── GET / (Render health check) ───────────────────────── */
  if (req.method === 'GET' && parsed.pathname === '/') {
    return send(res, 200, { status: 'Backend Live 🚀' });
  }

  /* ── GET /health ─────────────────────────────────────────── */
  if (req.method === 'GET' && parsed.pathname === '/health') {
    return send(res, 200, {
      status : 'ok',
      service: 'Antigravity AI Proxy v3',
      groq   : CFG.groq.model,
      hfModel: CFG.hf.model,
      pinecone: CFG.pinecone.host.split('.')[0],
    });
  }

  /* ── POST /intent ────────────────────────────────────────── */
  if (req.method === 'POST' && parsed.pathname === '/intent') {
    const raw = await readBody(req);
    let query, history;
    try   { ({ query, history = [] } = JSON.parse(raw)); }
    catch { return send(res, 400, { error: 'Invalid JSON body. Expected: { query: string }' }); }

    if (!query || typeof query !== 'string') {
      return send(res, 400, { error: 'Missing or invalid field: query (must be a non-empty string)' });
    }

    try {
      const result = await groqIntent(query, Array.isArray(history) ? history : []);
      return send(res, 200, result);
    } catch (err) {
      console.error('[/intent] Fatal error:', err.message);
      return send(res, 500, { error: err.message });
    }
  }

  /* ── POST /chat ──────────────────────────────────────────── */
  if (req.method === 'POST' && parsed.pathname === '/chat') {
    const raw = await readBody(req);
    let query, intent, history;
    try   { ({ query, intent, history = [] } = JSON.parse(raw)); }
    catch { return send(res, 400, { error: 'Invalid JSON body. Expected: { query: string, intent: string }' }); }

    if (!query && !intent) {
      return send(res, 400, { error: 'At least one of query or intent is required' });
    }

    try {
      const response = await groqChat(query || '', intent || 'fashion_chat', Array.isArray(history) ? history : []);
      return send(res, 200, { response });
    } catch (err) {
      console.error('[/chat] Fatal error:', err.message);
      return send(res, 500, { error: err.message });
    }
  }

  /* ── POST /search ────────────────────────────────────────── */
  if (req.method === 'POST' && parsed.pathname === '/search') {
    const raw = await readBody(req);
    let query, filters;
    try   { ({ query, filters = {} } = JSON.parse(raw)); }
    catch { return send(res, 400, { error: 'Invalid JSON body. Expected: { query: string, filters?: { color, gender } }' }); }

    if (!query || typeof query !== 'string') {
      return send(res, 400, { error: 'Missing or invalid field: query' });
    }

    // ── Step 1: Embed via HuggingFace ──
    let vector;
    try {
      vector = await hfEmbed(query);
    } catch (err) {
      console.error('[/search] HuggingFace FAILED:', err.message);
      return send(res, 502, {
        error : 'Embedding service error',
        detail: err.message,
        hint  : `Verify HF_API_KEY and embedding model: "${CFG.hf.model}"`,
      });
    }

    // ── Step 2: Search Pinecone ──
    let matches;
    try {
      matches = await pineconeQuery(vector, CFG.pinecone.topK);
    } catch (err) {
      console.error('[/search] Pinecone FAILED:', err.message);
      return send(res, 502, {
        error : 'Vector search error',
        detail: err.message,
        hint  : `Verify PINECONE_API_KEY and host: "${CFG.pinecone.host}"`,
      });
    }

    // ── Log raw Pinecone response for debugging ──
    console.log(`[/search] Raw Pinecone matches (${matches.length}):`,
      matches.slice(0, 3).map(m => ({
        id    : m.id,
        score : m.score,
        color : m.metadata?.['Product Color'],
        gender: m.metadata?.['Gender'],
        name  : m.metadata?.['Product name']?.slice(0, 50),
      }))
    );

    // ── Step 3: Deduplicate + filter ──
    const filtered = applyFilters(matches, filters);
    console.log(`[/search] query="${query}" filters=${JSON.stringify(filters)} → ${filtered.length} final products`);

    // ── Step 4: Groq formats results into product JSON ──
    let formatted;
    try {
      formatted = await groqFormat(
        filtered.map(m => m.metadata || {}),
        query,
        filters.color    || null,
        filters.category || null
      );
    } catch (err) {
      console.error('[/search] Groq format FAILED (using emergency fallback):', err.message);

      // Emergency raw fallback — still returns correct JSON shape, but without Groq
      if (filtered.length === 0) {
        const colorStr = filters.color ? `${filters.color} ` : '';
        formatted = {
          type      : 'no_product',
          message   : `Sorry, we don't have ${colorStr}products matching "${query}" right now.`,
          suggestion: filters.color
            ? `Would you like to see other colors instead?`
            : `Try a different style or category.`,
        };
      } else {
        formatted = {
          type    : 'product_list',
          products: filtered.map(m => {
            const md = m.metadata || {};
            return {
              name          : md['Product name']  || md['text'] || '',
              price         : '',   // Not in Pinecone index
              rating        : '',   // Not in Pinecone index
              image         : md['Image URL']     || md['image_url'] || '',
              buy_url       : (md['product URL '] || md['product URL'] || md['url'] || '').trim(),
              try_on_enabled: true,
            };
          }),
        };
        console.warn('[/search] Emergency fallback used — Groq formatter unavailable');
      }
    }

    return send(res, 200, formatted);
  }

  /* ── POST /track-order ── */
  if (req.method === 'POST' && parsed.pathname === '/track-order') {
    const raw = await readBody(req);
    let orderId, contact;
    try { ({ orderId, contact } = JSON.parse(raw)); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    if (!orderId) return send(res, 400, { error: 'Missing orderId' });
    const TRACK_ORDERS = {
      'LV123456': { status: 'shipped',    courier: 'Delhivery', eta: 'Feb 24, 2026', link: '#' },
      'LV654321': { status: 'delivered',  courier: 'BlueDart',  eta: 'Feb 20, 2026', link: '#' },
      'LV999000': { status: 'processing', courier: 'DTDC',      eta: 'Feb 27, 2026', link: '#' },
    };
    const order = TRACK_ORDERS[orderId.trim().toUpperCase()];
    if (!order) return send(res, 200, { found: false, orderId });
    return send(res, 200, { found: true, orderId: orderId.trim().toUpperCase(), ...order });
  }

  /* ── POST /contact ── */
  if (req.method === 'POST' && parsed.pathname === '/contact') {
    const raw = await readBody(req);
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    const { name, email, mobile, message } = body || {};
    if (!name || !email || !mobile || !message) return send(res, 400, { error: 'Missing required fields' });
    console.log(`[Contact] ${name} <${email}> ${mobile}: ${String(message).slice(0, 100)}`);
    return send(res, 200, { success: true, message: `Thank you, ${name}. We will contact you within 24 hours.` });
  }

  /* ── POST /debug  (temp — returns raw Pinecone metadata) ── */
  if (req.method === 'POST' && parsed.pathname === '/debug') {
    const raw = await readBody(req);
    let query;
    try { ({ query } = JSON.parse(raw)); } catch { return send(res, 400, { error: 'Invalid JSON' }); }
    if (!query) return send(res, 400, { error: 'Missing query' });
    try {
      const vector  = await hfEmbed(query);
      const matches = await pineconeQuery(vector, 5);
      return send(res, 200, {
        count  : matches.length,
        matches: matches.map(m => ({ id: m.id, score: m.score, metadata: m.metadata })),
      });
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  /* ── 404 ── */
  return send(res, 404, { error: `Route not found: ${req.method} ${parsed.pathname}` });
});

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Levi's AI Proxy  v3.0  —  READY       ║
  ╠══════════════════════════════════════════╣
  ║  http://localhost:${PORT}                ║
  ╠══════════════════════════════════════════╣
  ║  Groq     → intent + chat + formatting  ║
  ║  HF       → embeddings only             ║
  ║  Pinecone → vector search only          ║
  ╠══════════════════════════════════════════╣
  ║  GET  /                                 ║
  ║  GET  /health                           ║
  ║  POST /intent  { query }               ║
  ║  POST /chat    { query, intent }       ║
  ║  POST /search  { query, filters }      ║
  ╚══════════════════════════════════════════╝
`);
});
