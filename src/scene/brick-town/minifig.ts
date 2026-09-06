import { DynamicTexture, MeshBuilder, PBRMaterial, Color3, TransformNode, type Scene } from '@babylonjs/core';
import { BrickKit, COLORS as C } from './kit';
import type { TownPersonRole } from '../../data/town-life';

// Articulated moulded body parts. Shoulders and hips are actual pivots.
export function buildMinifig(scene:Scene,role:TownPersonRole,index:number,night:boolean,rainy:boolean) {
  const root=new TransformNode(`minifig:${index}`,scene);
  root.scaling.setAll(0.68);
  const kit=new BrickKit(scene,root);
  const shirt=role==='guard'?C.blue:role==='thief'?C.black:[C.coral,C.teal,'#e2b04b',C.navy][index%4];
  const pants=role==='thief'?C.navy:C.dark;
  kit.box(0,0.68,0,0.42,0.43,0.24,shirt);
  kit.box(0,0.43,0,0.40,0.095,0.24,pants);
  kit.cylinder(0,0.94,0,0.16,0.09,C.yellow);
  kit.cylinder(0,1.10,0,0.34,0.28,C.yellow);
  kit.cylinder(0,1.265,0,0.19,0.06,C.yellow);
  // Printed facial graphic, mapped only to the front of the cylindrical head.
  const faceTex=new DynamicTexture(`face:${index}`,{width:128,height:128},scene,false);
  const ctx=faceTex.getContext();ctx.clearRect(0,0,128,128);ctx.fillStyle='#202626';
  for(const x of [39,89]){ctx.beginPath();ctx.arc(x,46,6,0,Math.PI*2);ctx.fill();}
  ctx.lineWidth=5;ctx.strokeStyle='#202626';ctx.beginPath();ctx.arc(64,66,24,0.18,Math.PI-0.18);ctx.stroke();faceTex.update();faceTex.hasAlpha=true;
  const face=MeshBuilder.CreatePlane(`face:${index}`,{width:0.24,height:0.23},scene);face.position.set(0,1.10,0.174);face.rotation.y=Math.PI;face.parent=root;
  const faceMat=new PBRMaterial(`face-ink:${index}`,scene);faceMat.albedoTexture=faceTex;faceMat.useAlphaFromAlbedoTexture=true;faceMat.metallic=0;faceMat.roughness=0.4;faceMat.backFaceCulling=false;face.material=faceMat;
  // Costume silhouette and small printed torso details.
  if(role==='guard'){
    kit.cylinder(0,1.28,0,0.40,0.12,C.road);kit.cylinder(0,1.37,0,0.32,0.09,C.road,undefined,0.06);
    kit.box(0,0.72,0.14,0.26,0.29,0.035,C.road);kit.box(0,0.77,0.164,0.05,0.12,0.018,C.yellow);
  } else if(role==='thief') {
    kit.cylinder(0,1.27,-0.02,0.39,0.14,C.black);kit.box(0,1.0,0.17,0.32,0.08,0.04,C.black);
    for(const x of [-0.11,0,0.11])kit.box(x,0.72,0.132,0.04,0.3,0.025,C.road);
  } else {
    kit.cylinder(0,1.28,0,role==='traveler'?0.48:0.39,0.07,role==='traveler'?C.sand:C.brown);
    kit.cylinder(0,1.34,0,0.30,0.08,role==='traveler'?C.sand:C.brown);
    kit.box(0,0.70,0.136,0.045,0.3,0.022,C.ivory);
  }
  if(role==='traveler') {
    kit.box(0,0.70,-0.22,0.34,0.37,0.18,C.sand);kit.box(0,0.83,-0.33,0.3,0.07,0.06,C.brown);
    for(const x of [-0.16,0.16])kit.box(x,0.73,0.133,0.05,0.34,0.025,C.brown);
  }
  const limbs:TransformNode[]=[];
  for(const side of [-1,1]) {
    const hip=new TransformNode(`hip:${index}:${side}`,scene);hip.parent=root;hip.position.set(side*0.11,0.40,0);
    const leg=new BrickKit(scene,hip);leg.box(0,-0.17,0,0.18,0.31,0.20,pants);leg.box(0,-0.31,0.06,0.18,0.11,0.31,pants);leg.flush('leg');limbs.push(hip);
  }
  for(const side of [-1,1]) {
    const shoulder=new TransformNode(`shoulder:${index}:${side}`,scene);shoulder.parent=root;shoulder.position.set(side*0.28,0.85,0);shoulder.rotation.z=side*0.13;
    const arm=new BrickKit(scene,shoulder);arm.cylinder(0,-0.13,0,0.17,0.27,shirt);arm.cylinder(0,-0.33,0.025,0.16,0.13,C.yellow);arm.box(0,-0.36,0.07,0.05,0.07,0.12,C.yellow);arm.flush('arm');limbs.push(shoulder);
  }
  let torch;
  if(role==='guard'&&night) {
    kit.cylinder(0.36,0.9,0.07,0.055,0.65,C.brown);
    const flame=new BrickKit(scene,root);flame.cylinder(0.36,1.28,0.07,0.13,0.22,C.yellow,undefined,0.015);torch=flame.flush('torch')[0];
    const mat=torch.material as PBRMaterial;mat.emissiveColor=Color3.FromHexString('#ff9634');mat.emissiveIntensity=1.8;
  }
  if(rainy) {
    kit.cylinder(0.25,1.28,0,0.04,1.1,C.black);
    for(let level=0;level<3;level++)kit.cylinder(0.25,1.78+level*0.065,0,1.0-level*0.23,0.07,index%2?C.red:C.blue);
  }
  kit.flush('figure');
  const meshes=root.getChildMeshes();meshes.forEach(m=>{m.isPickable=false;});
  return {root,limbs,meshes,torch};
}
