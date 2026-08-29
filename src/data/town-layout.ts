export type RegionKind = 'road' | 'river' | 'forest' | 'landmark' | 'buildable';
export type Point = { x: number; z: number };

export interface WorldRegion {
  id: string;
  kind: RegionKind;
  polygon: Point[];
}

export interface TownPlot {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  roof: 'gable' | 'hip' | 'flat';
  walls: 'stone' | 'plaster' | 'timber';
  accent: number;
  postId?: string;
  floor?: number;
  special?: 'shop' | 'forge';
  seedIndex: number;
  seriesPostIds?: string[];
}

export interface LayoutPost {
  id: string;
  building: 'a' | 'b' | 'c' | 'forge' | 'shop' | 'home';
  series?: string;
  seriesIndex?: number;
  date?: string;
}

export type TownEntityKind = 'farm' | 'fence' | 'shrub';

export interface TownEntity {
  id: string;
  kind: TownEntityKind;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation?: number;
}

export interface TownLayout {
  seed: string;
  regions: WorldRegion[];
  entities: TownEntity[];
  plots: TownPlot[];
  center: Point;
}

// This is deliberately smaller than the oversized terrain plane. Article
// buildings are only ever placed inside this camera-safe band.
export const visibleBuildingBounds = {
  minX: -8.2,
  maxX: 8.2,
  minZ: -6.4,
  maxZ: 5.8,
};

const worldBounds: WorldRegion = {
  id: 'world-buildable',
  kind: 'buildable',
  polygon: [{ x: -24, z: -20 }, { x: 24, z: -20 }, { x: 24, z: 20 }, { x: -24, z: 20 }],
};

const catmullRomPoint = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
};

const samplePath = (points: Point[], detail = 6) => {
  const samples: Point[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < detail; step += 1) samples.push(catmullRomPoint(p0, p1, p2, p3, step / detail));
  }
  samples.push(points[points.length - 1]);
  return samples;
};

const corridorPolygon = (centerline: Point[], halfWidth: number): Point[] => {
  const samples = samplePath(centerline);
  const left: Point[] = [];
  const right: Point[] = [];
  samples.forEach((point, index) => {
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const length = Math.hypot(tangentX, tangentZ) || 1;
    const normalX = -tangentZ / length;
    const normalZ = tangentX / length;
    const taper = index === 0 || index === samples.length - 1 ? 0.84 : 1;
    left.push({ x: point.x + normalX * halfWidth * taper, z: point.z + normalZ * halfWidth * taper });
    right.push({ x: point.x - normalX * halfWidth * taper, z: point.z - normalZ * halfWidth * taper });
  });
  return [...left, ...right.reverse()];
};

export const riverCenterline: Point[] = [
  { x: -18.8, z: -30 }, { x: -15.1, z: -17.4 }, { x: -13.7, z: -12.2 }, { x: -12.0, z: -8.4 },
  { x: -11.5, z: -4.4 }, { x: -10.8, z: -0.7 }, { x: -9.2, z: 3.6 }, { x: -8.2, z: 8.0 },
  { x: -7.3, z: 13.8 }, { x: -5.6, z: 22.5 }, { x: -5.2, z: 30 },
];

export const roadCenterlines: Record<string, Point[]> = {
  main: [{ x: -0.7, z: -30 }, { x: 0.15, z: -15 }, { x: 0.3, z: -10.5 }, { x: 0.8, z: -6 }, { x: 0.35, z: -1.8 }, { x: 0.2, z: 2.5 }, { x: -0.5, z: 7.2 }, { x: -1.65, z: 11.4 }, { x: -2.4, z: 30 }],
  east: [{ x: 0.1, z: 0.1 }, { x: 3.7, z: 0.4 }, { x: 7.6, z: 1.2 }, { x: 11.4, z: 2.2 }, { x: 15, z: 3.8 }, { x: 24, z: 7.2 }],
  west: [{ x: -0.2, z: 0 }, { x: -3.5, z: -1.1 }, { x: -6.9, z: -2.8 }, { x: -10.2, z: -4.5 }, { x: -13.4, z: -6.6 }, { x: -23, z: -10 }],
  north: [{ x: -0.8, z: 4.2 }, { x: 1.1, z: 6.3 }, { x: 3.5, z: 8.7 }, { x: 5.8, z: 11.2 }, { x: 7.2, z: 13.8 }, { x: 12, z: 22 }],
};

