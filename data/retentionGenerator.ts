// Generates synthetic but plausible customer retention data from aggregate daily records.
// Used as placeholder until updateData.js generates real per-customer data.

export interface CustomerRetentionRecord {
  dates: string[];    // sorted ISO dates ("YYYY-MM-DD") of non-cancelled orders
  revenues: number[]; // revenue bez DPH per order (native currency)
  revsVat: number[];  // revenue s DPH per order (native currency)
}

// Seeded LCG RNG (same pattern as mockGenerator.ts)
function seededRandom(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateRetentionFromAggregate(
  records: { date: string; orders: number; revenue: number; revenue_vat: number }[],
  seed: number
): CustomerRetentionRecord[] {
  const rng = seededRandom(seed);

  // Sort records by date
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

  const customers: CustomerRetentionRecord[] = [];
  const customerLastMs: number[] = []; // last purchase time in ms per customer

  for (const day of sorted) {
    if (day.orders <= 0) continue;

    const avgRev    = day.orders > 0 ? day.revenue     / day.orders : 0;
    const avgRevVat = day.orders > 0 ? day.revenue_vat / day.orders : 0;
    const dayMs     = new Date(day.date).getTime();

    for (let i = 0; i < day.orders; i++) {
      const noise    = 0.6 + rng() * 0.8;
      const orderRev    = Math.round(avgRev    * noise * 100) / 100;
      const orderRevVat = Math.round(avgRevVat * noise * 100) / 100;

      let assigned = false;

      // 42% chance: try to assign to a repeat customer
      if (customers.length > 0 && rng() < 0.42) {
        // Sample up to 25 random candidates
        const sampleSize = Math.min(25, customers.length);
        for (let attempt = 0; attempt < sampleSize; attempt++) {
          const idx = Math.floor(rng() * customers.length);
          if (dayMs - customerLastMs[idx] >= 25 * 86400000) {
            customers[idx].dates.push(day.date);
            customers[idx].revenues.push(orderRev);
            customers[idx].revsVat.push(orderRevVat);
            customerLastMs[idx] = dayMs;
            assigned = true;
            break;
          }
        }
      }

      if (!assigned) {
        customers.push({
          dates:    [day.date],
          revenues: [orderRev],
          revsVat:  [orderRevVat],
        });
        customerLastMs.push(dayMs);
      }
    }
  }

  return customers;
}
