import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import type { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';

/** Per-mesh state keeps shared town materials and seasonal colours intact. */
export class TownFocusMaterial extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, 'TownFocus', 190, {}, true, false);
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  getUniforms() {
    return { ubo: [{ name: 'townGlass', size: 1, type: 'float' }], fragment: 'uniform float townGlass;' };
  }
  hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh) {
    buffer.updateFloat('townGlass', subMesh.getRenderingMesh().metadata?.townGlass ?? 0);
  }
  getCustomCode(type: string) {
    return type === 'fragment' ? {
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: 'surfaceAlbedo = mix(surfaceAlbedo, vec3(.48, .53, .55), townGlass * .96);',
      '!float roughness=reflectivityOut\\.roughness;': 'float roughness=mix(reflectivityOut.roughness, .19, townGlass);',
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        finalEmissive *= 1.0 - townGlass;
        #ifdef SPECULARTERM
        finalSpecularScaled *= 1.0 + townGlass * .45;
        #endif`,
    } : null;
  }
}
