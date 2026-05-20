'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import { mockData } from '@/data/mockGenerator';

export type HlavniMarket = 'all' | 'cz' | 'sk';

interface HlavniDashCtx {
  market: HlavniMarket;
  setMarket: (m: HlavniMarket) => void;
  yearA: number;
  yearB: number;
  yearOptions: number[];
  selectedYear: number;
  setSelectedYear: (y: number) => void;
}

const Ctx = createContext<HlavniDashCtx | null>(null);

function getAvailableYears(): number[] {
  const years = new Set<number>();
  for (const r of mockData) years.add(+r.date.slice(0, 4));
  return Array.from(years).sort((a, b) => b - a);
}

export function HlavniDashboardProvider({ children }: { children: React.ReactNode }) {
  const availableYears = useMemo(() => getAvailableYears(), []);

  const defaultYear = availableYears[0] ?? new Date().getFullYear();

  const [market, setMarket] = useState<HlavniMarket>('all');
  const [selectedYear, setSelectedYear] = useState(defaultYear);

  const yearA = selectedYear;
  const yearB = selectedYear - 1;

  return (
    <Ctx.Provider value={{ market, setMarket, yearA, yearB, yearOptions: availableYears, selectedYear, setSelectedYear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useHlavniDashboard(): HlavniDashCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHlavniDashboard must be used within HlavniDashboardProvider');
  return ctx;
}
