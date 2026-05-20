import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

const REPO  = 'daavidsv5/zbozi-z-bali-reporting';
const WORKFLOW = 'update-data.yml';

export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    return NextResponse.json(
      { ok: false, log: 'Chybí GITHUB_PAT v env proměnných. Přidej ho na Vercelu i lokálně.' },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept:        'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (res.status === 204) {
    return NextResponse.json({ ok: true, log: 'Import spuštěn — data budou aktualizována během ~1 minuty.' });
  }

  const body = await res.text();
  return NextResponse.json({ ok: false, log: `GitHub API chyba ${res.status}: ${body}` }, { status: 500 });
}
