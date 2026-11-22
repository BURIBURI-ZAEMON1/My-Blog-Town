import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NullEngine, Scene, Vector3, Ray } from '@babylonjs/core';
const require=createRequire(import.meta.url),cache=new Map();
function load(path){
  const absolute=resolve(path);if(cache.has(absolute))return cache.get(absolute).exports;
  const module={exports:{}};cache.set(absolute,module);
  const output=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const localRequire=id=>id.startsWith('.')?load(resolve(dirname(absolute),id.endsWith('.ts')?id:`${id}.ts`)):require(id);
  new Function('require','module','exports',output)(localRequire,module,module.exports);return module.exports;
}
const {createTownLayout,townBoard}=load('src/data/town-layout.ts');
const {inTownOutline}=load('src/data/town-outline.ts');
const {buildWorld,randomFor}=load('src/scene/brick-town/world.ts');
const {buildHouse}=load('src/scene/brick-town/buildings.ts');
const {createSeasonController}=load('src/scene/brick-town/seasons.ts');
const {createWeatherController}=load('src/scene/brick-town/weather.ts');
const {getSeasonForDate,SEASON_ORDER}=load('src/data/town-seasons.ts');
const {createPrecipitationField,weatherIsPrecipitating}=load('src/data/town-weather.ts');
const {getTownDaylight,blendTownDaylight,daylightStep}=load('src/data/town-daylight.ts');
const lightAt=(hour,forceNight=false,wet=false)=>getTownDaylight(new Date(2026,5,15,Math.floor(hour),Math.round(hour%1*60)),forceNight,wet);
const morning=lightAt(7),noon=lightAt(12),evening=lightAt(17),night=lightAt(22);
assert(morning.direction[0]<0&&evening.direction[0]>0,'sun did not move across the town');
const shadowLength=light=>Math.hypot(light.direction[0],light.direction[2])/-light.direction[1];
assert(shadowLength(morning)>shadowLength(noon)*3&&shadowLength(evening)>shadowLength(noon)*3,'morning/evening shadows are not longer than noon');
assert(morning.sun<noon.sun&&evening.sun<noon.sun,'low sun is as strong as noon');
assert(noon.sun/noon.sky>5,'clear midday sunlight is washed out by sky fill');
assert(morning.sunColor[2]<noon.sunColor[2],'morning sunlight is not warmer');
assert.equal(night.sun,0,'night retains direct sunlight');
assert.equal(lightAt(5.75).sun,0,'sun below the morning horizon still casts direct light');
assert.equal(lightAt(18.25).sun,0,'sun below the evening horizon still casts direct light');
assert.equal(night.night,1);
for(const hour of [0,6,12,18,23])assert.deepEqual(lightAt(hour,true),night,'night theme did not lock solar time');
const wet=lightAt(12,false,true);
assert.equal(wet.sun*(1-daylightStep(0,.55,wet.cloud)),0,'rain retains direct sunlight');
for(let cloud=0;cloud<=1;cloud+=.01)assert(!(daylightStep(.6,1,cloud)>0&&1-daylightStep(0,.55,cloud)>0),'rain appears before direct sunlight has vanished');
assert.deepEqual(blendTownDaylight(noon,night,0),{...noon,hour:night.hour});
assert.deepEqual(blendTownDaylight(noon,night,1),night);
const partial=blendTownDaylight(noon,night,.25),reverse=blendTownDaylight(partial,noon,.1);
assert(partial.night>reverse.night&&reverse.night>0,'interrupted theme transition jumped to its endpoint');
for(let minute=1;minute<1440;minute++) {
  const previous=lightAt((minute-1)/60),current=lightAt(minute/60);
  assert(Math.abs(current.night-previous.night)<.025&&Math.abs(current.sun-previous.sun)/noon.sun<.02,'solar lighting jumps at a clock boundary');
}
const wetSlots=Array.from({length:10000},(_,slot)=>Number(weatherIsPrecipitating('heavens-door-town-v1',slot))).reduce((a,b)=>a+b,0);
assert(wetSlots>1500&&wetSlots<2100,'precipitation probability is no longer close to 18%');
const expected=['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'];
for(let month=0;month<12;month++)assert.equal(getSeasonForDate(new Date(2026,month,15)),expected[month]);

