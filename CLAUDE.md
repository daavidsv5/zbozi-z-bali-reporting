# CLAUDE.md

Tento soubor slouží jako návod pro Claude Code při práci s tímto repozitářem.

## Příkazy

```bash
npm install               # Nainstaluje závislosti
npm run dev               # Spustí dev server (Next.js, hot reload)
npm run build             # Produkční build — odhalí TS chyby
npm run start             # Spustí produkční build
npm run db:migrate        # Vytvoří tabulky v NeonDB (jednorázově)
npm run db:import         # Importuje objednávky + náklady z Google Sheets do NeonDB
npm run db:seed           # Vytvoří admin účet
```

V projektu nejsou nakonfigurované linter ani testy.

## Architektura

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts, NextAuth 5, NeonDB (PostgreSQL).

### Tok dat

```
Wix export CSV (lokálně nebo Google Sheets)
  ORDERS_SHEET_URL  →  objednávky (Wix item-level export, comma delimiter, EN datum)
  COST_SHEET_URL    →  marketingové náklady (Facebook + Google Ads, per kampaň)
       ↓
  scripts/importData.js  (npm run db:import)
    --local <soubor.csv>  →  lokální CSV bez Google Sheets
       ↓
  NeonDB (PostgreSQL) — tabulky:
    daily_orders      (date, market, revenue_vat, revenue, order_count, shipping_revenue)
    daily_marketing   (date, market, source, cost, clicks, impressions, conversions)
    customer_orders   (order_id, date, market, customer_hash, revenue_vat, revenue, ...)
    order_values      (order_id, date, market, value)
    product_sales     (date, market, product_name, variant, sku, quantity, revenue)
    daily_shipping    (date, market, name, order_count, revenue_vat, free_count)
    daily_payment     (date, market, name, order_count, revenue_vat)
    hourly_behavior   (market, day_of_week, hour, order_count, revenue)
       ↓
  /api/dashboard    →  hooks/useDashboardData.ts  →  stránky
  /api/products     →  app/products/page.tsx
  /api/behavior     →  app/behavior/page.tsx
```

### Aktualizace dat

- **Automaticky každý den v 2:00 SEČ** — GitHub Actions (`.github/workflows/update-data.yml`) spouští `npm run db:import`, data jdou přímo do NeonDB
- **Tlačítko Aktualizovat data** (viditelné pouze adminům v TopBaru) — volá `POST /api/update`, který triggeruje GitHub Actions workflow přes `workflow_dispatch` API → import proběhne za ~1 minutu
- **Objednávky** — uživatel cca 1× za 3 dny stáhne Wix CSV export a spustí `node scripts/importData.js --local <soubor.csv>`

### Wix CSV export — formát

Wix exportuje **item-level** CSV (jeden řádek = jedna položka objednávky):
- Oddělovač: čárka
- Datum: anglický formát `Jun 19, 2026`
- Čas: 12h formát `11:01:18 AM`
- Klíčové sloupce: `Číslo objednávky`, `Datum vytvoření`, `Čas`, `Celkem`, `DPH celkem`, `Sazba dopravy`, `Měna`, `Stav platby`, `Položka`, `Kusů`, `Cena`
- **Pozor:** `DPH celkem` obsahuje DPH pouze pro PRVNÍ položku daného řádku, **ne celkové DPH objednávky** → nelze použít pro výpočet vatRatio (viz Vzorce níže)

### Env proměnné (`.env.local`)

```
AUTH_SECRET=...
DATABASE_URL=postgresql://...         # NeonDB connection string
ORDERS_SHEET_URL=https://...          # Google Sheets CSV — objednávky
COST_SHEET_URL=https://...            # Google Sheets CSV — náklady
GITHUB_PAT=ghp_...                    # Personal Access Token (scope: workflow) — pro tlačítko
GA4_PROPERTY_ID=                      # GA4 — doplnit
GA4_CLIENT_EMAIL=                     # GA4 — doplnit
GA4_PRIVATE_KEY=                      # GA4 — doplnit
META_ACCESS_TOKEN=...                 # Meta API token — čeká na správný účet
META_AD_ACCOUNT_ID=314023350872610    # Meta ad account — čeká na přístup
```

