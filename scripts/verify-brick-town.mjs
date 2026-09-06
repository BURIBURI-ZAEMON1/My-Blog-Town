import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { NullEngine, Scene } from '@babylonjs/core';
const require=createRequire(import.meta.url),cache=new Map();
function load(path){
  const absolute=resolve(path);if(cache.has(absolute))return cache.get(absolute).exports;
  const module={exports:{}};cache.set(absolute,module);
  const output=ts.transpileModule(readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const localRequire=id=>id.startsWith('.')?load(resolve(dirname(absolute),id.endsWith('.ts')?id:`${id}.ts`)):require(id);
  new Function('require','module','exports',output)(localRequire,module,module.exports);return module.exports;
}
const {createTownLayout,isBuildablePlot}=load('src/data/town-layout.ts');
const {buildHouse,FLOOR_HEIGHT}=load('src/scene/brick-town/buildings.ts');
const {roundedBox}=load('src/scene/brick-town/kit.ts');
const {buildWorld,BOARD}=load('src/scene/brick-town/world.ts');
const engine=new NullEngine(),scene=new Scene(engine);
const geometry=roundedBox(2,1,3,0.02);
assert(geometry.positions.length>24*3,'brick has no real bevel geometry');
for(let i=0;i<geometry.normals.length;i+=3)assert(Math.abs(Math.hypot(...geometry.normals.slice(i,i+3))-1)<1e-5,'non-unit bevel normal');
for(let i=0;i<geometry.positions.length;i+=3){assert(Math.abs(geometry.positions[i])<=1.00001);assert(Math.abs(geometry.positions[i+1])<=0.50001);assert(Math.abs(geometry.positions[i+2])<=1.50001);}
const posts=[{id:'single',building:'home'},{id:'series-2',building:'home',series:'notes',seriesIndex:2},{id:'series-1',building:'home',series:'notes',seriesIndex:1}];
const layout=createTownLayout('brick-verification',posts);
assert.equal(layout.plots.length,2);
assert(layout.reservedPlots.length >= 48,'town should expose a stable pool of empty article lots');
assert.deepEqual(layout.plots.find(p=>p.seriesPostIds).seriesPostIds,['series-1','series-2']);
for (const lot of layout.reservedPlots) {
  assert(isBuildablePlot(lot, layout.reservedPlots.filter(candidate => candidate !== lot)), `reserved lot ${lot.id} overlaps another reserved lot`);
}
const houses=layout.plots.map(p=>buildHouse(scene,p));
for(const house of houses){
  assert.deepEqual([...new Set(house.meshes.map(m=>m.metadata.postId))].sort(),[...house.ids].sort());
  for(const m of house.meshes){
    m.computeWorldMatrix(true);const box=m.getBoundingInfo().boundingBox;
    assert(Math.abs(box.minimumWorld.x-house.plot.x)<=house.plot.width/2+0.15,'visual house exceeds reserved X footprint');
    assert(Math.abs(box.maximumWorld.z-house.plot.z)<=house.plot.depth/2+0.15,'visual house exceeds reserved Z footprint');
    assert(box.maximumWorld.y<0.2+house.ids.length*FLOOR_HEIGHT+1.1,'roof contains duplicated world Y / floating geometry');
    assert(m.isPickable&&m.metadata.postId,'article mesh is not pickable with its own floor ID');
  }
  const all=house.meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0);assert(all>10000,'building reverted to a few primitive walls');
}
const world=buildWorld(scene,layout);
for(const tree of world.decor){
  assert(!world.inHouse(tree,tree.radius),'tree crown overlaps an article building');
  assert(!world.isRoad(tree,tree.radius),'tree crown overlaps road/access path');
  assert(!world.isWater(tree,tree.radius),'tree crown overlaps water');
  assert(tree.x>BOARD.minX&&tree.x<BOARD.maxX&&tree.z>BOARD.minZ&&tree.z<BOARD.maxZ,'tree outside board');
}
const many=createTownLayout('growth',Array.from({length:8},(_,i)=>({id:`post-${i}`,building:i%2?'home':'shop'})));
assert.equal(many.plots.length,8);
for(const plot of many.plots){assert(isBuildablePlot(plot,many.plots.filter(p=>p!==plot)),'new article does not fit occupancy model');}
console.log(JSON.stringify({houses:houses.length,articleFloors:posts.length,bevelVertices:geometry.positions.length/3,decor:world.decor.length,mergedMeshes:world.meshes.length,worldVertices:world.meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0),growthBuildings:many.plots.length},null,2));
scene.dispose();engine.dispose();
