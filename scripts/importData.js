/**
 * importData.js — stáhne objednávky + marketingové náklady z Google Sheets
 * a zapíše je do NeonDB (batch inserty).
 *
 * Spuštění: npm run db:import
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

// Load .env.local
try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
  for (const line of envContent.split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) { const k = m[1].trim(); if (!process.env[k]) process.env[k] = m[2].trim(); }
  }
} catch (_) {}

// Local mode: node importData.js --local <orders.csv>
const LOCAL_IDX = process.argv.indexOf('--local');
const LOCAL_MODE = LOCAL_IDX !== -1;
const LOCAL_ORDERS_FILE = LOCAL_MODE ? process.argv[LOCAL_IDX + 1] : null;

if (LOCAL_MODE && !LOCAL_ORDERS_FILE) {
  console.error('❌ Chybí cesta k souboru. Použití: node scripts/importData.js --local <cesta/k/orders.csv>');
  process.exit(1);
}

const ORDERS_URL = process.env.ORDERS_SHEET_URL;
const COST_URL   = process.env.COST_SHEET_URL;

if (!LOCAL_MODE && (!ORDERS_URL || !COST_URL)) {
  console.error('❌ Chybí env proměnné ORDERS_SHEET_URL nebo COST_SHEET_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function fetchUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseCSVLine(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else { cur += c; }
  }
  cols.push(cur);
  return cols;
}

function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 2) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseNum(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/\s/g, '').replace(',', '.')) || 0;
}

function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

const MONTH_NAMES = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };

function parseCzDate(s) {
  if (!s) return null;
  // Czech format: "19.6.2026"
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // English format: "Jun 19, 2026"
  const engMatch = s.match(/^([A-Za-z]{3})\s+(\d{1,2}),?\s*(\d{4})/);
  if (engMatch) {
    const m = MONTH_NAMES[engMatch[1]];
    if (m) return `${engMatch[3]}-${String(m).padStart(2, '0')}-${engMatch[2].padStart(2, '0')}`;
  }
  return null;
}

function parseHour(timeStr) {
  if (!timeStr) return 0;
  // "11:01:18 AM" / "01:30:00 PM"
  const ampm = timeStr.match(/^(\d{1,2}):\d{2}:\d{2}\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    if (ampm[2].toUpperCase() === 'AM' && h === 12) h = 0;
    if (ampm[2].toUpperCase() === 'PM' && h !== 12) h += 12;
    return h;
  }
  return parseInt(timeStr.split(':')[0], 10) || 0;
}

function detectMarket(currency) {
  return currency === 'EUR' ? 'SK' : 'CZ';
}

const SHIPPING_PREFIXES = ['Zásilkovna', 'Zasilkovna', 'GLS', 'PPL', 'Česká pošta', 'DPD', 'Packeta', 'In Time', 'Uloženka'];

// Všichni dopravci → kanonický název
const CARRIER_ALIASES = [
  [/^zásilkovna/i,        'Zásilkovna'],
  [/^zasilkovna/i,        'Zásilkovna'],
  [/^packeta/i,           'Zásilkovna'],
  [/^česká\s*pošta/i,    'Zásilkovna'],
  [/^ceska\s*posta/i,     'Zásilkovna'],
  [/^dobírk/i,            'Zásilkovna'],
  [/^dobierka/i,          'Zásilkovna'],
  [/^doprava$/i,          'Zásilkovna'],
];

function normalizeShipping(name) {
  if (!name) return '';
  const n = name.trim();
  for (const [re, canonical] of CARRIER_ALIASES) {
    if (re.test(n)) return canonical;
  }
  return n.split(' - ')[0].trim();
}

/**
 * Batch upsert helper — vloží rows po chunkSize, vrátí počet zpracovaných řádků.
 * buildQuery(placeholders) → string SQL s VALUES (...)
 * rowToValues(row) → pole hodnot
 */
