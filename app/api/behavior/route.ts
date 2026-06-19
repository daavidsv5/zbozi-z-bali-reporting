import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start  = searchParams.get('start');
  const end    = searchParams.get('end');
  const market = searchParams.get('market'); // 'CZ' | 'SK' | null = all

  const dailyConditions: string[] = [];
  const dailyParams: unknown[]    = [];

  if (start)  { dailyParams.push(start);  dailyConditions.push(`date >= $${dailyParams.length}`); }
  if (end)    { dailyParams.push(end);    dailyConditions.push(`date <= $${dailyParams.length}`); }
  if (market) { dailyParams.push(market); dailyConditions.push(`market = $${dailyParams.length}`); }

  const dailyWhere = dailyConditions.length > 0 ? `WHERE ${dailyConditions.join(' AND ')}` : '';

  const hourlyParams: unknown[] = [];
  const hourlyWhere = market ? `WHERE market = $1` : '';
  if (market) hourlyParams.push(market);

  const [dailyRes, hourlyRes] = await Promise.all([
    pool.query(
      `SELECT to_char(date,'YYYY-MM-DD') AS date, market, revenue, order_count FROM daily_orders ${dailyWhere} ORDER BY date`,
      dailyParams
    ),
    pool.query(
      `SELECT market, day_of_week, hour, order_count, revenue
       FROM hourly_behavior ${hourlyWhere}
       ORDER BY market, day_of_week, hour`,
      hourlyParams
    ),
  ]);

  return NextResponse.json({
    daily:  dailyRes.rows,
    hourly: hourlyRes.rows,
  });
}
