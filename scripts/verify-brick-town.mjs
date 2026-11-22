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
const {createTownLayout,isBuildablePlot,townBoard}=load('src/data/town-layout.ts');
const {createTownMapModel,TOWN_MAP_MIRROR_X}=load('src/data/town-map.ts');
const {buildHouse,FLOOR_HEIGHT}=load('src/scene/brick-town/buildings.ts');
const {roundedBox}=load('src/scene/brick-town/kit.ts');
const {buildWorld,BOARD}=load('src/scene/brick-town/world.ts');
const {inTownOutline,townTerrainBounds,clampToTownTerrain}=load('src/data/town-outline.ts');
assert.deepEqual(clampToTownTerrain({x:0,z:0}),{x:0,z:0});
assert(clampToTownTerrain({x:80,z:0}).x>BOARD.maxX,'expanded outer districts remain unreachable');
assert(inTownOutline(clampToTownTerrain({x:80,z:80}),5),'camera can drift into an empty corner outside the island');
const outsideOriginalBoard=p=>p.x<BOARD.minX||p.x>BOARD.maxX||p.z<BOARD.minZ||p.z>BOARD.maxZ;
const {TownEdgeField,edgeDistance,edgeCloseAmount}=load('src/scene/brick-town/edge-reveal.ts');
assert.equal(edgeCloseAmount(1.9,1.9),0);
assert.equal(edgeCloseAmount(.75,1.9),0);
assert.equal(edgeCloseAmount(2.6,1.9),1);
assert(edgeCloseAmount(2.1,1.9)>0&&edgeCloseAmount(2.1,1.9)<1);
assert(edgeDistance(0,0,0)>0&&edgeDistance(1.2,1,0)<0);
const edgeMatrix=[.05,0,0,0,0,0,0,0,0,.05,0,0,0,0,0,1];
const highEdge=[...edgeMatrix];highEdge[0]=highEdge[9]=.025;
const field=new TownEdgeField([{x:25.2,z:0,width:4.4,depth:4.4}]);
const linkedSupports=new TownEdgeField(Array.from({length:20},(_,i)=>({x:-7.2+i*.72,z:0,width:2.2,depth:2.2})));
assert(linkedSupports.owners.every(owner=>linkedSupports.owners[owner]===owner),'overlapping supports left unanimated group fragments');
field.retarget(edgeMatrix,0,true,true,true);
assert.equal(field.visibility(0,0),1);
assert.equal(field.visibility(25.2,0),0);
field.retarget(highEdge,0,true,false);
field.tick(.12);
const midway=field.visibility(25.2,0);
assert(midway>0&&midway<1,'group did not rise over time');
assert.equal(field.visibility(23.4,1.44),midway,'support and building animate separately');
assert(field.data.every((value,i)=>i%4!==0||value===0||value===255),'edge retained a translucent fog band');
field.retarget(edgeMatrix,0,true,false,false,true);
assert.equal(field.visibility(25.2,0),midway,'zoom reversal jumped the group');
const reversedPose=field.data.slice();field.tick(0);
assert.deepEqual(field.data,reversedPose,'zoom reversal jumped the vertical position');
field.tick(.5);assert.equal(field.visibility(25.2,0),0);
field.retarget(highEdge,0,true,false);field.tick(.5);
assert.equal(field.visibility(25.2,0),1);assert.equal(field.animating,false);
const pannedEdge=[...highEdge];pannedEdge[12]=2;
field.retarget(pannedEdge,0,false,false);field.tick(.5);
assert.equal(field.visibility(0,0),1,'pan withdrew already revealed world pieces');
field.retarget(pannedEdge,0,true,false);field.tick(.5);
assert.equal(field.visibility(0,0),0,'zoom out did not retract the outer world');
field.retarget(highEdge,0,true,false);field.tick(0,true);
assert.equal(field.animating,false,'reduced motion left a permanent animation loop');
assert.equal(field.visibility(25.2,0),1);
const revision=field.revision;assert.equal(field.tick(.1),false);assert.equal(field.revision,revision,'settled edge keeps uploading state');
field.retarget(edgeMatrix,0,true,false,false,true);
field.tick(.10);
assert(field.animating,'approaching outer plates has no landing response');
assert(field.data.some((value,i)=>i%4===2&&value>128),'approaching bricks did not lift and settle');
assert.equal(field.visibility(14.4,0),1,'landing wave hid the inner town');
field.tick(.4);assert.equal(field.animating,false);
assert.equal(field.visibility(25.2,0),0,'landed outer bricks remained visible after approaching');
assert(field.data.every((value,i)=>i%4!==2||value===128),'landing wave left bricks suspended');
const settledLow=field.data.slice();
for(let cycle=0;cycle<3;cycle++){
  field.retarget(highEdge,0,true,false);field.tick(.5);
  assert.equal(field.visibility(25.2,0),1,'pulling back failed to recover landed outer bricks');
  field.retarget(edgeMatrix,0,true,false,false,true);field.tick(.5);
  assert.deepEqual(field.data,settledLow,'zoom round trip changed the resting footprint');
}
const hysteresis=new TownEdgeField(),nearBoundary=[...edgeMatrix];
const boundary=edgeDistance(.9,0,0)+.9;
nearBoundary[12]=boundary-.9-.01;
hysteresis.retarget(nearBoundary,0,true,true,true);
for(const distance of [-.02,.02,-.02,.02]){
  nearBoundary[12]=boundary-.9-distance;
  hysteresis.retarget(nearBoundary,0,true,false);hysteresis.tick(.4);
  assert.equal(hysteresis.visibility(18,0),1,'tiny zoom jitter flickered a revealed brick');
}
nearBoundary[12]=boundary-.9+.06;
hysteresis.retarget(nearBoundary,0,true,false);hysteresis.tick(.4);
assert.equal(hysteresis.visibility(18,0),0,'hysteresis prevented deliberate withdrawal');
const edgeShader=readFileSync('src/scene/brick-town/edge-reveal.ts','utf8');
assert(!edgeShader.includes('finalColor.rgb = mix'),'persistent background-color fog returned');
assert.deepEqual(BOARD,townBoard,'Babylon world and mini-map use different coordinate bounds');
assert.equal(TOWN_MAP_MIRROR_X,true,'mini-map should use the corrected left-right orientation');
const runtimeSource=readFileSync('src/scene/brick-town/runtime.ts','utf8');
assert(runtimeSource.includes("@babylonjs/core/Culling/ray.js"),'tree-shaken runtime did not register Babylon ray picking');
const {createRainField,getCameraPanBounds,clampToPanBounds,getDragPanDelta,getArticleFocusPose,ARTICLE_FOCUS_MS,ARTICLE_FOCUS_ZOOM}=load('src/scene/brick-town/view.ts');
for(const distance of [0,.5,60]){
  const from={x:0,y:.2,z:0,zoom:1.9},to={x:distance,y:1.4,z:0};
  assert.deepEqual(getArticleFocusPose(from,to,0),from,'focus should begin at the current camera pose');
  const end=getArticleFocusPose(from,to,ARTICLE_FOCUS_MS);
  assert(Math.abs(end.x-to.x)<1e-10&&Math.abs(end.y-to.y)<1e-10&&Math.abs(end.z-to.z)<1e-10,'focus did not arrive at the fixed deadline');
  assert.equal(end.zoom,ARTICLE_FOCUS_ZOOM);
  assert.equal(getArticleFocusPose({...from,zoom:2.6},to,ARTICLE_FOCUS_MS).zoom,2.6,'focus zoomed out of a closer view');
  const middle=getArticleFocusPose(from,to,ARTICLE_FOCUS_MS/2);
  assert.equal(middle.z,0,'focus introduced a sideways detour');
  assert(Object.values(middle).every(Number.isFinite),'coincident focus produced invalid coordinates');
}
const closePose={x:0,y:.2,z:0,zoom:2.6};
const nearLift=getArticleFocusPose(closePose,{x:12,y:1,z:0},ARTICLE_FOCUS_MS*.32).zoom;
const farLift=getArticleFocusPose(closePose,{x:50,y:1,z:0},ARTICLE_FOCUS_MS*.32).zoom;
assert(farLift<nearLift&&nearLift<closePose.zoom,'distant close-view flights should rise further before approaching');
assert.equal(getArticleFocusPose(closePose,{x:2,y:1,z:0},ARTICLE_FOCUS_MS*.32).zoom,2.6,'nearby buildings caused an unnecessary rise');
assert(getArticleFocusPose({...closePose,zoom:1},{x:50,y:1,z:0},ARTICLE_FOCUS_MS*.32).zoom>=1,'already-high camera rose further');
const highMiddle=getArticleFocusPose({...closePose,zoom:1},{x:50,y:1,z:0},ARTICLE_FOCUS_MS*.5);
assert(1/highMiddle.zoom>(1+1/ARTICLE_FOCUS_ZOOM)/2,'high-to-low descent lost its shallow diving arc');
const vectorTarget=new Vector3(3,2,4);
assert.deepEqual(getArticleFocusPose(closePose,vectorTarget,ARTICLE_FOCUS_MS),{x:3,y:2,z:4,zoom:2.6},'Babylon vector target was not preserved at arrival');
const {getTownLoadingProfile,TOWN_LOADING_THRESHOLDS}=load('src/scene/brick-town/loading.ts');
const engine=new NullEngine(),scene=new Scene(engine);
let rainState=123456789;
const rainRandom=()=>{rainState=(1664525*rainState+1013904223)>>>0;return rainState/4294967296;};
const rain=createRainField(rainRandom,700,BOARD);
const rainMargin=1.8;
assert.equal(rain.length,700,'desktop rain density regressed');
assert(rain.every(drop=>drop.x>=BOARD.minX-rainMargin&&drop.x<=BOARD.maxX+rainMargin&&drop.z>=BOARD.minZ-rainMargin&&drop.z<=BOARD.maxZ+rainMargin),'rain escaped full-board field');
const rainXs=rain.map(drop=>drop.x),rainZs=rain.map(drop=>drop.z);
assert(Math.min(...rainXs)<BOARD.minX+1&&Math.max(...rainXs)>BOARD.maxX-1,'rain does not reach both X edges');
assert(Math.min(...rainZs)<BOARD.minZ+1&&Math.max(...rainZs)>BOARD.maxZ-1,'rain does not reach both Z edges');
const desktopAspect=1100/760;
const desktopSpan=Math.max(37,54/desktopAspect)/1.9;
const panBounds=getCameraPanBounds(BOARD,Math.PI*0.68,0.96,desktopSpan*desktopAspect,desktopSpan);
assert(panBounds.minX<-8&&panBounds.maxX>8&&panBounds.minZ<-7&&panBounds.maxZ>7,'close-view pan remains limited to the old town-center clamp');
assert.deepEqual(clampToPanBounds({x:-999,z:999},panBounds),{x:panBounds.minX,z:panBounds.maxZ},'camera target is not clamped to computed board coverage');
const dragAlpha=Math.PI*0.68,dragBeta=0.96,dragScale=0.04;
const dragRight=getDragPanDelta(dragAlpha,dragBeta,120,0,dragScale);
const screenRight={x:Math.sin(dragAlpha),z:-Math.cos(dragAlpha)};
assert(dragRight.x*screenRight.x+dragRight.z*screenRight.z>0,'dragging right should pan the camera target right');
const dragDown=getDragPanDelta(dragAlpha,dragBeta,0,120,dragScale);
const screenForward={x:Math.cos(dragAlpha),z:Math.sin(dragAlpha)};
assert(dragDown.x*screenForward.x+dragDown.z*screenForward.z<0,'dragging down should pan the camera target backward');
const townSceneSource=readFileSync('src/components/TownScene.tsx','utf8');
assert(!townSceneSource.includes('1450'),'town loading overlay still imposes an artificial 1450ms wait');
assert(runtimeSource.includes('onFirstFrame'),'town loading overlay is not tied to the first rendered frame');
assert.equal(getTownLoadingProfile(0).phase,'quiet','short loads should keep the town loader visually quiet');
assert.equal(getTownLoadingProfile(TOWN_LOADING_THRESHOLDS.reveal).phase,'quick','town loader should reveal after the quiet threshold');
assert.equal(getTownLoadingProfile(TOWN_LOADING_THRESHOLDS.label).phase,'steady','town loader label should appear only for a sustained load');
assert.equal(getTownLoadingProfile(TOWN_LOADING_THRESHOLDS.patient).phase,'patient','long loads should use the calmer patient motion');
assert(getTownLoadingProfile(1500).cycleMs>getTownLoadingProfile(120).cycleMs,'loader motion should adapt to actual elapsed loading time');