async function batchUpsert(rows, colCount, buildQuery, rowToValues, chunkSize = 200) {
  if (rows.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, ri) => {
      const offset = ri * colCount;
      const params = Array.from({ length: colCount }, (_, j) => `$${offset + j + 1}`).join(', ');
      return `(${params})`;
    }).join(', ');
    const values = chunk.flatMap(rowToValues);
    await pool.query(buildQuery(placeholders), values);
    total += chunk.length;
  }
  return total;
}

// ── Zpracování objednávek ─────────────────────────────────────────────────────

async function processOrders(rows) {
  log(`Zpracovávám ${rows.length} řádků objednávek...`);

  // Rychlá mapa číslo objednávky → čas
  const orderTimeMap = new Map();
  for (const row of rows) {
    const id = row['Číslo objednávky'];
    if (id && !orderTimeMap.has(id)) orderTimeMap.set(id, row['Čas'] || '00:00:00');
  }

  // Skupinování po čísle objednávky
  const orderMap = new Map();
  for (const row of rows) {
    const orderId = row['Číslo objednávky'];
    if (!orderId) continue;
    if ((row['Stav platby'] || '') === 'Čeká na platbu') continue;

    if (!orderMap.has(orderId)) {
      const date = parseCzDate(row['Datum vytvoření']);
      if (!date) continue;
      const currency    = (row['Měna'] || 'CZK').trim();
      const market      = detectMarket(currency);
      const totalVat    = parseNum(row['Celkem']);
      const vatAmount   = parseNum(row['DPH celkem']);
      const shippingVat = parseNum(row['Sazba dopravy']);
      const email       = row['Kontaktní e‑mail'] || row['Kontaktní e-mail'] || '';
      // Produktový obrat = celkem bez dopravy; bez DPH = proporcionální VAT ratio
      const productRevenueVat = totalVat - shippingVat;
      const vatRatio          = totalVat > 0 ? (totalVat - vatAmount) / totalVat : 1;
      orderMap.set(orderId, {
        orderId, date, market, currency,
        totalVat, vatAmount,
        revenue:     productRevenueVat * vatRatio,
        revenueVat:  productRevenueVat,
        shippingVat,
        email,
        shippingMethod: normalizeShipping(row['Způsob doručení'] || ''),
        paymentMethod:  row['Způsob platby'] || '',
        items: [],
      });
    }

    const order = orderMap.get(orderId);
    const productName = (row['Položka'] || '').trim();
    const isShipping = SHIPPING_PREFIXES.some(p => productName.toLowerCase().startsWith(p.toLowerCase()))
      || productName.toLowerCase().includes('doprava')
      || productName.toLowerCase().includes('poštovné');
    const isPayment = productName.toLowerCase().includes('platba')
      || productName.toLowerCase().includes('dobírka')
      || productName.toLowerCase().includes('platební');

    if (productName && !isShipping && !isPayment) {
      const qty      = parseInt(row['Kusů'] || '1', 10) || 1;
      const priceVat = parseNum(row['Cena']);
      const vatRatio = order.revenueVat > 0 ? (order.revenueVat - order.vatAmount) / order.revenueVat : 1;
      order.items.push({
        name: productName,
        variant: (row['Varianta'] || '').trim(),
        sku:     (row['SKU'] || '').trim(),
        qty,
        price: priceVat * vatRatio * qty,
      });
    }
  }

  log(`Nalezeno ${orderMap.size} unikátních objednávek.`);

  // Sestavení agregací
  const dailyOrdersMap  = new Map();
  const customerArr     = [];
  const orderValuesArr  = [];
  const productArr      = [];
  const shippingMap     = new Map();
  const paymentMap      = new Map();
  const hourlyMap       = new Map();

  for (const order of orderMap.values()) {
    const { orderId, date, market, revenueVat, revenue, shippingVat,
            shippingMethod, paymentMethod, email, items } = order;

    // daily_orders
    const doKey = `${date}|${market}`;
    if (!dailyOrdersMap.has(doKey)) {
      dailyOrdersMap.set(doKey, { date, market, revenueVat: 0, revenue: 0, orderCount: 0, shippingRevenue: 0 });
    }
    const do_ = dailyOrdersMap.get(doKey);
    do_.revenueVat      += revenueVat;
    do_.revenue         += revenue;
    do_.orderCount      += 1;
    do_.shippingRevenue += shippingVat;

    // customer_orders
    if (email) {
      customerArr.push({ orderId, date, market, customerHash: hashEmail(email), revenueVat, revenue, shippingMethod, paymentMethod });
    }

    // order_values
    const basketValue = items.reduce((s, i) => s + i.price, 0);
    if (basketValue > 0) orderValuesArr.push({ orderId, date, market, value: basketValue });

    // product_sales
    for (const item of items) {
      productArr.push({ date, market, productName: item.name, variant: item.variant, sku: item.sku, quantity: item.qty, revenue: item.price });
    }

    // daily_shipping
    if (shippingMethod) {
      const k = `${date}|${market}|${shippingMethod}`;
      if (!shippingMap.has(k)) shippingMap.set(k, { date, market, name: shippingMethod, orderCount: 0, revenueVat: 0, freeCount: 0 });
      const sh = shippingMap.get(k);
      sh.orderCount += 1;
      sh.revenueVat += shippingVat;
      if (shippingVat === 0) sh.freeCount += 1;
    }

    // daily_payment
    if (paymentMethod) {
      const k = `${date}|${market}|${paymentMethod}`;
      if (!paymentMap.has(k)) paymentMap.set(k, { date, market, name: paymentMethod, orderCount: 0, revenueVat: 0 });
      const pm = paymentMap.get(k);
      pm.orderCount += 1;
      pm.revenueVat += revenueVat;
    }

    // hourly_behavior
    const hour    = parseHour(orderTimeMap.get(orderId) || '00:00:00');
    const jsDow   = new Date(date).getDay();
    const dow     = jsDow === 0 ? 6 : jsDow - 1;
    const hk      = `${market}|${dow}|${hour}`;
    if (!hourlyMap.has(hk)) hourlyMap.set(hk, { market, dow, hour, orderCount: 0, revenue: 0 });
    hourlyMap.get(hk).orderCount += 1;
    hourlyMap.get(hk).revenue    += revenue;
  }

  // ── Batch upserts ─────────────────────────────────────────────────────────────

  // 1. daily_orders
  const doRows = [...dailyOrdersMap.values()];
  const doCount = await batchUpsert(doRows, 6,
    (ph) => `INSERT INTO daily_orders (date,market,revenue_vat,revenue,order_count,shipping_revenue) VALUES ${ph}
              ON CONFLICT (date,market) DO UPDATE SET
                revenue_vat=EXCLUDED.revenue_vat, revenue=EXCLUDED.revenue,
                order_count=EXCLUDED.order_count, shipping_revenue=EXCLUDED.shipping_revenue`,
    r => [r.date, r.market, r.revenueVat, r.revenue, r.orderCount, r.shippingRevenue]
  );
  log(`  daily_orders: ${doCount} řádků`);

  // 2. customer_orders
  const custCount = await batchUpsert(customerArr, 8,
    (ph) => `INSERT INTO customer_orders (order_id,date,market,customer_hash,revenue_vat,revenue,shipping_method,payment_method) VALUES ${ph}
              ON CONFLICT (order_id) DO NOTHING`,
    r => [r.orderId, r.date, r.market, r.customerHash, r.revenueVat, r.revenue, r.shippingMethod, r.paymentMethod]
  );
  log(`  customer_orders: ${custCount} řádků`);

  // 3. order_values
  const ovCount = await batchUpsert(orderValuesArr, 4,
    (ph) => `INSERT INTO order_values (order_id,date,market,value) VALUES ${ph} ON CONFLICT (order_id) DO NOTHING`,
    r => [r.orderId, r.date, r.market, r.value]
  );
  log(`  order_values: ${ovCount} řádků`);

  // 4. product_sales — DELETE range + batch INSERT
  if (productArr.length > 0) {
    const markets = [...new Set(productArr.map(r => r.market))];
    for (const mkt of markets) {
      const mktDates = productArr.filter(r => r.market === mkt).map(r => r.date);
      const minDate  = mktDates.reduce((a, b) => a < b ? a : b);
      const maxDate  = mktDates.reduce((a, b) => a > b ? a : b);
      await pool.query('DELETE FROM product_sales WHERE market=$1 AND date BETWEEN $2 AND $3', [mkt, minDate, maxDate]);
    }
    const psCount = await batchUpsert(productArr, 7,
      (ph) => `INSERT INTO product_sales (date,market,product_name,variant,sku,quantity,revenue) VALUES ${ph}`,
      r => [r.date, r.market, r.productName, r.variant, r.sku, r.quantity, r.revenue]
    );
    log(`  product_sales: ${psCount} řádků`);
  }

  // 5. daily_shipping — DELETE range + batch INSERT
  const shRows = [...shippingMap.values()];
  if (shRows.length > 0) {
    const markets = [...new Set(shRows.map(r => r.market))];
    for (const mkt of markets) {
      const mktDates = shRows.filter(r => r.market === mkt).map(r => r.date);
      const minDate  = mktDates.reduce((a, b) => a < b ? a : b);
      const maxDate  = mktDates.reduce((a, b) => a > b ? a : b);
      await pool.query('DELETE FROM daily_shipping WHERE market=$1 AND date BETWEEN $2 AND $3', [mkt, minDate, maxDate]);
    }
    const shCount = await batchUpsert(shRows, 6,
      (ph) => `INSERT INTO daily_shipping (date,market,name,order_count,revenue_vat,free_count) VALUES ${ph}`,
      r => [r.date, r.market, r.name, r.orderCount, r.revenueVat, r.freeCount]
    );
    log(`  daily_shipping: ${shCount} řádků`);
  }

  // 6. daily_payment — DELETE range + batch INSERT
  const pmRows = [...paymentMap.values()];
  if (pmRows.length > 0) {
    const markets = [...new Set(pmRows.map(r => r.market))];
    for (const mkt of markets) {
      const mktDates = pmRows.filter(r => r.market === mkt).map(r => r.date);
      const minDate  = mktDates.reduce((a, b) => a < b ? a : b);
      const maxDate  = mktDates.reduce((a, b) => a > b ? a : b);
      await pool.query('DELETE FROM daily_payment WHERE market=$1 AND date BETWEEN $2 AND $3', [mkt, minDate, maxDate]);
    }
    const pmCount = await batchUpsert(pmRows, 5,
      (ph) => `INSERT INTO daily_payment (date,market,name,order_count,revenue_vat) VALUES ${ph}`,
      r => [r.date, r.market, r.name, r.orderCount, r.revenueVat]
    );
    log(`  daily_payment: ${pmCount} řádků`);
  }

  // 7. hourly_behavior — TRUNCATE per market + INSERT
  const hwRows = [...hourlyMap.values()];
  if (hwRows.length > 0) {
    const markets = [...new Set(hwRows.map(r => r.market))];
    for (const mkt of markets) {
      await pool.query('DELETE FROM hourly_behavior WHERE market=$1', [mkt]);
    }
    const hwCount = await batchUpsert(hwRows, 5,
      (ph) => `INSERT INTO hourly_behavior (market,day_of_week,hour,order_count,revenue) VALUES ${ph}
                ON CONFLICT (market,day_of_week,hour) DO UPDATE SET order_count=EXCLUDED.order_count, revenue=EXCLUDED.revenue`,
      r => [r.market, r.dow, r.hour, r.orderCount, Math.round(r.revenue * 100) / 100]
    );
    log(`  hourly_behavior: ${hwCount} řádků`);
  }

  await pool.query(
    `INSERT INTO import_log (source,rows_total,rows_new,note) VALUES ('orders',$1,$2,$3)`,
    [rows.length, orderMap.size, `${orderMap.size} orders, ${productArr.length} product rows`]
  );

  log('✅ Objednávky importovány.');
}

