import { siteConfig } from '../config/site';

export type ViewSnapshot = { views: number; totals: { pageviews: number; visitors: number } };

export const viewsEnabled = () => {
  if (typeof window === 'undefined') return false;
  return new URL(siteConfig.siteUrl).origin === window.location.origin;
};

export async function recordView(path: string): Promise<ViewSnapshot | undefined> {
  if (!viewsEnabled()) return;
  try {
    const response = await fetch('/api/views', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }), signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return;
    const value = await response.json();
    if (value?.enabled !== true || !Number.isFinite(value.views)
      || !Number.isFinite(value.totals?.pageviews) || !Number.isFinite(value.totals?.visitors)) return;
    return { views: value.views, totals: value.totals };
  } catch { /* Counting must never interrupt reading. */ }
}
