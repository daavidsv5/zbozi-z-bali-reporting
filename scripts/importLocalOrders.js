/**
 * importLocalOrders.js
 * One-time import of Shoptet CSV order exports into data/*.ts files.
 *
 * Usage:
 *   node scripts/importLocalOrders.js [czFile] [skFile]
 *
 * Default paths:
 *   czFile = C:/Users/daavi/Downloads/CS-CZ_Orders.csv
 *   skFile = C:/Users/daavi/Downloads/CS-SK-Orders.csv
 *
 * Generates:
 *   data/realDataCZ.ts    – daily order/revenue (costs preserved from existing file)
 *   data/realDataSK.ts
 *   data/productDataCZ.ts – per-day product sales
 *   data/productDataSK.ts
 *   data/retentionDataCZ.ts
 *   data/retentionDataSK.ts
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LOG_FILE = path.join(__dirname, 'updateData.log');

const CZ_CSV = process.argv[2] || 'C:/Users/daavi/Downloads/CS-CZ_Orders.csv';
const SK_CSV = process.argv[3] || 'C:/Users/daavi/Downloads/CS-SK-Orders.csv';

// ── Column indices (Shoptet local export) ─────────────────────────────────────
const C_CODE     = 0;   // code
const C_DATE     = 1;   // date
const C_STATUS   = 2;   // statusName
const C_EMAIL    = 5;   // email
const C_PVAT     = 36;  // totalPriceWithVat
const C_P        = 37;  // totalPriceWithoutVat
const C_INAME    = 43;  // itemName
const C_IAMOUNT  = 44;  // itemAmount
const C_ICODE    = 45;  // itemCode
const C_IPVAT    = 55;  // itemTotalPriceWithVat
const C_IP       = 56;  // itemTotalPriceWithoutVat

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

const parseNum = s => parseFloat((s || '0').replace(/\s/g, '').replace(',', '.')) || 0;

function isCancelled(status) {
  const s = status.toLowerCase();
  return s.includes('storno') || s.includes('vrácen') || s.includes('vraten')
      || s.includes('nevyzdvih') || s.includes('nevyzvednuto');
}

// ── Streaming CSV parser ───────────────────────────────────────────────────────
// Handles semicolon delimiter, quoted fields (including embedded newlines)
function processCSVFile(filePath, onRow) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: 'latin1' });
    let buf = '', isHeader = true;

    function flush() {
      while (true) {
        // Find row boundary: newline outside quotes
        let inQ = false, i = 0;
        for (; i < buf.length; i++) {
          const c = buf[i];
          if (c === '"') {
            if (buf[i + 1] === '"') i++; // escaped quote
            else inQ = !inQ;
          } else if (c === '\n' && !inQ) break;
        }
        if (i >= buf.length) break; // no complete row yet

        const line = buf.substring(0, i).replace(/\r$/, '').trim();
        buf = buf.substring(i + 1);
        if (!line) continue;
        if (isHeader) { isHeader = false; continue; }

        // Parse semicolon-separated row
        const cols = [];
        let cur = '', inq = false;
        for (let j = 0; j < line.length; j++) {
          const c = line[j];
          if (c === '"') {
            if (inq && line[j + 1] === '"') { cur += '"'; j++; }
            else inq = !inq;
          } else if (c === ';' && !inq) {
            cols.push(cur); cur = '';
          } else {
            cur += c;
          }
        }
        cols.push(cur);
        onRow(cols);
      }
    }

    stream.on('data', chunk => { buf += chunk; flush(); });
    stream.on('end', () => { flush(); resolve(); });
    stream.on('error', reject);
  });
}

// ── Load existing cost data from a realData*.ts file ─────────────────────────
function loadExistingCosts(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/=\s*(\[[\s\S]*\]);?\s*$/);
    if (!match) return {};
    const arr = JSON.parse(match[1]);
    const map = {};
    for (const r of arr) {
      map[r.date] = {
        cost:             r.cost             || 0,
        cost_facebook:    r.cost_facebook    || 0,
        cost_google:      r.cost_google      || 0,
        clicks_facebook:  r.clicks_facebook  || 0,
        clicks_google:    r.clicks_google    || 0,
      };
    }
    log(`Loaded ${arr.length} cost records from ${path.basename(filePath)}`);
    return map;
  } catch (e) {
    log(`No existing cost data in ${path.basename(filePath)}: ${e.message}`);
    return {};
  }
}

// ── Process one CSV file ──────────────────────────────────────────────────────
async function processOrderFile(csvPath, country) {
  log(`Processing ${country.toUpperCase()}: ${csvPath}`);

  const byDay     = {};   // date → { orders, orders_cancelled, revenue_vat, revenue }
  const byProduct = {};   // "date||name" → { date, name, amount, revenue_vat, revenue }
  const byEmail   = new Map(); // email → { dates[], revenues[], revsVat[] }

  const seenOrders = new Set();  // for order-level dedup (revenue, email)

  let rowCount = 0;

  await processCSVFile(csvPath, cols => {
    rowCount++;
    if (rowCount % 100000 === 0) log(`  ... ${rowCount} rows processed`);

    if (cols.length < 46) return;

    const code   = cols[C_CODE].trim();
    const date   = cols[C_DATE].substring(0, 10);
    const status = cols[C_STATUS].trim();
    const icode  = cols[C_ICODE].trim();
    const iname  = cols[C_INAME].trim();

    if (!date || date.length < 10 || date[4] !== '-') return; // skip bad rows

    // ── Initialise daily bucket ──────────────────────────────────────────────
    if (!byDay[date]) byDay[date] = { orders: 0, orders_cancelled: 0, revenue_vat: 0, revenue: 0 };

    // ── Per-order processing (dedup by code) ─────────────────────────────────
    if (!seenOrders.has(code)) {
      seenOrders.add(code);

      if (isCancelled(status)) {
        byDay[date].orders_cancelled++;
      } else {
        byDay[date].orders++;
        byDay[date].revenue_vat += parseNum(cols[C_PVAT]);
        byDay[date].revenue     += parseNum(cols[C_P]);

        // ── Retention ───────────────────────────────────────────────────────
        const email = (cols[C_EMAIL] || '').trim().toLowerCase();
        const revVat = parseNum(cols[C_PVAT]);
        const rev    = parseNum(cols[C_P]);
        if (email && revVat > 0) {
          if (!byEmail.has(email)) byEmail.set(email, { dates: [], revenues: [], revsVat: [] });
          const c = byEmail.get(email);
          c.dates.push(date);
          c.revenues.push(Math.round(rev * 100) / 100);
          c.revsVat.push(Math.round(revVat * 100) / 100);
        }
      }
    }

    // From here on, skip cancelled orders entirely
    if (isCancelled(status)) return;

    const amt    = parseNum(cols[C_IAMOUNT]);
    const ipvat  = parseNum(cols[C_IPVAT]);
    const ip     = parseNum(cols[C_IP]);

    // ── Product item ──────────────────────────────────────────────────────────
    if (!iname || amt <= 0) return;
    const key = `${date}||${iname}`;
    if (!byProduct[key]) byProduct[key] = { date, name: iname, amount: 0, revenue_vat: 0, revenue: 0 };
    byProduct[key].amount      += amt;
    byProduct[key].revenue_vat += ipvat;
    byProduct[key].revenue     += ip;
  });

  log(`  ${country.toUpperCase()}: ${rowCount} rows → ${seenOrders.size} unique orders | ${Object.keys(byDay).length} days`);

  return { byDay, byProduct, byEmail };
}

// ── Write helpers ─────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0];

function writeRealData(filePath, varName, interfaceName, country, records) {
  const content =
`// Auto-generated by scripts/importLocalOrders.js — last update: ${TODAY}
// ${country.toUpperCase()}: orders in ${country === 'cz' ? 'CZK' : 'EUR'} (cancelled/returned excluded)

export interface ${interfaceName} {
  date: string;
  country: '${country}';
  orders: number;
  orders_cancelled: number;
  revenue_vat: number;
  revenue: number;
  cost: number;
  cost_facebook: number;
  cost_google: number;
  clicks_facebook: number;
  clicks_google: number;
}

export const ${varName}: ${interfaceName}[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeProductData(filePath, varName, country, records) {
  const content =
`// Auto-generated by scripts/importLocalOrders.js — last update: ${TODAY}
// ${country.toUpperCase()}: product sales (cancelled/returned excluded)

export interface ProductSaleRecord {
  date: string;
  name: string;
  amount: number;
  revenue_vat: number;
  revenue: number;
}

export const ${varName}: ProductSaleRecord[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeRetentionData(filePath, varName, country, records) {
  const content =
`// Auto-generated by scripts/importLocalOrders.js — last update: ${TODAY}
// ${country.toUpperCase()}: per-customer retention data (${country === 'cz' ? 'CZK' : 'EUR'})

export const ${varName}: { dates: string[]; revenues: number[]; revsVat: number[] }[] = ${JSON.stringify(records, null, 2)};
`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('=== importLocalOrders started ===');

  // Load existing cost data (to preserve marketing costs)
  const existingCostCZ = loadExistingCosts(path.join(DATA_DIR, 'realDataCZ.ts'));
  const existingCostSK = loadExistingCosts(path.join(DATA_DIR, 'realDataSK.ts'));

  // ── CZ ─────────────────────────────────────────────────────────────────────
  const cz = await processOrderFile(CZ_CSV, 'cz');

  // Merge daily records with existing costs
  const recordsCZ = Object.entries(cz.byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, o]) => {
      const c = existingCostCZ[date] || {};
      return {
        date, country: 'cz',
        orders:            o.orders,
        orders_cancelled:  o.orders_cancelled,
        revenue_vat:       Math.round(o.revenue_vat * 100) / 100,
        revenue:           Math.round(o.revenue     * 100) / 100,
        cost:              Math.round((c.cost            || 0) * 100) / 100,
        cost_facebook:     Math.round((c.cost_facebook   || 0) * 100) / 100,
        cost_google:       Math.round((c.cost_google     || 0) * 100) / 100,
        clicks_facebook:   c.clicks_facebook || 0,
        clicks_google:     c.clicks_google   || 0,
      };
    });

  writeRealData(path.join(DATA_DIR, 'realDataCZ.ts'), 'realDataCZ', 'RealDailyRecord', 'cz', recordsCZ);
  log(`CZ: written ${recordsCZ.length} daily records`);

  // CZ products
  const productsCZ = Object.values(cz.byProduct)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
    .map(r => ({
      ...r,
      revenue_vat: Math.round(r.revenue_vat * 100) / 100,
      revenue:     Math.round(r.revenue     * 100) / 100,
    }));
  writeProductData(path.join(DATA_DIR, 'productDataCZ.ts'), 'productDataCZ', 'cz', productsCZ);
  log(`CZ: written ${productsCZ.length} product-day records`);

  // CZ retention
  const retentionCZ = [...cz.byEmail.values()].map(c => {
    const sorted = c.dates.map((d, i) => ({ d, r: c.revenues[i], rv: c.revsVat[i] }))
      .sort((a, b) => a.d.localeCompare(b.d));
    return {
      dates:    sorted.map(x => x.d),
      revenues: sorted.map(x => x.r),
      revsVat:  sorted.map(x => x.rv),
    };
  });
  writeRetentionData(path.join(DATA_DIR, 'retentionDataCZ.ts'), 'retentionDataCZ', 'cz', retentionCZ);
  log(`CZ: written retention for ${retentionCZ.length} customers`);

  // ── SK ─────────────────────────────────────────────────────────────────────
  const sk = await processOrderFile(SK_CSV, 'sk');

  const recordsSK = Object.entries(sk.byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, o]) => {
      const c = existingCostSK[date] || {};
      return {
        date, country: 'sk',
        orders:            o.orders,
        orders_cancelled:  o.orders_cancelled,
        revenue_vat:       Math.round(o.revenue_vat * 100) / 100,
        revenue:           Math.round(o.revenue     * 100) / 100,
        cost:              Math.round((c.cost            || 0) * 100) / 100,
        cost_facebook:     Math.round((c.cost_facebook   || 0) * 100) / 100,
        cost_google:       Math.round((c.cost_google     || 0) * 100) / 100,
        clicks_facebook:   c.clicks_facebook || 0,
        clicks_google:     c.clicks_google   || 0,
      };
    });

  writeRealData(path.join(DATA_DIR, 'realDataSK.ts'), 'realDataSK', 'RealDailyRecordSK', 'sk', recordsSK);
  log(`SK: written ${recordsSK.length} daily records`);

  // SK products
  const productsSK = Object.values(sk.byProduct)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
    .map(r => ({
      ...r,
      revenue_vat: Math.round(r.revenue_vat * 100) / 100,
      revenue:     Math.round(r.revenue     * 100) / 100,
    }));
  writeProductData(path.join(DATA_DIR, 'productDataSK.ts'), 'productDataSK', 'sk', productsSK);
  log(`SK: written ${productsSK.length} product-day records`);

  // SK retention
  const retentionSK = [...sk.byEmail.values()].map(c => {
    const sorted = c.dates.map((d, i) => ({ d, r: c.revenues[i], rv: c.revsVat[i] }))
      .sort((a, b) => a.d.localeCompare(b.d));
    return {
      dates:    sorted.map(x => x.d),
      revenues: sorted.map(x => x.r),
      revsVat:  sorted.map(x => x.rv),
    };
  });
  writeRetentionData(path.join(DATA_DIR, 'retentionDataSK.ts'), 'retentionDataSK', 'sk', retentionSK);
  log(`SK: written retention for ${retentionSK.length} customers`);

  log('=== importLocalOrders finished successfully ===');
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
