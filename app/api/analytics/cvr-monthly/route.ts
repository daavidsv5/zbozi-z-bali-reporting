import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

const client = new BetaAnalyticsDataClient({
  credentials: {
    client_email: process.env.GA4_CLIENT_EMAIL,
    private_key: process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

type GA4Row = { dimensionValues?: { value?: string | null }[]; metricValues?: { value?: string | null }[] };
type MonthPoint = { sessions: number; conversions: number };

async function fetchMonthly(propertyId: string, year: number): Promise<MonthPoint[]> {
  const [res] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: `${year}-01-01`, endDate: `${year}-12-31` }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }, { name: 'conversions' }],
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
  });
  const map: Record<number, MonthPoint> = {};
  for (let m = 1; m <= 12; m++) map[m] = { sessions: 0, conversions: 0 };
  for (const row of (res.rows ?? []) as GA4Row[]) {
    const ym = row.dimensionValues?.[0].value ?? '';
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(4, 6));
    if (y !== year || m < 1 || m > 12) continue;
    map[m].sessions    += Number(row.metricValues?.[0].value ?? 0);
    map[m].conversions += Number(row.metricValues?.[1].value ?? 0);
  }
  return Array.from({ length: 12 }, (_, i) => map[i + 1]);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const yearA = Number(searchParams.get('yearA') ?? new Date().getFullYear());
  const yearB = yearA - 1;
  const czId = process.env.GA4_PROPERTY_ID!;
  const skId = process.env.GA4_PROPERTY_ID_SK!;

  try {
    const [czA, czB, skA, skB] = await Promise.all([
      fetchMonthly(czId, yearA),
      fetchMonthly(czId, yearB),
      fetchMonthly(skId, yearA),
      fetchMonthly(skId, yearB),
    ]);
    return NextResponse.json({ czA, czB, skA, skB });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GA4 error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
