'use client';

import { useFilters, getDateRange } from '@/hooks/useFilters';
import { useDashboardData } from '@/hooks/useDashboardData';
import KpiCard from '@/components/kpi/KpiCard';
import KpiLineCharts from '@/components/charts/KpiLineCharts';
import { AovChart, CpaChart } from '@/components/charts/AovCpaChart';
import CountryDistribution from '@/components/tables/CountryDistribution';
import DailyKpiTable from '@/components/tables/DailyKpiTable';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/formatters';
import { Wallet, Banknote, ShoppingCart, BarChart2, TrendingUp, Percent, Tag } from 'lucide-react';

const periodTitles: Record<string, string> = {
  current_year:  'tento rok',
  current_month: 'tento měsíc',
  last_14_days:  'posledních 14 dní',
  custom:        'vlastní období',
};

export default function DashboardPage() {
  const { filters, eurToCzk } = useFilters();
  const { kpi, yoy, chartData, currentData, daily, currency, hasPrevData, loading } = useDashboardData(filters, undefined, eurToCzk);

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

  const kpiCards = [
    { title: 'Tržby s DPH',           value: fc(kpi.revenuevat),      yoy: yoy.revenuevat, sparklineData: dailyRevenue, icon: <Wallet size={16} /> },
    { title: 'Tržby bez DPH',         value: fc(kpi.revenue),         yoy: yoy.revenue,    sparklineData: dailyRevenue, icon: <Banknote size={16} /> },
    { title: 'Počet objednávek',       value: formatNumber(kpi.orders), yoy: yoy.orders,    sparklineData: dailyOrders,  icon: <ShoppingCart size={16} /> },
    { title: 'AOV',                    value: fc(kpi.aov),             yoy: yoy.aov,        sparklineData: dailyAov,     icon: <BarChart2 size={16} /> },
    { title: 'Marketingové investice', value: fc(kpi.cost),            yoy: yoy.cost,       sparklineData: dailyCost,    icon: <TrendingUp size={16} />, invertColors: true },
    { title: 'PNO (%)',                value: formatPercent(kpi.pno),  yoy: yoy.pno,        sparklineData: dailyPno,     icon: <Percent size={16} />,   invertColors: true },
    { title: 'Cena za objednávku',     value: fc(kpi.cpa),             yoy: yoy.cpa,        sparklineData: dailyCpa,     icon: <Tag size={16} />,       invertColors: true },
  ].map(c => ({ ...c, hasPrevData }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {loading && (
        <p className="text-sm text-slate-400">Načítám data…</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        {kpiCards.map(card => <KpiCard key={card.title} {...card} />)}
      </div>

      {filters.countries.length > 1 && (
        <CountryDistribution data={currentData} eurToCzk={eurToCzk} />
      )}

      <KpiLineCharts data={chartData} currency={currency} hasPrevData={hasPrevData} isMonthly={isMonthly} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AovChart data={chartData} currency={currency} hasPrevData={hasPrevData} />
        <CpaChart data={chartData} currency={currency} hasPrevData={hasPrevData} />
      </div>

      <DailyKpiTable daily={daily} eurToCzk={eurToCzk} />
    </div>
  );
}
