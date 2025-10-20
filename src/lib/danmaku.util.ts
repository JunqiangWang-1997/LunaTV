// 规范化 slug 构建，用于跨源共享弹幕
export function buildCanonicalSlug(title?: string, year?: string): string | null {
  if (!title || !title.trim()) return null;
  const normTitle = title
    .toLowerCase()
    .replace(/\s+/g, '')
    // 仅保留英文字母、数字和常用中日韩统一表意文字
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
  const normYear = (year || '').trim();
  return normYear ? `${normTitle}-${normYear}` : normTitle;
}
