export interface AdminConfig {
  ConfigSubscribtion: {
    URL: string;
    AutoUpdate: boolean;
    LastCheck: string;
  };
  ConfigFile: string;
  SiteConfig: {
    SiteName: string;
    Announcement: string;
    SearchDownstreamMaxPage: number;
    SiteInterfaceCacheTime: number;
    DoubanProxyType: string;
    DoubanProxy: string;
    DoubanImageProxyType: string;
    DoubanImageProxy: string;
    DisableYellowFilter: boolean;
    FluidSearch: boolean;
  };
  UserConfig: {
    Users: {
      username: string;
      role: 'user' | 'admin' | 'owner';
      banned?: boolean;
      enabledApis?: string[]; // 优先级高于tags限制
      tags?: string[]; // 多 tags 取并集限制
    }[];
    Tags?: {
      name: string;
      enabledApis: string[];
    }[];
  };
  SourceConfig: {
    key: string;
    name: string;
    api: string;
    detail?: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  CustomCategories: {
    name?: string;
    type: 'movie' | 'tv';
    query: string;
    from: 'config' | 'custom';
    disabled?: boolean;
  }[];
  LiveConfig?: {
    key: string;
    name: string;
    url: string;  // m3u 地址
    ua?: string;
    epg?: string; // 节目单
    from: 'config' | 'custom';
    channelNumber?: number;
    disabled?: boolean;
  }[];

  // 弹幕导入全局配置（站长配置）
  DanmakuImport?: {
    // 默认提供商：dandanplay 或 bilibili
    defaultProvider?: 'dandanplay' | 'bilibili';
    // 针对某些源/剧集的覆盖映射，如：source+id -> provider/externalIds/aliasTitle
    mappings?: Array<{
      key: string; // `${source}+${id}`
      provider?: 'dandanplay' | 'bilibili';
      // 每集覆盖：episode(1-based) -> externalId（dandan episodeId 或 bilibili cid）
      episodes?: Record<string, string>;
      // 可选：别名标题（用于 DanDanPlay 搜索）
      aliasTitle?: string;
    }>;
    // 自动导入开关
    autoImportEnabled?: boolean;
    // 管理后台设置的 Bilibili Cookie（加密存储，不下发给前端）
    bilibiliCookieEncrypted?: string;
  };
}

export interface AdminConfigResult {
  Role: 'owner' | 'admin';
  Config: AdminConfig;
}
