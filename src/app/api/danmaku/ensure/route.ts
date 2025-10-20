import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { ensureEpisodeImported } from '@/lib/danmaku.import';
import { buildCanonicalSlug } from '@/lib/danmaku.util';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// POST { source,id,episode,title? }
export async function POST(req: NextRequest) {
  try {
    const { source, id, episode, title } = await req.json();
    if (!source || !id || !episode) {
      return NextResponse.json({ ok: false, error: 'missing-params' }, { status: 400 });
    }

    const config = await getConfig();
    const danCfg = config.DanmakuImport;
    const key = `${source}+${id}`;
    const map = danCfg?.mappings?.find((m) => m.key === key);

    const res = await ensureEpisodeImported({
      source,
      id,
      episode: Number(episode),
      provider: (map?.provider || danCfg?.defaultProvider || 'bilibili') as 'dandanplay' | 'bilibili',
      externalId: map?.episodes?.[String(episode)],
      title: map?.aliasTitle || title,
    });
    // 写映射（仅在有标题时），以便读取端 canonical 回退
    try {
      const slug = buildCanonicalSlug(map?.aliasTitle || title, undefined);
      if (slug) {
        const mapKey = `danmaku:map:${source}:${id}`;
        await db.setString(mapKey, JSON.stringify({ title: map?.aliasTitle || title, year: undefined, slug }));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('写入 danmaku 映射失败（忽略）:', e);
    }

    return NextResponse.json({ ok: true, result: res });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('ensure danmaku failed:', e);
    return NextResponse.json({ ok: false, error: 'internal-error' }, { status: 500 });
  }
}
