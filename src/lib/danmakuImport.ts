/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { createHash } from 'node:crypto';

import { getConfig } from './config';
import { SimpleCrypto } from './crypto';
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

// 统一的 Bilibili 请求头（可选使用 Cookie 提高成功率）
async function getBiliHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.bilibili.com',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  const envCookie = process.env.BILIBILI_COOKIE?.trim();
  if (envCookie) {
    headers.Cookie = envCookie;
    return headers;
  }
  // 尝试从管理员配置读取加密的 Cookie（仅在服务端使用）
  try {
    const cfg = await getConfig();
    const enc = cfg.DanmakuImport?.bilibiliCookieEncrypted;
    if (enc) {
      const pass = process.env.PASSWORD || process.env.USERNAME || 'moontv';
      const cookie = SimpleCrypto.decrypt(enc, pass);
      if (cookie) headers.Cookie = cookie;
    }
  } catch {
    // 忽略解密失败
  }
  return headers;
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

// WBI 签名算法实现（用于绕过 B 站 Web 接口签名校验）
// 参考社区实现：通过 /x/web-interface/nav 获取 wbi_img，计算 mixinKey，然后对参数进行签名

// 混淆表（固定常量）
const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 20, 34, 36, 44, 52,
];

let wbiCache: { imgKey: string; subKey: string; ts: number } | null = null;

function getMixinKey(orig: string): string {
  const res = mixinKeyEncTab.map((i) => orig[i]).join('');
  return res.slice(0, 32);
}

function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

function filterWbiChars(s: string): string {
  // 过滤特殊字符，保持与前端一致
  return s.replace(/[!'()*]/g, '');
}

function buildQuery(params: Record<string, string | number | boolean>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string } | null> {
  const now = Date.now();
  if (wbiCache && now - wbiCache.ts < 6 * 60 * 60 * 1000) {
    return { imgKey: wbiCache.imgKey, subKey: wbiCache.subKey };
  }

  try {
    const url = 'https://api.bilibili.com/x/web-interface/nav';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (!res.ok) {
      console.warn('⚠️  获取 WBI Key 失败:', res.status);
      return null;
    }

    const data = await res.json();
    const imgUrl: string | undefined = data?.data?.wbi_img?.img_url;
    const subUrl: string | undefined = data?.data?.wbi_img?.sub_url;
    if (!imgUrl || !subUrl) return null;

    const imgKeyMatch = /\/([a-zA-Z0-9]+)\.(?:png|jpg)$/.exec(imgUrl);
    const subKeyMatch = /\/([a-zA-Z0-9]+)\.(?:png|jpg)$/.exec(subUrl);
    const imgKey = imgKeyMatch?.[1];
    const subKey = subKeyMatch?.[1];
    if (!imgKey || !subKey) return null;

    wbiCache = { imgKey, subKey, ts: now };
    return { imgKey, subKey };
  } catch (e) {
    console.warn('⚠️  获取 WBI Key 异常:', e);
    return null;
  }
}

async function signWbiParams(
  params: Record<string, string | number | boolean>
): Promise<Record<string, string | number | boolean>> {
  const keys = await getWbiKeys();
  if (!keys) return params; // 回退：不签名（可能被 412 拦截）

  const mixinKey = getMixinKey(keys.imgKey + keys.subKey);
  const wts = Math.floor(Date.now() / 1000);

  // 过滤特殊字符
  const filtered: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    filtered[k] = typeof v === 'string' ? filterWbiChars(v) : v;
  }
  filtered.wts = wts;

  const qs = Object.keys(filtered)
    .sort()
    .map((k) => `${k}=${filtered[k as keyof typeof filtered]}`)
    .join('&');

  const wRid = md5(qs + mixinKey);
  return { ...filtered, w_rid: wRid };
}

/**
 * 搜索 Bilibili 番剧并提取指定集数的 cid
 * 尝试通过 API 搜索番剧并获取对应集数的 cid
 * @param title 番剧标题
 * @param year 年份(可选,用于精确匹配)
 * @param episode 集数(0-based)
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

    // 使用带 WBI 签名的搜索接口
    const baseUrl = 'https://api.bilibili.com/x/web-interface/wbi/search/type';
    const rawParams: Record<string, string | number | boolean> = {
      keyword: q,
      search_type: 'media_bangumi',
    };
    const signed = await signWbiParams(rawParams);
    const searchUrl = `${baseUrl}?${buildQuery(signed)}`;

  const searchRes = await fetch(searchUrl, { headers: await getBiliHeaders() });

    if (!searchRes.ok) {
      console.error(`❌ Bilibili 搜索 API 返回: ${searchRes.status}`);
      return null;
    }

    const searchData = await searchRes.json();
    const results = searchData?.data?.result || [];

    if (!Array.isArray(results) || results.length === 0) {
      console.warn('⚠️  未找到匹配的番剧');
      return null;
    }

    console.log(`📚 找到 ${results.length} 个候选番剧`);

    // 智能匹配
    let bestMatch: any = results[0];

    if (year) {
      const yearNum = parseInt(year);
      const withYear = results.find((r: any) => {
        const pubdate = String(r.pubdate ?? r.pubtime ?? '');
        return pubdate.includes(String(yearNum));
      });
      if (withYear) {
        bestMatch = withYear;
        console.log(`✅ 年份匹配: ${bestMatch.title} (${year})`);
      }
    }

    const seasonId = bestMatch.season_id || bestMatch.media_id;
    if (!seasonId) {
      console.error('❌ 未找到 season_id');
      return null;
    }

    console.log(`📖 获取番剧详情 (season_id: ${seasonId})`);

    const detailUrl = `https://api.bilibili.com/pgc/view/web/season?season_id=${seasonId}`;
  const detailRes = await fetch(detailUrl, { headers: await getBiliHeaders() });

    if (!detailRes.ok) {
      console.error(`❌ Bilibili 详情 API 返回: ${detailRes.status}`);
      return null;
    }

    const detailData = await detailRes.json();
    const episodes = detailData?.result?.episodes || [];

    if (episodes.length === 0) {
      console.warn('⚠️  番剧没有分集信息');
      return null;
    }

    console.log(`📺 共 ${episodes.length} 集`);

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

      console.log(`✅ 找到第 ${episode + 1} 集 cid: ${cid}`);
      return String(cid);
    }

    const firstCid = episodes[0]?.cid;
    if (firstCid) {
      console.log(`✅ 返回第 1 集 cid: ${firstCid}`);
      return String(firstCid);
    }

    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ 搜索失败:', errorMessage);
    return null;
  }
}

export async function fetchFromBilibili(cid: string): Promise<DanmakuItem[]> {
  console.log(`� 正在从 Bilibili 获取弹幕...`);
  
  // 尝试旧版 XML API
  const url = `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`;
  
  const response = await fetch(url, { headers: await getBiliHeaders() });
  
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
    const colorInt = parseInt(params[3]);
    const color = `#${colorInt.toString(16).padStart(6, '0')}`;
    
    list.push({
      time,
      text: match[2],
      color,
      mode,
    });
  }
  
  console.log(`✅ 成功获取 ${list.length} 条弹幕`);
  return list;
}
