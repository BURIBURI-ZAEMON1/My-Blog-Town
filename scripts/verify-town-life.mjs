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

const life = loadTs('src/data/town-life.ts');
const layoutModule = loadTs('src/data/town-layout.ts');
const spatial = loadTs('src/data/town-spatial.ts');
const rain = loadTs('src/data/town-rain.ts');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sequence = (...values) => {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0.5;
};

assert(rain.rainYAtTime(12, 0.2, 20, 0) !== rain.rainYAtTime(12, 0.2, 20, 0.25), 'rain streak Y position is static over time');
assert(rain.rainYAtTime(12, 0.2, 20, 0) > rain.RAIN_BOTTOM, 'rain streak starts outside the valid rain area');
assert(rain.rainXAtTime(0, 68 / rain.RAIN_WIND_X) === rain.rainXAtTime(0, 0), 'rain horizontal motion does not wrap');

const day = life.planTownPopulation({ plotCount: 3, night: false, rainy: false, random: sequence(0.5, 0.2, 0.3, 0.4, 0.1, 0.2) });
assert(day.length >= 3, `three buildings should sustain at least three daytime people, got ${day.length}`);
assert(day.some((person) => person.role === 'townsperson'), 'day plan has no townsperson');
assert(day.some((person) => person.role === 'traveler'), 'day plan has no traveler');
assert(day.some((person) => person.role === 'guard'), 'day plan has no guard');
assert(!day.some((person) => person.role === 'thief'), 'day plan generated a thief');

const nightWithThief = life.planTownPopulation({ plotCount: 5, night: true, rainy: false, random: sequence(0.9, 0.2, 0.3, 0.2, 0.1, 0.1, 0.1) });
assert(nightWithThief.some((person) => person.role === 'thief'), 'night event roll did not generate a thief');
assert(nightWithThief.filter((person) => person.role === 'thief').length === 1, 'more than one thief generated');

const sparseNightCount = life.getTownPopulationCount({ plotCount: 3, night: true, rainy: true, random: sequence(0) });
assert(sparseNightCount === 3, `three-building town lost a core role in sparse weather (${sparseNightCount})`);

const smallNight = life.planTownPopulation({ plotCount: 3, night: true, rainy: false, random: sequence(0.5, 0.2, 0.3, 0.1) });
assert(smallNight.some((person) => person.role === 'guard'), 'small night event removed the guard');
assert(smallNight.some((person) => person.role === 'thief'), 'small night town can never generate a thief');
assert(smallNight.some((person) => person.role === 'townsperson'), 'small night event removed every townsperson');

const rainyNight = life.getTownPopulationCount({ plotCount: 8, night: true, rainy: true, random: sequence(0.8) });
const clearDay = life.getTownPopulationCount({ plotCount: 8, night: false, rainy: false, random: sequence(0.8) });
assert(rainyNight < clearDay, `rainy night population (${rainyNight}) should be lower than clear day (${clearDay})`);
assert(clearDay <= 10, `population exceeded performance cap (${clearDay})`);


// Night building illumination must remain local to window panes. Scene-wide
// Moving scene lights are allowed, but the building construction section must
// not contain a PointLight or non-window emissive.
const sceneSource = readFileSync(resolve('src/components/TownScene.tsx'), 'utf8');
const buildingSection = sceneSource.slice(
  sceneSource.indexOf('const makeBuilding'),
  sceneSource.indexOf('const makePedestrian'),
);
assert(!buildingSection.includes('PointLight'), 'building construction still contains a PointLight');
const buildingEmissiveLines = buildingSection
  .split('\n')
  .filter((line) => line.includes('emissive'));
assert(buildingEmissiveLines.length === 0, `building construction contains non-window emissive material: ${buildingEmissiveLines.join(' | ')}`);
assert(sceneSource.includes('const pane = new THREE.Mesh') && sceneSource.includes('emissiveIntensity'), 'window panes no longer provide their own emissive glow');

assert(sceneSource.includes('makeTownPatrolRoute(townTravelRoutes, samplePath)'), 'guards are not assigned the town-wide patrol circuit');
assert(sceneSource.includes('canSeePoint(guardPosition, thiefPosition, facing'), 'guard-thief interaction is not visibility gated');
assert(sceneSource.includes("buildingState = 'entering'") && sceneSource.includes('setOpacity(visualOpacity)'), 'building visit fade state is not wired');
assert(sceneSource.includes('interactionBlend'), 'conversation offset is not eased');
assert(sceneSource.includes("Math.floor(Date.now() / 900000)"), 'weather is still pinned to a one-hour slot');
assert(sceneSource.includes('const isRainy = weatherIsRainy(layout.seed, weatherSlot)'), 'weather is not determined by the 15-minute slot helper');
assert(rain.RAIN_PROBABILITY === 0.3, `rain weather probability should be 30%, got ${rain.RAIN_PROBABILITY}`);
const sampledWeather = Array.from({ length: 96 }, (_, index) => rain.weatherIsRainy('river-bend-demo-v2', index));
const rainySlots = sampledWeather.filter(Boolean).length;
assert(rainySlots > 3 && rainySlots < 38, `weather helper distribution is implausible across 96 slots (${rainySlots} rainy)`);
assert(!sceneSource.includes('makeCarriage') && !sceneSource.includes('carriageNodes'), 'carriage model or animation is still present');
assert(sceneSource.includes('const count = 420') && sceneSource.includes('uTime * rainSpeed') && sceneSource.includes('RAIN_WIND_X'), 'rain system is not using the dense wind-swept loop');
assert(sceneSource.includes('vertexShader') && sceneSource.includes('uTime * rainSpeed') && sceneSource.includes('rainOffset'), 'rain shader does not calculate per-streak motion');
assert(sceneSource.includes('rainXOffset') && sceneSource.includes('rainZOffset') && sceneSource.includes('Wrap the line anchor once'), 'rain shader still wraps line endpoints independently');
assert(sceneSource.includes('if (rainSystem) rainSystem.material.uniforms.uTime.value = elapsed;'), 'rain shader clock is not updated every frame');
const animateIndex = sceneSource.indexOf('function animate()');
assert(sceneSource.indexOf('if (rainSystem) rainSystem.material.uniforms.uTime.value = elapsed;', animateIndex) < sceneSource.indexOf('if (!reducedMotion)', animateIndex), 'rain shader clock update occurs after the reduced-motion branch');
assert(sceneSource.includes("thiefState: role === 'thief' ? 'arriving'") && sceneSource.includes("thiefState = 'escaping'"), 'thief arrival and escape states are not wired');



