'use client';

/**
 * Aktuální hodnoty pro Slovník klíčových metrik (/slovnik): posledních 12 měsíců.
 * Vzorce odpovídají Hlavním KPI (`app/dashboard/page.tsx`).
 */

import { useEffect, useMemo, useState } from 'react';
import { useFilters } from '@/hooks/useFilters';
import type { ApiRecord } from '@/hooks/useDashboardData';
import { SK_LAUNCH_DATE } from '@/data/types';
import { computeRetentionKpis } from '@/lib/retentionUtils';
import type { CurrentValueKey } from '@/lib/metricsGlossary';

export type CurrentValues = Partial<Record<CurrentValueKey, number | null>>;

export interface Customer { dates: string[]; revenues: number[]; revsVat: number[] }

/** Posledních 12 měsíců končících včera (stejně jako otevřená období v TopBaru). */
export function last12Months() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start, end, s: iso(start), e: iso(end) };
}

interface Inputs {
  revenue: number; revenueVat: number; orders: number; cost: number;
  aovWithVat: boolean;
  /** null = projekt nemá nákupní ceny */
  margin: { revenue: number; purchaseCost: number } | null;
  /** zákazníci s daty seřazenými vzestupně, tržby v měně reportu */
  customers: Customer[];
  s: string; e: string;
  costNoBrand?: number;
}

export function computeValues(i: Inputs): CurrentValues {
  const { revenue, revenueVat, orders, cost, customers } = i;
  const newCustomers = customers.filter(c => c.dates[0] >= i.s && c.dates[0] <= i.e).length;
  const ltvRevenue   = customers.reduce((sum, c) => sum + c.revenues.reduce((a, v) => a + v, 0), 0);
  const retention    = computeRetentionKpis(customers);
  const cac          = newCustomers > 0 ? cost / newCustomers : null;
  const ltv          = customers.length > 0 ? ltvRevenue / customers.length : null;

  const v: CurrentValues = {
    revenueVat, revenue, orders, cost,
    aov:         orders > 0 ? (i.aovWithVat ? revenueVat : revenue) / orders : null,
    pno:         revenue > 0 ? (cost / revenue) * 100 : null,
    cpa:         orders > 0 ? cost / orders : null,
    cac, ltv,
    repeatRate:  customers.length > 0 ? retention.repeatPurchaseRate : null,
    daysBetween: retention.avgDaysBetween > 0 ? retention.avgDaysBetween : null,
  };

  if (i.costNoBrand !== undefined) {
    v.costNoBrand = i.costNoBrand;
    v.pnoNoBrand  = revenue > 0 ? (i.costNoBrand / revenue) * 100 : null;
  }

  if (i.margin && i.margin.revenue > 0) {
    const margin      = i.margin.revenue - i.margin.purchaseCost;
    const marginPct   = (margin / i.margin.revenue) * 100;
    const grossProfit = margin - cost;
    const ltvProfit   = ltv !== null ? ltv * (marginPct / 100) : null;
    Object.assign(v, {
      margin, marginPct, grossProfit,
      grossPct:            (grossProfit / i.margin.revenue) * 100,
      grossPerOrder:       orders > 0 ? grossProfit / orders : null,
      grossPerNewCustomer: newCustomers > 0 ? grossProfit / newCustomers : null,
      poas:                cost > 0 ? margin / cost : null,
      poasNoBrand:         i.costNoBrand ? margin / i.costNoBrand : null,
      ltvProfit,
      ltvCac:              ltvProfit !== null && cac ? ltvProfit / cac : null,
    });
  }
  return v;
}

type RetentionRow = { market: string; dates: string[]; revenues: number[]; revsVat: number[] };

export function useCurrentValues() {
  const { eurToCzk } = useFilters();
  const range = useMemo(() => last12Months(), []);
  const [daily, setDaily] = useState<ApiRecord[] | null>(null);
  const [retention, setRetention] = useState<RetentionRow[] | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ start: range.s, end: range.e, market: 'ALL' });
    fetch(`/api/dashboard?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setDaily(Array.isArray(d?.daily) ? d.daily : []))
      .catch(() => setDaily([]));
    fetch('/api/retention')
      .then(r => (r.ok ? r.json() : []))
      .then(rows => setRetention(Array.isArray(rows) ? rows : []))
      .catch(() => setRetention([]));
  }, [range]);

  const values = useMemo(() => {
    if (!daily || !retention) return {};
    let revenue = 0, revenueVat = 0, orders = 0, cost = 0;
    for (const r of daily) {
      // SK tržby jsou v EUR, náklady jsou v Kč pro oba trhy
      const mult = r.market === 'SK' ? eurToCzk : 1;
      revenue += r.revenue * mult; revenueVat += r.revenue_vat * mult; orders += r.order_count; cost += r.cost;
    }
    const customers = retention
      .filter(c => c.market !== 'SK' || c.dates[0] >= SK_LAUNCH_DATE)
      .map(c => {
        const mult = c.market === 'SK' ? eurToCzk : 1;
        return { dates: c.dates, revenues: c.revenues.map(v => v * mult), revsVat: c.revsVat.map(v => v * mult) };
      });
    return computeValues({
      revenue, revenueVat, orders, cost, aovWithVat: true, margin: null, customers, s: range.s, e: range.e,
    });
  }, [daily, retention, eurToCzk, range]);

  return { values, start: range.start, end: range.end, loading: !daily || !retention };
}
