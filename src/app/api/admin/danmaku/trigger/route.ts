import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { ensureEpisodeImported } from '@/lib/danmaku.import';

export const runtime = 'nodejs';

// POST { source,id,episodes:number[], title? }
export async function POST(req: NextRequest) {
  try {
    const { source, id, episodes, title } = await req.json();
    if (!source || !id || !Array.isArray(episodes) || episodes.length === 0) {
      return NextResponse.json({ ok: false, error: 'missing-params' }, { status: 400 });
    }

    const config = await getConfig();
    const danCfg = config.DanmakuImport;
    const key = `${source}+${id}`;
    const map = danCfg?.mappings?.find((m) => m.key === key);
    const provider = (map?.provider || danCfg?.defaultProvider || 'dandanplay') as 'dandanplay' | 'bilibili';

    const results = [] as Array<{ episode: number; imported: boolean; count?: number; reason?: string }>;
    for (const ep of episodes) {
      const res = await ensureEpisodeImported({
        source,
        id,
        episode: Number(ep),
        provider,
        externalId: map?.episodes?.[String(ep)],
        title: map?.aliasTitle || title,
      });
      results.push({ episode: Number(ep), ...res });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('admin danmaku trigger failed:', e);
    return NextResponse.json({ ok: false, error: 'internal-error' }, { status: 500 });
  }
}