const pair = day.filter((person) => person.interactionGroup === 0);
assert(pair.length === 2, `social interaction should bind exactly two people, got ${pair.length}`);

// Exercise the real article-building layout rather than only synthetic points.
// Every segment is sampled densely, so a long access leg crossing a house is
// caught even when neither of its endpoints lies inside that footprint.
const layout = layoutModule.createTownLayout('heavens-door-town-v1', [
  { id: 'article-one', building: 'b' },
  { id: 'article-two', building: 'c' },
  { id: 'article-three', building: 'a' },
]);
const thiefPlot = layout.plots[0];
const thiefArrival = life.makeThiefArrivalRoute(thiefPlot, layoutModule.townTravelRoutes, spatial.samplePath, layout.plots);
assert(thiefArrival.length > 2, 'thief arrival route does not include a road approach');
assert(Math.hypot(thiefArrival.at(-1).x - life.doorPointForPlot(thiefPlot).x, thiefArrival.at(-1).z - life.doorPointForPlot(thiefPlot).z) < 1e-6, 'thief arrival route does not end at the target door');
assert(!life.routeIntersectsPlots(thiefArrival, layout.plots), 'thief arrival route crosses a building');

const patrolRoute = life.makeTownPatrolRoute(layoutModule.townTravelRoutes, spatial.samplePath);
const mainRoute = spatial.samplePath(layoutModule.townTravelRoutes.main, 8);
assert(patrolRoute.length > mainRoute.length, 'guard patrol route does not cover more than the main road');
assert(life.routeMetrics(patrolRoute).totalDistance > life.routeMetrics(mainRoute).totalDistance, 'guard patrol route is not a town-wide circuit');
assert(!life.routeIntersectsPlots(patrolRoute, layout.plots), 'guard patrol route crosses an article building');

assert(life.canSeePoint({ x: 0, z: -2 }, { x: 0, z: 0 }, { x: 0, z: 1 }, 3, [], 96), 'guard sightline rejected a visible thief');
assert(!life.canSeePoint({ x: 0, z: -2 }, { x: 0, z: 0 }, { x: 0, z: -1 }, 3, [], 96), 'guard sightline accepted a thief behind the guard');
assert(!life.canSeePoint({ x: 0, z: -2 }, { x: 0, z: 2 }, { x: 0, z: 1 }, 5, [{ x: 0, z: 0, width: 1, depth: 1 }], 96), 'guard sightline ignored a building obstruction');

let visitRouteChecks = 0;
for (let fromIndex = 0; fromIndex < layout.plots.length; fromIndex += 1) {
  const patrol = life.makeDoorPatrolRoute(layout.plots[fromIndex], 0.62);
  assert(!life.routeIntersectsPlots(patrol, layout.plots), `door patrol ${fromIndex} crosses a building`);
  for (let toIndex = 0; toIndex < layout.plots.length; toIndex += 1) {
    if (fromIndex === toIndex) continue;
    const route = life.makeBuildingVisitRoute(
      layout.plots[fromIndex],
      layout.plots[toIndex],
      layoutModule.townTravelRoutes,
      spatial.samplePath,
      layout.plots,
    );
    assert(route.length > 3, `visit route ${fromIndex}->${toIndex} does not reach the road network`);
    assert(!life.routeIntersectsPlots(route, layout.plots), `visit route ${fromIndex}->${toIndex} crosses a building`);
    const start = life.doorPointForPlot(layout.plots[fromIndex]);
    const end = life.doorPointForPlot(layout.plots[toIndex]);
    assert(Math.hypot(route[0].x - start.x, route[0].z - start.z) < 1e-6, `visit route ${fromIndex}->${toIndex} starts away from its door`);
    assert(Math.hypot(route.at(-1).x - end.x, route.at(-1).z - end.z) < 1e-6, `visit route ${fromIndex}->${toIndex} ends away from its door`);
    visitRouteChecks += 1;
  }
}

console.log(JSON.stringify({
  dayRoles: day.map((person) => person.role),
  nightRoles: nightWithThief.map((person) => person.role),
  smallNightRoles: smallNight.map((person) => person.role),
  clearDayCount: clearDay,
  rainyNightCount: rainyNight,
  sparseNightCount,
  pairedPeople: pair.length,
  visitRouteChecks,
}, null, 2));
