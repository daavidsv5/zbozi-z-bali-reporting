/**
 * Slovník klíčových metrik (/slovnik).
 *
 * Vzorce odpovídají skutečnému výpočtu v aplikaci. Benchmarky jsou orientační rozpětí z praxe
 * e-shopů v daném segmentu v CZ/SK a nejde o oficiální statistiku.
 * Aktuální hodnoty dopočítává `lib/glossaryValues.ts`.
 */

export type MetricCategory = 'obrat' | 'ziskovost' | 'marketing' | 'zakaznici' | 'web' | 'meta' | 'provoz';

export type CurrentValueKey =
  | 'revenueVat' | 'revenue' | 'orders' | 'aov'
  | 'margin' | 'marginPct' | 'grossProfit' | 'grossPct' | 'grossPerOrder' | 'grossPerNewCustomer'
  | 'cost' | 'costNoBrand' | 'pno' | 'pnoNoBrand' | 'poas' | 'poasNoBrand' | 'cpa'
  | 'cac' | 'ltv' | 'ltvProfit' | 'ltvCac' | 'repeatRate' | 'daysBetween';

export type ValueFormat = 'currency' | 'percent' | 'number' | 'ratio' | 'days';

export interface Benchmark {
  /** Text benchmarku zobrazený uživateli */
  text: string;
  /** Číselné rozpětí pro barevné vyhodnocení (ve stejné jednotce jako aktuální hodnota) */
  min?: number;
  max?: number;
  /** higher = čím víc, tím lépe; lower = čím míň, tím lépe; range = ideálně uvnitř rozpětí */
  better?: 'higher' | 'lower' | 'range';
}

export interface MetricDefinition {
  id: string;
  name: string;
  category: MetricCategory;
  meaning: string;
  formula: string;
  where: string[];
  benchmark?: Benchmark;
  note?: string;
  current?: { key: CurrentValueKey; format: ValueFormat };
}

export const CATEGORY_LABELS: Partial<Record<MetricCategory, string>> = {
  obrat: "Obrat a objednávky",
  marketing: "Marketingová efektivita",
  zakaznici: "Zákazníci a retence",
  web: "Webová návštěvnost (GA4)",
  meta: "Meta Ads",
  provoz: "Produkty a doprava",
};

export const VALUE_LABEL = "Zboží z Bali";

export const VALUE_SCOPE = "CZ + SK přepočtené do Kč.";

export const SEGMENT_LABEL = "módy a oblečení";

export const SEGMENT_DESCRIPTION =
  "Zboží z Bali prodává oblečení a módní doplňky z Bali (CZ, SK). Móda má výraznou sezónnost, vyšší podíl vratek a nákup ovlivňuje hlavně vizuál, proto hraje velkou roli Meta Ads. Reporting zatím nemá nákupní ceny, marže, hrubý zisk ani POAS se proto nesledují a náklady na reklamu se hodnotí přes PNO.";