const geometry=roundedBox(2,1,3,0.02);
assert(geometry.positions.length>24*3,'brick has no real bevel geometry');
for(let i=0;i<geometry.normals.length;i+=3)assert(Math.abs(Math.hypot(...geometry.normals.slice(i,i+3))-1)<1e-5,'non-unit bevel normal');
for(let i=0;i<geometry.positions.length;i+=3){assert(Math.abs(geometry.positions[i])<=1.00001);assert(Math.abs(geometry.positions[i+1])<=0.50001);assert(Math.abs(geometry.positions[i+2])<=1.50001);}
const posts=[{id:'single'},{id:'series-2',series:'notes',seriesIndex:2},{id:'series-1',series:'notes',seriesIndex:1}];
const layout=createTownLayout('brick-verification',posts);
assert.equal(layout.plots.length,2);
assert(layout.reservedPlots.length >= 96,'expanded town should expose a stable pool of empty article lots');
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
const crown=world.meshes.find(mesh=>mesh.name.startsWith('tree-picking:'));
const firstTree=world.trees[0];
assert.equal(crown.visibility,0,'tree picking hull became visible');
assert(scene.pickWithRay(new Ray(new Vector3(firstTree.x,4,firstTree.z),new Vector3(0,-1,0)),mesh=>mesh===crown).hit,'instanced tree crowns stopped occluding article picking');
for(const tree of world.decor){
  assert(!world.inHouse(tree,tree.radius),'tree crown overlaps an article building');
  assert(!world.isRoad(tree,tree.radius),'tree crown overlaps road/access path');
  assert(!world.isWater(tree,tree.radius),'tree crown overlaps water');
  assert(inTownOutline(tree,tree.radius),'tree outside brick outline');
}
assert(world.decor.some(outsideOriginalBoard),'extended terrain has no trees or decorations');
assert(world.groundTiles.some(outsideOriginalBoard)&&world.waterTiles.some(outsideOriginalBoard),'land/river did not extend past the old board');
const bed=world.meshes.find(mesh=>mesh.name.startsWith('foundation:'));
const waterTile=world.waterTiles[0];
const bedMatrix=bed.thinInstanceGetWorldMatrices().find(matrix=>Math.abs(matrix.m[12]-waterTile.x)<.001&&Math.abs(matrix.m[14]-waterTile.z)<.001);
assert(bedMatrix&&bedMatrix.m[13]+.3<-.1,'foundation buried the water surface');
assert(!inTownOutline({x:townTerrainBounds.maxX,z:townTerrainBounds.maxZ}),'map still has rectangular corners');
for(const lot of layout.reservedPlots) assert(inTownOutline(lot,Math.hypot(lot.width,lot.depth)/2),'existing article lot falls outside the expanded island');
const many=createTownLayout('growth',Array.from({length:8},(_,i)=>({id:`post-${i}`})));
const mapModel=createTownMapModel(many,'post-7');
assert.equal(mapModel.buildings.length,many.plots.length,'mini-map omitted a generated building');
assert(mapModel.selected?.postIds.includes('post-7'),'mini-map did not select the article building');
for(const building of mapModel.worldBuildings){
  const plot=many.plots.find(candidate=>candidate.id===building.id);
  assert(plot,'mini-map invented a building not present in the world layout');
  assert.deepEqual({x:building.x,z:building.z,width:building.width,depth:building.depth},{x:plot.x,z:plot.z,width:plot.width,depth:plot.depth},'mini-map transformed a world building coordinate');
}
let overflowError='';
try{createTownLayout('capacity',Array.from({length:700},(_,i)=>({id:`capacity-${i}`})));}
catch(error){overflowError=String(error?.message??error);}
const overflowMatch=overflowError.match(/article group (\d+)/);
const maxBuildings=overflowMatch?Number(overflowMatch[1])-1:300;
assert(maxBuildings>54,'expanded layout did not add outer building capacity');
assert(overflowError.includes('No collision-free article building lot remains'),'overflow should fail with a collision-free lot error');
assert.equal(many.plots.length,8);
for(const plot of many.plots){assert(isBuildablePlot(plot,many.plots.filter(p=>p!==plot)),'new article does not fit occupancy model');}
console.log(JSON.stringify({rainDrops:rain.length,panBounds,houses:houses.length,articleFloors:posts.length,bevelVertices:geometry.positions.length/3,decor:world.decor.length,mergedMeshes:world.meshes.length,worldVertices:world.meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0),growthBuildings:many.plots.length,maxBuildings,overflowError},null,2));
scene.dispose();engine.dispose();
