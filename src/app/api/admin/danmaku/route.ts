import { NextRequest, NextResponse } from 'next/server';

import { getConfig, setCachedConfig } from '@/lib/config';
import { SimpleCrypto } from '@/lib/crypto';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// GET: 获取 DanmakuImport 配置
export async function GET() {
  const config = await getConfig();
  const di = config.DanmakuImport || {} as Record<string, unknown>;
  // 不泄露加密内容，仅透出是否已配置
  const hasCookie = !!(di as { bilibiliCookieEncrypted?: string }).bilibiliCookieEncrypted;
  const { bilibiliCookieEncrypted: _omit, ...rest } = di as { [k: string]: unknown };
  return NextResponse.json({ ...rest, hasBilibiliCookie: hasCookie });
}

// POST: 覆盖 DanmakuImport 配置（仅 owner/admin 使用，鉴权沿用现有中间件约定）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = await getConfig();

    // 允许在 body.cookie 中接收明文 Cookie，并进行加密保存
    const { cookie, clearCookie, ...others } = body || {};
  const di = config.DanmakuImport || {};
  const nextDi: Record<string, unknown> = { ...di, ...others };

    const pass = process.env.PASSWORD || process.env.USERNAME || 'moontv';
    if (clearCookie) {
      nextDi.bilibiliCookieEncrypted = '';
    } else if (typeof cookie === 'string' && cookie.trim()) {
      nextDi.bilibiliCookieEncrypted = SimpleCrypto.encrypt(cookie.trim(), pass);
    }

    config.DanmakuImport = nextDi;
    await db.saveAdminConfig(config);
    // 刷新内存缓存
    setCachedConfig(config);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('save DanmakuImport config failed:', e);
    return NextResponse.json({ ok: false, error: 'save-failed' }, { status: 500 });
  }
}
