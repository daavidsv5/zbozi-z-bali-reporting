# CLAUDE.md

Tento soubor slouží jako stručný návod pro Claude Code (claude.ai/code) při práci s tímto repozitářem.

## Příkazy

```bash
npm install      # Nainstaluje závislosti
npm run dev      # Spustí dev server (Next.js, hot reload)
npm run build    # Produkční build — často odhalí TS chyby
npm run start    # Spustí produkční build

node scripts/updateData.js   # Ruční refresh reálných dat z Google Sheets
```

V projektu nejsou nakonfigurované linter ani testy.

## Architektura

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts, NextAuth 5, Radix UI.

### Tok dat

```
Google Sheets (CSV)
       ↓  scripts/updateData.js  (denně v 06:00 via Windows Task Scheduler)
       ↓  na konci skriptu: git commit + push → Vercel automaticky redeploy
data/realDataCZ.ts + realDataSK.ts + productData* + marginData* + hourlyData* +
crossSellData* + retentionData* + orderValueData* + shippingPaymentData* + lastUpdate.ts
       ↓
data/mockGenerator.ts  →  export const mockData: DailyRecord[]
                       →  getDailyMarketingData() + getMarketingSourceData()
       ↓
hooks/useDashboardData.ts  (filters + aggregates → KpiData, chartData, YoY)
       ↓
app/(dashboard|orders|marketing|products|margin|analytics|behavior|crosssell|retention|shipping)/page.tsx
```

### Aktualizace dat na Vercelu

- **Primárně:** `.github/workflows/update-data.yml` — GitHub Actions spouští `node scripts/updateData.js` každý den v 05:00 UTC (= 06:00 CET / 07:00 CEST), nezávisle na stavu počítače
- Na konci skriptu se provede `git commit + push` → Vercel automaticky nasadí nová data
- Workflow lze spustit i ručně: GitHub → Actions → Update Data → Run workflow
- Tlačítko **Aktualizovat data** (viditelné pouze adminům) volá `/api/update`:
  - Na Vercelu: spustí Vercel Deploy Hook (`VERCEL_DEPLOY_HOOK_URL` env proměnná)
  - Lokálně: spustí `node updateData.js` přímo
- `data/lastUpdate.ts` — auto-gen timestamp poslední aktualizace, zobrazen v TopBaru vpravo

**Windows Task Scheduler** — tasky `Shoptet Reporting - Update Data` a `ShoptetReportingUpdate` (záloha, primárně nahrazeno GitHub Actions):
- Spustitelný soubor: `cmd.exe`, argument: `/c "C:\Users\daavi\Desktop\VIBECODING\Shoptet reporting\shoptet-reporting\scripts\updateData.bat"`
- Uvozovky jsou nutné kvůli mezeře v cestě
- `DisallowStartIfOnBatteries` = false (taska se spustí i na baterii)

### Stránky

