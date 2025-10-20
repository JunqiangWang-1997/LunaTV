import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { buildCanonicalSlug } from '@/lib/danmaku.util';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 定义导入请求的验证模型
const importDanmakuSchema = z.object({
  source: z.string().min(1, 'Source is required'),
  videoId: z.string().min(1, 'Video ID is required'),
  episodeIndex: z.number().int().min(0, 'Episode index must be a non-negative integer'),
  // 支持 DanDanPlay 和 Bilibili
  danmakuSource: z.enum(['dandanplay', 'bilibili']),
  // DanDanPlay episodeId 或 B站 cid
  externalId: z.string().min(1, 'External ID is required'),
  // 用于生成跨源共享的规范化键（可选）
  title: z.string().optional(),
  year: z.string().optional(),
});

/**
 * POST handler for importing danmaku from external sources.
 * 支持 DanDanPlay 和 Bilibili
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = importDanmakuSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400 }
      );
    }

  const { source, videoId, episodeIndex, danmakuSource, externalId, title, year } = validation.data;

    let importedDanmakus: Array<{
      time: number;
      text: string;
      color?: string;
      mode?: 0 | 1;
    }> = [];

    // 根据不同的来源获取弹幕
    if (danmakuSource === 'dandanplay') {
      importedDanmakus = await fetchFromDanDanPlay(externalId);
    } else if (danmakuSource === 'bilibili') {
      importedDanmakus = await fetchFromBilibili(externalId);
    }

    if (importedDanmakus.length === 0) {
      return NextResponse.json(
        { error: `No danmaku found from ${danmakuSource}` },
        { status: 404 }
      );
    }

  // 批量导入到 Redis（来源特定键）
  const danmakuKey = `danmaku:${source}:${videoId}:${episodeIndex}`;

    // eslint-disable-next-line no-console
    console.log(`📥 导入弹幕到: ${danmakuKey}, 共 ${importedDanmakus.length} 条`);
    
    // 使用 zadd 批量添加（按时间排序）
    const members = importedDanmakus.map(danmaku => ({
      score: danmaku.time,
      member: {
        ...danmaku,
        imported: true,
        importTime: Date.now(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    await db.zadd(danmakuKey, ...members);

    // 如果提供了标题或可从配置映射中推导出别名，则同时写入规范化键，便于跨源共享
    try {
      const slug = buildCanonicalSlug(title, year);
      if (slug) {
        const canonicalKey = `danmaku:canonical:${slug}:${episodeIndex}`;
        await db.zadd(canonicalKey, ...members);
        // eslint-disable-next-line no-console
        console.log(`🔗 同步写入规范化键: ${canonicalKey}`);

        // 写入 provider->slug 的映射，便于读取端回退
        const mapKey = `danmaku:map:${source}:${videoId}`;
        await db.setString(mapKey, JSON.stringify({ title, year, slug }));
        // eslint-disable-next-line no-console
        console.log(`🗺️  记录映射: ${mapKey} -> ${slug}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('写入规范化键或映射失败（忽略）:', e);
    }

    // eslint-disable-next-line no-console
    console.log(`✅ 成功导入弹幕到 ${danmakuKey}`);

    return NextResponse.json({
      ok: true,
      message: `Danmaku imported successfully from ${danmakuSource}`,
      count: importedDanmakus.length,
      source: danmakuSource,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to import danmaku:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


/**
 * 从 DanDanPlay 获取弹幕
 * 注意：需要 AppId 和 AppSecret 认证
 */
