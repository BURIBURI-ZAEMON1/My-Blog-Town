// TOWN_BLOG_TEST_URL=http://127.0.0.1:4325 PLAYWRIGHT_CHANNEL=chrome node scripts/verify-town-lighting.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
const errors=[];
const snapshot=page=>page.locator('canvas').evaluate(canvas=>({...canvas.dataset}));
const idle=async page=>{
  try {await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.effectsReady==='true'&&document.querySelector('canvas')?.dataset.renderLoop==='idle',null,{timeout:120000});}
  catch(error){console.error('Unsettled lighting',await snapshot(page),errors);throw error;}
};
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:760},isMobile:mobile,hasTouch:mobile,colorScheme:'light',reducedMotion:'reduce',timezoneId:'Asia/Shanghai'});
    await context.addInitScript(()=>{
      window.__townClock=Date.parse('2026-06-01T12:00:00+08:00');Date.now=()=>window.__townClock;
      window.__solarShaders={count:0,parallel:false,perspective:false,cloud:false,pcf:false};
      for(const Type of [WebGLRenderingContext,WebGL2RenderingContext]) {
        const original=Type.prototype.shaderSource;
        Type.prototype.shaderSource=function(shader,source) {
          // Inspect what Babylon actually sends to the GPU, after include and
          // plugin expansion. This catches engine upgrades silently losing hooks.
          if(source.includes('vTownEdge')&&source.includes('diffuseBase')) {
            const result=window.__solarShaders;result.count++;
            result.parallel ||= source.includes('viewDirectionW=normalize(townViewDirection)');
            result.perspective ||= source.includes('viewDirectionW=normalize(vEyePosition.xyz-vPositionW)');
            result.cloud ||= /^#define TOWN_CLOUD_SHADOWS\s*$/m.test(source);
            result.pcf ||= /^#define SHADOWPCF\d/m.test(source);
          }
          return original.call(this,shader,source);
        };
      }
    });
    const page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(process.env.TOWN_BLOG_TEST_URL||'http://127.0.0.1:4325/');await idle(page);
    const noon=await snapshot(page),shaders=await page.evaluate(()=>window.__solarShaders);
    console.log(mobile?'mobile':'desktop',noon.sunIntensity,shaders);
    assert(shaders.count>0&&shaders.parallel&&!shaders.perspective,'town still uses camera-position specular rays');
    assert.equal(shaders.cloud,!mobile,'cloud shadow shader did not follow the mobile budget');
    assert.equal(shaders.pcf,!mobile,'expensive filtered solar shadows enabled on mobile or missing on desktop');
    assert.equal(noon.studioReflections,'false');assert.equal(noon.cloudShadows,mobile?'off':'on');
    assert.equal(+noon.cloudShadowStrength,mobile?0:.4);
    assert.equal(noon.lightCount,'2');assert.equal(noon.weather,'clear');assert(+noon.sunIntensity/+noon.skyIntensity>5);
    if(!mobile) {
      const box=await page.locator('canvas').boundingBox();
      await page.mouse.move(box.x+box.width*.5,box.y+box.height*.7);await page.mouse.down();
      await page.mouse.move(box.x+box.width*.5+80,box.y+box.height*.7+25,{steps:8});await page.mouse.up();await idle(page);
      const panned=await snapshot(page);
      assert.notEqual(panned.cameraX,noon.cameraX);assert.equal(panned.sunDirection,noon.sunDirection);assert.equal(panned.sunIntensity,noon.sunIntensity);
      for(const [hour,day] of [[7,1],[17,1],[22,1],[12,11]]) {
        await page.evaluate(({hour,day})=>{
          window.__townClock=Date.parse(`2026-06-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00+08:00`);
          document.dispatchEvent(new Event('visibilitychange'));
        },{hour,day});
        await page.waitForFunction(hour=>+document.querySelector('canvas').dataset.solarHour===hour,hour);await idle(page);
        const next=await snapshot(page);assert.equal(next.canvasBackground,noon.canvasBackground);
        console.log('solar state',hour,day,next.sunIntensity,next.weather);
        if(hour===7)assert(+next.sunDirection.split(',')[0]<0&&+next.sunIntensity<+noon.sunIntensity);
        if(hour===17)assert(+next.sunDirection.split(',')[0]>0&&+next.sunIntensity<+noon.sunIntensity);
        if(hour===22){assert.equal(+next.sunIntensity,0);assert.equal(+next.windowLight,1);assert.equal(+next.cloudShadowStrength,0);}
        if(day===11){assert.equal(next.weather,'rain');assert.equal(+next.sunIntensity,0);assert.equal(+next.cloudShadowStrength,0);}
      }
      await page.getByRole('button',{name:'切换昼夜模式',exact:true}).click();await idle(page);
      const locked=await snapshot(page);assert.equal(+locked.solarHour,22);assert.equal(+locked.sunIntensity,0);
      assert.notEqual(locked.canvasBackground,noon.canvasBackground);
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: parallel orthographic reflections, no studio lights, sun anchored during pan, morning/evening/night/rain, theme lock, desktop cloud/PCF shadows and mobile budget');
} finally {await browser.close();}
