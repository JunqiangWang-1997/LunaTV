/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { db } from './db';

// 弹幕提供商类型
export type DanmakuProvider = 'dandanplay' | 'bilibili';

export interface DanmakuItem {
  time: number;
  text: string;
  color?: string;
  mode?: 0 | 1; // 0=滚动, 1=顶部/底部
}

export interface EnsureImportParams {
  source: string;
  id: string;
  episode: number; // 0-based
  provider: DanmakuProvider;
  externalId?: string; // DanDanPlay episodeId 或 Bilibili cid
  title?: string; // 用于搜索匹配
}

// 存储键
function danmakuKey(source: string, id: string, episode: number) {
  return `danmaku:${source}:${id}:${episode}`;
}

export async function isEpisodeImported(
  source: string,
  id: string,
  episode: number
): Promise<boolean> {
  const key = danmakuKey(source, id, episode);
  const existing = await db.zrange(key, 0, 0);
  return Array.isArray(existing) && existing.length > 0;
}

export async function ensureEpisodeImported(params: EnsureImportParams): Promise<{
  imported: boolean;
  count?: number;
  reason?: string;
  error?: string;
}> {
  const { source, id, episode, provider } = params;

  // 已存在则跳过
  if (await isEpisodeImported(source, id, episode)) {
    console.log(`⏭️  弹幕已存在: ${source}:${id}:E${episode}`);
    return { imported: false, reason: 'already-exists' };
  }

  let list: DanmakuItem[] = [];

  try {
    if (provider === 'dandanplay') {
      // DanDanPlay 需要 API 认证（AppId + AppSecret）
      // 如果没有配置认证信息，返回错误提示
      const msg = 'DanDanPlay 需要 API 认证，请先配置 AppId 和 AppSecret，或使用 Bilibili';
      console.warn(`⚠️  ${msg}`);
      return { imported: false, reason: 'auth-required', error: msg };
      
      // 未来如果配置了认证，可以这样使用：
      // if (!params.externalId) {
      //   const foundId = await findDanDanEpisodeId(params.title || '', episode + 1);
      //   params.externalId = foundId;
      // }
      // if (params.externalId) {
      //   list = await fetchFromDanDanPlay(params.externalId);
      // }
    } else if (provider === 'bilibili') {
      if (!params.externalId) {
        const msg = 'B站弹幕需要提供 cid（在视频页面按F12，控制台输入 window.__INITIAL_STATE__.videoData.cid 获取）';
        console.warn(`⚠️  ${msg}`);
        return { imported: false, reason: 'cid-required', error: msg };
      }
      console.log(`🔍 Bilibili cid: ${params.externalId}`);
      list = await fetchFromBilibili(params.externalId);
    }
  } catch (e: any) {
    console.error('❌ 获取弹幕失败:', e);
    return { imported: false, reason: 'fetch-failed', error: e.message || String(e) };
  }

  if (!list.length) {
    console.warn('⚠️  弹幕为空');
    return { imported: false, reason: 'empty', error: '未获取到任何弹幕' };
  }

  const key = danmakuKey(source, id, episode);
  const members = list.map((d) => ({
    score: d.time,
    member: {
      ...d,
      imported: true,
      importTime: Date.now(),
    } as any,
  }));

  try {
    await db.zadd(key, ...members);
    console.log(`✅ 成功导入 ${list.length} 条弹幕到 ${key}`);
    return { imported: true, count: list.length };
  } catch (e: any) {
    console.error('❌ 保存弹幕失败:', e);
    return { imported: false, reason: 'save-failed', error: e.message };
  }
}

// ==================== DanDanPlay ====================