GitHub repo secrets (pro Actions): `DATABASE_URL`, `ORDERS_SHEET_URL`, `COST_SHEET_URL`, `GITHUB_PAT`

### Práce s měnami

**Vždy zobrazujeme v CZK.** `getDisplayCurrency()` vrací vždy `'CZK'`.

- SK `revenue` a `revenue_vat` jsou v EUR → vždy násobit `eurToCzk`
- SK `cost` (marketingové náklady) jsou **již v CZK** → **nikdy nenásobit**
- Live EUR/CZK kurz z `frankfurter.app`, cachovaný denně v `localStorage`, fallback `EUR_TO_CZK = 25`
- Vzor správného výpočtu:
  ```typescript
  const revMult = r.market === 'SK' ? eurToCzk : 1;  // jen pro revenue
  revenue += r.revenue * revMult;
  cost    += r.cost;  // bez násobení — už je v CZK
  ```

### API routes (NeonDB)

**`GET /api/dashboard?start&end&market`**
- Joinuje `daily_orders` + `daily_marketing` přes CTE `all_days` (UNION obou tabulek)
- Důvod UNION: dny s náklady ale bez objednávek (typicky SK) musí být vidět
- Vrací: `{ daily: ApiRecord[], prevDaily: ApiRecord[] }` (prevDaily = stejné období -1 rok)

**`GET /api/products?start&end&market`**
- Vrací: `{ daily: ApiProductRow[], prevTotals: ApiPrevTotalWithMarket[] }`
- `daily` — per-date záznamy pro trend chart
- `prevTotals` — součty za předchozí rok (GROUP BY market, product_name) pro YoY

**`GET /api/shipping`**
- Vrací všechna data z `daily_shipping` + `daily_payment` jako `ShippingPaymentRecord[]`
- Klient filtruje podle trhu a období (client-side, data jsou malá ~2000 řádků)

**`GET /api/retention`**
- Groupuje `customer_orders` podle `customer_hash` a vrací pole `{ market, dates, revenues, revsVat }[]`
- Klient merguje CZ+SK a konvertuje EUR→CZK (SK revenue × `EUR_TO_CZK`)

**`POST /api/update`** — admin only, triggeruje GitHub Actions `workflow_dispatch`

### `ApiRecord` interface

```typescript
interface ApiRecord {
  date: string;
  market: 'CZ' | 'SK';
  revenue_vat: number;      // s DPH (SK v EUR → konvertovat)
  revenue: number;           // bez DPH (SK v EUR → konvertovat)
  order_count: number;
  shipping_revenue: number;
  cost: number;              // celkové náklady (už v CZK)
  clicks_facebook: number;
  clicks_google: number;
  cost_facebook: number;     // už v CZK
  cost_google: number;       // už v CZK
}
```

### hooks/useDashboardData.ts

Vrací: `{ daily, prevDaily, currentData, prevData, kpi, prevKpi, yoy, chartData, chartDataExtended, currency, hasPrevData, loading, error }`

**Klíčové:** `chartData` mapuje prev-year záznamy na aktuální datumy (+1 rok) aby obě série sdílely stejnou osu X v grafech. Bez toho by se zobrazovalo dvojité období.

```typescript
const dateKey = isPrev ? shiftToCurrentYear(r.date, 1) : r.date;
```

**Grafy prodloužené do konce měsíce/roku (`chartDataExtended`, 2026-08):** U otevřených period (`current_month`/`current_year`) hook navíc vrací `chartDataExtended` — na rozdíl od `chartData` (jen dny s reálnými daty) obsahuje sjednocení dní aktuálního období s loňskými daty, takže loňská (přerušovaná) křivka na grafu pokračuje až do konce měsíce/roku, zatímco letošní křivka viditelně končí posledním dostupným dnem (pole = `null` pro dny bez letošních dat). Protože primární `/api/dashboard` volání omezuje `prevDaily` na stejný rozsah jako `daily` (route počítá `prevStart`/`prevEnd` prostým posunem `start`/`end` o -1 rok), hook navíc pro otevřené období pošle **druhý fetch** s rozšířeným `end` (konec měsíce/roku) jen kvůli loňským datům (`prevDailyWide`), použitým výhradně pro dostavbu `chartDataExtended`. `KpiLineCharts.tsx` a `AovCpaChart.tsx` přijímají `ExtendedChartDataPoint[]`; jejich tooltipy filtrují `p.value != null`, aby u budoucích dnů nezobrazily zavádějící „0". Sparklines v KPI kartách nadále používají nerozšířený `chartData`. Stejný princip jako u Celtic-supply reportingu (tam realizováno přes statická data, ne API fetch).

