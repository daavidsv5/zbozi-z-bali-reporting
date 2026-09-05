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

// GA4 device filter — 'all' means no filter at all
const DEVICES = ['desktop', 'mobile', 'tablet'] as const;
type Device = typeof DEVICES[number] | 'all';

function deviceFilter(device: Device) {
  if (device === 'all') return undefined;
  return {
    filter: {
      fieldName: 'deviceCategory',
      stringFilter: { value: device, matchType: 'EXACT' as const },
    },
  };
}

function parseDevice(raw: string | null): Device {
  return (DEVICES as readonly string[]).includes(raw ?? '') ? (raw as Device) : 'all';
}

async function fetchMonthly(propertyId: string, year: number, device: Device): Promise<MonthPoint[]> {
  const [res] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: `${year}-01-01`, endDate: `${year}-12-31` }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }, { name: 'conversions' }],
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
    dimensionFilter: deviceFilter(device),
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
  const device = parseDevice(searchParams.get('device'));
  const czId = process.env.GA4_PROPERTY_ID!;
  const skId = process.env.GA4_PROPERTY_ID_SK!;

  try {
    const [czA, czB, skA, skB] = await Promise.all([
      fetchMonthly(czId, yearA, device),
      fetchMonthly(czId, yearB, device),
      fetchMonthly(skId, yearA, device),
      fetchMonthly(skId, yearB, device),
    ]);
    return NextResponse.json({ czA, czB, skA, skB });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GA4 error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
