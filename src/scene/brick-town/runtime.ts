import {
  ArcRotateCamera, Camera, Color3, Color4, CubeTexture, DirectionalLight, Engine,
  GlowLayer, HemisphericLight, HighlightLayer, ImageProcessingConfiguration,
  Matrix, MeshBuilder, PBRMaterial, Scene, ShadowGenerator, Vector3,
  SSAO2RenderingPipeline, DefaultRenderingPipeline,
} from '@babylonjs/core';
import { BOARD, buildWorld, randomFor } from './world';
import { buildHouse, FLOOR_HEIGHT, GROUND_Y } from './buildings';
import { buildMinifig } from './minifig';
import { createLife, tickLife, type Citizen } from './life';
import { weatherIsRainy } from '../../data/town-rain';
import type { TownLayout } from '../../data/town-layout';
import type { TownSceneProps } from './types';

export type SceneState = Pick<TownSceneProps,'activePostId'|'hoveredPostId'|'query'|'category'|'tag'|'colorMode'|'reducedMotion'>;
export type SceneCallbacks = Pick<TownSceneProps,'onHoverPost'|'onResolvePostAnchor'|'onSelectPost'>;
const color=(hex:string)=>Color3.FromHexString(hex);

export function mountBrickTown(canvas:HTMLCanvasElement,layout:TownLayout,posts:TownSceneProps['posts'],initial:SceneState,callbacks:()=>SceneCallbacks) {
  const mobile=canvas.clientWidth<720;
  const engine=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:false,powerPreference:'default'});
  engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio,mobile?1.25:1.5));
  const scene=new Scene(engine);
  scene.clearColor=Color4.FromHexString('#e3ddcdff');
  scene.environmentTexture=CubeTexture.CreateFromPrefilteredData('/assets/brick-town/studio.env',scene);
  scene.environmentIntensity=0.75;
  scene.imageProcessingConfiguration.toneMappingEnabled=true;
  scene.imageProcessingConfiguration.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure=1.15;
  scene.imageProcessingConfiguration.contrast=1.06;
  const camera=new ArcRotateCamera('diorama-camera',Math.PI*0.68,0.96,36,new Vector3(0,0.2,0),scene);
  camera.mode=Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ=0.1;camera.maxZ=160;
  // Deliberate fixed composition keeps the article frontage readable. Zoom is
  // explicit; a click/touch never gets confused with an orbit gesture.
  const defaultZoom=mobile?1:1.9;
  let zoom=defaultZoom;
  const fit=()=>{
    const aspect=canvas.clientWidth/Math.max(1,canvas.clientHeight);
    const span=(mobile?34:Math.max(37,54/aspect))/zoom;
    camera.orthoTop=span/2;camera.orthoBottom=-span/2;
    camera.orthoLeft=-span*aspect/2;camera.orthoRight=span*aspect/2;
    engine.resize();
  };
  fit();
  const hemi=new HemisphericLight('cool-sky',new Vector3(0,1,0),scene);
  hemi.diffuse=color('#dce7ed');hemi.groundColor=color('#706748');hemi.intensity=0.42;
  const sun=new DirectionalLight('large-window-sun',new Vector3(-0.5,-1,-0.65),scene);
  sun.position.set(12,25,16);sun.diffuse=color('#fff0d2');sun.intensity=1.5;
  sun.shadowMinZ=0.1;sun.shadowMaxZ=100;
  const shadows=new ShadowGenerator(mobile?1024:2048,sun);
  shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias=0.00012;shadows.normalBias=0.018;
  shadows.getShadowMap()!.refreshRate=2;
  const world=buildWorld(scene,layout);
  const houses=layout.plots.map(p=>buildHouse(scene,p));
  const houseMeshes=houses.flatMap(h=>h.meshes);
  for(const m of [...world.meshes,...houseMeshes])shadows.addShadowCaster(m);
  const glow=new GlowLayer('warm-window-scatter',scene,{mainTextureRatio:0.35});glow.intensity=0.22;
  // Empty include lists glow every emissive object. Explicit exclusions prevent
  // filter outlines from turning whole houses into night lights.
  for(const m of world.meshes)glow.addExcludedMesh(m);
  for(const m of houseMeshes)if(!m.metadata.glass)glow.addExcludedMesh(m);
  const highlights=new HighlightLayer('article-floor-highlight',scene,{mainTextureRatio:0.5});
  highlights.blurHorizontalSize=0.55;highlights.blurVerticalSize=0.55;highlights.innerGlow=false;
  let ao:SSAO2RenderingPipeline|undefined;
  if(!mobile&&engine.webGLVersion===2) {
    ao=new SSAO2RenderingPipeline('brick-contact-shadows',scene,{ssaoRatio:0.65,blurRatio:0.75},[camera]);
    ao.radius=0.35;ao.totalStrength=1.0;ao.samples=12;ao.expensiveBlur=false;
  }
  const pipeline=new DefaultRenderingPipeline('photographic-finish',true,scene,[camera]);
  pipeline.fxaaEnabled=true;pipeline.samples=1;
  pipeline.imageProcessingEnabled=false;pipeline.bloomEnabled=false;
  const postMap=new Map(posts.map(p=>[p.id,p]));
  let state={...initial};let disposed=false;let frames=0;let elapsed=0;
  let inView=true,visible=!document.hidden,lastFrame=0;
  let weatherSlot=Math.floor(Date.now()/900000),rainy=weatherIsRainy(layout.seed,weatherSlot);
  let citizens:Citizen[]=[],figures:ReturnType<typeof buildMinifig>[]=[];
  const rainRandom=randomFor(layout.seed+':rain');
  const drops=Array.from({length:mobile?100:300},()=>({x:-15+rainRandom()*27,z:-11+rainRandom()*22,y:1+rainRandom()*13,speed:6+rainRandom()*4}));
  const linePairs=drops.map(d=>[new Vector3(d.x,d.y,d.z),new Vector3(d.x-0.12,d.y-0.65,d.z-0.04)]);
  const rainMesh=MeshBuilder.CreateLineSystem('rain',{lines:linePairs,updatable:true},scene);
  rainMesh.color=color('#bad4dc');rainMesh.alpha=0.42;rainMesh.isPickable=false;
  function populate() {
    for(const f of figures){for(const m of f.meshes)shadows.removeShadowCaster(m);f.root.dispose(false,true);}
    citizens=createLife(layout,state.colorMode==='night',rainy,randomFor(`${layout.seed}:${state.colorMode}:${weatherSlot}`));
    figures=citizens.map((p,i)=>buildMinifig(scene,p.role,i,state.colorMode==='night',rainy));
    for(const f of figures)for(const m of f.meshes)shadows.addShadowCaster(m);
  }
  function lighting() {
    const night=state.colorMode==='night';
    scene.clearColor=Color4.FromHexString(night?'#24343cff':'#e3ddcdff');
    sun.intensity=night?0.45:rainy?0.75:1.5;sun.diffuse=color(night?'#9cbce8':rainy?'#dbe5e8':'#fff0d2');
    hemi.intensity=night?0.18:rainy?0.40:0.25;scene.environmentIntensity=night?0.20:0.5;
    scene.imageProcessingConfiguration.exposure=night?0.8:0.82;
    const table=world.table.material as PBRMaterial;table.albedoColor=color(night?'#24343c':'#d6cfbc').toLinearSpace();
    for(const m of houseMeshes)if(m.metadata.glass){
      const mat=m.material as PBRMaterial;mat.emissiveColor=night?color('#ffb751'):Color3.Black();mat.emissiveIntensity=night?1.5:0;
      mat.albedoColor=color(night?'#edbd6d':'#5e97a4');
    }
    for(const m of world.lamps){const mat=m.material as PBRMaterial;mat.emissiveColor=night?color('#ffba5b'):Color3.Black();mat.emissiveIntensity=night?1.5:0;}
    rainMesh.setEnabled(rainy);
  }
  function update(next:SceneState) {
    const rebuildPeople=next.colorMode!==state.colorMode;
    state={...next};if(rebuildPeople){populate();lighting();}
    const needle=state.query.trim().toLowerCase();
    for(const mesh of houseMeshes){
      const post=postMap.get(mesh.metadata.postId);if(!post)continue;
      const matches=!!(needle||state.category||state.tag)&&(!needle||[post.title,post.description,post.category,...post.tags,post.series??''].join(' ').toLowerCase().includes(needle))&&(!state.category||post.category===state.category)&&(!state.tag||post.tags.includes(state.tag));
      const direct=post.id===state.hoveredPostId||post.id===state.activePostId;
      if(direct||matches)highlights.addMesh(mesh,color(direct?'#90e3d4':'#edbb53'));else highlights.removeMesh(mesh);
    }
    if(state.hoveredPostId)anchor(state.hoveredPostId);
  }
  function anchor(id:string){
    const house=houses.find(h=>h.ids.includes(id));if(!house)return;
    const i=house.ids.indexOf(id),point=new Vector3(house.plot.x,GROUND_Y+(i+0.6)*FLOOR_HEIGHT,house.plot.z);
    const rect=canvas.getBoundingClientRect();
    const p=Vector3.Project(point,Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight()));
    const a={x:rect.left+p.x*rect.width/engine.getRenderWidth(),y:rect.top+p.y*rect.height/engine.getRenderHeight()};
    callbacks().onResolvePostAnchor(id,a);return a;
  }
  let lastHover:string|undefined;
  function pick(event:PointerEvent){
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    // Pick ALL real solid surfaces. Roof/terrain/tree occlusion is respected;
    // a hidden wall can never be clicked through another object.
    const hit=scene.pick(x,y,m=>m.isPickable&&m.isVisible);
    return hit?.hit?hit.pickedMesh?.metadata?.postId as string|undefined:undefined;
  }
  const onMove=(e:PointerEvent)=>{
    if(down&&e.buttons===1&&e.pointerType!=='touch'){
      const dx=e.clientX-down.lastX,dy=e.clientY-down.lastY;
      down.lastX=e.clientX;down.lastY=e.clientY;
      if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>7){
        const perPixel=(camera.orthoRight!-camera.orthoLeft!)/canvas.clientWidth;
        const right=new Vector3(Math.sin(camera.alpha),0,-Math.cos(camera.alpha));
        const forward=new Vector3(Math.cos(camera.alpha),0,Math.sin(camera.alpha));
        camera.target.addInPlace(right.scale(-dx*perPixel)).addInPlace(forward.scale(dy*perPixel/Math.cos(camera.beta)));
        camera.target.x=Math.max(-8,Math.min(8,camera.target.x));camera.target.z=Math.max(-7,Math.min(7,camera.target.z));
        return;
      }
    }
    const id=pick(e);canvas.style.cursor=id?'pointer':'grab';
    if(id!==lastHover){lastHover=id;callbacks().onHoverPost(id,id?{x:e.clientX,y:e.clientY}:undefined);}
  };
  const onLeave=()=>{lastHover=undefined;callbacks().onHoverPost(undefined);};
  let down:{x:number;y:number;lastX:number;lastY:number}|undefined;
  const onDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY};};
  const onUp=(e:PointerEvent)=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<7){const id=pick(e);if(id)callbacks().onSelectPost(id);}down=undefined;};
  canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerleave',onLeave);canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointerup',onUp);
  populate();lighting();update(initial);
  const resize=new ResizeObserver(()=>{fit();if(state.hoveredPostId)anchor(state.hoveredPostId);});resize.observe(canvas.parentElement!);
  function render(){
    if(disposed||!inView||!visible)return;
    const now=performance.now();if(now-lastFrame<(mobile?33:16))return;
    const dt=Math.min(0.05,lastFrame?(now-lastFrame)/1000:0.016);lastFrame=now;elapsed+=dt;
    const slot=Math.floor(Date.now()/900000);
    if(slot!==weatherSlot){weatherSlot=slot;rainy=weatherIsRainy(layout.seed,slot);populate();lighting();}
    if(!state.reducedMotion)tickLife(citizens,dt,layout);
    citizens.forEach((p,i)=>{
      const f=figures[i];f.root.position.set(p.position.x,0.10,p.position.z);
      // Raised bridge follows its real deck, with short ramps at both ends.
      if(world.bridge){const b=world.bridge,dx=p.position.x-b.x,dz=p.position.z-b.z,c=Math.cos(b.rotationY),s=Math.sin(b.rotationY),along=dx*c-dz*s,across=dx*s+dz*c;if(Math.abs(across)<0.85&&Math.abs(along)<2.2)f.root.position.y=0.10+0.12*Math.min(1,(2.2-Math.abs(along))/0.3);}
      if(p.state==='entering')f.root.position.z-=0.32*Math.min(1,p.timer/0.8);
      if(p.state==='exiting')f.root.position.z-=0.32*(1-Math.min(1,p.timer/0.8));
      // Conversation pose is derived from the base route position each frame,
      // never accumulated into the agent's navigation coordinates.
      if(p.conversation>0){const side=i%2?1:-1;f.root.position.x+=side*0.09*p.conversation;}
      f.root.rotation.y=Math.atan2(p.facing.x,p.facing.z);
      const step=p.moving&&!state.reducedMotion?Math.sin(elapsed*9+i)*0.36:0;
      f.limbs[0].rotation.x=step;f.limbs[1].rotation.x=-step;f.limbs[2].rotation.x=-step*0.6;f.limbs[3].rotation.x=step*0.6;
      const edge=Math.min(p.position.x-BOARD.minX,BOARD.maxX-p.position.x,p.position.z-BOARD.minZ,BOARD.maxZ-p.position.z);
      for(const m of f.meshes)m.visibility=p.opacity*Math.max(0,Math.min(1,edge/0.5));
    });
    if(rainy){for(let i=0;i<drops.length;i++){const d=drops[i];if(!state.reducedMotion){d.y-=dt*d.speed;if(d.y<0.1)d.y+=13;}linePairs[i][0].set(d.x,d.y,d.z);linePairs[i][1].set(d.x-0.12,d.y-0.65,d.z-0.04);}MeshBuilder.CreateLineSystem('rain',{lines:linePairs,instance:rainMesh},scene);}
    for(const m of world.glints)m.visibility=0.65+Math.sin(elapsed*1.5)*0.15;
    scene.render();frames++;
    canvas.dataset.ready='true';canvas.dataset.frames=String(frames);canvas.dataset.weather=rainy?'rain':'clear';canvas.dataset.renderer='webgl2';
  }
  const syncVisibility=()=>{if(inView&&visible){lastFrame=0;engine.runRenderLoop(render);}else engine.stopRenderLoop(render);};
  const observer=new IntersectionObserver(([entry])=>{inView=!!entry?.isIntersecting;syncVisibility();});observer.observe(canvas);
  const onVisibility=()=>{visible=!document.hidden;syncVisibility();};document.addEventListener('visibilitychange',onVisibility);
  engine.runRenderLoop(render);
  return {
    update,anchor,
    zoom(amount:number){zoom=Math.max(0.75,Math.min(2.6,zoom+amount));fit();},
    home(){zoom=defaultZoom;camera.target.set(0,0.2,0);fit();},
    dispose(){disposed=true;engine.stopRenderLoop(render);resize.disconnect();observer.disconnect();document.removeEventListener('visibilitychange',onVisibility);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerleave',onLeave);canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointerup',onUp);ao?.dispose();scene.dispose();engine.dispose();},
  };
}
