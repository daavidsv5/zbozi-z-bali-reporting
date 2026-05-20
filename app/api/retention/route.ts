import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/retention
 *
 * Groups customer_orders by customer_hash and returns per-customer order arrays.
 * Response: { market, dates, revenues, revsVat }[]
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const res = await pool.query<{
    market: string;
    customer_hash: string;
    dates: string;
    revenues: string;
    revs_vat: string;
  }>(`
    SELECT
      market,
      customer_hash,
      STRING_AGG(date::text, ',' ORDER BY date) AS dates,
      STRING_AGG(revenue::text,     ',' ORDER BY date) AS revenues,
      STRING_AGG(revenue_vat::text, ',' ORDER BY date) AS revs_vat
    FROM customer_orders
    GROUP BY market, customer_hash
  `);

  const customers = res.rows.map(r => ({
    market: r.market,
    dates:    r.dates.split(',').map(d => d.substring(0, 10)),
    revenues: r.revenues.split(',').map(Number),
    revsVat:  r.revs_vat.split(',').map(Number),
  }));

  return NextResponse.json(customers);
}