const summaries=[];
for(const mobile of [false,true]) {
  const engine=new NullEngine(),scene=new Scene(engine);
  const layout=createTownLayout('heavens-door-town-v1',[
    {id:'first',series:'notes',seriesIndex:1},{id:'second',series:'notes',seriesIndex:2},{id:'third'},
  ]);
  const originalLayout=JSON.stringify(layout);
  const world=buildWorld(scene,layout,mobile),houses=layout.plots.map(plot=>buildHouse(scene,plot,mobile));
  const baseMeshes=[...world.meshes,...houses.flatMap(h=>h.meshes)];
  const basePositions=baseMeshes.map(m=>m.position.asArray());
  const controller=createSeasonController({scene,world,mobile,seed:layout.seed,surfaces:[...world.snowSurfaces,...houses.flatMap(h=>h.snowSurfaces)]});
  const counts={};
  for(const season of SEASON_ORDER) {
    controller.set(season,true);
    assert.equal(controller.transitioning,false);
    assert.equal(JSON.stringify(layout),originalLayout,'season changed navigation/map/article layout');
    assert(baseMeshes.every((mesh,index)=>!mesh.isDisposed()&&JSON.stringify(mesh.position.asArray())===JSON.stringify(basePositions[index])),'season rebuilt/moved base town');
    if(season==='spring'||season==='autumn') {
      assert(controller.coverCount>100,`${season} cover unexpectedly sparse`);
      for(const mesh of controller.meshes)for(const matrix of mesh.thinInstanceGetWorldMatrices()) {
        const p={x:matrix.m[12],z:matrix.m[14]};
        assert(inTownOutline(p),'cover escaped brick outline');
        assert(!world.isRoad(p,0.02)&&!world.isWater(p,0.02)&&!world.inHouse(p,0.02),'cover entered a road, river or article lot');
      }
    }
    if(season==='winter') {
      assert(world.glints.every(mesh=>!mesh.isEnabled()),'water glints still animate under ice');
      assert(controller.articleMeshes.length===houses.length,'roof snow lost article binding');
      for(const house of houses) {
        const roof=controller.articleMeshes.find(mesh=>mesh.parent===house.root);
        assert(roof,'snow is detached from its building root');
        assert.equal(roof.metadata.postId,house.ids.at(-1));
        assert(roof.isPickable,'snow blocks article roof picking');
        house.root.computeWorldMatrix(true);roof.computeWorldMatrix(true);
        const surface=house.snowSurfaces.reduce((top,item)=>item.y>top.y?item:top);
        const hit=scene.pickWithRay(new Ray(new Vector3(house.plot.x+surface.x,40,house.plot.z+surface.z),new Vector3(0,-1,0)),mesh=>mesh===roof);
        assert(hit?.hit,'registered roof snow cannot be ray-picked');
      }
    }
    counts[season]={meshes:scene.meshes.length,materials:scene.materials.length,cover:controller.coverCount};
  }
  // Warm material cache, then check repeated switches don't grow either resource list.
  for(const season of SEASON_ORDER)controller.set(season,true);
  const warmedMaterials=scene.materials.length;
  for(let cycle=0;cycle<3;cycle++)for(const season of SEASON_ORDER) {
    controller.set(season,false);controller.tick(1,false);
    assert.equal(scene.meshes.length,counts[season].meshes,'disposed overlays accumulated meshes');
    assert.equal(scene.materials.length,warmedMaterials,'switch accumulated materials');
  }
  controller.set('spring',false);assert(controller.transitioning);controller.tick(0,true);assert(!controller.transitioning,'reduced motion did not settle transition');
  const weather=createWeatherController(scene,layout.seed,mobile);
  const countBefore=scene.meshes.length;
  weather.set('rain',true,false);weather.tick(0.1);
  assert(weather.animated);assert.equal(weather.kind,'rain');
  weather.set('rain',true,false,.5);assert.equal(scene.getMeshByName('town-precipitation').alpha,.21,'rain did not fade with cloud cover');
  weather.set('rain',true,false,0);assert(!scene.getMeshByName('town-precipitation').isEnabled(),'zero-strength rain still renders');
  weather.set('snow',true,false);weather.tick(0.1);
  assert.equal(scene.meshes.length,countBefore+1,'weather created multiple live precipitation systems');
  assert.equal(weather.kind,'snow');
  weather.set('snow',true,true);assert(!weather.animated,'reduced motion snow still animates');
  weather.set('rain',false,false);assert(!weather.animated,'clear weather still animates');
  const weatherMaterials=scene.materials.length;
  for(let repeat=0;repeat<5;repeat++) {weather.set('snow',true,false);weather.set('rain',true,false);}
  assert.equal(scene.materials.length,weatherMaterials,'rain/snow changes accumulated line materials');
  weather.dispose();assert.equal(scene.meshes.length,countBefore);
  controller.dispose();assert(baseMeshes.every(mesh=>!mesh.isDisposed()));
  summaries.push({mobile,counts});scene.dispose();engine.dispose();
}
const rain=createPrecipitationField(randomFor('same-seed'),500,townBoard,'rain');
const snow=createPrecipitationField(randomFor('same-seed'),500,townBoard,'snow');
assert(snow.every((drop,index)=>drop.speed<rain[index].speed),'snow should fall slower than rain');
assert(rain.every(drop=>Number.isFinite(drop.x+drop.y+drop.z+drop.speed)));
assert(Array.from({length:96},(_,slot)=>weatherIsPrecipitating('heavens-door-town-v1',slot)).some(Boolean));
console.log(JSON.stringify({message:'Local solar cycle, long/short shadows, night lock, overcast, interrupted transitions, 18% precipitation; season layout/picking/occupancy, disposal and reduced motion PASS',summaries},null,2));
