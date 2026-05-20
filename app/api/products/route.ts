import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products?start=YYYY-MM-DD&end=YYYY-MM-DD&market=CZ|SK|ALL
 *
 * Vrací:
 *   daily     – záznamy product_sales za aktuální období (date, product_name, market, quantity, revenue)
 *   prevTotals – součty za předchozí rok (pro YoY v tabulce)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const start  = searchParams.get('start');
  const end    = searchParams.get('end');
  const market = searchParams.get('market') || 'ALL';

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }

  const prevStart = shiftYear(start, -1);
  const prevEnd   = shiftYear(end,   -1);

  const marketFilter = market === 'ALL' ? '' : `AND market = '${market === 'CZ' ? 'CZ' : 'SK'}'`;

  const dailyQuery = `
    SELECT date::text, market, product_name, SUM(quantity) AS quantity, SUM(revenue) AS revenue
    FROM product_sales
    WHERE date BETWEEN $1 AND $2 ${marketFilter}
    GROUP BY date, market, product_name
    ORDER BY date, product_name
  `;

  const prevQuery = `
    SELECT market, product_name, SUM(quantity) AS quantity, SUM(revenue) AS revenue
    FROM product_sales
    WHERE date BETWEEN $1 AND $2 ${marketFilter}
    GROUP BY market, product_name
  `;

  try {
    const [dailyRes, prevRes] = await Promise.all([
      pool.query(dailyQuery, [start, end]),
      pool.query(prevQuery, [prevStart, prevEnd]),
    ]);

    const parseRow = (r: Record<string, unknown>) => ({
      ...r,
      quantity: parseInt(r.quantity as string, 10) || 0,
      revenue:  parseFloat(r.revenue as string)    || 0,
    });

    return NextResponse.json({
      daily:      dailyRes.rows.map(parseRow),
      prevTotals: prevRes.rows.map(parseRow),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/products]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function shiftYear(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}