export const roadWidths = { main: 1.72, east: 1.6, west: 1.56, north: 1.64 } as const;
export const riverWidth = 1.96;

const river: WorldRegion = {
  id: 'river-west',
  kind: 'river',
  polygon: corridorPolygon(riverCenterline, riverWidth / 2),
};

const forest: WorldRegion = {
  id: 'pine-grove-east',
  kind: 'forest',
  polygon: [{ x: 9.1, z: 6.6 }, { x: 17.2, z: 6.3 }, { x: 17.8, z: 14.6 }, { x: 7.2, z: 14.4 }, { x: 7.1, z: 9.4 }],
};

const northGrove: WorldRegion = {
  id: 'north-grove',
  kind: 'forest',
  polygon: [{ x: -16.6, z: 9.5 }, { x: -11.6, z: 10.2 }, { x: -10.4, z: 14.8 }, { x: -17.5, z: 14.9 }],
};

const southOrchard: WorldRegion = {
  id: 'south-orchard',
  kind: 'forest',
  polygon: [{ x: 7.5, z: -14.6 }, { x: 12.1, z: -14.2 }, { x: 12.6, z: -11.1 }, { x: 9.9, z: -10.2 }, { x: 7.2, z: -11.8 }],
};


const roads: WorldRegion[] = [
  { id: 'road-main', kind: 'road', polygon: corridorPolygon(roadCenterlines.main, roadWidths.main / 2) },
  { id: 'road-branch-east', kind: 'road', polygon: corridorPolygon(roadCenterlines.east, roadWidths.east / 2) },
  { id: 'road-branch-west', kind: 'road', polygon: corridorPolygon(roadCenterlines.west, roadWidths.west / 2) },
  { id: 'road-north', kind: 'road', polygon: corridorPolygon(roadCenterlines.north, roadWidths.north / 2) },
];

const landmark: WorldRegion = {
  id: 'town-center',
  kind: 'landmark',
  polygon: [{ x: -3.1, z: -3.1 }, { x: 3.1, z: -3.1 }, { x: 3.1, z: 3.1 }, { x: -3.1, z: 3.1 }],
};

// These are authored scene entities, not decorative afterthoughts. They are
// shared by the renderer and the article plot allocator so a new house cannot
// be placed through a farm bed, fence, or fixed shrub cluster.
export const townEntities: TownEntity[] = [
  { id: 'farm-west', kind: 'farm', x: -16.25, z: -12.25, width: 2.5, depth: 1.55, rotation: 0.12 },
  { id: 'farm-south', kind: 'farm', x: 13.75, z: -13.25, width: 2.7, depth: 1.6, rotation: 0.12 },
  { id: 'farm-north-east', kind: 'farm', x: 20.0, z: 11.8, width: 3.0, depth: 1.65, rotation: 0.12 },
  { id: 'fence-west-edge', kind: 'fence', x: -5.5, z: 6.8, width: 2.0, depth: 0.32, rotation: -0.2 },
  { id: 'fence-east-edge', kind: 'fence', x: 7.75, z: -5.25, width: 2.5, depth: 0.32, rotation: 0.28 },
  { id: 'shrub-west-1', kind: 'shrub', x: -8.5, z: -8.8, width: 1.15, depth: 1.0 },
  { id: 'shrub-west-2', kind: 'shrub', x: -6.3, z: -10.8, width: 1.15, depth: 1.0 },
  { id: 'shrub-east-1', kind: 'shrub', x: 8.5, z: -8.5, width: 1.15, depth: 1.0 },
  { id: 'shrub-east-2', kind: 'shrub', x: 9.75, z: 3.25, width: 1.15, depth: 1.0 },
  { id: 'shrub-north-1', kind: 'shrub', x: -6.25, z: 9.5, width: 1.15, depth: 1.0 },
  { id: 'shrub-north-2', kind: 'shrub', x: 6.5, z: 9.5, width: 1.15, depth: 1.0 },
];

