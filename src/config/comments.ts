// These are public repository/category identifiers, not credentials.
// Keep townId stable: each article's comment thread is mapped to that ID.
export const commentConfig = {
  enabled: true,
  host: 'https://giscus.app',
  repo: 'BURIBURI-ZAEMON1/My-Blog-Town',
  repoId: 'R_kgDOUICVQg',
  category: 'Announcements',
  categoryId: 'DIC_kwDOUICVQs4DKiAc',
  language: 'zh-CN',
  themes: { day: 'noborder_light', night: 'transparent_dark' },
} as const;
