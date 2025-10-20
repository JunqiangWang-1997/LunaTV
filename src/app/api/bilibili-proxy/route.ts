/* eslint-disable no-console */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Bilibili API 代理端点
 * 用于绕过客户端的 412 反爬虫限制
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    console.log(`🔄 代理 Bilibili 请求: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      },
    });

    console.log(`✅ Bilibili 响应状态: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Bilibili API 错误: ${response.status}`, errorText.substring(0, 200));
      return NextResponse.json(
        { error: `Bilibili API error: ${response.status}`, details: errorText.substring(0, 200) },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // 返回数据，添加 CORS 头
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=3600', // 缓存 1 小时
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Proxy request failed';
    console.error('❌ 代理请求失败:', error);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
