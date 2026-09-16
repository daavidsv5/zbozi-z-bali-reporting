'use client';

import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useFilters, getDateRange } from '@/hooks/useFilters';
import { useDashboardData } from '@/hooks/useDashboardData';
import KpiCard from '@/components/kpi/KpiCard';
import KpiLineCharts from '@/components/charts/KpiLineCharts';
import { AovChart, CpaChart } from '@/components/charts/AovCpaChart';
import CountryDistribution from '@/components/tables/CountryDistribution';
import DailyKpiTable from '@/components/tables/DailyKpiTable';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/formatters';
import { Wallet, Banknote, ShoppingCart, BarChart2, TrendingUp, Percent, Tag, Repeat } from 'lucide-react';
import { SK_LAUNCH_DATE } from '@/data/types';

const periodTitles: Record<string, string> = {
  current_year:  'tento rok',
  current_month: 'tento měsíc',
  last_14_days:  'posledních 14 dní',
  custom:        'vlastní období',
};

function KpiGroup({ title, badge, cards, cols = 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4' }: {
  title: string;
  badge?: string;
  cards: ComponentProps<typeof KpiCard>[];
  cols?: string;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h2>
        {badge && <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{badge}</span>}
      </div>
      <div className={`grid ${cols} gap-3 sm:gap-4`}>
        {cards.map((card) => <KpiCard key={card.title} {...card} />)}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { filters, eurToCzk } = useFilters();
  const { kpi, yoy, chartData, chartDataExtended, currentData, daily, currency, hasPrevData, loading } = useDashboardData(filters, undefined, eurToCzk);

  const { start, end } = getDateRange(filters);
  const dayCount  = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const isMonthly = dayCount > 60;

  const title    = `KPI – ${periodTitles[filters.timePeriod] ?? 'aktuální období'} (YoY)`;
  const subtitle = `${formatDate(start)} – ${formatDate(end)}`;

  const dailyRevenue = chartData.map(d => d.revenue);
  const dailyOrders  = chartData.map(d => d.orders);
  const dailyCost    = chartData.map(d => d.cost);
  const dailyPno     = chartData.map(d => d.pno);
  const dailyAov     = chartData.map(d => d.orders > 0 ? d.revenue / d.orders : 0);
  const dailyCpa     = chartData.map(d => d.orders > 0 ? d.cost    / d.orders : 0);

  const fc = (v: number) => formatCurrency(v, currency);

  // LTV (bez DPH) — per-customer z /api/retention (NeonDB), all-time; SK tržby vždy do CZK (stejně jako /retention)
  const [retention, setRetention] = useState<{ market: string; dates: string[]; revenues: number[] }[]>([]);
  useEffect(() => {
    fetch('/api/retention')
      .then(r => (r.ok ? r.json() : []))
      .then(rows => setRetention(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);
  const ltv = useMemo(() => {
    let total = 0, customers = 0;
    for (const c of retention) {
      const isSk = c.market === 'SK';
      if (isSk && c.dates[0] < SK_LAUNCH_DATE) continue;
      if (!filters.countries.includes(isSk ? 'sk' : 'cz')) continue;
      const mult = isSk ? eurToCzk : 1;
      for (const v of c.revenues) total += v * mult;
      customers++;
    }
    return customers > 0 ? total / customers : null;
  }, [retention, filters.countries, eurToCzk]);

  const cf = <T,>(cards: T[]) => cards.map(c => ({ hasPrevData, ...c }));

  const revenueCards = cf([
    { title: 'Tržby s DPH',           value: fc(kpi.revenuevat),      yoy: yoy.revenuevat, sparklineData: dailyRevenue, icon: <Wallet size={16} /> },
    { title: 'Tržby bez DPH',         value: fc(kpi.revenue),         yoy: yoy.revenue,    sparklineData: dailyRevenue, icon: <Banknote size={16} /> },
    { title: 'Počet objednávek',       value: formatNumber(kpi.orders), yoy: yoy.orders,    sparklineData: dailyOrders,  icon: <ShoppingCart size={16} /> },
    { title: 'AOV',                    value: fc(kpi.aov),             yoy: yoy.aov,        sparklineData: dailyAov,     icon: <BarChart2 size={16} /> },
  ]);

  const marketingCards = cf([
    { title: 'Marketingové investice', value: fc(kpi.cost),            yoy: yoy.cost,       sparklineData: dailyCost,    icon: <TrendingUp size={16} />, invertColors: true },
    { title: 'PNO (%)',                value: formatPercent(kpi.pno),  yoy: yoy.pno,        sparklineData: dailyPno,     icon: <Percent size={16} />,   invertColors: true },
    { title: 'Cena za objednávku',     value: fc(kpi.cpa),             yoy: yoy.cpa,        sparklineData: dailyCpa,     icon: <Tag size={16} />,       invertColors: true },
  ]);

  const customerValueCards = [
    { title: 'LTV (bez DPH)', value: ltv !== null ? fc(ltv) : '–', yoy: null, icon: <Repeat size={16} />, hasPrevData: false },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {loading && (
        <p className="text-sm text-slate-400">Načítám data…</p>
      )}

      {/* KPI Cards — skupiny řazené jako výsledovka (marže a POAS chybí: Wix nemá nákupní ceny) */}
      <div className="space-y-5">
        <KpiGroup title="Obrat" cards={revenueCards} />
        <div className="grid grid-cols-1 xl:grid-cols-[3fr_1fr] gap-5 xl:gap-4">
          <KpiGroup title="Marketingová efektivita" cards={marketingCards} cols="grid-cols-1 sm:grid-cols-3" />
          <KpiGroup title="Hodnota zákazníka" badge="celé období" cards={customerValueCards} cols="grid-cols-1" />
        </div>
      </div>

      {filters.countries.length > 1 && (
        <CountryDistribution data={currentData} eurToCzk={eurToCzk} />
      )}

      <KpiLineCharts data={chartDataExtended} currency={currency} hasPrevData={hasPrevData} isMonthly={isMonthly} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AovChart data={chartDataExtended} currency={currency} hasPrevData={hasPrevData} />
        <CpaChart data={chartDataExtended} currency={currency} hasPrevData={hasPrevData} />
      </div>

      <DailyKpiTable daily={daily} eurToCzk={eurToCzk} />
    </div>
  );
}
