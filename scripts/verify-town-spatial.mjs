import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const cache = new Map();
const loadTs = (path) => {
  const absolute = resolve(path);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const source = readFileSync(absolute, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) throw new Error(`Unsupported test import: ${specifier}`);
    const candidate = resolve(dirname(absolute), specifier);
    return loadTs(candidate.endsWith('.ts') ? candidate : `${candidate}.ts`);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
};

const spatial = loadTs('src/data/town-spatial.ts');
const layoutModule = loadTs('src/data/town-layout.ts');
const textures = loadTs('src/data/town-textures.ts');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const mesh = spatial.corridorMeshData([{ x: 0, z: -2 }, { x: 0, z: 2 }], 1, 0.1);
const [aIndex, bIndex, cIndex] = mesh.indices;
const vertex = (index) => ({ x: mesh.positions[index * 3], y: mesh.positions[index * 3 + 1], z: mesh.positions[index * 3 + 2] });
const a = vertex(aIndex); const b = vertex(bIndex); const c = vertex(cIndex);
const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
const normalY = ab.z * ac.x - ab.x * ac.z;
assert(normalY > 0, `corridor surface faces downward (normalY=${normalY})`);

const riverBankPolygon = spatial.corridorPolygon(layoutModule.riverCenterline, (layoutModule.riverWidth + 0.22) / 2);
const bridgeSegments = spatial.pathSegmentsInsidePolygon(layoutModule.roadCenterlines.west, riverBankPolygon, 24);
assert(bridgeSegments.length === 1, `expected one contiguous bridge overlap segment, got ${bridgeSegments.length}`);
const bridgeSegment = bridgeSegments[0];
assert(bridgeSegment.length > 2, `bridge overlap segment is too short (${bridgeSegment.length} samples)`);
const crossing = spatial.findPathIntersection(layoutModule.riverCenterline, layoutModule.roadCenterlines.west);
assert(crossing, 'west road and river have no calculated crossing');
const riverRegion = layoutModule.worldRegions.find((region) => region.kind === 'river');
const westRoad = layoutModule.worldRegions.find((region) => region.id === 'road-branch-west');
assert(spatial.pointInPolygon(crossing, riverRegion.polygon), 'bridge crossing is outside rendered/collision river polygon');
assert(spatial.pointInPolygon(crossing, westRoad.polygon), 'bridge crossing is outside west road polygon');
// The bridge's local +X axis must point along the road tangent after Three.js
// applies rotationY (where +X rotates toward world -Z).
const roadSamples = spatial.samplePath(layoutModule.roadCenterlines.west, 12);
let tangentIndex = 0;
for (let index = 0; index < roadSamples.length - 1; index += 1) {
  const a = roadSamples[index];
  const b = roadSamples[index + 1];
  if (Math.abs((a.x + b.x) / 2 - crossing.x) + Math.abs((a.z + b.z) / 2 - crossing.z) < 1.4) { tangentIndex = index; break; }
}
const roadTangent = { x: roadSamples[tangentIndex + 1].x - roadSamples[tangentIndex].x, z: roadSamples[tangentIndex + 1].z - roadSamples[tangentIndex].z };
const roadLength = Math.hypot(roadTangent.x, roadTangent.z) || 1;
const bridgeAxis = { x: Math.cos(crossing.rotationY), z: -Math.sin(crossing.rotationY) };
const alignment = Math.abs((bridgeAxis.x * roadTangent.x + bridgeAxis.z * roadTangent.z) / roadLength);
assert(alignment > 0.96, `bridge axis is not aligned with west road (alignment=${alignment.toFixed(3)})`);
const bridgeHalfLength = (layoutModule.riverWidth + 1.08) / 2;
const bridgeEndpoints = [-bridgeHalfLength, bridgeHalfLength].map((distance) => ({
  x: crossing.x + bridgeAxis.x * distance,
  z: crossing.z + bridgeAxis.z * distance,
}));
bridgeEndpoints.forEach((endpoint, index) => {
  assert(!spatial.pointInPolygon(endpoint, riverRegion.polygon), `bridge endpoint ${index + 1} still sits in the river`);
  assert(spatial.pointInPolygon(endpoint, westRoad.polygon), `bridge endpoint ${index + 1} does not meet the west road`);
});
const extendedBridgeSegment = spatial.extendPathEndpoints(bridgeSegment, 0.38, 0.68);
const bridgeStart = extendedBridgeSegment[0];
const bridgeEnd = extendedBridgeSegment[extendedBridgeSegment.length - 1];
assert(spatial.pointInPolygon(bridgeSegment[Math.floor(bridgeSegment.length / 2)], riverRegion.polygon), 'bridge overlap does not cover the river center');
assert(!spatial.pointInPolygon(bridgeStart, riverRegion.polygon) && !spatial.pointInPolygon(bridgeEnd, riverRegion.polygon), 'bridge overlap endpoints still sit inside the water channel');
assert(spatial.pointInPolygon(bridgeStart, westRoad.polygon) && spatial.pointInPolygon(bridgeEnd, westRoad.polygon), 'extended bridge endpoints do not cover the land road');

