import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildCanonicalSlug } from '@/lib/danmaku.util';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 定义弹幕数据的前端验证模型
const danmakuPostSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  id: z.string().min(1, 'ID is required'),
  episode: z.number().int().min(0, 'Episode index must be a non-negative integer'),
  danmaku: z.object({
    time: z.number(),
    text: z.string().min(1).max(100),
    color: z.string().optional(),
    mode: z.union([z.literal(0), z.literal(1)]).optional(),
  }),
});

// 定义获取弹幕的查询参数验证模型
const danmakuGetSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  id: z.string().min(1, 'ID is required'),
  episode: z.coerce.number().int().min(0, 'Episode index must be a non-negative integer'),
});

/**
 * GET handler for fetching all danmaku for a video.
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const validation = danmakuGetSchema.safeParse({
      source: searchParams.get('source'),
      id: searchParams.get('id'),
      episode: searchParams.get('episode'),
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { source, id, episode } = validation.data;

    // 1) 先尝试读取来源特定键
    const danmakuKey = `danmaku:${source}:${id}:${episode}`;
    let danmakus = await db.zrange(danmakuKey, 0, -1);

    // 2) 如果为空，使用 provider->slug 的映射进行 canonical 回退
    if (!danmakus || danmakus.length === 0) {
      const mapKey = `danmaku:map:${source}:${id}`; // 值为 JSON: { title, year, slug }
      try {
        const mapVal = await db.getString(mapKey);
        if (mapVal) {
          try {
            const parsed = JSON.parse(mapVal) as { title?: string; year?: string; slug?: string };
            let slug = parsed.slug;
            if (!slug) slug = buildCanonicalSlug(parsed.title, parsed.year) || undefined;
            if (slug) {
              const canonicalKey = `danmaku:canonical:${slug}:${episode}`;
              danmakus = await db.zrange(canonicalKey, 0, -1);
              if (danmakus && danmakus.length) {
                // eslint-disable-next-line no-console
                console.log(`🔁 命中 canonical 回退: ${canonicalKey} -> 返回 ${danmakus.length} 条`);
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('解析 danmaku 映射失败:', e);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('读取 danmaku 映射失败:', e);
      }
    }

    return NextResponse.json(danmakus);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch danmaku:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST handler for saving a new danmaku comment.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = danmakuPostSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { source, id, episode, danmaku } = validation.data;

    // 构造用于存储弹幕的唯一键
    const danmakuKey = `danmaku:${source}:${id}:${episode}`;

    const danmakuToSave = {
      ...danmaku,
      // 可以在这里添加服务端时间戳或用户ID等额外信息
      serverTime: Date.now(),
    };

    // 使用 Sorted Set (zadd) 存储弹幕
    // upstash.db.ts 会自动将 member 对象序列化为 JSON 字符串
    await db.zadd(danmakuKey, {
      score: danmaku.time,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      member: danmakuToSave as any, // 类型断言：实际存储时会被序列化
    });

    return NextResponse.json({ ok: true, message: 'Danmaku saved' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save danmaku:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
