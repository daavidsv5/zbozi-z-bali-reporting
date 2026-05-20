'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ApiRecord } from '@/hooks/useDashboardData';
import { EUR_TO_CZK } from '@/data/types';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '@/lib/formatters';

interface Props {
  daily: ApiRecord[];
  eurToCzk?: number;
}

type MarketTab = 'all' | 'cz' | 'sk';

interface Row {
  date: string;
  revVat: number;
  rev: number;
  orders: number;
  aov: number;
  cost: number;
  pno: number;
  cpa: number;
}

const PAGE_SIZE = 20;

function pnoBadge(pno: number) {
  if (pno === 0) return 'text-slate-400';
  if (pno < 15)  return 'bg-emerald-50 text-emerald-700';
  if (pno < 25)  return 'bg-amber-50 text-amber-700';
  if (pno < 35)  return 'bg-orange-50 text-orange-700';
  return 'bg-rose-50 text-rose-600';
}

function buildRows(records: ApiRecord[], tab: MarketTab, eurToCzk: number): Row[] {
  const byDate = new Map<string, { revVat: number; rev: number; orders: number; cost: number }>();

  for (const r of records) {
    if (tab === 'cz' && r.market !== 'CZ') continue;
    if (tab === 'sk' && r.market !== 'SK') continue;

    // SK revenues are in EUR → convert; SK costs are already in CZK
    const revMult = r.market === 'SK' ? eurToCzk : 1;
    const cur  = byDate.get(r.date) ?? { revVat: 0, rev: 0, orders: 0, cost: 0 };
    cur.revVat += r.revenue_vat  * revMult;
    cur.rev    += r.revenue      * revMult;
    cur.orders += r.order_count;
    cur.cost   += r.cost;
    byDate.set(r.date, cur);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, d]) => ({
      date,
      revVat: d.revVat,
      rev:    d.rev,
      orders: d.orders,
      aov:    d.orders > 0 ? d.revVat / d.orders : 0,
      cost:   d.cost,
      pno:    d.rev    > 0 ? (d.cost  / d.rev)   * 100 : 0,
      cpa:    d.orders > 0 ? d.cost   / d.orders  : 0,
    }));
}

export default function DailyKpiTable({ daily, eurToCzk = EUR_TO_CZK }: Props) {
  const [tab, setTab]   = useState<MarketTab>('all');
  const [page, setPage] = useState(0);

  const currency = 'CZK';
  const fc = (v: number) => formatCurrency(v, currency);

  const rows     = buildRows(daily, tab, eurToCzk);
  const total    = rows.length;
  const pages    = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sumRevVat = rows.reduce((s, r) => s + r.revVat,  0);
  const sumRev    = rows.reduce((s, r) => s + r.rev,     0);
  const sumOrders = rows.reduce((s, r) => s + r.orders,  0);
  const sumCost   = rows.reduce((s, r) => s + r.cost,    0);
  const totalAov  = sumOrders > 0 ? sumRevVat / sumOrders : 0;
  const totalPno  = sumRev    > 0 ? (sumCost  / sumRev)  * 100 : 0;
  const totalCpa  = sumOrders > 0 ? sumCost   / sumOrders : 0;

  const tabClass = (t: MarketTab) =>
    `px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
      tab === t
        ? 'bg-blue-900 text-white'
        : 'text-slate-500 hover:bg-slate-100'
    }`;

  const th = 'px-4 py-3 text-[11px] font-semibold text-white uppercase tracking-wider';

  function handleTabChange(t: MarketTab) {
    setTab(t);
    setPage(0);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-700">Přehled po dnech</h2>
        <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1">
          <button className={tabClass('all')} onClick={() => handleTabChange('all')}>Vše</button>
          <button className={tabClass('cz')}  onClick={() => handleTabChange('cz')}>CZ</button>
          <button className={tabClass('sk')}  onClick={() => handleTabChange('sk')}>SK</button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-blue-900 border-b border-blue-800">
              <th className={`${th} text-left w-10`}>#</th>
              <th className={`${th} text-left`}>Datum</th>
              <th className={`${th} text-right`}>Tržby s DPH</th>
              <th className={`${th} text-right`}>Tržby bez DPH</th>
              <th className={`${th} text-right`}>Objednávky</th>
              <th className={`${th} text-right`}>AOV</th>
              <th className={`${th} text-right`}>Náklady</th>
              <th className={`${th} text-right`}>PNO</th>
              <th className={`${th} text-right`}>CPA</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">
                  Žádná data pro vybrané období
                </td>
              </tr>
            )}
            {pageRows.map((r, idx) => {
              const globalIdx = page * PAGE_SIZE + idx + 1;
              return (
                <tr
                  key={r.date}
                  className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-300 text-xs tabular-nums">{globalIdx}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium whitespace-nowrap">
                    {formatDate(new Date(r.date + 'T12:00:00'))}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{fc(r.revVat)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800 font-semibold tabular-nums">{fc(r.rev)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{formatNumber(r.orders)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fc(r.aov)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-800 font-bold tabular-nums">{fc(r.cost)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`px-2 py-0.5 rounded-lg text-sm font-bold ${pnoBadge(r.pno)}`}>
                      {formatPercent(r.pno)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{fc(r.cpa)}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-blue-50/60 border-t-2 border-blue-100 font-semibold">
                <td className="px-4 py-3 text-xs text-blue-500" colSpan={2}>Celkem</td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{fc(sumRevVat)}</td>
                <td className="px-4 py-3 text-right text-slate-700 font-semibold tabular-nums">{fc(sumRev)}</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{formatNumber(sumOrders)}</td>
                <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fc(totalAov)}</td>
                <td className="px-4 py-3 text-right text-slate-800 font-bold tabular-nums">{fc(sumCost)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-0.5 rounded-lg text-sm font-bold ${pnoBadge(totalPno)}`}>
                    {formatPercent(totalPno)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{fc(totalCpa)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="px-5 py-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/50">
        <p className="text-xs text-slate-400">
          {total === 0
            ? '0 řádků'
            : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} z ${total} řádků`}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-500"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs text-slate-500 px-2 tabular-nums">{page + 1} / {pages}</span>
          <button
            onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-500"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