// ── Zpracování marketingových nákladů ─────────────────────────────────────────

async function processCosts(rows) {
  log(`Zpracovávám ${rows.length} řádků marketingových nákladů...`);

  const costMap = new Map();
  for (const row of rows) {
    const date = row['date'];
    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
    const campaignName = (row['campaign_name'] || '').toLowerCase();
    const market       = campaignName.startsWith('sk-') ? 'SK' : 'CZ';
    const source       = (row['source'] || 'facebook').toLowerCase();
    const key          = `${date}|${market}|${source}`;
    if (!costMap.has(key)) {
      costMap.set(key, { date, market, source, cost: 0, clicks: 0, impressions: 0, conversions: 0, conversionsValue: 0 });
    }
    const e = costMap.get(key);
    e.cost             += parseNum(row['cost']);
    e.clicks           += parseInt(row['clicks'] || '0', 10) || 0;
    e.impressions      += parseInt(row['impressions'] || '0', 10) || 0;
    e.conversions      += parseInt(row['conversions'] || '0', 10) || 0;
    e.conversionsValue += parseNum(row['conversions_value']);
  }

  const costRows = [...costMap.values()];
  log(`Nalezeno ${costRows.length} kombinací date×market×source.`);

  const count = await batchUpsert(costRows, 8,
    (ph) => `INSERT INTO daily_marketing (date,market,source,cost,clicks,impressions,conversions,conversions_value) VALUES ${ph}
              ON CONFLICT (date,market,source) DO UPDATE SET
                cost=EXCLUDED.cost, clicks=EXCLUDED.clicks, impressions=EXCLUDED.impressions,
                conversions=EXCLUDED.conversions, conversions_value=EXCLUDED.conversions_value`,
    r => [r.date, r.market, r.source, r.cost, r.clicks, r.impressions, r.conversions, r.conversionsValue]
  );

  await pool.query(
    `INSERT INTO import_log (source,rows_total,rows_new,note) VALUES ('costs',$1,$2,$3)`,
    [rows.length, count, `${count} cost rows upserted`]
  );

  log('✅ Marketingové náklady importovány.');
}

function readLocalCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  return parseCSV(content);
}

// ── Hlavní funkce ─────────────────────────────────────────────────────────────

async function main() {
  log('=== Import dat: Zboží z Bali ===');

  try {
    let ordersRows;
    if (LOCAL_MODE) {
      log(`Čtu lokální soubor: ${LOCAL_ORDERS_FILE}`);
      ordersRows = readLocalCSV(LOCAL_ORDERS_FILE);
    } else {
      log('Stahuji export objednávek...');
      const ordersCSV = await fetchUrl(ORDERS_URL);
      ordersRows = parseCSV(ordersCSV);
    }
    log(`Načteno ${ordersRows.length} řádků.`);
    await processOrders(ordersRows);
  } catch (err) {
    log(`❌ Chyba při importu objednávek: ${err.message}`);
    console.error(err.stack);
  }

  if (!LOCAL_MODE) {
    try {
      log('Stahuji export marketingových nákladů...');
      const costsCSV  = await fetchUrl(COST_URL);
      const costsRows = parseCSV(costsCSV);
      log(`Staženo ${costsRows.length} řádků.`);
      await processCosts(costsRows);
    } catch (err) {
      log(`❌ Chyba při importu nákladů: ${err.message}`);
      console.error(err.stack);
    }
  }

  await pool.end();
  log('=== Import dokončen ===');
}

main().catch(err => {
  console.error('❌ Fatální chyba:', err.message);
  process.exit(1);
});
