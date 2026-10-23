/** A versioned, browser-local record keyed by the same permanent IDs as article URLs. */
export const READ_POSTS_STORAGE_KEY = 'town-blog:read-posts:v1';
export const NEW_POST_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function parseReadPostIds(raw: string | null): Set<string> {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : []);
  } catch {
    return new Set();
  }
}

export function getNewPostIds(posts: readonly { id: string; date: string }[], readIds: ReadonlySet<string>, now: number): string[] {
  return posts.filter((post) => {
    const age = now - Date.parse(post.date);
    return age >= 0 && age <= NEW_POST_WINDOW_MS && !readIds.has(post.id);
  }).map((post) => post.id);
}

export type PostNoticeAnchor = { postId: string; x: number; y: number };
export type PostNoticeFrame = { width: number; height: number; anchors: PostNoticeAnchor[] };
export type PostNoticePlacement = PostNoticeAnchor & { left: number; top: number; width: number; height: number; path: string };

/** CSS-pixel callouts fan out from article floors, including floors sharing a building. */
export function layoutPostNotices({ width, height, anchors }: PostNoticeFrame): PostNoticePlacement[] {
  const labelWidth = 80, labelHeight = width < 720 ? 44 : 36, margin = 10, gap = 8;
  if (width < labelWidth + margin * 2 || height < labelHeight + margin * 2) return [];
  const placed: PostNoticePlacement[] = [];
  const overlaps = (left: number, top: number) => placed.some((other) =>
    left < other.left + other.width + gap && left + labelWidth + gap > other.left &&
    top < other.top + other.height + gap && top + labelHeight + gap > other.top);
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  // Top-down order prevents adjacent series floors swapping their labels as the camera moves.
  for (const anchor of [...anchors].sort((a, b) => a.y - b.y || a.postId.localeCompare(b.postId))) {
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || anchor.x < 0 || anchor.x > width || anchor.y < 0 || anchor.y > height) continue;
    const preferredSide = anchor.x < width / 2 ? 1 : -1;
    let position: { left: number; top: number } | undefined;
    for (let offset = 0; offset < height && !position; offset += labelHeight + gap) {
      for (const direction of offset ? [-1, 1] : [-1]) {
        for (const side of [preferredSide, -preferredSide]) {
          const left = clamp(anchor.x + (side > 0 ? 28 : -28 - labelWidth), margin, width - labelWidth - margin);
          const top = clamp(anchor.y - 56 + direction * offset, margin, height - labelHeight - margin);
          if (!overlaps(left, top)) { position = { left, top }; break; }
        }
        if (position) break;
      }
    }
    // A crowded viewport should not turn its labels into an unreadable stack.
    if (!position) continue;
    const { left, top } = position;
    const dotX = left + 12, dotY = top + labelHeight / 2;
    const bendX = dotX + (anchor.x > dotX ? 12 : -12);
    placed.push({ ...anchor, left, top, width: labelWidth, height: labelHeight,
      path: `M ${anchor.x} ${anchor.y} L ${bendX} ${dotY} H ${dotX}` });
  }
  return placed;
}