const intersectsRegion = (entity, region) => {
  const corners = [
    { x: entity.x - entity.width / 2, z: entity.z - entity.depth / 2 },
    { x: entity.x + entity.width / 2, z: entity.z - entity.depth / 2 },
    { x: entity.x + entity.width / 2, z: entity.z + entity.depth / 2 },
    { x: entity.x - entity.width / 2, z: entity.z + entity.depth / 2 },
  ];
  return corners.some((corner) => spatial.pointInPolygon(corner, region.polygon)) || spatial.pointInPolygon({ x: entity.x, z: entity.z }, region.polygon);
};
const forbiddenRegions = layoutModule.worldRegions.filter((region) => ['river', 'road', 'forest'].includes(region.kind));
for (const entity of layoutModule.townEntities) {
  for (const region of forbiddenRegions) {
    assert(!intersectsRegion(entity, region), `${entity.id} overlaps forbidden ${region.id}`);
  }
}

const ground = textures.createGroundTextureData('river-bend-demo-v2', 64, 64);
let rgbTotal = 0;
let alphaMin = 255;
for (let index = 0; index < ground.data.length; index += 4) {
  rgbTotal += ground.data[index] + ground.data[index + 1] + ground.data[index + 2];
  alphaMin = Math.min(alphaMin, ground.data[index + 3]);
}
const rgbAverage = rgbTotal / (ground.width * ground.height * 3);
assert(alphaMin === 255, `ground texture contains transparent pixels (min alpha ${alphaMin})`);
assert(rgbAverage > 160, `ground texture is dark enough to blacken the terrain (average ${rgbAverage.toFixed(1)})`);

const samplePosts = Array.from({ length: 8 }, (_, index) => ({ id: `post-${index}`, building: index % 2 ? 'home' : 'shop' }));
const seriesLayout = layoutModule.createTownLayout('series-regression', [
  { id: 'series-1', building: 'a', series: 'same-series', seriesIndex: 0 },
  { id: 'series-2', building: 'c', series: 'same-series', seriesIndex: 1 },
]);
assert(seriesLayout.plots.length === 1, `one series must generate one building, got ${seriesLayout.plots.length}`);
assert(seriesLayout.plots[0].seriesPostIds?.join(',') === 'series-1,series-2', 'series floors are not ordered or grouped correctly');

const layout = layoutModule.createTownLayout('spatial-regression', samplePosts);
for (const plot of layout.plots) {
  assert(!spatial.pointInPolygon({ x: plot.x, z: plot.z }, riverRegion.polygon), `${plot.id} generated in river`);
  for (const entity of layout.entities) {
    const overlaps = Math.abs(plot.x - entity.x) < (plot.width + entity.width) / 2 + 0.35
      && Math.abs(plot.z - entity.z) < (plot.depth + entity.depth) / 2 + 0.35;
    assert(!overlaps, `${plot.id} overlaps fixed ${entity.kind} ${entity.id}`);
  }
}
for (let index = 0; index < layout.plots.length; index += 1) {
  for (let other = index + 1; other < layout.plots.length; other += 1) {
    const first = layout.plots[index];
    const second = layout.plots[other];
    const overlaps = Math.abs(first.x - second.x) < (first.width + second.width) / 2 + 0.35
      && Math.abs(first.z - second.z) < (first.depth + second.depth) / 2 + 0.35;
    assert(!overlaps, `${first.id} overlaps ${second.id}`);
  }
}

console.log(JSON.stringify({
  corridorNormalY: normalY,
  bridgeCrossing: crossing,
  bridgeAlignment: Number(alignment.toFixed(3)),
  bridgeEndpoints,
  bridgeOverlapSamples: bridgeSegment.length,
  bridgeExtendedSamples: extendedBridgeSegment.length,
  groundAverage: Number(rgbAverage.toFixed(1)),
  groundAlphaMin: alphaMin,
  plotCount: layout.plots.length,
}, null, 2));
