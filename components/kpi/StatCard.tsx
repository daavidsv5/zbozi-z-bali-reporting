'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
  highlight?: boolean;
  negative?: boolean;
  yoy?: number | null;
  hasPrevData?: boolean;
  invertYoy?: boolean;
}

export default function StatCard({ title, value, icon, sub, highlight, negative, yoy, hasPrevData, invertYoy }: StatCardProps) {
  const borderCls = negative ? 'bg-rose-50 border-rose-400' : highlight ? 'border-emerald-500' : 'border-blue-800';
  const valueCls  = negative ? 'text-rose-600' : highlight ? 'text-emerald-600' : 'text-slate-800';
  const iconCls   = negative ? 'bg-rose-50 text-rose-500' : highlight ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600';

  const showYoy = hasPrevData && yoy !== null && yoy !== undefined && yoy !== 0;
  const yoyPositive = showYoy && (invertYoy ? (yoy as number) < 0 : (yoy as number) > 0);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border-2 p-4 flex items-start justify-between ${borderCls}`}>
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 leading-snug">{title}</p>
        <p className={`text-2xl font-bold leading-tight ${valueCls}`}>{value}</p>
        {showYoy && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md mt-1.5 ${
            yoyPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
          }`}>
            {yoyPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {(yoy as number) > 0 ? '+' : ''}{(yoy as number).toFixed(1)}%
          </span>
        )}
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCls}`}>
        {icon}
      </div>
    </div>
  );
}
