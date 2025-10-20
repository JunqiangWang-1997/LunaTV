'use client';

import { useState } from 'react';

interface DanmakuImportProps {
  source: string;
  videoId: string;
  episodeIndex: number;
  animeTitle: string;
  onClose?: () => void;
}

type DanmakuSource = 'bilibili' | 'dandanplay';

export default function DanmakuImport({
  source,
  videoId,
  episodeIndex,
  animeTitle,
  onClose,
}: DanmakuImportProps) {
  const [danmakuSource, setDanmakuSource] = useState<DanmakuSource>('bilibili');
  const [externalId, setExternalId] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleImport = async () => {
    if (!externalId.trim()) {
      setError(danmakuSource === 'bilibili' ? '请输入 Bilibili cid' : '请输入 DanDanPlay episodeId');
      return;
    }

    setImporting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/danmaku/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          videoId,
          episodeIndex,
          danmakuSource,
          externalId: externalId.trim(),
          title: animeTitle || undefined,
          // year 如果页面可用可以从 URL 取，这里留空让后端仍可生成 slug（仅标题）
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '导入失败');
      }

      setSuccess(`成功导入 ${data.count || 0} 条弹幕`);
      setTimeout(() => {
        window.location.reload(); // 重新加载页面以显示新弹幕
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              导入弹幕 - Bilibili
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              当前剧集：<span className="font-semibold">{animeTitle}</span>
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              集数：第 {episodeIndex + 1} 集
            </p>
          </div>

          {/* 弹幕源选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              弹幕来源
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="bilibili"
                  checked={danmakuSource === 'bilibili'}
                  onChange={(e) => {
                    setDanmakuSource(e.target.value as DanmakuSource);
                    setExternalId('');
                    setError('');
                  }}
                  className="mr-2"
                  disabled={importing}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Bilibili</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="dandanplay"
                  checked={danmakuSource === 'dandanplay'}
                  onChange={(e) => {
                    setDanmakuSource(e.target.value as DanmakuSource);
                    setExternalId('');
                    setError('');
                  }}
                  className="mr-2"
                  disabled={importing}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  DanDanPlay <span className="text-xs text-yellow-600 dark:text-yellow-400">(需要认证)</span>
                </span>
              </label>
            </div>
          </div>

          {/* Bilibili 说明 */}
          {danmakuSource === 'bilibili' && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                📖 如何获取 Bilibili cid？
              </h3>
              
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-3">
                <div>
                  <strong className="block mb-1">方法 1：从控制台获取（推荐）</strong>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>在 Bilibili 打开对应剧集的视频页面</li>
                    <li>按 <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border text-xs">F12</kbd> 打开开发者工具</li>
                    <li>切换到 <strong>Console</strong>（控制台）标签</li>
                    <li>如果出现粘贴警告，输入 <code className="px-1 bg-white dark:bg-gray-800 rounded">允许粘贴</code> 并回车</li>
                    <li>尝试以下任一代码：
                      <pre className="mt-2 p-2 bg-white dark:bg-gray-800 rounded text-xs overflow-x-auto font-mono">
{`// 方法 A（番剧页面）
window.__INITIAL_STATE__.epInfo.cid

// 方法 B（普通视频）
window.__INITIAL_STATE__.videoData.cid

// 方法 C（通用）
__INITIAL_STATE__.epInfo?.cid || __INITIAL_STATE__.videoData?.cid`}
                      </pre>
                    </li>
                    <li>复制输出的数字（例如：123456789）</li>
                  </ol>
                </div>

                <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                  <strong className="block mb-1">方法 2：从网络请求获取</strong>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>按 <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border text-xs">F12</kbd> 打开开发者工具</li>
                    <li>切换到 <strong>Network</strong>（网络）标签</li>
                    <li>刷新页面，在请求列表中搜索 <code className="px-1 bg-white dark:bg-gray-800 rounded">dm</code> 或 <code className="px-1 bg-white dark:bg-gray-800 rounded">list.so</code></li>
                    <li>找到类似 <code className="px-1 bg-white dark:bg-gray-800 rounded">list.so?oid=123456789</code> 的请求</li>
                    <li>复制 <code className="px-1 bg-white dark:bg-gray-800 rounded">oid=</code> 后面的数字即为 cid</li>
                  </ol>
                </div>

                <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                  <strong className="block mb-1">方法 3：从页面源代码获取</strong>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>在视频页面右键选择 <strong>查看网页源代码</strong></li>
                    <li>按 <kbd className="px-2 py-1 bg-white dark:bg-gray-800 rounded border text-xs">Ctrl+F</kbd> 搜索 <code className="px-1 bg-white dark:bg-gray-800 rounded">"cid":</code></li>
                    <li>找到类似 <code className="px-1 bg-white dark:bg-gray-800 rounded">&quot;cid&quot;:123456789</code> 的内容</li>
                    <li>复制数字部分</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* DanDanPlay 说明 */}
          {danmakuSource === 'dandanplay' && (
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
              <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                ⚠️ DanDanPlay 需要 API 认证
              </h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                DanDanPlay API 需要 AppId 和 AppSecret 进行认证。如果您还没有配置认证信息，导入将会失败。
              </p>
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                建议先使用 <strong>Bilibili</strong> 进行弹幕导入，或联系管理员配置 DanDanPlay 认证。
              </p>
            </div>
          )}

          <div className="mb-6">
            <label htmlFor="externalId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {danmakuSource === 'bilibili' ? 'Bilibili cid' : 'DanDanPlay episodeId'}
            </label>
            <input
              id="externalId"
              type="text"
              value={externalId}
              onChange={(e) => {
                setExternalId(e.target.value);
                setError('');
              }}
              placeholder={danmakuSource === 'bilibili' ? '例如：123456789' : '例如：10864001'}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={importing}
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">❌ {error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">✅ {success}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing || !externalId.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg
                       disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? '导入中...' : '开始导入'}
            </button>
            <button
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
                       text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