export const worldRegions: WorldRegion[] = [worldBounds, river, forest, northGrove, southOrchard, ...roads, landmark];

const pointInPolygon = (point: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersect = ((a.z > point.z) !== (b.z > point.z)) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
};

const polygonBounds = (polygon: Point[]) => ({
  minX: Math.min(...polygon.map((point) => point.x)),
  maxX: Math.max(...polygon.map((point) => point.x)),
  minZ: Math.min(...polygon.map((point) => point.z)),
  maxZ: Math.max(...polygon.map((point) => point.z)),
});

const overlaps = (a: { x: number; z: number; width: number; depth: number }, b: { x: number; z: number; width: number; depth: number }) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 0.35 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + 0.35;

const intersectsRegion = (plot: { x: number; z: number; width: number; depth: number }, region: WorldRegion) => {
  const bounds = polygonBounds(region.polygon);
  if (plot.x + plot.width / 2 < bounds.minX || plot.x - plot.width / 2 > bounds.maxX || plot.z + plot.depth / 2 < bounds.minZ || plot.z - plot.depth / 2 > bounds.maxZ) return false;
  const corners = [
    { x: plot.x - plot.width / 2, z: plot.z - plot.depth / 2 },
    { x: plot.x + plot.width / 2, z: plot.z - plot.depth / 2 },
    { x: plot.x + plot.width / 2, z: plot.z + plot.depth / 2 },
    { x: plot.x - plot.width / 2, z: plot.z + plot.depth / 2 },
  ];
  return corners.some((corner) => pointInPolygon(corner, region.polygon)) || pointInPolygon({ x: plot.x, z: plot.z }, region.polygon);
};

export const isBuildablePlot = (plot: { x: number; z: number; width: number; depth: number }, occupied: Array<{ x: number; z: number; width: number; depth: number }>) => {
  const insideVisibleBand = plot.x - plot.width / 2 >= visibleBuildingBounds.minX
    && plot.x + plot.width / 2 <= visibleBuildingBounds.maxX
    && plot.z - plot.depth / 2 >= visibleBuildingBounds.minZ
    && plot.z + plot.depth / 2 <= visibleBuildingBounds.maxZ;
  if (!insideVisibleBand || !pointInPolygon({ x: plot.x, z: plot.z }, worldBounds.polygon)) return false;
  if ([river, forest, northGrove, southOrchard, ...roads, landmark].some((region) => intersectsRegion(plot, region))) return false;
  if (townEntities.some((entity) => overlaps(plot, entity))) return false;
  return !occupied.some((other) => overlaps(plot, other));
};

