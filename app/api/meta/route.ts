import { auth } from '@/auth';
import { NextRequest, NextResponse } from 'next/server';

const BASE = 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_ACCESS_TOKEN!;
const ACCOUNT_ID = `act_${process.env.META_AD_ACCOUNT_ID}`;

function getAccountId(_country: string): string {
  return ACCOUNT_ID;
}

function findAction(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  return Number(actions?.find(a => a.action_type === type)?.value ?? 0);
}

function findActionValue(actionValues: { action_type: string; value: string }[] | undefined, type: string): number {
  return Number(actionValues?.find(a => a.action_type === type)?.value ?? 0);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from    = searchParams.get('from');
  const to      = searchParams.get('to');
  const country = searchParams.get('country') ?? 'cz';

  const accountId = getAccountId(country);
  const dateParams = from && to
    ? `time_range={"since":"${from}","until":"${to}"}`
    : 'date_preset=last_30d';

  const insightFields = 'spend,reach,impressions,clicks,ctr,actions,action_values,cpc,cpm';

  // Předchozí rok — posuneme datum o -1 rok
  let prevDateParams = '';
  if (from && to) {
    const prevFrom = new Date(from); prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    const prevTo   = new Date(to);   prevTo.setFullYear(prevTo.getFullYear() - 1);
    const pf = prevFrom.toISOString().split('T')[0];
    const pt = prevTo.toISOString().split('T')[0];
    prevDateParams = `time_range={"since":"${pf}","until":"${pt}"}`;
  } else {
    prevDateParams = 'date_preset=last_year';
  }

  const EXCLUDE_CAMPAIGN = 'myfish';

  function isCampaignExcluded(name: string): boolean {
    return name.toLowerCase().includes(EXCLUDE_CAMPAIGN);
  }

  function aggregateRows(rows: any[]) {
    let spend = 0, reach = 0, impressions = 0, clicks = 0;
    let purchases = 0, purchaseValue = 0, addToCart = 0, initCheckout = 0;
    for (const r of rows) {
      spend        += Number(r.spend ?? 0);
      reach        += Number(r.reach ?? 0);
      impressions  += Number(r.impressions ?? 0);
      clicks       += Number(r.clicks ?? 0);
      purchases    += findAction(r.actions, 'purchase');
      purchaseValue+= findActionValue(r.action_values, 'purchase');
      addToCart    += findAction(r.actions, 'add_to_cart');
      initCheckout += findAction(r.actions, 'initiate_checkout');
    }
    return {
      spend, reach, impressions, clicks,
      purchases, purchaseValue, addToCart, initCheckout,
      ctr:  impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc:  clicks > 0 ? spend / clicks : 0,
      cpm:  impressions > 0 ? (spend / impressions) * 1000 : 0,
      cpa:  purchases > 0 ? spend / purchases : 0,
      roas: spend > 0 ? purchaseValue / spend : 0,
    };
  }

  try {
    // --- KPI z campaign-level (filtrujeme MyFish) ---
    const [kpiRes, prevKpiRes] = await Promise.all([
      fetch(`${BASE}/${accountId}/insights?fields=${insightFields},campaign_name&${dateParams}&level=campaign&limit=100&access_token=${TOKEN}`),
      fetch(`${BASE}/${accountId}/insights?fields=${insightFields},campaign_name&${prevDateParams}&level=campaign&limit=100&access_token=${TOKEN}`),
    ]);
    const [kpiJson, prevKpiJson] = await Promise.all([kpiRes.json(), prevKpiRes.json()]);

    if (kpiJson.error) {
      return NextResponse.json({ error: kpiJson.error.message }, { status: 400 });
    }

    const kpiRows     = (kpiJson.data     ?? []).filter((r: any) => !isCampaignExcluded(r.campaign_name ?? ''));
    const prevKpiRows = (prevKpiJson.data ?? []).filter((r: any) => !isCampaignExcluded(r.campaign_name ?? ''));

    const kpi     = aggregateRows(kpiRows);
    const prevKpi = aggregateRows(prevKpiRows);

    // --- Denní breakdown (campaign level, filtr MyFish) ---
    const dailyRes = await fetch(
      `${BASE}/${accountId}/insights?fields=spend,clicks,actions,action_values,campaign_name&${dateParams}&level=campaign&time_increment=1&limit=500&access_token=${TOKEN}`
    );
    const dailyJson = await dailyRes.json();

    // Seskup po datu, přeskočit MyFish
    const dailyByDate: Record<string, { spend: number; clicks: number; purchases: number; purchaseValue: number }> = {};
    for (const d of (dailyJson.data ?? [])) {
      if (isCampaignExcluded(d.campaign_name ?? '')) continue;
      const date = d.date_start;
      if (!dailyByDate[date]) dailyByDate[date] = { spend: 0, clicks: 0, purchases: 0, purchaseValue: 0 };
      dailyByDate[date].spend        += Number(d.spend ?? 0);
      dailyByDate[date].clicks       += Number(d.clicks ?? 0);
      dailyByDate[date].purchases    += findAction(d.actions, 'purchase');
      dailyByDate[date].purchaseValue+= findActionValue(d.action_values, 'purchase');
    }
    const daily = Object.entries(dailyByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        cpc:       v.clicks > 0 ? v.spend / v.clicks : 0,
        purchases: v.purchases,
        cpa:       v.purchases > 0 ? v.spend / v.purchases : 0,
        roas:      v.spend > 0 ? v.purchaseValue / v.spend : 0,
      }));

    // --- Ad-level insights ---
    const adsRes = await fetch(
      `${BASE}/${accountId}/insights?fields=${insightFields},ad_name,ad_id,campaign_name,adset_name&${dateParams}&level=ad&limit=50&sort=spend_descending&access_token=${TOKEN}`
    );
    const adsJson = await adsRes.json();
    const adsRaw: any[] = adsJson.data ?? [];

    // Sesbírej unikátní ad_id pro thumbnail
    const adIds = [...new Set(adsRaw.map(a => a.ad_id).filter(Boolean))];

    // Fetch thumbnails + status pro všechny ads najednou
    const thumbMap: Record<string, string> = {};
    const statusMap: Record<string, string> = {};
    if (adIds.length > 0) {
      const thumbRes = await fetch(
        `${BASE}?ids=${adIds.join(',')}&fields=creative{thumbnail_url,title},effective_status&access_token=${TOKEN}`
      );
      const thumbJson = await thumbRes.json();
      for (const [id, val] of Object.entries(thumbJson as Record<string, any>)) {
        thumbMap[id] = val?.creative?.thumbnail_url ?? '';
        statusMap[id] = val?.effective_status ?? '';
      }
    }

    const ads = adsRaw
      .filter(a => Number(a.spend ?? 0) > 0 && !isCampaignExcluded(a.campaign_name ?? ''))
      .map(a => {
        const adSpend      = Number(a.spend ?? 0);
        const adPurchases  = findAction(a.actions, 'purchase');
        const adPurchVal   = findActionValue(a.action_values, 'purchase');
        return {
          id:           a.ad_id,
          name:         a.ad_name ?? '–',
          campaignName: a.campaign_name ?? '–',
          adsetName:    a.adset_name ?? '–',
          thumbnail:    thumbMap[a.ad_id] ?? '',
          status:       statusMap[a.ad_id] ?? '',
          spend:        adSpend,
          reach:        Number(a.reach ?? 0),
          impressions:  Number(a.impressions ?? 0),
          clicks:       Number(a.clicks ?? 0),
          ctr:          Number(a.ctr ?? 0),
          cpc:          Number(a.cpc ?? 0),
          purchases:    adPurchases,
          purchaseValue: adPurchVal,
          addToCart:    findAction(a.actions, 'add_to_cart'),
          cpa:          adPurchases > 0 ? adSpend / adPurchases : 0,
          roas:         adSpend > 0 ? adPurchVal / adSpend : 0,
        };
      });

    return NextResponse.json({ kpi, prevKpi, daily, ads });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Unknown error' }, { status: 500 });
  }
}
