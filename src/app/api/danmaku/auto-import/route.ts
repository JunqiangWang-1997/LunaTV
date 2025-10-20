/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  fetchFromBilibili,
  fetchFromDanDanPlay,
  findDanDanEpisodeId,
  searchBilibiliCid,
} from '@/lib/danmakuImport';
import { db } from '@/lib/db';

// 请求参数校验
const AutoImportSchema = z.object({
  source: z.string(),
  id: z.string(),
  episode: z.number().int().min(0),
  title: z.string(),
  year: z.string().optional(),
});

// 映射数据类型
interface CanonicalMapping {
  title: string;
  year?: string;
  seasonId: string;
  cid: string;
  provider: string;
  createdAt: number;
}

// Canonical 映射键
function canonicalMapKey(source: string, id: string) {
  return `danmaku:map:${source}:${id}`;
}

// 弹幕键
function danmakuKey(source: string, id: string, episode: number) {
  return `danmaku:${source}:${id}:${episode}`;
}

/**
 * POST /api/danmaku/auto-import
 * 自动查找并导入弹幕（Bilibili 优先）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params = AutoImportSchema.parse(body);
    const { source, id, episode, title, year } = params;

    console.log(`🤖 自动导入弹幕请求: ${title} - 第 ${episode + 1} 集`);

    // 第 1 步：检查是否已有弹幕
    const key = danmakuKey(source, id, episode);
    const existing = await db.zrange(key, 0, 0);
    if (Array.isArray(existing) && existing.length > 0) {
      console.log(`⏭️  弹幕已存在，跳过导入`);
      return NextResponse.json({
        ok: true,
        imported: false,
        reason: 'already-exists',
        message: '弹幕已存在',
      });
    }

    // 第 2 步：检查 canonical 映射
    const mapKey = canonicalMapKey(source, id);
    let mapping: CanonicalMapping | null = null;
    
    try {
      const mapData = await db.getString(mapKey);
      if (mapData) {
        mapping = JSON.parse(mapData) as CanonicalMapping;
        console.log(`📍 找到 canonical 映射:`, mapping);
      }
    } catch (err) {
      console.warn('⚠️  读取映射失败:', err);
    }

    let cid: string | null = null;

    // 第 3 步：如果有映射，尝试使用缓存的 season_id
    if (mapping?.seasonId && episode !== undefined) {
      try {
        console.log(`🔄 使用缓存的 season_id: ${mapping.seasonId}`);
        
        const detailUrl = `https://api.bilibili.com/pgc/view/web/season?season_id=${mapping.seasonId}`;
        const detailRes = await fetch(detailUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com',
          },
        });

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          const episodes = detailData?.result?.episodes || [];
          const targetEp = episodes[episode];
          
          if (targetEp?.cid) {
            cid = String(targetEp.cid);
            console.log(`✅ 从缓存获取 cid: ${cid}`);
          }
        }
      } catch (err) {
        console.warn('⚠️  使用缓存 season_id 失败:', err);
      }
    }

    // 第 4 步：优先尝试 DanDanPlay（不受反爬虫限制）
    if (!cid) {
      try {
        console.log(`🔍 尝试 DanDanPlay...`);
        const episodeId = await findDanDanEpisodeId(title, episode + 1); // 1-based

        if (episodeId) {
          console.log(`📥 从 DanDanPlay 导入 (episodeId: ${episodeId})...`);
          const ddpDanmakuList = await fetchFromDanDanPlay(episodeId);

          if (ddpDanmakuList.length > 0) {
            // 保存弹幕
            const members = ddpDanmakuList.map((d) => ({
              score: d.time,
              member: {
                ...d,
                imported: true,
                importTime: Date.now(),
              },
            }));

            await db.zadd(key, ...members);
            console.log(`✅ DanDanPlay 成功导入 ${ddpDanmakuList.length} 条弹幕`);

            return NextResponse.json({
              ok: true,
              imported: true,
              count: ddpDanmakuList.length,
              provider: 'dandanplay',
              message: `已自动加载 ${ddpDanmakuList.length} 条弹幕`,
            });
          }
        }
        console.log(`⚠️  DanDanPlay 未找到匹配`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.warn(`❌ DanDanPlay 失败: ${errorMessage}`);
      }
    }

    // 第 5 步：如果 DanDanPlay 失败，尝试 Bilibili
    if (!cid) {
      console.log(`🔍 搜索 Bilibili...`);
      cid = await searchBilibiliCid(title, year, episode);
      
      if (!cid) {
        console.warn('❌ 未找到匹配的 Bilibili 弹幕');
        return NextResponse.json({
          ok: false,
          imported: false,
          reason: 'not-found',
          message: '未找到 Bilibili 弹幕，可手动导入',
        }, { status: 404 });
      }
    }

    // 第 6 步：导入 Bilibili 弹幕
    console.log(`📥 导入 Bilibili 弹幕 (cid: ${cid})...`);
    const danmakuList = await fetchFromBilibili(cid);

    if (danmakuList.length === 0) {
      console.warn('⚠️  弹幕为空');
      return NextResponse.json({
        ok: false,
        imported: false,
        reason: 'empty',
        message: '弹幕数据为空',
      }, { status: 404 });
    }

    // 第 7 步：保存 Bilibili 弹幕到 Redis
    const members = danmakuList.map((d) => ({
      score: d.time,
      member: {
        ...d,
        imported: true,
        importTime: Date.now(),
      },
    }));

    await db.zadd(key, ...members);
    console.log(`✅ Bilibili 成功导入 ${danmakuList.length} 条弹幕`);

    // 第 8 步：更新 canonical 映射（如果是首次导入）
    if (!mapping) {
      try {
        // 重新搜索获取 season_id（用于后续集数）
        const searchUrl = `https://api.bilibili.com/x/web-interface/search/type?` +
          `keyword=${encodeURIComponent(title)}&search_type=media_bangumi`;

        const searchRes = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com',
          },
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const firstResult = searchData?.data?.result?.[0];
          const seasonId = firstResult?.season_id || firstResult?.media_id;

          if (seasonId) {
            const newMapping = {
              title,
              year,
              seasonId,
              cid,
              provider: 'bilibili',
              createdAt: Date.now(),
            };

            await db.setString(mapKey, JSON.stringify(newMapping));
            console.log(`✅ 创建 canonical 映射`);
          }
        }
      } catch (err) {
        console.warn('⚠️  创建映射失败（不影响导入）:', err);
      }
    }

    return NextResponse.json({
      ok: true,
      imported: true,
      count: danmakuList.length,
      provider: 'bilibili',
      message: `已自动加载 ${danmakuList.length} 条弹幕`,
    });

  } catch (error) {
    console.error('❌ 自动导入失败:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        ok: false,
        error: '参数错误',
        details: error.errors,
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '自动导入失败',
    }, { status: 500 });
  }
}
