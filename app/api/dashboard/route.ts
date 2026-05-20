import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard?start=YYYY-MM-DD&end=YYYY-MM-DD&market=CZ|SK|ALL
 *
 * Vrací:
 *   - daily: DailyRecord[] (orders + marketing per den)
 *   - prevDaily: DailyRecord[] (stejný rozsah, předchozí rok)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const start  = searchParams.get('start');
  const end    = searchParams.get('end');
  const market = searchParams.get('market') || 'ALL'; // CZ | SK | ALL

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }

  // Předchozí rok pro YoY
  const prevStart = shiftYear(start, -1);
  const prevEnd   = shiftYear(end, -1);

  const mktFilter = market === 'ALL' ? '' : `AND d.market = '${market === 'CZ' ? 'CZ' : 'SK'}'`;

  const query = `
    WITH mkt AS (
      SELECT
        date,
        market,
        SUM(cost)                                                  AS cost,
        SUM(CASE WHEN source = 'facebook' THEN clicks ELSE 0 END) AS clicks_fb,
        SUM(CASE WHEN source = 'google'   THEN clicks ELSE 0 END) AS clicks_google,
        SUM(CASE WHEN source = 'facebook' THEN cost   ELSE 0 END) AS cost_fb,
        SUM(CASE WHEN source = 'google'   THEN cost   ELSE 0 END) AS cost_google
      FROM daily_marketing
      WHERE date BETWEEN $1 AND $2
      GROUP BY date, market
    ),
    all_days AS (
      SELECT date, market FROM daily_orders    WHERE date BETWEEN $1 AND $2
      UNION
      SELECT date, market FROM daily_marketing WHERE date BETWEEN $1 AND $2
    )
    SELECT
      d.date::text,
      d.market,
      COALESCE(o.revenue_vat,      0) AS revenue_vat,
      COALESCE(o.revenue,          0) AS revenue,
      COALESCE(o.order_count,      0) AS order_count,
      COALESCE(o.shipping_revenue, 0) AS shipping_revenue,
      COALESCE(m.cost,             0) AS cost,
      COALESCE(m.clicks_fb,        0) AS clicks_facebook,
      COALESCE(m.clicks_google,    0) AS clicks_google,
      COALESCE(m.cost_fb,          0) AS cost_facebook,
      COALESCE(m.cost_google,      0) AS cost_google
    FROM all_days d
    LEFT JOIN daily_orders o ON o.date = d.date AND o.market = d.market
    LEFT JOIN mkt m          ON m.date = d.date AND m.market = d.market
    WHERE d.date BETWEEN $1 AND $2
    ${mktFilter}
    ORDER BY d.date, d.market
  `;

  try {
    const [current, prev] = await Promise.all([
      pool.query(query, [start, end]),
      pool.query(query, [prevStart, prevEnd]),
    ]);

    const parseRow = (r: Record<string, unknown>) => ({
      ...r,
      revenue_vat:      parseFloat(r.revenue_vat as string)      || 0,
      revenue:          parseFloat(r.revenue as string)          || 0,
      order_count:      parseInt(r.order_count as string, 10)    || 0,
      shipping_revenue: parseFloat(r.shipping_revenue as string) || 0,
      cost:             parseFloat(r.cost as string)             || 0,
      clicks_facebook:  parseInt(r.clicks_facebook as string, 10)  || 0,
      clicks_google:    parseInt(r.clicks_google as string, 10)    || 0,
      cost_facebook:    parseFloat(r.cost_facebook as string)    || 0,
      cost_google:      parseFloat(r.cost_google as string)      || 0,
    });

    return NextResponse.json({
      daily:     current.rows.map(parseRow),
      prevDaily: prev.rows.map(parseRow),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/dashboard]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function shiftYear(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
}
