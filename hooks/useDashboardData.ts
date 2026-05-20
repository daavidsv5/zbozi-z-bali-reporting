'use client';

import { useMemo, useEffect, useState } from 'react';
import { DailyRecord, FilterState, KpiData, EUR_TO_CZK, getDisplayCurrency, Currency } from '@/data/types';
import { getDateRange } from './useFilters';

/** Surový záznam z API /api/dashboard */
export interface ApiRecord {
  date: string;
  market: 'CZ' | 'SK';
  revenue_vat: number;
  revenue: number;
  order_count: number;
  shipping_revenue: number;
  cost: number;
  clicks_facebook: number;
  clicks_google: number;
  cost_facebook: number;
  cost_google: number;
}

export interface ChartDataPoint {
  date: string;
  revenue: number;
  revenue_prev: number;
  orders: number;
  orders_prev: number;
  cost: number;
  cost_prev: number;
  pno: number;
  pno_prev: number;
  aov: number;
  aov_prev: number;
  cpa: number;
  cpa_prev: number;
}

export interface DashboardData {
  daily: ApiRecord[];
  prevDaily: ApiRecord[];
  /** DailyRecord[] (starý formát) pro zpětnou kompatibilitu s DailyTable / CountryDistribution */
  currentData: DailyRecord[];
  prevData: DailyRecord[];
  kpi: KpiData;
  prevKpi: KpiData;
  yoy: Record<keyof KpiData, number>;
  chartData: ChartDataPoint[];
  currency: Currency;
  hasPrevData: boolean;
  loading: boolean;
  error: string | null;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Převede API záznam na starý DailyRecord formát pro komponenty */
function toLegacyRecord(r: ApiRecord): DailyRecord {
  return {
    date: r.date,
    country: r.market === 'SK' ? 'sk' : 'cz',
    currency: r.market === 'SK' ? 'EUR' : 'CZK',
    revenue:          Number(r.revenue)     || 0,
    revenue_vat:      Number(r.revenue_vat) || 0,
    orders:           Number(r.order_count) || 0,
    orders_cancelled: 0,
    cost:             Number(r.cost)        || 0,
  };
}

function calcKpi(records: ApiRecord[], displayCurrency: Currency, eurToCzk: number): KpiData {
  let revenuevat = 0, revenue = 0, orders = 0, cost = 0;
  for (const r of records) {
    // SK revenues are in EUR → convert to CZK; SK costs are already in CZK
    const revMult = displayCurrency === 'CZK' && r.market === 'SK' ? eurToCzk : 1;
    revenuevat += r.revenue_vat * revMult;
    revenue    += r.revenue     * revMult;
    orders     += r.order_count;
    cost       += r.cost;
  }
  const aov = orders > 0 ? revenuevat / orders : 0;
  const pno = revenue > 0 ? (cost / revenue) * 100 : 0;
  const cpa = orders > 0 ? cost / orders : 0;
  return { revenuevat, revenue, orders, aov, cost, pno, cpa, ordersCancelled: 0, cancelRate: 0 };
}

function yoyChange(current: number, prev: number): number {
  if (prev === 0) return 0;
  return ((current - prev) / prev) * 100;
}

const emptyKpi: KpiData = {
  revenuevat: 0, revenue: 0, orders: 0, aov: 0,
  cost: 0, pno: 0, cpa: 0, ordersCancelled: 0, cancelRate: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDashboardData(filters: FilterState, _ignoredData?: any, eurToCzk: number = EUR_TO_CZK): DashboardData {
  const [daily, setDaily]         = useState<ApiRecord[]>([]);
  const [prevDaily, setPrevDaily] = useState<ApiRecord[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const { start, end } = useMemo(() => getDateRange(filters), [filters]);
  const startStr    = isoDate(start);
  const endStr      = isoDate(end);
  const marketParam = filters.countries.length === 1
    ? filters.countries[0].toUpperCase()
    : 'ALL';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ start: startStr, end: endStr, market: marketParam });
    fetch(`/api/dashboard?${params}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (!cancelled) {
          setDaily(data.daily || []);
          setPrevDaily(data.prevDaily || []);
        }
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [startStr, endStr, marketParam]);

  return useMemo(() => {
    const currency    = getDisplayCurrency(filters.countries);
    const kpi         = calcKpi(daily,     currency, eurToCzk);
    const prevKpi     = calcKpi(prevDaily, currency, eurToCzk);
    const hasPrevData = prevDaily.length > 0;

    const yoy = (Object.keys(emptyKpi) as (keyof KpiData)[]).reduce((acc, k) => {
      acc[k] = yoyChange(kpi[k], prevKpi[k]);
      return acc;
    }, {} as Record<keyof KpiData, number>);

    // Chart data — group by date přes oba trhy
    const dateMap = new Map<string, { rev: number; revP: number; ord: number; ordP: number; cst: number; cstP: number }>();

    // Shift prev-year date to current year so both series share the same x-axis key
    const shiftToCurrentYear = (dateStr: string, yearDiff: number): string => {
      const d = new Date(dateStr + 'T12:00:00');
      d.setFullYear(d.getFullYear() + yearDiff);
      return isoDate(d);
    };

    const addRecords = (records: ApiRecord[], isPrev: boolean) => {
      for (const r of records) {
        // SK revenues are in EUR → convert to CZK; SK costs are already in CZK
        const revMult = r.market === 'SK' ? eurToCzk : 1;
        // Align prev-year dates (+1 year) to current year for the shared x-axis
        const dateKey = isPrev ? shiftToCurrentYear(r.date, 1) : r.date;
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { rev: 0, revP: 0, ord: 0, ordP: 0, cst: 0, cstP: 0 });
        }
        const pt = dateMap.get(dateKey)!;
        if (isPrev) {
          pt.revP += r.revenue     * revMult;
          pt.ordP += r.order_count;
          pt.cstP += r.cost;
        } else {
          pt.rev  += r.revenue     * revMult;
          pt.ord  += r.order_count;
          pt.cst  += r.cost;
        }
      }
    };

    addRecords(daily,     false);
    addRecords(prevDaily, true);

    const chartData: ChartDataPoint[] = [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pt]) => ({
        date,
        revenue:      pt.rev,
        revenue_prev: pt.revP,
        orders:       pt.ord,
        orders_prev:  pt.ordP,
        cost:         pt.cst,
        cost_prev:    pt.cstP,
        pno:      pt.rev  > 0 ? (pt.cst  / pt.rev)  * 100 : 0,
        pno_prev: pt.revP > 0 ? (pt.cstP / pt.revP) * 100 : 0,
        aov:      pt.ord  > 0 ? pt.rev  / pt.ord  : 0,
        aov_prev: pt.ordP > 0 ? pt.revP / pt.ordP : 0,
        cpa:      pt.ord  > 0 ? pt.cst  / pt.ord  : 0,
        cpa_prev: pt.ordP > 0 ? pt.cstP / pt.ordP : 0,
      }));

    const currentData = daily.map(toLegacyRecord);
    const prevData    = prevDaily.map(toLegacyRecord);

    return { daily, prevDaily, currentData, prevData, kpi, prevKpi, yoy, chartData, currency, hasPrevData, loading, error };
  }, [daily, prevDaily, filters, eurToCzk, loading, error]);
}
