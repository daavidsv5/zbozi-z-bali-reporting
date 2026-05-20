import { DailyRecord, EUR_TO_CZK, SK_LAUNCH_DATE } from './types';
import { realDataCZ } from './realDataCZ';
import { realDataSK } from './realDataSK';


// CZ: real data only — e-shop launched May 2025, no prior year data exists
const realCZ: DailyRecord[] = realDataCZ.map(r => ({
  date: r.date, country: r.country, currency: 'CZK' as const,
  orders: r.orders, orders_cancelled: r.orders_cancelled, revenue_vat: r.revenue_vat, revenue: r.revenue, cost: r.cost,
}));

// SK: real data only from launch date — no mock data (e-shop did not exist before June 2024)
const realSK: DailyRecord[] = realDataSK
  .filter(r => r.date >= SK_LAUNCH_DATE)
  .map(r => ({
    date: r.date, country: r.country, currency: 'EUR' as const,
    orders: r.orders, orders_cancelled: r.orders_cancelled, revenue_vat: r.revenue_vat, revenue: r.revenue, cost: r.cost,
  }));

export const mockData: DailyRecord[] = [
  ...realCZ,
  ...realSK,
];

// Daily marketing data with per-channel breakdown
export interface DailyMarketingRow {
  date: string;
  cost: number;
  cost_facebook: number;
  cost_google: number;
  clicks_facebook: number;
  clicks_google: number;
  orders: number;
  revenue: number;
}

export function getDailyMarketingData(
  dateStart: string,
  dateEnd: string,
  countries: string[],
  eurToCzk: number = EUR_TO_CZK
): DailyMarketingRow[] {
  const onlySK = countries.length === 1 && countries[0] === 'sk';
  const skMult = onlySK ? 1 : eurToCzk;

  const byDate: Record<string, DailyMarketingRow> = {};

  const ensure = (date: string) => {
    if (!byDate[date]) {
      byDate[date] = { date, cost: 0, cost_facebook: 0, cost_google: 0, clicks_facebook: 0, clicks_google: 0, orders: 0, revenue: 0 };
    }
  };

  if (countries.includes('cz')) {
    for (const r of realDataCZ.filter(d => d.date >= dateStart && d.date <= dateEnd)) {
      ensure(r.date);
      byDate[r.date].cost          += r.cost;
      byDate[r.date].cost_facebook += r.cost_facebook;
      byDate[r.date].cost_google   += r.cost_google;
      byDate[r.date].clicks_facebook += r.clicks_facebook;
      byDate[r.date].clicks_google   += r.clicks_google;
      byDate[r.date].orders          += r.orders;
      byDate[r.date].revenue         += r.revenue;
    }
  }

  if (countries.includes('sk')) {
    for (const r of realDataSK.filter(d => d.date >= dateStart && d.date <= dateEnd)) {
      ensure(r.date);
      byDate[r.date].cost          += r.cost          * skMult;
      byDate[r.date].cost_facebook += r.cost_facebook * skMult;
      byDate[r.date].cost_google   += r.cost_google   * skMult;
      byDate[r.date].clicks_facebook += r.clicks_facebook;
      byDate[r.date].clicks_google   += r.clicks_google;
      byDate[r.date].orders          += r.orders;
      byDate[r.date].revenue         += r.revenue      * skMult;
    }
  }

  return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
}

// Source breakdown for marketing page
export interface MarketingSource {
  source: string;
  cost: number;
  currency: 'CZK' | 'EUR';
  clicks: number;
  orders: number;
  revenue: number;
  pno: number;
  cpa: number;
}

function buildSourceBreakdown(
  fbCost: number, gCost: number,
  fbClicks: number, gClicks: number,
  totalRevenue: number, totalOrders: number,
  currency: 'CZK' | 'EUR'
): MarketingSource[] {
  const totalCost = fbCost + gCost;
  const mkShare   = (c: number) => totalCost > 0 ? c / totalCost : 0;
  const safeDiv   = (a: number, b: number) => b > 0 ? a / b : 0;

  return [
    {
      source: 'Facebook Ads', currency,
      cost: fbCost, clicks: fbClicks,
      orders:  Math.round(totalOrders  * mkShare(fbCost)),
      revenue: Math.round(totalRevenue * mkShare(fbCost)),
      pno: safeDiv(fbCost, totalRevenue * mkShare(fbCost)) * 100,
      cpa: safeDiv(fbCost, totalOrders  * mkShare(fbCost)),
    },
    {
      source: 'Google Ads', currency,
      cost: gCost, clicks: gClicks,
      orders:  Math.round(totalOrders  * mkShare(gCost)),
      revenue: Math.round(totalRevenue * mkShare(gCost)),
      pno: safeDiv(gCost, totalRevenue * mkShare(gCost)) * 100,
      cpa: safeDiv(gCost, totalOrders  * mkShare(gCost)),
    },
  ];
}

export function getMarketingSourceData(
  dateStart: string,
  dateEnd: string,
  countries: string[],
  eurToCzk: number = EUR_TO_CZK
): MarketingSource[] {
  const onlySK = countries.length === 1 && countries[0] === 'sk';
  // When mixing CZ+SK, convert SK EUR values to CZK for unified display
  const skMultiplier = onlySK ? 1 : eurToCzk;
  const displayCurrency: 'CZK' | 'EUR' = onlySK ? 'EUR' : 'CZK';

  let fbCost = 0, gCost = 0, fbClicks = 0, gClicks = 0;
  let totalRevenue = 0, totalOrders = 0;

  if (countries.includes('cz')) {
    const r = realDataCZ.filter(d => d.date >= dateStart && d.date <= dateEnd);
    fbCost       += r.reduce((s, d) => s + d.cost_facebook, 0);
    gCost        += r.reduce((s, d) => s + d.cost_google, 0);
    fbClicks     += r.reduce((s, d) => s + d.clicks_facebook, 0);
    gClicks      += r.reduce((s, d) => s + d.clicks_google, 0);
    totalRevenue += r.reduce((s, d) => s + d.revenue, 0);
    totalOrders  += r.reduce((s, d) => s + d.orders, 0);
  }

  if (countries.includes('sk')) {
    const r = realDataSK.filter(d => d.date >= dateStart && d.date <= dateEnd);
    fbCost       += r.reduce((s, d) => s + d.cost_facebook, 0)  * skMultiplier;
    gCost        += r.reduce((s, d) => s + d.cost_google, 0)    * skMultiplier;
    fbClicks     += r.reduce((s, d) => s + d.clicks_facebook, 0);
    gClicks      += r.reduce((s, d) => s + d.clicks_google, 0);
    totalRevenue += r.reduce((s, d) => s + d.revenue, 0)        * skMultiplier;
    totalOrders  += r.reduce((s, d) => s + d.orders, 0);
  }

  return buildSourceBreakdown(fbCost, gCost, fbClicks, gClicks, totalRevenue, totalOrders, displayCurrency);
}
