/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const SettingsSchema = z.object({
  opacity: z.number().min(0).max(1),
  fontSize: z.number().min(10).max(80),
  areaBottom: z.union([z.string(), z.number()]),
  speed: z.number().min(1).max(10),
  synchronousPlayback: z.boolean(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthInfoFromCookie(request);
    if (!auth?.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 非站长也可读写个人设置，但仍校验账号存在/未封禁
    const cfg = await getConfig();
    if (auth.username !== process.env.USERNAME) {
      const user = cfg.UserConfig.Users.find((u) => u.username === auth.username);
      if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      if (user.banned) return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
    }

    const settings = await db.getDanmakuSettings(auth.username);
    return NextResponse.json(settings || null);
  } catch (err) {
    console.error('获取弹幕设置失败:', err);
    return NextResponse.json({ error: '获取弹幕设置失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthInfoFromCookie(request);
    if (!auth?.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const cfg = await getConfig();
    if (auth.username !== process.env.USERNAME) {
      const user = cfg.UserConfig.Users.find((u) => u.username === auth.username);
      if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      if (user.banned) return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = SettingsSchema.parse(body);

    await db.setDanmakuSettings(auth.username, parsed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('保存弹幕设置失败:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: '参数错误', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ error: '保存弹幕设置失败' }, { status: 500 });
  }
}