| Stránka | Popis |
|---------|-------|
| `/hlavni-dashboard` | **Hlavní Dashboard** — měsíční přehled 9 KPI metrik jako grouped bar charty (Tržby bez DPH, Hrubý zisk, Počet obj., Mark. investice, PNO %, AOV, Marže %, CPA, **Konverzní poměr z GA4**). Tooltip každého grafu zobrazuje hodnoty obou roků + YoY % (zelená/červená). Selektor trhu + **selektor jednotlivých roků** v TopBaru (yearB = selectedYear − 1, automaticky). Výchozí přesměrování z `/`. |
| `/dashboard` | **Klíčové ukazatele (KPI)** — Tržby s/bez DPH, Počet obj., AOV, Marketing. investice, PNO, CPA, Marže, Marže %, Cena za nového zákazníka, Hrubý zisk na obj. + samostatný řádek Hrubý zisk + Hrubý zisk %. Pod KPI boxy: **4 samostatné spojnicové grafy YoY** (Tržby bez DPH, Počet objednávek, Náklady, PNO %) z `KpiLineCharts`. |
| `/orders` | Objednávky — tržby vs počet, distribuce hodnot košíku (histogram), rozložení CZ/SK |
| `/marketing` | Marketingové investice — CPC per channel (FB/Google), trend kliky+CPC (ROAS odstraněn) |
| `/products` | Prodejnost produktů — ABC analýza (A/B/C segmenty), sortovatelná tabulka, YoY, CSV export. Nad tabulkou: **graf vývoje tržeb bez DPH + počtu kusů** pro vybrané produkty s vyhledáváním (autocomplete), dual Y-osa (tržby = plná čára, kusy = čárkovaná). |
| `/margin` | Maržový report — marže %, hrubý zisk, grafy |
| `/analytics` | GA4 integrace — sessions, CVR, sources+devices (YoY), vstupní stránky. **Zdroje návštěvnosti jako tabulka** (Sessions, podíl, CVR, Transakce, podíl, Tržby, podíl — vše s YoY). **KPI boxy Tržby bez DPH (GA4) + Odchylka GA4 vs. Shoptet** (barevný signál ≤5 % zelená, ≤15 % oranžová, >15 % červená). Měna dynamická (CZK/EUR dle zvoleného trhu). |
| `/meta` | Meta Ads — KPI boxy s YoY (útrata, dosah, imprese, kliky, CTR, CPC, nákupy, tržby z reklam, CPA, ROAS), grafy CPC/CPA/Nákupy/ROAS po dnech, tabulka kreativ s filtrem kampaně+sady reklam |
| `/behavior` | Nákupní chování — týdenní srovnání, hourly grid (all-time agregace) |
| `/crosssell` | Cross-sell potenciál — top 100 produktových párů |
| `/retention` | Retenční analýza — RFM segmentace, LTV, AOV, repeat purchase rate, měsíční graf Noví vs. stávající zákazníci (100% stacked bar) |
| `/shipping` | Doprava a platby — KPI vč. zisku/ztráty dopravy + **Doprava zdarma %** (bez Osobního odběru), ceník dopravců (CZ/SK), P&L tabulka per dopravce, **graf Doprava zdarma % v čase** (sloupcový s průměrnou referenční čarou). Layout donutů + tabulek: **pies v řádku 1, tabulky v řádku 2** (4 položky v jednom `grid-cols-2`) — tabulky jsou vždy zarovnané vedle sebe. |
| `/login` | Přihlášení (NextAuth) |
| `/admin/users` | Správa uživatelů (admin only) |

### Práce s měnami

- CZ data jsou v **CZK**. SK data jsou v **EUR**.
- `getDisplayCurrency(countries)` v `data/types.ts`: vrací `'EUR'` pouze tehdy, když je vybrané jen SK; jinak `'CZK'`.
- Při kombinaci CZ+SK se SK hodnoty násobí `eurToCzk` (live rate z frankfurter.app, fallback `EUR_TO_CZK = 25`) uvnitř `useDashboardData` a `getMarketingSourceData` před agregací.
- Všechny money formattery berou `currency: 'CZK' | 'EUR'`.

### Meziroční srovnání (YoY)

- **CZ nemá YoY** — e-shop běží od května 2025. `hasPrevData` bude `false` kdykoliv je ve filtru CZ a nejsou dostupné záznamy z předchozího roku.
- **SK má YoY** — reálná data od března 2024; mock SK data (seeded RNG) doplňují leden–únor 2024 jako základ pro YoY.
- `hasPrevData` předávej do `KpiCard`, `RevenueOrdersChart` a `CostPnoChart`, aby šlo podmíněně skrýt YoY badge a "minulý rok" řady v grafech.

### Hlavní Dashboard (`/hlavni-dashboard`)

Výchozí stránka aplikace (redirect z `/`). Zobrazuje 8 grouped bar chartů s měsíčními daty pro 2 vybrané roky.

