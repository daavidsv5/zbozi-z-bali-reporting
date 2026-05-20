/**
 * Unified chart color palette for all charts in the application.
 * Import from here instead of using raw hex strings in chart files.
 */
export const C = {
  // ── Core data series ──────────────────────────────────────────────────────
  /** Primary series: tržby, sessions, hlavní sloupce */
  primary:          '#2563eb',  // blue-600
  /** Primary loňský rok / světlá varianta */
  primaryLight:     '#93c5fd',  // blue-300

  /** Secondary series: objednávky */
  secondary:        '#7c3aed',  // violet-700
  /** Secondary loňský rok */
  secondaryLight:   '#c4b5fd',  // violet-300

  // ── Cost / negative metrics ───────────────────────────────────────────────
  /** Náklady, cost */
  cost:             '#e11d48',  // rose-600
  /** Náklady loňský rok */
  costLight:        '#fda4af',  // rose-300

  // ── Rate / percentage lines ───────────────────────────────────────────────
  /** PNO %, CVR %, LTV */
  rate:             '#0ea5e9',  // sky-500
  /** Rate loňský rok */
  rateLight:        '#7dd3fc',  // sky-300

  // ── Margin / profit ───────────────────────────────────────────────────────
  /** Marže */
  margin:           '#16a34a',  // green-600
  /** Marže % line */
  marginLight:      '#86efac',  // green-300

  /** Hrubý zisk */
  grossProfit:      '#0d9488',  // teal-600
  /** Hrubý zisk % line */
  grossProfitLight: '#5eead4',  // teal-300

  // ── Channels ──────────────────────────────────────────────────────────────
  /** Facebook Ads (kliky, náklady) */
  facebook:         '#2563eb',  // blue-600
  /** Facebook CPC line (tmavší) */
  facebookDark:     '#1e40af',  // blue-800
  /** Google Ads (kliky, náklady) */
  google:           '#059669',  // emerald-600
  /** Google CPC line (tmavší) */
  googleDark:       '#065f46',  // emerald-800

  // ── Analytics ─────────────────────────────────────────────────────────────
  /** CVR %, Bounce rate */
  cvr:              '#f59e0b',  // amber-500
  /** Délka návštěvy */
  duration:         '#8b5cf6',  // violet-500

  // ── Retention ─────────────────────────────────────────────────────────────
  /** Noví zákazníci */
  newCustomers:     '#22c55e',  // green-500
  /** AOV, opakované nákupy */
  aov:              '#6366f1',  // indigo-500

  // ── Funnel steps ──────────────────────────────────────────────────────────
  funnelStep: {
    begin_checkout:    '#2563eb',  // blue-600
    add_shipping_info: '#f59e0b',  // amber-500
    add_payment_info:  '#7c3aed',  // violet-700
    purchase:          '#16a34a',  // green-600
  },

  // ── Device breakdown ──────────────────────────────────────────────────────
  device: {
    desktop: '#2563eb',  // blue-600
    mobile:  '#16a34a',  // green-600
    tablet:  '#f59e0b',  // amber-500
  },

  // ── Multi-series palette (dopravci, platby, …) ────────────────────────────
  palette: [
    '#2563eb',  // blue-600
    '#e11d48',  // rose-600
    '#16a34a',  // green-600
    '#f59e0b',  // amber-500
    '#7c3aed',  // violet-700
    '#0ea5e9',  // sky-500
    '#f97316',  // orange-500
    '#0d9488',  // teal-600
    '#ec4899',  // pink-500
    '#6366f1',  // indigo-500
  ],
} as const;
