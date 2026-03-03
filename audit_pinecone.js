'use strict';
/**
 * Pinecone Database Audit Script
 * ─────────────────────────────────────────────────────────────
 * Fetches raw records directly from Pinecone (no embeddings, no filters).
 * Uses Pinecone List API → Fetch API to inspect real metadata.
 * ─────────────────────────────────────────────────────────────
 * Run: node audit_pinecone.js
 */

const https = require('https');

const PINECONE_KEY  = 'pcsk_6A7Vei_SyVmsSaoAAduSCjaQpgYcJWmGhoc3Hi3wyvfLo7HWTnMxLaPYqp2m7KjTqqAmnF';
const PINECONE_HOST = 'levis-store-wqyt4q6.svc.aped-4627-b74a.pinecone.io';

/* ── HTTPS helper ── */
function httpsReq(method, host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        method,
        hostname: host,
        path,
        headers: {
          'Api-Key'     : headers['Api-Key'] || '',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* ── Step 1: List vector IDs (up to 100) ── */
async function listIds(limit = 100) {
  console.log(`\n[Pinecone/list] Requesting up to ${limit} vector IDs...`);
  const res = await httpsReq(
    'GET',
    PINECONE_HOST,
    `/vectors/list?limit=${limit}`,
    { 'Api-Key': PINECONE_KEY },
    null
  );

  if (res.status !== 200) {
    console.error(`[Pinecone/list] HTTP ${res.status}:`, JSON.stringify(res.body).slice(0, 400));
    throw new Error(`List failed with HTTP ${res.status}`);
  }

  const ids = (res.body.vectors || []).map(v => v.id);
  console.log(`[Pinecone/list] Got ${ids.length} IDs`);

  // If list endpoint not available, fall back to describe_index_stats to confirm connectivity
  if (ids.length === 0 && res.body.vectors !== undefined) {
    console.warn('[Pinecone/list] Empty list returned — namespace may be required or index uses different list format');
    console.log('[Pinecone/list] Raw response:', JSON.stringify(res.body).slice(0, 300));
  }

  return ids;
}

/* ── Step 2: Fetch metadata for IDs ── */
async function fetchMetadata(ids) {
  console.log(`\n[Pinecone/fetch] Fetching metadata for ${ids.length} vectors...`);
  const res = await httpsReq(
    'GET',
    PINECONE_HOST,
    `/vectors/fetch?ids=${ids.map(encodeURIComponent).join('&ids=')}`,
    { 'Api-Key': PINECONE_KEY },
    null
  );

  if (res.status !== 200) {
    console.error(`[Pinecone/fetch] HTTP ${res.status}:`, JSON.stringify(res.body).slice(0, 400));
    throw new Error(`Fetch failed with HTTP ${res.status}`);
  }

  const vectors = res.body.vectors || {};
  const records = Object.values(vectors);
  console.log(`[Pinecone/fetch] Retrieved ${records.length} records with metadata`);
  return records;
}

/* ── Step 3: Fallback — random vector query to get 50 diverse results ── */
async function queryRandomVector(topK = 50) {
  console.log(`\n[Pinecone/query] Fallback: querying with random unit vector (topK=${topK})...`);

  // 1024-dim random vector (BAAI/bge-large-en-v1.5 dimension)
  const dim = 1024;
  const vec = Array.from({ length: dim }, () => (Math.random() * 2 - 1));
  // Normalize to unit vector
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  const unitVec = vec.map(v => v / mag);

  const res = await httpsReq(
    'POST',
    PINECONE_HOST,
    '/query',
    { 'Api-Key': PINECONE_KEY },
    { vector: unitVec, topK, includeMetadata: true }
  );

  if (res.status !== 200) {
    console.error(`[Pinecone/query] HTTP ${res.status}:`, JSON.stringify(res.body).slice(0, 400));
    throw new Error(`Query failed with HTTP ${res.status}`);
  }

  const matches = res.body.matches || [];
  console.log(`[Pinecone/query] Got ${matches.length} matches`);
  return matches.map(m => ({ id: m.id, score: m.score, metadata: m.metadata }));
}

/* ── Step 4: Analyze and print report ── */
function analyzeRecords(records) {
  console.log('\n' + '═'.repeat(60));
  console.log(' PINECONE METADATA AUDIT REPORT');
  console.log('═'.repeat(60));

  if (records.length === 0) {
    console.error('❌ No records retrieved. Check API key and host.');
    return;
  }

  console.log(`\n📦 Total records inspected: ${records.length}\n`);

  // ── 1. Print all unique metadata keys found ──
  const allKeys = new Set();
  records.forEach(r => {
    const md = r.metadata || {};
    Object.keys(md).forEach(k => allKeys.add(k));
  });

  console.log('─'.repeat(60));
  console.log('🔑 METADATA KEYS FOUND IN INDEX:');
  console.log('─'.repeat(60));
  [...allKeys].sort().forEach(k => console.log(`   "${k}"`));

  // ── 2. Extract unique values for key fields ──
  // Try both guessed and actual key names
  const categoryKey = [...allKeys].find(k => k.toLowerCase().includes('categor')) || null;
  const colorKey    = [...allKeys].find(k => k.toLowerCase().includes('color'))    || null;
  const genderKey   = [...allKeys].find(k => k.toLowerCase().includes('gender'))   || null;
  const nameKey     = [...allKeys].find(k => k.toLowerCase().includes('name') && !k.toLowerCase().includes('brand')) || null;

  console.log('\n─'.repeat(30));
  console.log(`📌 Mapped field names:`);
  console.log(`   Category → "${categoryKey}"`);
  console.log(`   Color    → "${colorKey}"`);
  console.log(`   Gender   → "${genderKey}"`);
  console.log(`   Name     → "${nameKey}"`);

  // ── 3. Unique categories ──
  console.log('\n' + '─'.repeat(60));
  console.log('🏷️  UNIQUE PRODUCT CATEGORIES:');
  console.log('─'.repeat(60));
  const categoryCounts = {};
  records.forEach(r => {
    const val = (r.metadata?.[categoryKey] || 'UNKNOWN').trim();
    categoryCounts[val] = (categoryCounts[val] || 0) + 1;
  });
  const sortedCats = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  sortedCats.forEach(([cat, count]) => {
    console.log(`   ${String(count).padStart(3, ' ')}x  "${cat}"`);
  });

  // ── 4. Unique colors ──
  console.log('\n' + '─'.repeat(60));
  console.log('🎨 UNIQUE PRODUCT COLORS:');
  console.log('─'.repeat(60));
  const colorCounts = {};
  records.forEach(r => {
    const val = (r.metadata?.[colorKey] || 'UNKNOWN').trim();
    colorCounts[val] = (colorCounts[val] || 0) + 1;
  });
  Object.entries(colorCounts).sort((a, b) => b[1] - a[1])
    .forEach(([col, count]) => console.log(`   ${String(count).padStart(3, ' ')}x  "${col}"`));

  // ── 5. Unique genders ──
  console.log('\n' + '─'.repeat(60));
  console.log('👤 UNIQUE GENDER VALUES:');
  console.log('─'.repeat(60));
  const genderCounts = {};
  records.forEach(r => {
    const val = (r.metadata?.[genderKey] || 'UNKNOWN').trim();
    genderCounts[val] = (genderCounts[val] || 0) + 1;
  });
  Object.entries(genderCounts).sort((a, b) => b[1] - a[1])
    .forEach(([g, count]) => console.log(`   ${String(count).padStart(3, ' ')}x  "${g}"`));

  // ── 6. Shirt / T-Shirt / Top check ──
  console.log('\n' + '─'.repeat(60));
  console.log('🔍 SHIRT / T-SHIRT / TOP AVAILABILITY CHECK:');
  console.log('─'.repeat(60));

  const targets = ['shirt', 't-shirt', 'tshirt', 'tee', 'top', 'polo', 'tops'];
  const found   = {};

  records.forEach(r => {
    const cat  = (r.metadata?.[categoryKey] || '').toLowerCase();
    const name = (r.metadata?.[nameKey]     || '').toLowerCase();
    const text = (r.metadata?.['text']      || '').toLowerCase();
    targets.forEach(t => {
      if (cat.includes(t) || name.includes(t) || text.includes(t)) {
        found[t] = (found[t] || 0) + 1;
      }
    });
  });

  if (Object.keys(found).length === 0) {
    console.log('\n   ❌ No shirt products found in database.');
    console.log('   ❌ No t-shirt products found in database.');
    console.log('   ❌ No top products found in database.');
  } else {
    targets.forEach(t => {
      if (found[t]) {
        console.log(`   ✅ "${t}" — ${found[t]} record(s) found`);
      } else {
        console.log(`   ❌ "${t}" — NOT FOUND in database`);
      }
    });
  }

  // ── 7. Sample raw records ──
  console.log('\n' + '─'.repeat(60));
  console.log('📄 SAMPLE RAW METADATA (first 5 unique products):');
  console.log('─'.repeat(60));
  const seenNames = new Set();
  let printed = 0;
  for (const r of records) {
    const name = r.metadata?.[nameKey] || r.id;
    if (!seenNames.has(name)) {
      seenNames.add(name);
      console.log(`\n[${printed + 1}] ID: ${r.id}`);
      console.log('    Metadata:', JSON.stringify(r.metadata, null, 4).replace(/^/gm, '    ').trimStart());
      printed++;
      if (printed >= 5) break;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(' AUDIT COMPLETE');
  console.log('═'.repeat(60) + '\n');
}

/* ── MAIN ── */
(async () => {
  console.log('\n🔍 Starting Pinecone Audit...');
  console.log(`   Host : ${PINECONE_HOST}`);
  console.log(`   Key  : ${PINECONE_KEY.slice(0, 12)}...`);

  let records = [];

  try {
    // Try List + Fetch first (most accurate — gets real random samples)
    const ids = await listIds(100);

    if (ids.length > 0) {
      // Fetch in batches of 50 (Pinecone fetch limit per request)
      const batch = ids.slice(0, 50);
      records = await fetchMetadata(batch);
    }

    // If list gave 0 results, fall back to random-vector query
    if (records.length === 0) {
      console.log('\n[Audit] List/Fetch returned 0 results. Trying random-vector query fallback...');
      records = await queryRandomVector(50);
    }

    analyzeRecords(records);

  } catch (err) {
    console.error('\n❌ Audit failed:', err.message);
    console.log('\n[Audit] Trying random-vector query as last resort...');
    try {
      records = await queryRandomVector(50);
      analyzeRecords(records);
    } catch (err2) {
      console.error('❌ Fallback also failed:', err2.message);
      process.exit(1);
    }
  }
})();