async function fetchFromDanDanPlay(episodeId: string) {
  try {
    // TODO: 添加 AppId/AppSecret 认证
    // 目前暂时返回空数组，提示需要认证
    // eslint-disable-next-line no-console
    console.warn('⚠️  DanDanPlay API 需要认证，请配置 AppId 和 AppSecret');
    
    const response = await fetch(`https://api.dandanplay.net/api/v2/comment/${episodeId}`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`DanDanPlay API error: ${response.status}`);
    }

    const data = await response.json();
    
    // DanDanPlay 弹幕格式：
    // { "comments": [{ "cid": "xxx", "p": "time,mode,color,...", "m": "text" }] }
    if (!data.comments || !Array.isArray(data.comments)) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.comments.map((comment: any) => {
      const params = comment.p.split(',');
      const time = parseFloat(params[0]);
      const modeValue = parseInt(params[1]);
      const mode: 0 | 1 = modeValue === 4 ? 1 : 0; // 4=底部, 其他=滚动
      const color = `#${parseInt(params[2]).toString(16).padStart(6, '0')}`;

      return {
        time,
        text: comment.m,
        color,
        mode,
      };
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch from DanDanPlay:', error);
    return [];
  }
}

/**
 * 从 B站 获取弹幕（需要 cid）
 */
async function fetchFromBilibili(cid: string) {
  try {
    // B站弹幕 API（XML 格式）
    const response = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });

    if (!response.ok) {
      throw new Error(`Bilibili API error: ${response.status}`);
    }

    const xmlText = await response.text();
    
    // eslint-disable-next-line no-console
    console.log(`📦 获取到 Bilibili XML 响应，长度: ${xmlText.length}`);
    
    // 先输出前几条原始数据看看格式
    const sampleRegex = /<d p="([^"]+)">([^<]+)<\/d>/;
    const sampleMatch = xmlText.match(sampleRegex);
    if (sampleMatch) {
      // eslint-disable-next-line no-console
      console.log(`📋 样例弹幕原始数据: p="${sampleMatch[1]}", text="${sampleMatch[2]}"`);
      const sampleParams = sampleMatch[1].split(',');
      // eslint-disable-next-line no-console
      console.log(`📋 参数详情: [0]time=${sampleParams[0]}, [1]mode=${sampleParams[1]}, [2]size=${sampleParams[2]}, [3]color=${sampleParams[3]}, [4]timestamp=${sampleParams[4]}`);
    }
    
    // 解析 XML 弹幕
    // B站弹幕格式：<d p="time,mode,size,color,timestamp,pool,userid,dmid">text</d>
    // 参数位置: [0]time, [1]mode, [2]size, [3]color, [4]timestamp...
    const danmakuRegex = /<d p="([^"]+)">([^<]+)<\/d>/g;
    const danmakus = [];
    let match;
    const colorStats: Record<string, number> = {};

    while ((match = danmakuRegex.exec(xmlText)) !== null) {
      const params = match[1].split(',');
      const time = parseFloat(params[0]);
      const modeValue = parseInt(params[1]);
      const mode: 0 | 1 = modeValue === 4 || modeValue === 5 ? 1 : 0; // 4=底部, 5=顶部, 其他=滚动
      const colorInt = parseInt(params[3]); // ← 修改：颜色在第3个参数（索引3）
      
      // B站颜色是十进制整数，需要转换为十六进制
      // 16777215 = 0xFFFFFF (白色), 16711680 = 0xFF0000 (红色)
      let color = '#FFFFFF'; // 默认白色
      if (colorInt >= 0) {
        const hex = colorInt.toString(16).padStart(6, '0').toUpperCase();
        color = `#${hex}`;
      }
      
      // 统计颜色分布
      colorStats[color] = (colorStats[color] || 0) + 1;
      
      const text = match[2];

      danmakus.push({
        time,
        text,
        color,
        mode,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`🎨 弹幕颜色分布:`, Object.entries(colorStats).sort((a, b) => b[1] - a[1]).slice(0, 5));
    // eslint-disable-next-line no-console
    console.log(`✅ 解析出 ${danmakus.length} 条弹幕`);

    return danmakus;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch from Bilibili:', error);
    return [];
  }
}

/**
 * GET handler for searching DanDanPlay episodes.
 * 帮助用户找到对应的 episodeId
 * 注意：需要 AppId 和 AppSecret 认证
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const anime = searchParams.get('anime');
    const episode = searchParams.get('episode');

    if (!anime) {
      return NextResponse.json(
        { error: 'Missing anime parameter' },
        { status: 400 }
      );
    }

    // TODO: 添加 AppId/AppSecret 认证
    // eslint-disable-next-line no-console
    console.warn('⚠️  DanDanPlay API 需要认证，请配置 AppId 和 AppSecret');

    // 搜索番剧
    const searchResponse = await fetch(
      `https://api.dandanplay.net/api/v2/search/episodes?anime=${encodeURIComponent(anime)}${episode ? `&episode=${episode}` : ''}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`DanDanPlay search error: ${searchResponse.status}`);
    }

    const data = await searchResponse.json();

    return NextResponse.json({
      ok: true,
      results: data.animes || [],
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to search DanDanPlay:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
