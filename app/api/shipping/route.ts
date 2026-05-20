import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/shipping
 *
 * Returns all rows from daily_shipping and daily_payment as ShippingPaymentRecord[].
 * Client handles date filtering and market splitting.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [shipRes, payRes] = await Promise.all([
    pool.query<{
      date: Date; market: string; name: string;
      order_count: number; revenue_vat: string; free_count: number;
    }>(`SELECT date, market, name, order_count, revenue_vat, free_count
        FROM daily_shipping ORDER BY date`),
    pool.query<{
      date: Date; market: string; name: string;
      order_count: number; revenue_vat: string;
    }>(`SELECT date, market, name, order_count, revenue_vat
        FROM daily_payment ORDER BY date`),
  ]);

  const records = [
    ...shipRes.rows.map(r => ({
      date: r.date.toISOString().substring(0, 10),
      market: r.market,
      type: 'shipping' as const,
      name: r.name,
      count: r.order_count,
      free_count: r.free_count ?? 0,
      revenue_vat: parseFloat(r.revenue_vat),
    })),
    ...payRes.rows.map(r => ({
      date: r.date.toISOString().substring(0, 10),
      market: r.market,
      type: 'payment' as const,
      name: r.name,
      count: r.order_count,
      free_count: 0,
      revenue_vat: parseFloat(r.revenue_vat),
    })),
  ];

  return NextResponse.json(records);
}