### Stránky

| Stránka | Zdroj dat | Popis |
|---------|-----------|-------|
| `/hlavni-dashboard` | `/api/dashboard` | Měsíční grouped bar charty YoY (Tržby s DPH, Tržby bez DPH, Objednávky, Investice, PNO, AOV, CPA + CVR z GA4) |
| `/dashboard` | `/api/dashboard` | KPI boxy + 4 spojnicové grafy YoY + DailyKpiTable |
| `/marketing` | `/api/dashboard` (`daily`) | FB+Google náklady/kliky/CPC, denní tabulka |
| `/products` | `/api/products` | ABC analýza, trend chart, sortovatelná tabulka, CSV export |
| `/orders` | `/api/dashboard` + statická data | Tržby, histogram hodnot košíku, CZ/SK distribuce |
| `/analytics` | `/api/analytics` (GA4) | Sessions, CVR, zdroje, trychtýř |
| `/meta` | `/api/meta` (Meta Graph API) | KPI, denní grafy, tabulka kreativ — čeká na správný token |
| `/margin` | statická data (`marginData*`) | Marže, hrubý zisk |
| `/shipping` | `/api/shipping` | Doprava, platby, P&L |
| `/retention` | `/api/retention` | RFM, LTV, Noví vs. stávající (CZ+SK sloučeno v CZK). Dva grouped bar charty „Noví vs. stávající zákazníci" (počty + tržby bez DPH, sjednoceno se strukturou Celtic-supply reportingu 2026-08), `computeMonthlyNewVsReturning()`/`computeMonthlyNewVsReturningRevenue()` v `lib/retentionUtils.ts`. Meziroční srovnání aktuálního (nedokončeného) měsíce jen do stejného dne loňského roku, ne k celému měsíci — `computeCurrentMonthYoyCutoff()`. |
| `/behavior` | `/api/behavior` (NeonDB) | Hourly grid (all-time) + weekly stats z `daily_orders` |
| `/crosssell` | statická data (`crossSellData*`) | Top 100 párů produktů |

### Klíčové soubory

| Soubor | Účel |
|--------|------|
| `scripts/importData.js` | Import objednávek z Wix CSV (lokálně `--local` nebo Google Sheets) + nákladů do NeonDB |
| `scripts/migrate.js` | Vytvoření schématu tabulek v NeonDB |
| `lib/schema.sql` | SQL schéma všech tabulek |
| `lib/db.ts` | NeonDB pool (pg, ssl: rejectUnauthorized: false) |
| `hooks/useDashboardData.ts` | Fetch z `/api/dashboard`, agregace KPI + chartData + YoY |
| `hooks/useFilters.ts` | `FiltersProvider`, `useFilters()`, `getDateRange()`, live EUR kurz |
| `data/types.ts` | `DailyRecord`, `KpiData`, `FilterState`, `EUR_TO_CZK`, `getDisplayCurrency` |
| `lib/formatters.ts` | `formatCurrency`, `formatPercent`, `formatNumber`, `formatDate`, `localIsoDate` |
| `app/api/dashboard/route.ts` | SQL: UNION all_days + LEFT JOIN orders + marketing |
| `app/api/products/route.ts` | SQL: product_sales → daily + prevTotals |
| `app/api/shipping/route.ts` | SQL: daily_shipping + daily_payment → ShippingPaymentRecord[] |
| `app/api/retention/route.ts` | SQL: customer_orders GROUP BY customer_hash → per-customer pole |
| `app/api/update/route.ts` | Trigger GitHub Actions workflow_dispatch |
| `.github/workflows/update-data.yml` | Cron 2:00 SEČ + workflow_dispatch → `npm run db:import` |

### KPI komponenty