**Selektory** — zobrazují se v TopBaru místo standardních Trh/Období filtrů, když je aktivní cesta `/hlavni-dashboard`:
- Přepínač **Vše / CZ / SK** — trh
- Skupina tlačítek **jednotlivých roků** — výběrem roku se `yearB` nastaví automaticky na `selectedYear − 1`; napravo od tlačítek se zobrazuje label „vs. YYYY"

`hooks/useHlavniDashboard.tsx` — stav: `selectedYear`, `setSelectedYear`, `yearOptions: number[]`; `yearA = selectedYear`, `yearB = selectedYear - 1`.

**Stav** — spravován v `hooks/useHlavniDashboard.tsx` (`HlavniDashboardProvider` je v `ConditionalLayout`). Stránka stav pouze čte přes `useHlavniDashboard()`, lokální state nepoužívá.

**Grafy (2×4 grid + 1):** Tržby bez DPH (modrá), Hrubý zisk (zelená), Počet objednávek (modrá), Marketingové investice (červená), PNO % (cyan), AOV (indigo), Marže % (zelená), CPA (fialová), **Konverzní poměr** (teal — GA4, CZ+SK). Světlejší barva = starší rok, tmavší = novější rok.

**Tooltip s YoY:** Každý graf zobrazuje v tooltipu hodnoty obou roků + řádek `YoY: ±X,X %` (zelená = růst, červená = pokles). Pokud je hodnota předchozího roku 0, YoY se nezobrazí.

**Konverzní poměr (GA4):** Data fetchuje `useEffect` z `/api/analytics/cvr-monthly?yearA=YYYY` při každé změně roku. Surová data (`rawCvr`) se ukládají do stavu, `cvrData` je `useMemo` přepočítaný dle trhu — pro „Vše" se sessions a conversions CZ+SK sečtou před dělením (ne průměr procent).

**Hrubý zisk** = `marginRev - purchaseCost - cost` (marže minus marketingové náklady). Pokud `marginData*` pro daný rok/měsíc neexistuje, zobrazí 0.

### Klíčové soubory