const hashSeed = (seed: string) => [...seed].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
const rngFor = (seed: string) => {
  let state = hashSeed(seed);
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const buildingStyle = (post: LayoutPost, index: number) => {
  const styleByKind: Record<LayoutPost['building'], { roof: TownPlot['roof']; walls: TownPlot['walls'] }> = {
    a: { roof: 'gable', walls: 'timber' },
    b: { roof: 'hip', walls: 'stone' },
    c: { roof: 'gable', walls: 'plaster' },
    forge: { roof: 'flat', walls: 'stone' },
    shop: { roof: 'hip', walls: 'timber' },
    home: { roof: 'gable', walls: 'plaster' },
  };
  const style = styleByKind[post.building];
  return { ...style, accent: index % 4 };
};

const groupPosts = (posts: LayoutPost[]) => {
  const groups: LayoutPost[][] = [];
  const seriesGroups = new Map<string, LayoutPost[]>();
  posts.forEach((post) => {
    if (!post.series) {
      groups.push([post]);
      return;
    }
    const key = post.series;
    const group = seriesGroups.get(key) ?? [];
    group.push(post);
    seriesGroups.set(key, group);
  });
  seriesGroups.forEach((group) => groups.push([...group].sort((a, b) => (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0))));
  return groups;
};

const visibleSlots: Point[] = [
  { x: -7.6, z: -5.8 }, { x: -6.0, z: -5.8 }, { x: -4.4, z: -5.8 }, { x: -2.8, z: -5.8 },
  { x: 3.0, z: -5.8 }, { x: 4.6, z: -5.8 }, { x: 6.2, z: -5.8 }, { x: 7.8, z: -5.8 },
  { x: -7.6, z: -2.2 }, { x: -6.0, z: -2.2 }, { x: -4.4, z: -2.2 }, { x: 3.0, z: -2.2 },
  { x: 4.6, z: -2.2 }, { x: 6.2, z: -2.2 }, { x: 7.8, z: -2.2 },
  { x: -7.6, z: 1.4 }, { x: -6.0, z: 1.4 }, { x: -4.4, z: 1.4 }, { x: -2.8, z: 1.4 },
  { x: 3.0, z: 1.4 }, { x: 4.6, z: 1.4 }, { x: 6.2, z: 1.4 }, { x: 7.8, z: 1.4 },
  { x: -6.8, z: 5.0 }, { x: -5.2, z: 5.0 }, { x: -3.6, z: 5.0 }, { x: 2.2, z: 5.0 },
  { x: 3.8, z: 5.0 }, { x: 5.4, z: 5.0 }, { x: 7.0, z: 5.0 },
];

export const createTownLayout = (seed = 'river-bend-demo-v2', posts: LayoutPost[] = []): TownLayout => {
  const random = rngFor(seed);
  const groups = groupPosts(posts);
  const occupied: TownPlot[] = [];
  const plots: TownPlot[] = [];
  const roofs: TownPlot['roof'][] = ['gable', 'hip', 'flat'];
  const walls: TownPlot['walls'][] = ['stone', 'plaster', 'timber'];

  groups.forEach((group, groupIndex) => {
    const plotWidth = 1.04 + (groupIndex % 3) * 0.05;
    const plotDepth = 0.98 + (groupIndex % 2) * 0.04;
    const candidates = visibleSlots
      .map((slot, slotIndex) => ({ slot, slotIndex, distance: Math.hypot(slot.x, slot.z) }))
      .sort((a, b) => a.distance - b.distance || a.slotIndex - b.slotIndex);
    const slot = candidates
      .map(({ slot }) => slot)
      .find((candidate) => isBuildablePlot({ x: candidate.x, z: candidate.z, width: plotWidth, depth: plotDepth }, occupied));
    if (!slot) {
      throw new Error(`No camera-safe building slot remains for article group ${groupIndex + 1}. Expand visibleSlots before adding more articles.`);
    }
    const style = buildingStyle(group[0], groupIndex);
    const plot: TownPlot = {
      id: `article-building-${groupIndex + 1}`,
      x: slot.x,
      z: slot.z,
      width: plotWidth,
      depth: plotDepth,
      roof: style.roof ?? roofs[(groupIndex + random() * roofs.length) % roofs.length | 0],
      walls: style.walls ?? walls[(groupIndex + random() * walls.length) % walls.length | 0],
      accent: style.accent,
      postId: group[0].id,
      special: group[0].building === 'shop' || group[0].building === 'forge' ? group[0].building : undefined,
      seedIndex: groupIndex,
      seriesPostIds: group.length > 1 ? group.map((post) => post.id) : undefined,
    };
    occupied.push(plot);
    plots.push(plot);
  });

  return { seed, regions: worldRegions, entities: townEntities, plots, center: { x: 0, z: 0 } };
};