Dva typy — **neměnit vzájemně**:
- **`StatCard`** — `/margin`, `/retention`, `/crosssell`. Props: `yoy`, `hasPrevData`, `invertYoy`, `negative`.
- **`KpiCard`** — `/dashboard`, `/orders`, `/marketing`, `/products`, `/shipping`. Podporuje sparkline, YoY badge, `variant: 'default' | 'green' | 'red'`.

### Vzorce

**PNO** = `Marketingové investice / Tržby bez DPH × 100`

**Tržby bez DPH** = `(Celkem − Sazba dopravy) / 1,21` — použita fixní sazba 21 % (platí pro oblečení CZ i SK).
`DPH celkem` ze Wix item-exportu se **nesmí** používat pro vatRatio — obsahuje DPH jen první položky, ne celé objednávky.

**vatRatio** = `1 / 1.21` (fixní, v `scripts/importData.js`)

**product_sales.revenue** = `priceVat × vatRatio × qty` kde `vatRatio = 1/1.21`

**Srovnání s Wix "Hrubý příjem":** naše `revenue` ≈ Wix +268 Kč/den (pro ~57 tis. Kč/den obrat).
Wix počítá `Celkem/1,21 − Doprava` (odečte dopravu s DPH od základu bez DPH), my počítáme `(Celkem − Doprava)/1,21` (správnější). Rozdíl = DPH z dopravy.

### `localIsoDate(d: Date)`

Vrací `"YYYY-MM-DD"` v **lokálním čase**. Používat vždy místo `.toISOString().split('T')[0]` — jinak v CEST (UTC+2) dochází k posunutí data o den zpět.

### ABC analýza produktů

- **A** — 0–80 % kumulativních tržeb (zelené)
- **B** — 80–95 % (žluté)
- **C** — 95–100 % (červené)

Klasifikace se počítá vždy ze seřazeného celku, nezávisle na aktuálním řazení tabulky.

### YoY grafy — zarovnání os

`chartData` v `useDashboardData` posouvá prev-year datumy o +1 rok, aby obě série sdílely stejný klíč v mapě. Výsledek: 1 bod na osu X = aktuální + loňská hodnota. Bez tohoto by chart zobrazoval 2× tolik bodů s duplicitními ticklabely.

### Meziroční srovnání

- **CZ** — e-shop od května 2025. `hasPrevData = false` pro CZ dokud nejsou data z předchozího roku.
- **SK** — data od dubna 2024 (testovací objednávky před červnem 2024 jsou v DB ale filtrují se).

### Filtr období (TopBar)

`TimePeriod` v `data/types.ts`: `yesterday`, `last_7_days`, `last_14_days`, `current_month`, `last_month`, `current_year`, `last_year`, `all_time`, `custom`.

### Selektor Trh (TopBar)

- `/shipping`, `/analytics`, `/meta`: skryta možnost **Vše** (pouze CZ / SK)
- `/retention`, `/crosssell`: selektor zcela skrytý

### Bezpečnost — emaily zákazníků

E-maily jsou **hashované SHA-256** ihned při importu v `scripts/importData.js`. Plaintext email se nikdy neukládá do DB ani nikam neposílá. Tabulka `customer_orders` obsahuje pouze `customer_hash`.

### Meta Ads (`/meta`)

- Jeden ad account `META_AD_ACCOUNT_ID` (ne oddělené CZ/SK)
- Token v `.env.local` je Sardinerie token — nemá přístup k Zboží z Bali účtu
- **Čeká na:** přidání System Usera do Meta Business Manageru Zboží z Bali + nový token

### Stránky stále na statických datech (čeká na migraci)

Tyto stránky stále čtou ze statických `data/*.ts` souborů:
- `/margin` — `marginDataCZ/SK`
- `/orders` (histogram) — `orderValueDataCZ/SK`
- `/crosssell` — `crossSellDataCZ/SK`

**Migrace z NeonDB — dokončeno:**
- `/behavior` — přemigrováno na `/api/behavior` (NeonDB `hourly_behavior` + `daily_orders`)

### Pre-existing TS chyby

`app/shipping/page.tsx` má ~8 TS chyb (Recharts PieLabel + Tooltip typy). Jsou pre-existující — neřešit pokud se nerefaktoruje shipping stránka.
