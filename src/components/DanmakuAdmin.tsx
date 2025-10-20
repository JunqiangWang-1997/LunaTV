/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
'use client';

import { useEffect, useMemo, useState } from 'react';

type Provider = 'dandanplay' | 'bilibili';

interface MappingItem {
  key: string; // `${source}+${id}`
  provider?: Provider;
  episodes?: Record<string, string>; // episode(1-based) -> externalId
  aliasTitle?: string;
}

interface DanmakuImportConfig {
  defaultProvider?: Provider;
  mappings?: MappingItem[];
  autoImportEnabled?: boolean;
  hasBilibiliCookie?: boolean;
}

const btn = {
  primary: 'px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors',
  danger: 'px-3 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors',
  secondary: 'px-3 py-1.5 text-sm font-medium bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors',
};

export default function DanmakuAdmin() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<DanmakuImportConfig>({
    autoImportEnabled: true,
    defaultProvider: 'dandanplay',
    mappings: [],
  });

  const [newMap, setNewMap] = useState<MappingItem>({ key: '', provider: undefined, aliasTitle: '', episodes: {} });
  const [episodesText, setEpisodesText] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/danmaku');
        const data = await res.json();
        setConfig({
          autoImportEnabled: data.autoImportEnabled ?? true,
          defaultProvider: (data.defaultProvider as Provider) ?? 'dandanplay',
          mappings: Array.isArray(data.mappings) ? data.mappings : [],
          hasBilibiliCookie: !!data.hasBilibiliCookie,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('加载弹幕导入配置失败:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveConfig = async (next: DanmakuImportConfig) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(await res.text());
      setConfig(next);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('保存弹幕导入配置失败:', e);
    } finally {
      setSaving(false);
    }
  };

  // Cookie 表单状态（不回显明文）
  const [cookieInput, setCookieInput] = useState('');
  const [cookieBusy, setCookieBusy] = useState(false);

  const saveCookie = async () => {
    if (!cookieInput.trim()) return;
    setCookieBusy(true);
    try {
      const res = await fetch('/api/admin/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: cookieInput.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setConfig((c) => ({ ...c, hasBilibiliCookie: true }));
      setCookieInput('');
    } catch (e) {
      console.error('保存 Cookie 失败:', e);
    } finally {
      setCookieBusy(false);
    }
  };

  const clearCookie = async () => {
    setCookieBusy(true);
    try {
      const res = await fetch('/api/admin/danmaku', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearCookie: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      setConfig((c) => ({ ...c, hasBilibiliCookie: false }));
    } catch (e) {
      console.error('清除 Cookie 失败:', e);
    } finally {
      setCookieBusy(false);
    }
  };

  const onToggleAuto = () => {
    const next = { ...config, autoImportEnabled: !config.autoImportEnabled };
    void saveConfig(next);
  };

  const onProviderChange = (p: Provider) => {
    const next = { ...config, defaultProvider: p };
    void saveConfig(next);
  };

  const addOrUpdateMapping = async () => {
    if (!newMap.key.trim()) return;
    let episodes: Record<string, string> | undefined = undefined;
    if (episodesText.trim()) {
      try {
        episodes = JSON.parse(episodesText);
      } catch {
        // eslint-disable-next-line no-console
        console.error('episodes JSON 解析失败');
        return;
      }
    }
    const item: MappingItem = {
      key: newMap.key.trim(),
      provider: newMap.provider,
      aliasTitle: newMap.aliasTitle?.trim() || undefined,
      episodes,
    };
    const filtered = (config.mappings || []).filter((m) => m.key !== item.key);
    const next = { ...config, mappings: [...filtered, item] };
    await saveConfig(next);
    setNewMap({ key: '', provider: undefined, aliasTitle: '', episodes: {} });
    setEpisodesText('');
  };

  const removeMapping = async (key: string) => {
    const next = { ...config, mappings: (config.mappings || []).filter((m) => m.key !== key) };
    await saveConfig(next);
  };

  const sortedMappings = useMemo(() => {
    return [...(config.mappings || [])].sort((a, b) => a.key.localeCompare(b.key));
  }, [config.mappings]);

  if (loading) return null;

  return (
    <div className="rounded-xl shadow-sm overflow-hidden bg-white/80 backdrop-blur-md dark:bg-gray-800/50 dark:ring-1 dark:ring-gray-700">
      <div className="px-6 py-4 flex items-center justify-between bg-gray-50/70 dark:bg-gray-800/60">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">弹幕导入配置</h3>
        {saving && (
          <span className="text-sm text-gray-500">保存中…</span>
        )}
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Bilibili Cookie 配置（仅服务端使用，不回显） */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/30">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Bilibili Cookie（服务端可选）</h4>
            <span className="text-xs text-gray-500">{config.hasBilibiliCookie ? '已配置' : '未配置'}</span>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">用于提升 B 站弹幕抓取成功率。仅保存在服务器端（加密），不会下发到浏览器。</p>
          <div className="flex flex-col md:flex-row gap-2">
            <input
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="SESSDATA=...; buvid3=...; buvid4=...; b_nut=..."
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
            />
            <div className="flex gap-2">
              <button disabled={!cookieInput.trim() || cookieBusy} onClick={saveCookie} className={cookieBusy || !cookieInput.trim() ? btn.secondary : btn.primary}>
                {cookieBusy ? '保存中...' : '保存 Cookie'}
              </button>
              <button disabled={!config.hasBilibiliCookie || cookieBusy} onClick={clearCookie} className={btn.danger}>
                清除 Cookie
              </button>
            </div>
          </div>
        </div>
        {/* 开关与默认提供商 */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center cursor-pointer select-none">
              <input type="checkbox" className="sr-only" checked={!!config.autoImportEnabled} onChange={onToggleAuto} />
              <div className={`w-12 h-6 rounded-full transition-colors ${config.autoImportEnabled ? 'bg-green-600' : 'bg-gray-400'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mt-0.5 ${config.autoImportEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
              <span className="ml-3 text-sm text-gray-800 dark:text-gray-200">启用自动导入</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">默认提供商：</span>
            <select
              value={config.defaultProvider}
              onChange={(e) => onProviderChange(e.target.value as Provider)}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="dandanplay">DanDanPlay</option>
              <option value="bilibili">Bilibili</option>
            </select>
          </div>
        </div>

        {/* 映射列表 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">映射列表</h4>
            <span className="text-xs text-gray-500">共 {sortedMappings.length} 条</span>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">key(source+id)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">provider</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">aliasTitle</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">episodes(条数)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedMappings.map((m) => (
                  <tr key={m.key}>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{m.key}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{m.provider || '-'}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{m.aliasTitle || '-'}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{m.episodes ? Object.keys(m.episodes).length : 0}</td>
                    <td className="px-4 py-2 text-right">
                      <button className={btn.danger} onClick={() => removeMapping(m.key)}>删除</button>
                    </td>
                  </tr>
                ))}
                {sortedMappings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">暂无映射</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 新增/更新映射 */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">新增/更新映射</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <input
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="key: source+id"
              value={newMap.key}
              onChange={(e) => setNewMap((p) => ({ ...p, key: e.target.value }))}
            />
            <select
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              value={newMap.provider || ''}
              onChange={(e) => setNewMap((p) => ({ ...p, provider: (e.target.value || undefined) as Provider | undefined }))}
            >
              <option value="">继承默认</option>
              <option value="dandanplay">DanDanPlay</option>
              <option value="bilibili">Bilibili</option>
            </select>
            <input
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="别名标题(用于搜索)"
              value={newMap.aliasTitle || ''}
              onChange={(e) => setNewMap((p) => ({ ...p, aliasTitle: e.target.value }))}
            />
            <button className={btn.primary} onClick={addOrUpdateMapping}>保存映射</button>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">按集 externalId 映射(JSON)：例如 {`{"1":"12345","2":"67890"}`}</label>
            <textarea
              className="w-full h-28 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-xs"
              placeholder='{"1":"episodeId-or-cid"}'
              value={episodesText}
              onChange={(e) => setEpisodesText(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
