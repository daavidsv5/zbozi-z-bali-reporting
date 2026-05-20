'use client';

import TopBar from './TopBar';
import { useFilters } from '@/hooks/useFilters';

export default function TopBarWrapper() {
  const { filters, setFilters } = useFilters();
  return <TopBar filters={filters} onChange={setFilters} />;
}
