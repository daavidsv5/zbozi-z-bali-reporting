'use client';

import { useMemo, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { useFilters } from '@/hooks/useFilters';
import { useHlavniDashboard } from '@/hooks/useHlavniDashboard';
import type { ApiRecord } from '@/hooks/useDashboardData';

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS_CS = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];

// ─── Data aggregation ────────────────────────────────────────────────────────

interface MonthlyRow {
  revenueVat: number;
  revenue: number;
  orders: number;
  cost: number;
}

function aggregateMonthly(records: ApiRecord[], eurToCzk: number): MonthlyRow[] {
  const months: MonthlyRow[] = Array.from({ length: 12 }, () => ({ revenueVat: 0, revenue: 0, orders: 0, cost: 0 }));
  for (const r of records) {
    // SK revenues are in EUR → convert; SK costs are already in CZK
    const revMult = r.market === 'SK' ? eurToCzk : 1;
    const m = parseInt(r.date.slice(5, 7), 10) - 1;
    months[m].revenueVat += r.revenue_vat * revMult;
    months[m].revenue    += r.revenue * revMult;
    months[m].orders     += r.order_count;
    months[m].cost       += r.cost;
  }
  return months;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtCZK(v: number): string {
  return `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} Kč`;
}

function fmtAxisCZK(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}

function fmtAxisPct(v: number): string {
  return `${v.toFixed(1).replace('.', ',')} %`;
}

function fmtAxisCount(v: number): string {
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(Math.round(v));
}

// ─── Chart component ─────────────────────────────────────────────────────────

interface ChartCardProps {
  title: string;
  subtitle?: string;
  data: { month: string; a: number; b: number }[];
  colorA: string;
  colorB: string;
  yearA: number;
  yearB: number;
  axisFormatter: (v: number) => string;
  tooltipFormatter: (v: number) => string;
}

function ChartCard({ title, subtitle, data, colorA, colorB, yearA, yearB, axisFormatter, tooltipFormatter }: ChartCardProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valB: number = payload.find((p: any) => p.dataKey === 'b')?.value ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valA: number = payload.find((p: any) => p.dataKey === 'a')?.value ?? 0;
    const yoy = valB !== 0 ? ((valA - valB) / Math.abs(valB)) * 100 : null;
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs shadow-sm">
        <p className="font-medium text-slate-600 mb-1">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.name} style={{ color: entry.fill }}>
            {entry.name}: <span className="font-semibold">{tooltipFormatter(entry.value)}</span>
          </p>
        ))}
        {yoy !== null && (
          <p className={`mt-1 pt-1 border-t border-slate-100 font-semibold ${yoy >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            YoY: {yoy >= 0 ? '+' : ''}{yoy.toFixed(1).replace('.', ',')} %
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-0.5">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 mb-2">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={axisFormatter} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={46} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="square" iconSize={10} />
          <Bar dataKey="b" name={String(yearB)} fill={colorB} radius={[2, 2, 0, 0]} maxBarSize={28} />
          <Bar dataKey="a" name={String(yearA)} fill={colorA} radius={[2, 2, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HlavniDashboardPage() {
  const { eurToCzk } = useFilters();
  const { market, yearA, yearB } = useHlavniDashboard();

  const [recordsA, setRecordsA] = useState<ApiRecord[]>([]);
  const [recordsB, setRecordsB] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(false);

  type MonthPoint = { sessions: number; conversions: number };
  type RawCvr = { czA: MonthPoint[]; czB: MonthPoint[]; skA: MonthPoint[]; skB: MonthPoint[] };

  const [rawCvr, setRawCvr] = useState<RawCvr | null>(null);

  const marketParam = market === 'cz' ? 'CZ' : market === 'sk' ? 'SK' : 'ALL';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fetchYear = (year: number) => {
      const params = new URLSearchParams({
        start: `${year}-01-01`,
        end:   `${year}-12-31`,
        market: marketParam,
      });
      return fetch(`/api/dashboard?${params}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(data => (data.daily || []) as ApiRecord[]);
    };

    Promise.all([fetchYear(yearA), fetchYear(yearB)])
      .then(([a, b]) => {
        if (!cancelled) { setRecordsA(a); setRecordsB(b); }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [yearA, yearB, marketParam]);

  useEffect(() => {
    setRawCvr(null);
    fetch(`/api/analytics/cvr-monthly?yearA=${yearA}`)
      .then(r => r.json())
      .then(json => { if (json.czA) setRawCvr(json); })
      .catch(() => {});
  }, [yearA]);

  const cvrData = useMemo(() => {
    if (!rawCvr) return null;
    const { czA, czB, skA, skB } = rawCvr;
    const combine = (x: MonthPoint[], y: MonthPoint[]): MonthPoint[] =>
      x.map((d, i) => ({ sessions: d.sessions + y[i].sessions, conversions: d.conversions + y[i].conversions }));
    const [arrA, arrB] = market === 'cz' ? [czA, czB] :
                         market === 'sk' ? [skA, skB] :
                         [combine(czA, skA), combine(czB, skB)];
    return MONTHS_CS.map((month, i) => ({
      month,
      a: arrA[i].sessions > 0 ? (arrA[i].conversions / arrA[i].sessions) * 100 : 0,
      b: arrB[i].sessions > 0 ? (arrB[i].conversions / arrB[i].sessions) * 100 : 0,
    }));
  }, [rawCvr, market]);

  const monthsA = useMemo(() => aggregateMonthly(recordsA, eurToCzk), [recordsA, eurToCzk]);
  const monthsB = useMemo(() => aggregateMonthly(recordsB, eurToCzk), [recordsB, eurToCzk]);

  const chartData = useMemo(() => MONTHS_CS.map((month, i) => {
    const a = monthsA[i];
    const b = monthsB[i];
    return {
      month,
      revenueVat: { a: a.revenueVat, b: b.revenueVat },
      revenue: { a: a.revenue, b: b.revenue },
      orders:  { a: a.orders,  b: b.orders },
      cost:    { a: a.cost,    b: b.cost },
      pno:     { a: a.revenue > 0 ? (a.cost / a.revenue) * 100 : 0, b: b.revenue > 0 ? (b.cost / b.revenue) * 100 : 0 },
      aov:     { a: a.orders > 0 ? a.revenue / a.orders : 0,        b: b.orders > 0 ? b.revenue / b.orders : 0 },
      cpa:     { a: a.orders > 0 ? a.cost    / a.orders : 0,        b: b.orders > 0 ? b.cost    / b.orders : 0 },
    };
  }), [monthsA, monthsB]);

  function makeData(key: keyof typeof chartData[0]): { month: string; a: number; b: number }[] {
    return chartData.map(d => ({ month: d.month, ...(d[key] as { a: number; b: number }) }));
  }

  const pctFmt = (v: number) => `${v.toFixed(1).replace('.', ',')} %`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Hlavní Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Měsíční přehled klíčových metrik · srovnání s předchozím rokem
          {loading && <span className="ml-2 text-slate-400">· načítám…</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ChartCard title="Tržby s DPH"
          data={makeData('revenueVat')}
          colorA="#16a34a" colorB="#86efac"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisCZK} tooltipFormatter={fmtCZK}
        />
        <ChartCard title="Tržby bez DPH"
          data={makeData('revenue')}
          colorA="#2563eb" colorB="#93c5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisCZK} tooltipFormatter={fmtCZK}
        />
        <ChartCard title="Počet objednávek"
          data={makeData('orders')}
          colorA="#1e40af" colorB="#93c5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisCount} tooltipFormatter={v => String(Math.round(v))}
        />
        <ChartCard title="Marketingové investice"
          data={makeData('cost')}
          colorA="#dc2626" colorB="#fca5a5"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisCZK} tooltipFormatter={fmtCZK}
        />
        <ChartCard title="PNO (%)"
          data={makeData('pno')}
          colorA="#0891b2" colorB="#67e8f9"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisPct} tooltipFormatter={pctFmt}
        />
        <ChartCard title="AOV – Průměrná hodnota objednávky"
          data={makeData('aov')}
          colorA="#4338ca" colorB="#c4b5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisCZK} tooltipFormatter={fmtCZK}
        />
        <ChartCard title="Cena za objednávku (CPA)"
          data={makeData('cpa')}
          colorA="#7c3aed" colorB="#c4b5fd"
          yearA={yearA} yearB={yearB}
          axisFormatter={fmtAxisCZK} tooltipFormatter={fmtCZK}
        />
        {cvrData && (
          <ChartCard
            title="Konverzní poměr"
            subtitle="Zdroj: GA4"
            data={cvrData}
            colorA="#0e7490" colorB="#a5f3fc"
            yearA={yearA} yearB={yearB}
            axisFormatter={fmtAxisPct} tooltipFormatter={pctFmt}
          />
        )}
      </div>
    </div>
  );
}
