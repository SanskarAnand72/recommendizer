'use strict';
/**
 * Pinecone Catalog Analyzer
 * ─────────────────────────────────────────────────────────────
 * Queries the Pinecone index using multiple semantic queries to
 * gather a broad sample of products, deduplicates by URL, then
 * prints a detailed breakdown of Categories, Genders, and Colors.
 *
 * Run:  node --env-file=.env audit_pinecone.js
 *
 * Required env vars:
 *   PINECONE_API_KEY
 *   PINECONE_HOST
 *   HUGGINGFACE_API_KEY
 * ─────────────────────────────────────────────────────────────
 */

const https = require('https');

/* ── Env vars ─────────────────────────────────────────────────── */
const PINECONE_KEY  = process.env.PINECONE_API_KEY;
const PINECONE_HOST = process.env.PINECONE_HOST;
const HF_KEY        = process.env.HUGGINGFACE_API_KEY;
const HF_HOST       = 'router.huggingface.co';
const HF_MODEL      = 'BAAI/bge-large-en-v1.5';

/* ── Startup validation ─────────────────────────────────────── */
const missing = [
  ['PINECONE_API_KEY',    PINECONE_KEY],
  ['PINECONE_HOST',       PINECONE_HOST],
  ['HUGGINGFACE_API_KEY', HF_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error('\n  ✖ Missing env vars:', missing.join(', '));
  console.error('  Run: node --env-file=.env audit_pinecone.js\n');
  process.exit(1);
}

/* ── HTTPS helper ─────────────────────────────────────────────── */
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
      res => {
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

/* ── HuggingFace: embed a text string ─────────────────────────── */
async function embed(text) {
  process.stdout.write(`  [HF] Embedding: "${text}" ... `);
  const res = await httpsPost(
    HF_HOST,
    `/hf-inference/models/${HF_MODEL}/pipeline/feature-extraction`,
    { Authorization: `Bearer ${HF_KEY}` },
    { inputs: text, options: { wait_for_model: true } }
  );
  if (res.status !== 200) throw new Error(`HF embed failed (HTTP ${res.status})`);
  const raw    = res.body;
  const vector = Array.isArray(raw[0]) ? raw[0] : raw;
  console.log(`OK (dim=${vector.length})`);
  return vector;
}

/* ── Pinecone: query with a vector ────────────────────────────── */
async function queryPinecone(vector, topK) {
  const res = await httpsPost(
    PINECONE_HOST,
    '/query',
    { 'Api-Key': PINECONE_KEY },
    { vector, topK, includeMetadata: true }
  );
  if (res.status !== 200) throw new Error(`Pinecone query failed (HTTP ${res.status})`);
  return res.body?.matches || [];
}

/* ── Counter helper ───────────────────────────────────────────── */
function count(records, key) {
  const map = {};
  for (const r of records) {
    const val = (r[key] || 'Unknown').toString().trim() || 'Unknown';
    map[val] = (map[val] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

/* ── Print table ──────────────────────────────────────────────── */
function printTable(title, icon, entries) {
  console.log(`\n${icon}  ${title}`);
  console.log('─'.repeat(44));
  if (entries.length === 0) {
    console.log('   (none found)');
    return;
  }
  const maxLabel = Math.max(...entries.map(([k]) => k.length), 8);
  const total    = entries.reduce((s, [, n]) => s + n, 0);
  for (const [label, n] of entries) {
    const bar = '█'.repeat(Math.max(1, Math.round((n / total) * 20)));
    console.log(`  ${label.padEnd(maxLabel + 2)} ${String(n).padStart(4)}  ${bar}`);
  }
  console.log('─'.repeat(44));
  console.log(`  ${'TOTAL'.padEnd(maxLabel + 2)} ${String(total).padStart(4)}`);
}

/* ── MAIN ─────────────────────────────────────────────────────── */
(async () => {
  const LINE = '═'.repeat(52);
  console.log('\n' + LINE);
  console.log('   PINECONE CATALOG ANALYZER');
  console.log(`   Host  : ${PINECONE_HOST}`);
  console.log(`   Model : ${HF_MODEL}`);
  console.log(LINE + '\n');

  /* ── 1. Embed multiple queries to maximize catalog coverage ── */
  const QUERIES = [
    'clothing apparel fashion',
    'men jeans trousers denim',
    'women jeans trousers tops',
    'shirts jackets t-shirts',
    'casual formal wear',
    'blue black grey jeans',
  ];
  const TOP_K = 500;

  const allMatches = [];
  console.log('Step 1 — Fetching vectors from Pinecone...\n');
  for (const q of QUERIES) {
    try {
      const vec     = await embed(q);
      const matches = await queryPinecone(vec, TOP_K);
      console.log(`         → ${matches.length} matches returned`);
      allMatches.push(...matches);
    } catch (err) {
      console.warn(`  [WARN] Query "${q}" failed: ${err.message}`);
    }
  }

  /* ── 2. Deduplicate by product URL ─────────────────────────── */
  console.log('\nStep 2 — Deduplicating...');
  const seen   = new Set();
  const unique = [];
  let   dupes  = 0;

  for (const m of allMatches) {
    const md  = m.metadata || {};
    const url = (md['product URL '] || md['product URL'] || md['url'] || m.id || '').toString().trim();
    if (!url || seen.has(url)) { dupes++; continue; }
    seen.add(url);
    unique.push({
      id      : m.id,
      name    : md['Product name']     || md['text']          || '',
      category: md['Product Category'] || '',
      color   : md['Product Color']    || '',
      gender  : md['Gender']           || '',
      image   : md['Image URL']        || '',
      url,
    });
  }

  console.log(`  Raw matches : ${allMatches.length}`);
  console.log(`  Duplicates  : ${dupes}`);
  console.log(`  Unique items: ${unique.length}`);

  if (unique.length === 0) {
    console.error('\n  ✖ No unique products found. Check PINECONE_API_KEY and PINECONE_HOST.');
    process.exit(1);
  }

  /* ── 3. Print report ────────────────────────────────────────── */
  console.log('\n' + LINE);
  console.log('   CATALOG REPORT');
  console.log(LINE);

  printTable('CATEGORIES', '📦', count(unique, 'category'));
  printTable('GENDER',     '👤', count(unique, 'gender'));
  printTable('COLORS',     '🎨', count(unique, 'color'));

  /* ── 4. Metadata field discovery ───────────────────────────── */
  const allKeys = new Set();
  allMatches.forEach(m => Object.keys(m.metadata || {}).forEach(k => allKeys.add(k)));

  console.log('\n🔑  METADATA KEYS IN INDEX');
  console.log('─'.repeat(44));
  [...allKeys].sort().forEach(k => console.log(`   "${k}"`));

  /* ── 5. Sample products (first 5 unique) ───────────────────── */
  console.log('\n📄  SAMPLE PRODUCTS (first 5)');
  console.log('─'.repeat(44));
  unique.slice(0, 5).forEach((p, i) => {
    console.log(`\n  [${i + 1}] ${p.name || '(no name)'}`);
    console.log(`      Category : ${p.category || '—'}`);
    console.log(`      Color    : ${p.color    || '—'}`);
    console.log(`      Gender   : ${p.gender   || '—'}`);
    console.log(`      URL      : ${p.url.slice(0, 70)}`);
  });

  console.log('\n' + LINE);
  console.log('   AUDIT COMPLETE');
  console.log(LINE + '\n');
})();