export const METRICS: MetricDefinition[] = [
  {
    id: "trzby-s-dph",
    name: "Tržby s DPH",
    category: "obrat",
    meaning: "Celková hodnota objednávek, kterou zákazníci zaplatili, včetně DPH. Odpovídá tomu, co vidí zákazník v košíku.",
    formula: "Σ hodnota objednávek s DPH z Wix API\n(bez stornovaných objednávek)",
    where: ["Hlavní KPI", "Výkon prodeje", "Hlavní Dashboard"],
    benchmark: { text: "Absolutní hodnota nemá tržní benchmark, sledujte meziroční vývoj (YoY) a sezónnost (jaro a léto, Vánoce)." },
    current: { key: "revenueVat", format: "currency" },
  },
  {
    id: "trzby-bez-dph",
    name: "Tržby bez DPH",
    category: "obrat",
    meaning: "Obrat, který skutečně zůstává firmě (bez DPH odvedené státu). Je základem pro PNO a CPA.",
    formula: "Tržby s DPH / 1,21\n(fixní sazba 21 % pro oblečení v CZ i SK)",
    where: ["Hlavní Dashboard", "Hlavní KPI", "Výkon prodeje", "Produktový žebříček"],
    benchmark: { text: "Bez tržního benchmarku, jde o hlavní měřítko růstu. Zdravý e-shop v růstové fázi roste meziročně dvouciferně." },
    note: "Tržby bez DPH se dopočítávají fixní sazbou 21 %, ne z jednotlivých položek objednávky.",
    current: { key: "revenue", format: "currency" },
  },
  {
    id: "pocet-objednavek",
    name: "Počet objednávek",
    category: "obrat",
    meaning: "Počet dokončených objednávek. Ukazuje, zda růst tržeb táhne víc nákupů, nebo jen vyšší hodnota košíku.",
    formula: "Σ objednávek (bez storen)",
    where: ["Hlavní Dashboard", "Hlavní KPI", "Výkon prodeje"],
    benchmark: { text: "Bez tržního benchmarku. Porovnávejte YoY a v poměru k návštěvnosti (konverzní poměr)." },
    current: { key: "orders", format: "number" },
  },
  {
    id: "aov",
    name: "AOV (průměrná hodnota objednávky)",
    category: "obrat",
    meaning: "Kolik zákazník v průměru utratí za jednu objednávku. Vyšší AOV rozkládá náklady na dopravu a marketing na větší částku.",
    formula: "Hlavní KPI:        Tržby s DPH / Počet objednávek\nHlavní Dashboard:  Tržby bez DPH / Počet objednávek",
    where: ["Hlavní Dashboard", "Hlavní KPI"],
    benchmark: { text: "Móda a oblečení z menších e-shopů mají AOV orientačně 900 až 1 600 Kč s DPH.", min: 900, max: 1600, better: "higher" },
    note: "Pozor: na Hlavních KPI je AOV s DPH, na Hlavním Dashboardu bez DPH, hodnoty se proto liší zhruba o sazbu DPH.",
    current: { key: "aov", format: "currency" },
  },
  {
    id: "marketingove-investice",
    name: "Marketingové investice",
    category: "marketing",
    meaning: "Celkové náklady na placenou reklamu za období.",
    formula: "Σ náklady Google Ads + Meta (Facebook/Instagram)",
    where: ["Hlavní Dashboard", "Hlavní KPI", "Marketingový Mix & PNO"],
    benchmark: { text: "Bez absolutního benchmarku, hodnotí se vždy v poměru k tržbám (PNO)." },
    current: { key: "cost", format: "currency" },
  },
  {
    id: "pno",
    name: "PNO (podíl nákladů na obratu)",
    category: "marketing",
    meaning: "Kolik procent z tržeb bez DPH stojí marketing. Nejběžnější metrika efektivity reklamy v Česku.",
    formula: "Marketingové investice / Tržby bez DPH × 100",
    where: ["Hlavní Dashboard", "Hlavní KPI", "Marketingový Mix & PNO"],
    benchmark: { text: "Móda orientačně 12 až 25 %. Bez známé marže hlídejte, aby PNO zůstalo výrazně pod odhadovanou marží oblečení (obvykle 50 až 60 %).", min: 12, max: 25, better: "lower" },
    note: "PNO počítá všechny tržby (i organické a opakované nákupy), ne jen tržby přivedené reklamou. Vratky oblečení nejsou v tržbách vždy zachycené, PNO proto může být reálně vyšší.",
    current: { key: "pno", format: "percent" },
  },
  {
    id: "cpa",
    name: "Cena za objednávku (CPA)",
    category: "marketing",
    meaning: "Kolik marketingu připadá na jednu objednávku. Počítá se ze všech objednávek, ne jen z těch, které přivedla reklama.",
    formula: "Marketingové investice / Počet objednávek",
    where: ["Hlavní Dashboard", "Hlavní KPI", "Marketingový Mix & PNO"],
    benchmark: { text: "Bez nákupních cen nelze spočítat maximální udržitelnou CPA. Orientačně: CPA by u módy neměla přesáhnout 20 až 25 % AOV bez DPH." },
    current: { key: "cpa", format: "currency" },
  },
  {
    id: "cpc",
    name: "CPC (cena za proklik)",
    category: "marketing",
    meaning: "Kolik stojí jeden proklik z reklamy. Sleduje se zvlášť pro každý reklamní kanál.",
    formula: "Náklady kanálu / Počet prokliků kanálu",
    where: ["Marketingový Mix & PNO"],
    benchmark: { text: "Móda v CZ orientačně: Google Ads 3 až 10 Kč, Meta 3 až 10 Kč." },
  },
  {
    id: "ltv",
    name: "LTV (bez DPH)",
    category: "zakaznici",
    meaning: "Průměrný obrat, který e-shop od jednoho zákazníka získal za celou dobu vztahu.",
    formula: "Σ tržby bez DPH všech zákazníků / Počet zákazníků\n(celé období, nezávisí na filtru období)",
    where: ["Hlavní Dashboard", "Hlavní KPI"],
    benchmark: { text: "U módy s opakovanými nákupy bývá LTV orientačně 1,5 až 2,5násobek AOV bez DPH." },
    note: "Retenční analýza zobrazuje LTV s DPH, Hlavní KPI a Hlavní Dashboard bez DPH.",
    current: { key: "ltv", format: "currency" },
  },
  {
    id: "repeat-rate",
    name: "Míra opakovaného nákupu",
    category: "zakaznici",
    meaning: "Podíl zákazníků, kteří nakoupili alespoň dvakrát. U módy ukazuje, zda si zákazníci oblíbili styl a vracejí se pro nové kolekce.",
    formula: "Zákazníci s 2+ objednávkami / Všichni zákazníci × 100",
    where: ["Retenční analýza"],
    benchmark: { text: "Móda a oblečení orientačně 15 až 30 %.", min: 15, max: 30, better: "higher" },
    current: { key: "repeatRate", format: "percent" },
  },
  {
    id: "dny-mezi-nakupy",
    name: "Ø dní mezi nákupy",
    category: "zakaznici",
    meaning: "Jak dlouho v průměru trvá, než se vracející zákazník vrátí. Pomáhá načasovat e-maily a remarketing.",
    formula: "Průměr mezer mezi po sobě jdoucími objednávkami\n(jen zákazníci s 2+ objednávkami)",
    where: ["Retenční analýza"],
    benchmark: { text: "Nákup další položky oblečení orientačně 90 až 180 dní (podle kolekcí a sezón).", min: 90, max: 180, better: "lower" },
    current: { key: "daysBetween", format: "days" },
  },
  {
    id: "rfm",
    name: "RFM segmenty",
    category: "zakaznici",
    meaning: "Rozdělení zákazníků podle toho, jak nedávno (R) a jak často (F) nakupují: Šampioni, Věrní, Ohrožení, Noví, Jednorázoví a Ztracení.",
    formula: "Ztracení:  poslední nákup > 365 dní\nŠampioni:  3+ nákupy a poslední ≤ 90 dní\nVěrní:     2+ nákupy a poslední ≤ 180 dní\nOhrožení:  2+ nákupy a poslední > 180 dní\nNoví:      1 nákup a poslední ≤ 90 dní\nJednorázoví: ostatní",
    where: ["Retenční analýza"],
    benchmark: { text: "Cílem je růst podílu Šampionů a Věrných a včasná reaktivace Ohrožených (dřív, než přejdou mezi Ztracené)." },
  },
  {
    id: "sessions",
    name: "Návštěvnost (sessions)",
    category: "web",
    meaning: "Počet návštěv webu podle Google Analytics 4. Jeden uživatel může mít více návštěv.",
    formula: "GA4 metrika sessions",
    where: ["Hlavní Dashboard", "Webová návštěvnost (GA4)"],
    benchmark: { text: "Bez tržního benchmarku, sledujte YoY a podíl zdrojů (organika, placené, e-mail, přímé)." },
  },
  {
    id: "cvr",
    name: "Konverzní poměr (CVR)",
    category: "web",
    meaning: "Jaký podíl návštěv skončí nákupem. Ukazuje kvalitu návštěvnosti i to, jak dobře web prodává.",
    formula: "Konverze (nákupy) / Sessions × 100",
    where: ["Hlavní Dashboard", "Webová návštěvnost (GA4)"],
    benchmark: { text: "Móda orientačně 0,8 až 2 %. Mobil bývá výrazně níž než desktop." },
  },
  {
    id: "bounce",
    name: "Bounce rate",
    category: "web",
    meaning: "Podíl návštěv bez zapojení (krátká návštěva bez interakce). V GA4 jde o doplněk míry zapojení.",
    formula: "1 − míra zapojení (GA4)",
    where: ["Webová návštěvnost (GA4)"],
    benchmark: { text: "E-shopy orientačně 35 až 55 %. Vysoké hodnoty u konkrétního zdroje nebo vstupní stránky ukazují na nesoulad reklamy a obsahu." },
  },
  {
    id: "delka-navstevy",
    name: "Průměrná délka návštěvy",
    category: "web",
    meaning: "Jak dlouho v průměru návštěva trvá.",
    formula: "GA4 průměrná délka relace",
    where: ["Webová návštěvnost (GA4)"],
    benchmark: { text: "E-shopy orientačně 1,5 až 3 minuty. Samostatně má omezenou vypovídací hodnotu, čtěte spolu s CVR." },
  },
  {
    id: "checkout-funnel",
    name: "Průchodnost košíkem",
    category: "web",
    meaning: "Kolik zákazníků, kteří zahájí pokladnu, nákup opravdu dokončí. Odhaluje problémy v dopravě, platbě nebo formuláři.",
    formula: "purchase / begin_checkout × 100\n(kroky: begin_checkout → add_shipping_info → add_payment_info → purchase)",
    where: ["Webová návštěvnost (GA4)"],
    benchmark: { text: "Orientačně 40 až 60 % dokončených pokladen. Propad hlavně u kroku dopravy obvykle znamená vysokou cenu dopravy." },
  },
  {
    id: "meta-ctr",
    name: "CTR (Meta)",
    category: "meta",
    meaning: "Podíl zobrazení reklamy, na která někdo klikl. Ukazuje, jak kreativa zaujme.",
    formula: "Kliknutí / Imprese × 100",
    where: ["Meta Ads"],
    benchmark: { text: "Móda na Metě orientačně 0,8 až 1,5 %. Pod 0,6 % obvykle unavená kreativa." },
    note: "Meta Ads se načítají až po přidání System Usera do Business Manageru Zboží z Bali, do té doby může stránka být prázdná.",
  },
  {
    id: "meta-cpc",
    name: "CPC (Meta)",
    category: "meta",
    meaning: "Cena jednoho kliknutí na reklamu v Meta Ads.",
    formula: "Útrata / Kliknutí",
    where: ["Meta Ads"],
    benchmark: { text: "CZ/SK móda orientačně 3 až 10 Kč (0,12 až 0,40 €)." },
  },
  {
    id: "meta-cpa",
    name: "CPA (Meta)",
    category: "meta",
    meaning: "Kolik stojí jeden nákup připsaný reklamám na Metě podle pixelu nebo CAPI.",
    formula: "Útrata / Nákupy (akce purchase)",
    where: ["Meta Ads"],
    benchmark: { text: "Hodnoťte vůči CPA z Hlavních KPI a cílovému PNO." },
    note: "Na rozdíl od „Ceny za objednávku“ na Hlavních KPI počítá jen nákupy připsané Metě.",
  },
  {
    id: "meta-roas",
    name: "ROAS (Meta)",
    category: "meta",
    meaning: "Kolik korun tržeb připsala Meta každé koruně útraty.",
    formula: "Hodnota nákupů (purchase value) / Útrata",
    where: ["Meta Ads"],
    benchmark: { text: "Móda orientačně 3 až 5× (podle Mety). Atribuce Mety bývá nadsazená, ověřujte proti PNO z e-shopu." },
  },
  {
    id: "abc",
    name: "ABC analýza produktů",
    category: "provoz",
    meaning: "Rozdělení produktů podle podílu na tržbách, podle kterého se určuje, kam soustředit sklad, reklamu a péči o dostupnost.",
    formula: "Produkty seřazené podle tržeb bez DPH, kumulativní podíl:\nA = 0 až 80 % tržeb · B = 80 až 95 % · C = 95 až 100 %",
    where: ["Produktový žebříček"],
    benchmark: { text: "U módy tvoří skupina A typicky 15 až 25 % položek. Doprodávejte skupinu C slevami na konci sezóny." },
  },
  {
    id: "doprava-zdarma",
    name: "Doprava zdarma %",
    category: "provoz",
    meaning: "Podíl doručovaných objednávek, u kterých zákazník za dopravu neplatil.",
    formula: "Objednávky s dopravou zdarma / Doručované objednávky × 100\n(bez osobního odběru a nedoručovacích metod)",
    where: ["Doprava a platba"],
    benchmark: { text: "Orientačně 30 až 60 %. Hranice dopravy zdarma motivuje k přidání druhé položky." },
  },
];