export async function fetchFromDanDanPlay(episodeId: string): Promise<DanmakuItem[]> {
  const url = `https://api.dandanplay.net/api/v2/comment/${episodeId}?withRelated=true&chConvert=1`;
  
  console.log(`📥 正在从 DanDanPlay 获取弹幕...`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`❌ DanDanPlay API 错误: ${response.status}`, text.slice(0, 200));
    throw new Error(`DanDanPlay API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.comments || !Array.isArray(data.comments)) {
    console.warn('⚠️  DanDanPlay 返回格式异常:', data);
    return [];
  }
  
  console.log(`✅ 获取到 ${data.comments.length} 条弹幕`);
  
  return data.comments.map((comment: any) => {
    const params = String(comment.p).split(',');
    const time = parseFloat(params[0]);
    const modeValue = parseInt(params[1]);
    const mode: 0 | 1 = [4, 5].includes(modeValue) ? 1 : 0; // 4/5=底部/顶部
    const colorInt = parseInt(params[2]);
    const color = `#${colorInt.toString(16).padStart(6, '0')}`;
    return { time, text: String(comment.m), color, mode } as DanmakuItem;
  });
}

export async function findDanDanEpisodeId(title: string, episodeOneBased: number): Promise<string | null> {
  const q = title.trim();
  if (!q) return null;
  
  const url = `https://api.dandanplay.net/api/v2/search/episodes?anime=${encodeURIComponent(q)}&episode=${episodeOneBased}`;
  
  console.log(`🔍 搜索 DanDanPlay: "${q}" 第 ${episodeOneBased} 集`);
  
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`❌ DanDanPlay 搜索失败: ${res.status}`, text.slice(0, 200));
    throw new Error(`DanDanPlay search error: ${res.status}`);
  }
  
  const data = await res.json();
  const animes: any[] = data.animes || [];
  
  console.log(`📚 找到 ${animes.length} 个候选`);
  
  if (!animes.length) {
    return null;
  }
  
  // 精确匹配集数
  for (const anime of animes) {
    const eps = Array.isArray(anime.episodes) ? anime.episodes : [];
    console.log(`  - ${anime.animeTitle}: ${eps.length} 集`);
    
    const found = eps.find((e: any) => 
      e.episodeTitle?.includes(`第${episodeOneBased}集`) ||
      e.episodeTitle?.includes(`第${episodeOneBased}话`) ||
      e.episodeTitle?.includes(`${episodeOneBased}`) ||
      e.episodeNo === episodeOneBased
    );
    
    if (found?.episodeId) {
      console.log(`✅ 匹配成功: ${anime.animeTitle} - ${found.episodeTitle} (${found.episodeId})`);
      return String(found.episodeId);
    }
  }
  
  // 兜底：只有一个结果且只有一集
  if (animes.length === 1) {
    const eps = animes[0].episodes || [];
    if (eps.length === 1 && eps[0]?.episodeId) {
      console.log(`✅ 兜底匹配: ${animes[0].animeTitle} (唯一候选)`);
      return String(eps[0].episodeId);
    }
  }
  
  console.warn('⚠️  未找到匹配的集数');
  return null;
}

// ==================== Bilibili ====================

/**
 * 搜索 Bilibili 番剧并提取指定集数的 cid
 * 注意：此函数设计为在客户端（浏览器）中运行，以利用浏览器的 Cookie 和环境
 * @param title 番剧标题
 * @param year 年份（可选，用于精确匹配）
 * @param episode 集数（0-based）
 * @returns cid 或 null
 */
