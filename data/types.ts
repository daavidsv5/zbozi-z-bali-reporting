export type Country = 'cz' | 'sk';
export type Currency = 'CZK' | 'EUR';

export interface DailyRecord {
  date: string; // ISO date "2026-03-13"
  country: Country;
  currency: Currency;         // CZK for CZ, EUR for SK
  revenue: number;            // bez DPH (in native currency)
  revenue_vat: number;        // s DPH (in native currency)
  orders: number;
  orders_cancelled: number;   // stornované objednávky za den
  cost: number;               // marketing cost (in native currency)
}

/** Fallback EUR→CZK kurz */
export const EUR_TO_CZK = 25;

/** Zboží z Bali CZ start date */
export const CZ_LAUNCH_DATE = '2023-03-28';

/** SK launch date — objednávky s EUR před tímto datem jsou testovací */
export const SK_LAUNCH_DATE = '2023-03-28';

export interface KpiData {
  revenuevat: number;
  revenue: number;
  orders: number;
  aov: number;
  cost: number;
  pno: number;
  cpa: number;
  ordersCancelled: number;
  cancelRate: number; // % stornovaných z celku (cancelled / (orders + cancelled) * 100)
}

export type TimePeriod = 'current_year' | 'current_month' | 'last_month' | 'last_14_days' | 'last_year' | 'yesterday' | 'last_7_days' | 'all_time' | 'custom';

export interface FilterState {
  countries: Country[];
  timePeriod: TimePeriod;
  customStart?: Date;
  customEnd?: Date;
}

/** Returns the display currency. Always CZK — SK values are converted at the rate from useFilters. */
export function getDisplayCurrency(_countries: Country[]): Currency {
  return 'CZK';
}
