import { MeshBuilder, PBRMaterial, Color3, Scene } from '@babylonjs/core';
import { townTravelRoutes, roadCenterlines, roadWidths, riverCenterline, riverWidth, townCenterRoundaboutRadius, type TownLayout, type Point } from '../../data/town-layout';
import { samplePath, pointInPolygon, findPathIntersection } from '../../data/town-spatial';
import { makeThiefArrivalRoute } from '../../data/town-life';
import { BrickKit, STUD as S, COLORS as C, COURSE as H } from './kit';

export const BOARD = { minX: -34.56, maxX: 34.56, minZ: -28.80, maxZ: 28.80 };
const distanceTo = (p: Point, samples: Point[]) => {
  let best = Infinity;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i-1], b = samples[i], dx = b.x-a.x, dz = b.z-a.z;
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1)));
    best = Math.min(best, Math.hypot(p.x-a.x-t*dx, p.z-a.z-t*dz));
  }
  return best;
};
export function randomFor(seed: string) {
  let state = [...seed].reduce((sum, c) => (sum * 33 + c.charCodeAt(0)) >>> 0, 5381);
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296; };
}

export function buildWorld(scene: Scene, layout: TownLayout) {
  const kit = new BrickKit(scene), rand = randomFor(layout.seed);
  const roads = Object.entries(roadCenterlines).map(([key, path]) => ({ samples: samplePath(path, 12), width: roadWidths[key as keyof typeof roadWidths] }));
  const river = samplePath(riverCenterline, 12);
  const reserved = layout.reservedPlots ?? layout.plots;
  const access = layout.plots.map(plot=>makeThiefArrivalRoute(plot,townTravelRoutes,samplePath,layout.plots));
  const isRoad = (p: Point, clearance = 0) => access.some(path=>distanceTo(p,path)<0.30+clearance)||roads.some(r => distanceTo(p, r.samples) < r.width / 2 + clearance) || Math.hypot(p.x,p.z) < townCenterRoundaboutRadius + clearance;
  const inHouse = (p: Point, clearance = 0) => reserved.some(b => Math.abs(p.x-b.x) < b.width/2+clearance && Math.abs(p.z-b.z) < b.depth/2+clearance);
  const inEntity = (p:Point,clearance=0)=>layout.entities.some(e=>Math.abs(p.x-e.x)<e.width/2+clearance&&Math.abs(p.z-e.z)<e.depth/2+clearance);
  const isWater = (p: Point, clearance = 0) => distanceTo(p, river) < riverWidth/2+clearance;
  const width = BOARD.maxX - BOARD.minX, depth = BOARD.maxZ - BOARD.minZ;
  const centerX = (BOARD.maxX+BOARD.minX)/2;
  // The diorama has actual thickness and two moulded layers, not a vast flat plane.
  kit.box(centerX,-0.53,0,width+0.2,0.48,depth+0.2,C.dark);
  kit.box(centerX,-0.24,0,width,0.12,depth,C.sand);
  kit.box(centerX,-0.10,0,width,0.16,depth,C.pine);
  const greens = [C.green, C.green, C.green, C.moss, C.leaf];
  // Tile masks, picking, navigation and building occupation all use world X/Z.
  for (let x = BOARD.minX+S; x < BOARD.maxX; x+=S*2) for (let z=BOARD.minZ+S;z<BOARD.maxZ;z+=S*2) {
    const p = {x,z}, road = isRoad(p), wet = isWater(p), house = inHouse(p,0.2);
    if (wet && !road) {
      kit.brick(x,-0.10,z,2,2,rand()<0.25?C.waterLight:rand()<0.5?C.water:C.waterDeep,H/3,false);
      if (rand()<0.16) kit.box(x,0.008,z,S*1.4,0.024,S*0.13,'#abdadd');
    } else if (road) {
      const cobbles = [C.roadLight,C.road,C.sand];
      for (const dx of [-S/2,S/2]) for (const dz of [-S/2,S/2]) kit.brick(x+dx,0.01,z+dz,1,1,cobbles[Math.floor(rand()*cobbles.length)],H/3,false);
    } else {
      const shore = isWater(p,0.55);
      kit.brick(x,0.0,z,2,2,shore?C.sand:greens[Math.floor(rand()*greens.length)],H/3,!house);
    }
  }
  // Bridge built in a single local frame; its posts and deck share the same transform.
  const bridge = findPathIntersection(riverCenterline,roadCenterlines.west);
  if (bridge) {
    const angle=bridge.rotationY, c=Math.cos(angle),s=Math.sin(angle);
    for(let i=-5;i<=5;i++) {
      const x=bridge.x+c*i*S,z=bridge.z-s*i*S;
      kit.box(x,0.16,z,S-0.02,0.12,roadWidths.west+0.15,C.brown,angle);
      if(i%2===0) for(const edge of [-1,1]) {
        const px=x+s*edge*0.87,pz=z+c*edge*0.87;
        kit.box(px,0.43,pz,0.11,0.58,0.11,C.sand,angle);
        kit.cylinder(px,0.75,pz,0.17,0.06,C.ivory);
      }
    }
    for(const edge of [-1,1]) kit.box(bridge.x+s*edge*0.87,0.59,bridge.z+c*edge*0.87,4.1,0.12,0.10,C.sand,angle);
  }
  // Fountain made of concentric stepped brick courses and transparent-blue plates.
  const fountain = new BrickKit(scene);
  fountain.cylinder(0,0.10,0,1.76,0.16,C.roadLight);
  for(let i=0;i<12;i++) {
    const a=i*Math.PI/6;
    fountain.box(Math.cos(a)*0.65,0.27,Math.sin(a)*0.65,0.34,0.22,0.24,C.ivory,-a);
  }
  fountain.cylinder(0,0.2,0,1.12,0.035,C.water);
  fountain.cylinder(0,0.48,0,0.30,0.52,C.sand);
  fountain.cylinder(0,0.78,0,0.66,0.10,C.ivory);
  fountain.cylinder(0,0.85,0,0.50,0.06,C.waterLight);
  fountain.cylinder(0,0.97,0,0.15,0.25,C.ivory);
  const fountainMeshes=fountain.flush('fountain');
  // Benches, flower beds and lamps live outside the walking ring.
  for(const side of [-1,1]) {
    kit.box(side*1.30,0.30,0,0.25,0.10,0.9,C.brown);
    kit.box(side*1.43,0.45,0,0.08,0.36,0.9,C.brown);
    for(const z of [-0.32,0.32]) kit.box(side*1.3,0.19,z,0.12,0.25,0.12,C.black);
  }
  const lampPositions=[{x:-2.65,z:0.8},{x:2.6,z:-0.8},{x:-6.0,z:-1.1},{x:5.8,z:2.8}].filter(p=>!inHouse(p,0.45)&&!isRoad(p,0.12));
  const lamps: ReturnType<BrickKit['flush']>=[];
  for(const p of lampPositions) {
    kit.cylinder(p.x,0.18,p.z,0.26,0.2,C.black);
    kit.cylinder(p.x,0.72,p.z,0.07,1.0,C.black);
    kit.box(p.x,1.3,p.z,0.25,0.06,0.25,C.black);
    kit.cylinder(p.x,1.53,p.z,0.30,0.12,C.black,undefined,0.09);
    const lightKit=new BrickKit(scene); lightKit.box(p.x,1.4,p.z,0.17,0.16,0.17,C.yellow);
    lamps.push(...lightKit.flush('lamp'));
  }
  // Trees are layered leaf plates, not low-poly spheres. Deterministic occupancy
  // checks include the entire crown radius; decorative objects never occupy a plot.
  const decor: {x:number;z:number;radius:number}[]=[];
  function tree(x:number,z:number,size:number,autumn:boolean) {
    const leaf=autumn?C.yellow:C.leaf, shade=autumn?'#cb7d31':C.pine;
    kit.brick(x,0.09,z,1,1,C.brown,H*4,false);
    for(let level=0;level<4;level++) {
      const count=[3,4,3,2][level],y=0.70+level*H*0.9;
      for(let i=0;i<count;i++) for(let j=0;j<count;j++) {
        if((i===0||i===count-1)&&(j===0||j===count-1)&&count>2) continue;
        kit.brick(x+(i-(count-1)/2)*S*size,y,z+(j-(count-1)/2)*S*size,1,1,(i+j+level)%4===0?shade:leaf,H,true);
      }
    }
    kit.brick(x,1.5,z,1,1,leaf,H,true);
  }
  let attempts=0;
  while(decor.length<180&&attempts++<7000) {
    const x=BOARD.minX+1+rand()*(width-2),z=BOARD.minZ+1+rand()*(depth-2),p={x,z};
    if(isRoad(p,0.95)||isWater(p,0.95)||inHouse(p,1.0)||inEntity(p,0.8)||Math.hypot(x,z)<3.2)continue;
    if(decor.some(t=>Math.hypot(t.x-x,t.z-z)<1.3))continue;
    const inForest=layout.regions.some(r=>r.kind==='forest'&&pointInPolygon(p,r.polygon));
    if(!inForest&&rand()>0.32)continue;
    decor.push({x,z,radius:0.72});tree(x,z,1,rand()<0.13);
  }
  for(const e of layout.entities.filter(e=>e.kind==='fence')) {
    const angle=e.rotation??0,c=Math.cos(angle),s=Math.sin(angle);
    for(let i=-2;i<=2;i++){
      const x=e.x+c*i*e.width/5,z=e.z-s*i*e.width/5;
      kit.brick(x,0.08,z,1,1,C.ivory,H/3,false);
      kit.box(x,0.36,z,0.075,0.50,0.075,C.ivory,angle);
      kit.cylinder(x,0.64,z,0.12,0.06,C.ivory);
    }
    for(const y of [0.24,0.49])kit.box(e.x,y,e.z,e.width,0.065,0.065,C.ivory,angle);
  }
  // A vegetable patch made of furrows, studs and carrot tops.
  for(const entity of layout.entities.filter(e=>e.kind==='farm')) {
    if(entity.x<BOARD.minX+1||entity.x>BOARD.maxX-1||Math.abs(entity.z)>10)continue;
    for(let i=-2;i<=2;i++)for(let j=-1;j<=1;j++){
      const x=entity.x+i*S,z=entity.z+j*S;
      if(inHouse({x,z},0.2)||isRoad({x,z},0.1)||isWater({x,z}))continue;
      kit.brick(x,0.08,z,1,1,C.brown,H/3,false);
      kit.cylinder(x,0.23,z,0.12,0.15,'#d97732');kit.brick(x,0.31,z,1,1,C.leaf,H/3,false);
    }
  }
  // Individual flowers and boulders at checked, stable positions.
  for(let i=0;i<160;i++) {
    const x=BOARD.minX+0.6+rand()*(width-1.2),z=BOARD.minZ+0.6+rand()*(depth-1.2),p={x,z};
    if(isRoad(p,0.4)||isWater(p,0.35)||inHouse(p,0.5)||inEntity(p,0.2)||decor.some(t=>Math.hypot(t.x-x,t.z-z)<0.65))continue;
    if(i%3===0)kit.brick(x,0.1,z,1,1,C.road,H,true);
    else {kit.cylinder(x,0.22,z,0.055,0.27,C.pine);kit.cylinder(x,0.39,z,0.16,0.055,i%2?C.ivory:C.yellow);}
  }
  // Empty article lots are collision-only reservations. They intentionally
  // use the same ground as the rest of the diorama and receive no special
  // overlay, so trees and small props can naturally sit between them.
  const meshes=kit.flush('world');
  const waterMeshes=meshes.filter(m=>[C.water,C.waterLight,C.waterDeep].includes(m.metadata.baseColor));
  for(const m of waterMeshes){const mat=m.material as PBRMaterial;mat.roughness=0.13;mat.metallic=0.08;mat.clearCoat.intensity=0.7;}
  const glints=meshes.filter(m=>m.metadata.baseColor==='#abdadd');
  const table=MeshBuilder.CreateGround('studio-table',{width:200,height:200},scene);
  table.position.y=-0.81; table.receiveShadows=true; table.isPickable=false;
  const tableMaterial=new PBRMaterial('matte-studio',scene);tableMaterial.albedoColor=Color3.FromHexString('#d6cfbc').toLinearSpace();tableMaterial.roughness=0.93;tableMaterial.metallic=0;table.material=tableMaterial;
  return {meshes:[...meshes,...fountainMeshes],lamps,decor,table,bridge,glints,waterMeshes,isRoad,isWater,inHouse};
}