| Soubor | Účel |
|--------|------|
| `data/types.ts` | `DailyRecord`, `KpiData`, `FilterState`, `TimePeriod`, `EUR_TO_CZK`, `getDisplayCurrency` |
| `data/mockGenerator.ts` | Kombinuje reálná + mock data; `getDailyMarketingData()` + `getMarketingSourceData()` |
| `data/realDataCZ.ts` | Auto-gen reálná CZ data (CZK) — **needitovat ručně** |
| `data/realDataSK.ts` | Auto-gen reálná SK data (EUR) — **needitovat ručně** |
| `data/lastUpdate.ts` | Auto-gen timestamp poslední aktualizace dat — **needitovat ručně** |
| `data/productDataCZ.ts` / `productDataSK.ts` | Prodej produktů (počet kusů, tržby) — auto-gen |
| `data/marginDataCZ.ts` / `marginDataSK.ts` | Marže (nákupní cena vs tržby bez DPH) — auto-gen |
| `data/hourlyDataCZ.ts` / `hourlyDataSK.ts` | Nákupní chování 7×24 grid — auto-gen, all-time |
| `data/crossSellDataCZ.ts` / `crossSellDataSK.ts` | Top 100 produktových párů — auto-gen |
| `data/retentionDataCZ.ts` / `retentionDataSK.ts` | Per-customer retence `{ dates, revenues, revsVat }[]` — auto-gen |
| `data/orderValueDataCZ.ts` / `orderValueDataSK.ts` | Per-order košík bez DPH `{ date, value }[]` — auto-gen |
| `data/shippingPaymentDataCZ.ts` / `shippingPaymentDataSK.ts` | Doprava+platby po dnech — auto-gen |
| `lib/retentionUtils.ts` | Všechny výpočty pro `/retention` (KPI, YoY, RFM segmentace, distribuce, měsíční Noví vs. stávající) |
| `lib/formatters.ts` | `formatCurrency`, `formatPercent`, `formatNumber`, `formatDate`, `formatShortDate`, `formatMonthYear`, `localIsoDate` |
| `app/api/meta/route.ts` | Meta Marketing API — KPI + denní breakdown + kreativy; filtruje kampaně obsahující "myfish" |
| `app/meta/page.tsx` | Meta Ads stránka — KPI s YoY, grafy po dnech, tabulka kreativ s filtrem |
| `components/kpi/StatCard.tsx` | Sdílená KPI karta (border-2 border-blue-800, icon vpravo); prop `negative` = rose varianta; props `yoy`, `hasPrevData`, `invertYoy` pro YoY badge |
| `components/kpi/KpiCard.tsx` | KPI karta se sparkline a YoY badge; prop `variant: 'default' \| 'green' \| 'red'` mění barvu rámečku, ikony a hodnoty |
| `components/charts/KpiLineCharts.tsx` | 4 samostatné spojnicové grafy YoY pro `/dashboard`: Tržby bez DPH, Počet objednávek, Náklady, PNO %. Solid = aktuální, dashed = loni. Prop `isMonthly` přepíná formát osy X (dny/měsíce). |
| `hooks/useFilters.ts` | `FiltersProvider` + `useFilters()` + `getDateRange()` + live EUR rate |
| `hooks/useDashboardData.ts` | Filtruje, agreguje, normalizuje měny, počítá KPI + chartData + YoY |
| `app/hlavni-dashboard/page.tsx` | Hlavní Dashboard — 9 monthly grouped bar chartů (8 Shoptet + CVR z GA4), tooltip s YoY %, čte stav z `useHlavniDashboard` |
| `app/api/analytics/cvr-monthly/route.ts` | GA4 endpoint — měsíční sessions+conversions pro CZ i SK, yearA + yearA-1; 4 paralelní requesty, vrací raw `{ czA, czB, skA, skB }` |
| `hooks/useHlavniDashboard.tsx` | Context pro Hlavní Dashboard — `market`, `yearA`, `yearB`, `yearOptions`; provider v `ConditionalLayout` |
| `scripts/updateData.js` | Čistý Node.js — stáhne CSV z Google Sheets, generuje všechny data/*.ts soubory, pak git push |
| `app/api/update/route.ts` | POST endpoint — admin only; na Vercelu volá Deploy Hook, lokálně spustí skript |

### KPI komponenty

Dva typy KPI karet — **neměnit vzájemně**:
- **`StatCard`** — používají `/margin`, `/retention`, `/crosssell`. Prop `negative` = rose border/barva. Props `yoy`, `hasPrevData`, `invertYoy` pro YoY badge.
- **`KpiCard`** — používají `/dashboard`, `/orders`, `/marketing`, `/products`, `/shipping`. Podporuje sparkline, YoY badge a `variant`:
  - `'default'` — modrý rámeček (výchozí)
  - `'green'` — tmavě zelený rámeček + zelená hodnota (Hrubý zisk)
  - `'red'` — červený rámeček + červená hodnota (ztráta dopravy)

### `localIsoDate(d: Date)`

Funkce v `lib/formatters.ts` — vrací datum jako `"YYYY-MM-DD"` v **lokálním čase** (bez UTC konverze). Používat všude místo `.toISOString().split('T')[0]`, jinak v CEST (UTC+2) dochází k posunutí data o den zpět.

### `/dashboard` — Klíčové ukazatele (KPI)

KPI boxy (11 + 2 ve vlastním řádku): Tržby s/bez DPH, Počet obj., AOV, Marketing. investice, PNO, CPA, Marže, Marže %, Cena za nového zákazníka, Hrubý zisk na objednávku + **samostatný řádek: Hrubý zisk, Hrubý zisk %** (variant='green').

**Grafy (4 celkem, 2×2 mřížka):** Tržby+Objednávky, Náklady+PNO, AOV (YoY), Cena za objednávku/CPA (YoY) — komponenty `AovChart` a `CpaChart` z `components/charts/AovCpaChart.tsx`.

**Odstraněno:** Storna, Podíl storen (odstraněno na žádost uživatele).

Marže a Hrubý zisk se počítají z `marginDataCZ` / `marginDataSK`:
- `margin = marginRev - purchaseCost`
- `marginPct = margin / marginRev × 100`
- `grossProfit = margin - kpi.cost`
- `grossPct = grossProfit / marginRev × 100`

### `/retention` — Retenční analýza

- **Měsíční graf Noví vs. stávající zákazníci** — 100% stacked bar, hned pod KPI boxy
  - Data z `computeMonthlyNewVsReturning()` v `lib/retentionUtils.ts`
  - Zelená = noví (první nákup v daném měsíci), Modrá = stávající (vrátili se)
  - Osa X: název měsíce + rok (`formatMonthYear`), Osa Y: % podíl
  - Tooltip zobrazuje skutečné počty zákazníků
- RFM segmentace, LTV, AOV, repeat purchase rate — beze změny

### `/shipping` — Doprava a platby

**KPI boxy** (8 celkem):
- `Doprava zákazník` — příjmy od zákazníků za dopravu
- `Doprava e-shop` — náklady e-shopu dle ceníku dopravců
- `Doprava zisk / ztráta` — rozdíl; `variant='green'` nebo `'red'`; zobrazuje `'--'` pokud ceník není vyplněn
- `Doprava zdarma %` — podíl objednávek s dopravou zdarma (revenue_vat === 0 nebo name obsahuje "zdarma"/"free"), **vylučuje Osobní odběr** z obou stran výpočtu

**Graf Doprava zdarma % v čase:**
- Sloupcový graf respektující přepínač Den/Týden/Měsíc
- Přerušovaná šedá referenční čára (`ReferenceLine`) na průměrné hodnotě za období
- Badge "Ø X.X % za období" v pravém horním rohu
- Umístění: za grafem "Vývoj využitelnosti plateb", před sekcí donutů/tabulek
- Funkce `isPickup()` jako helper v komponentě (vyloučení Osobního odběru)

**Výpočet free_count (správná logika):**
- `free_count` se počítá v `aggregateShippingPayment()` v `scripts/updateData.js` na úrovni každé individuální objednávky (před denní agregací)
- Pokud objednávka má `revVat === 0` na shipping řádku → `free_count++`
- **Proč ne `revenue_vat === 0` na agregovaném záznamu:** záznamy jsou sečteny za celý den, takže den s mix placenou/zdarma dopravou má `revenue_vat > 0` a stará logika objednávky zdarma přehlédla
- `ShippingPaymentRecord` interface obsahuje pole `free_count: number`
- Shipping page používá `r.free_count ?? 0` nikdy ne `revenue_vat === 0`

**Ceník dopravců** — editovatelná tabulka uložená v `localStorage` (`carrierCosts_v1`):
- Rozdělena na CZ (Kč) a SK (€) sekce
- Zobrazuje pouze panely odpovídající aktivním selektorům CZ/SK
- Struktura: `Record<carrierName, { cz: string, sk: string, note: string }>`

**Tabulka Zisk / ztráta per dopravce** — zobrazí se pouze pokud je vyplněn ceník:
- Sloupce: Dopravce, Obj., Zákazník platí, E-shop platí, Zisk/ztráta, Na objednávku
- Zákazník platí = z `shippingRows` (agregace za období)
- E-shop platí = `czCount[name] × costs[name].cz + skCount[name] × costs[name].sk × skMult`

### ABC analýza produktů (`/products`)

Produkty se klasifikují dle kumulativního podílu na tržbách bez DPH (seřazeno sestupně):
- **A** — top produkty → 0–80 % tržeb (zelené)
- **B** — střední produkty → 80–95 % tržeb (žluté)
- **C** — slabé produkty → 95–100 % tržeb (červené)

Klasifikace se vždy počítá ze všech dat (sort dle revenue desc), nezávisle na aktuálním řazení tabulky.

### Distribuce hodnot objednávek (`/orders`)

`orderValueData*` = per-order košík bez DPH (bez dopravy a platby), extrahovaný z col[56] Shoptet exportu.
- CZK buckety: 0–500, 500–1k, 1k–2k, 2k–5k, 5k+
- EUR buckety: 0–20, 20–40, 40–80, 80–200, 200+
- Při kombinaci CZ+SK se SK hodnoty převádí na CZK přes `eurToCzk`.
- Histogram zobrazuje peak bucket (tmavě modrý) + amber tip na dopravu zdarma.

### Marketing — CPC (`/marketing`)

Data z `getDailyMarketingData()` — každý den má `clicks_facebook`, `clicks_google`, `cost_facebook`, `cost_google`, `revenue`.
- **CPC** = cost_channel / clicks_channel (per den), zobrazeno na 2 desetinná místa
- **ROAS byl odstraněn** ze všech přehledů
- Grafy: ComposedChart (stacked bars kliky + lines CPC)
- Výkon per channel obsahuje YoY srovnání (FB, Google — náklady, kliky, CPC)

### RFM segmentace zákazníků (`/retention`)

Výpočet v `lib/retentionUtils.ts` → `computeRfmSegments()`. Referenční datum = nejnovější objednávka v datasetu.

| Segment | Podmínka (priority pořadí) |
|---------|---------------------------|
| Ztracení | R > 365 dní |
| Šampioni | F ≥ 3 AND R ≤ 90 dní |
| Věrní zákazníci | F ≥ 2 AND R ≤ 180 dní |
| Ohrožení | F ≥ 2 AND R > 180 dní |
| Noví zákazníci | F = 1 AND R ≤ 90 dní |
| Jednorázové | F = 1, ostatní |

### Definice Noví vs. Stávající zákazníci (`/retention`)

- **Noví** = zákazník, jehož úplně první nákup je v daném roce
- **Stávající** = zákazník, který měl v daném roce svůj 2.+ nákup vůbec (zahrnuje i opakované nákupy ve stejném roce)
- Jeden zákazník **může být v obou kategoriích** v jednom roce (poprvé koupil a vrátil se ve stejném roce)

### Filtr období (TopBar)

Dostupné možnosti `TimePeriod` v `data/types.ts`:
- `yesterday` — Včerejší den
- `last_7_days` — Posledních 7 dní (dnes − 6 → dnes)
- `current_month` — Aktuální měsíc
- `last_month` — Minulý měsíc (1. den – poslední den předchozího měsíce)
- `last_14_days` — Posledních 14 dní
- `current_year` — Aktuální rok
- `last_year` — Minulý rok
- `all_time` — Celé období (2024-01-01 → dnes; pokryje veškerá SK i CZ data)
- `custom` — Vlastní období (customStart, customEnd)

Logika datových rozsahů je v `hooks/useFilters.ts` → `getDateRange()`.

### Selektor Trh (TopBar)

- Stránky `/shipping` a `/analytics` mají skrytou možnost **Vše** — zobrazují pouze CZ a SK.
- Stránky `/retention` a `/crosssell` mají selektor trhu zcela skrytý.
- Ostatní stránky zobrazují všechny tři možnosti (Vše, CZ, SK).

### Konstanta `TODAY` (defaulty pro datum)

`hooks/useFilters.ts` používá aktuální datum dynamicky:
```ts
const TODAY = new Date();
```

Pokud řešíš funkce závislé na čase (např. "posledních 7 dní"), drž logiku dat na jednom místě (`hooks/useFilters.ts` / `getDateRange()`) a počítej s hraničními efekty časových pásem při groupingu po dnech.

### Vzorec PNO

`PNO = Marketingové investice / Tržby bez DPH × 100`

(marketingové náklady dělené tržbami bez DPH; v jmenovateli není DPH)

### Hourly data

Hourly grid na stránce `/behavior` je **all-time agregace** — nezohledňuje vybrané časové období filtrů. Jde o záměrné rozhodnutí pro zachycení dlouhodobého vzorce chování.

### SK marže

Nákupní ceny pro SK nejsou dostupné — `marginDataSK` obsahuje nuly v `costPrice`. Maržový report pro SK je nepřesný.

### SK launch date

SK e-shop spuštěn **1. června 2024**. Data před tímto datem jsou testovací objednávky a nesmí vstupovat do žádných reportů.

Konstanta `SK_LAUNCH_DATE = '2024-06-01'` v `data/types.ts` — používat všude jako filtr SK dat.

**Filtrování je aplikováno na těchto místech:**
- `data/mockGenerator.ts` — `mockData` obsahuje SK záznamy pouze od `SK_LAUNCH_DATE`; mock data pro SK zcela odstraněna (e-shop před červnem 2024 neexistoval)
- `app/dashboard/page.tsx` — `marginDataSK`
- `app/hlavni-dashboard/page.tsx` — `marginDataSK`
- `app/margin/page.tsx` — `marginDataSK`, `realDataSK`
- `app/orders/page.tsx` — `orderValueDataSK`
- `app/shipping/page.tsx` — `shippingPaymentDataSK`
- `app/retention/page.tsx` — zákazníci s prvním nákupem před `SK_LAUNCH_DATE` vyloučeni

**Při přidávání nových SK datasetů** vždy filtrovat: `data.filter(r => r.date >= SK_LAUNCH_DATE)`.

### GA4

GA4 je napojeno pro **CZ i SK**. `/analytics` stránka zobrazuje pouze CZ; Hlavní Dashboard (`/api/analytics/cvr-monthly`) fetchuje obě property.

**`app/api/analytics/route.ts`** — vrací:
- `daily`, `dailyPrev` — denní sessions/users/conversions/bounceRate/avgDuration
- `totals` — agregáty za aktuální + předchozí rok (dva dateRanges v jednom requestu)
- `sources`, `sourcesPrev` — zdroje návštěvnosti (source/medium, top 20)
- `devices`, `devicesPrev` — rozpad na deviceCategory
- `landingPages` — vstupní stránky (top 20)
- `funnel` — checkout trychtýř agregát: begin_checkout → add_shipping_info → add_payment_info → purchase, rozpad desktop/mobile/tablet
- `funnelTrend` — denní průchodnost košíkem; každý řádek má klíče `${step}_${device}` a `${step}_all`

**`app/analytics/page.tsx`**:
- KPI boxy: Sessions, Unikátní uživatelé, Konverze, Konverzní poměr, Bounce rate, Prům. délka — grid `grid-cols-2 sm:grid-cols-3`
- Grafy v čase: Sessions YoY, Konverzní poměr YoY, Bounce rate YoY, Délka návštěvy YoY
- Zdroje návštěvnosti (progress bary, YoY badge) + Zařízení (PieChart + YoY badge)
- **Graf CVR trychtýře v čase** (`funnelTrendPct`): zobrazuje jedinou křivku — `purchase / begin_checkout × 100 %` — jak se vyvíjí CVR celého trychtýře v čase; selektor zařízení (Vše / Desktop / Mobil / Tablet); Y-osa 0–100 %, každý bod počítán relativně k `begin_checkout_${device}` daného dne
- **Trychtýř průchodnosti košíkem** (statický): stacked bar per krok, % z 1. kroku, odpad mezi kroky, rozpad desktop/mobile/tablet

### Autentizace

NextAuth 5 (beta). Uživatelé jsou uloženi v `data/users.json` (bcrypt hesla). Admin stránka `/admin/users` vyžaduje `role: 'admin'`.

- Tlačítko **Aktualizovat data** v TopBaru je viditelné **pouze adminům** (kontrola přes `useSession`)
- Ostatní uživatelé tlačítko nevidí

### Názvy měsíců v grafech

Grafy s rozpadem po měsících zobrazují české zkratky měsíců (`formatMonthYear` z `lib/formatters.ts`), ne číselný formát.

- **`/margin`** — useMemo vrací `isMonthly: dayCount > 60`; komponenta volí `dateTickFormatter = isMonthly ? formatMonthYear : formatShortDate` pro osu X i tooltip (`MarzeTooltip` přijímá prop `isMonthly`)
- **`/shipping`** — `formatPeriodLabel(key, 'month')` vrací `Bře 2024` pomocí lokální konstanty `MONTHS_CS`
- **`/retention`** — měsíční graf Noví vs. stávající zákazníci vždy používá `formatMonthYear`

### Branding a název aplikace

- Název aplikace: **Manažerský reporting** (sidebar, login stránka, browser tab)
- Logo: `public/logo.png` (Sardinerie Fish Boutique, modré logo na bílém pozadí)
- Logo je zobrazeno v sidebaru a na login stránce
- Sidebar: logo v bílém kontejneru + text "Manažerský / reporting" pod ním

### Sidebar — navigační struktura (`components/layout/Sidebar.tsx`)

Položky jsou organizovány do skupin `navGroups` se sekčními hlavičkami:

| Sekce | Položky (label → href) |
|-------|------------------------|
| Strategický přehled | Hlavní Dashboard → `/hlavni-dashboard`, Hlavní KPI → `/dashboard`, Marketingový Mix & PNO → `/marketing` |
| Prodej a profitabilita | Výkon prodeje → `/orders`, Analýza marží → `/margin`, Doprava a platba → `/shipping` |
| Produktová analytika | Produktový žebříček → `/products`, Cross-sell potenciál → `/crosssell`, Stav skladu → `/stock` |
| Zákazníci a retence | Nákupní chování → `/behavior`, Retenční analýza → `/retention` |
| Akvizice a kanály | Webová návštěvnost (GA4) → `/analytics`, Meta Ads → `/meta`, Google Ads → `/google-ads` |
| Admin (admin only) | Správa uživatelů → `/admin/users` |

### `/meta` — Meta Ads

Stránka volá `app/api/meta/route.ts` který fetchuje Meta Marketing API v21.0.

**Env proměnné:**
```
META_ACCESS_TOKEN=...          # System User token (trvalý)
META_AD_ACCOUNT_ID_CZ=act_...  # CZ reklamní účet
META_AD_ACCOUNT_ID_SK=act_...  # SK reklamní účet
```

**Filtr MyFish:** Kampaně obsahující `"myfish"` (case-insensitive) jsou **vyloučeny ze všech metrik** — KPI, denní grafy i tabulka kreativ. Konstanta `EXCLUDE_CAMPAIGN = 'myfish'` v `route.ts`.

**KPI agregace:** Počítá se na úrovni `level=campaign` (ne account-level), aby šlo filtrovat MyFish před součtem.

**Selektor trhu:** Přepíná mezi CZ a SK Ad Account. Možnost "Vše" je skryta (stejně jako `/analytics`) — Meta má oddělené účty per trh.

**Tabulka kreativ:** Filtrovatelná dle kampaně a sady reklam (dropdowny nad tabulkou). Výběr kampaně resetuje filtr sady reklam a nabízí pouze relevantní sady.

**YoY:** API fetchuje předchozí rok posunutím `time_range` o -1 rok. YoY badge zobrazuje % změnu; pro Útrata/CPA/CPC je logika invertovaná (pokles = zelená).

### Pre-existing TS chyby

`app/shipping/page.tsx` má ~8 TS chyb (Recharts PieLabel + Tooltip typy). Jsou **pre-existující**, nezpůsobené nedávnými změnami — neřešit, pokud se nerefaktoruje shipping stránka.