export async function searchBilibiliCid(
  title: string,
  year?: string,
  episode?: number
): Promise<string | null> {
  try {
    const q = title.trim();
    if (!q) return null;

    console.log(`🔍 搜索 Bilibili 番剧: "${q}"${year ? ` (${year})` : ''}`);

    // 第 1 步：搜索番剧（客户端直接调用，利用浏览器环境绕过反爬虫）
    const searchUrl = `https://api.bilibili.com/x/web-interface/search/type?` +
      `keyword=${encodeURIComponent(q)}&search_type=media_bangumi`;

    const searchRes = await fetch(searchUrl, {
      credentials: 'omit', // 不发送 Cookie（避免 CORS 问题）
      mode: 'cors',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!searchRes.ok) {
      console.error(`❌ Bilibili 搜索 API 错误: ${searchRes.status}`);
      return null;
    }

    const searchData = await searchRes.json();
    const results = searchData?.data?.result || [];

    if (results.length === 0) {
      console.warn('⚠️  未找到匹配的番剧');
      return null;
    }

    console.log(`📚 找到 ${results.length} 个候选番剧`);

    // 第 2 步：智能匹配最佳结果
    let bestMatch = results[0];

    // 年份匹配优化
    if (year) {
      const yearNum = parseInt(year);
      const withYear = results.find((r: any) => {
        const pubdate = r.pubdate || r.pubtime || '';
        return pubdate.includes(String(yearNum));
      });
      if (withYear) {
        bestMatch = withYear;
        console.log(`✅ 年份匹配: ${bestMatch.title} (${year})`);
      }
    }

    // 第 3 步：获取番剧详情和分集信息
    const seasonId = bestMatch.season_id || bestMatch.media_id;
    if (!seasonId) {
      console.error('❌ 未找到 season_id');
      return null;
    }

    console.log(`📖 获取番剧详情: ${bestMatch.title} (season_id: ${seasonId})`);

    const detailUrl = `https://api.bilibili.com/pgc/view/web/season?season_id=${seasonId}`;
    
    const detailRes = await fetch(detailUrl, {
      credentials: 'omit',
      mode: 'cors',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!detailRes.ok) {
      console.error(`❌ Bilibili 详情 API 错误: ${detailRes.status}`);
      return null;
    }

    const detailData = await detailRes.json();
    const episodes = detailData?.result?.episodes || [];

    if (episodes.length === 0) {
      console.warn('⚠️  番剧没有分集信息');
      return null;
    }

    console.log(`📺 共 ${episodes.length} 集`);

    // 第 4 步：提取目标集数的 cid
    if (episode !== undefined) {
      const targetEp = episodes[episode];
      if (!targetEp) {
        console.warn(`⚠️  第 ${episode + 1} 集不存在`);
        return null;
      }

      const cid = targetEp.cid;
      if (!cid) {
        console.error('❌ 目标集数没有 cid');
        return null;
      }

      console.log(`✅ 找到第 ${episode + 1} 集 cid: ${cid} (${targetEp.title || ''})`);
      return String(cid);
    }

    // 如果没有指定集数，返回第 1 集的 cid
    const firstCid = episodes[0]?.cid;
    if (firstCid) {
      console.log(`✅ 返回第 1 集 cid: ${firstCid}`);
      return String(firstCid);
    }

    return null;
  } catch (error: any) {
    console.error('❌ 搜索 Bilibili cid 失败:', error);
    return null;
  }
}

export async function fetchFromBilibili(cid: string): Promise<DanmakuItem[]> {
  console.log(`📥 正在从 Bilibili 获取弹幕...`);
  
  // 尝试旧版 XML API
  const url = `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com',
    },
  });
  
  if (!response.ok) {
    console.error(`❌ Bilibili API 错误: ${response.status}`);
    throw new Error(`Bilibili API error: ${response.status}`);
  }
  
  const xmlText = await response.text();
  const danmakuRegex = /<d p="([^"]+)">([^<]+)<\/d>/g;
  const list: DanmakuItem[] = [];
  let match: RegExpExecArray | null;
  
  while ((match = danmakuRegex.exec(xmlText)) !== null) {
    const params = match[1].split(',');
    const time = parseFloat(params[0]);
    const modeValue = parseInt(params[1]);
    const mode: 0 | 1 = [4, 5].includes(modeValue) ? 1 : 0; // 4/5=底部/顶部
    const colorInt = parseInt(params[2]);
    const color = `#${colorInt.toString(16).padStart(6, '0')}`;
    const text = match[2];
    list.push({ time, text, color, mode });
  }
  
  console.log(`✅ 从 Bilibili 获取到 ${list.length} 条弹幕`);
  return list;
}
