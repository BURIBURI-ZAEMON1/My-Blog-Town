import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { NullEngine, Scene, Mesh, Matrix, Vector3 } from '@babylonjs/core';
const require = createRequire(import.meta.url), cache = new Map();
function load(path) {
  const absolute = resolve(path);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} }; cache.set(absolute, module);
  const output = ts.transpileModule(readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = id => id.startsWith('.') ? load(resolve(dirname(absolute), `${id}.ts`)) : require(id);
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}
const { ThinBrickKit, BrickKit } = load('src/scene/brick-town/kit.ts');
const engine = new NullEngine(), scene = new Scene(engine);
const originalRefresh = Mesh.prototype.thinInstanceRefreshBoundingInfo;
let refreshes = 0;
Mesh.prototype.thinInstanceRefreshBoundingInfo = function (...args) { refreshes++; return originalRefresh.apply(this, args); };
try {
  const kit = new ThinBrickKit(scene, 'instance-regression');
  const transforms = Array.from({ length: 200 }, (_, i) => ({ x: Math.sin(i) * 20, y: i * .01, z: Math.cos(i) * 12, yaw: i % 3 ? 0 : i * .14 }));
  for (const p of transforms) kit.box(p.x, p.y, p.z, .72, .2, 1.08, '#547a3c', p.yaw);
  const [mesh] = kit.flush('instances');
  const matrices = mesh.thinInstanceGetWorldMatrices();
  assert.equal(matrices.length, transforms.length);
  for (let i = 0; i < transforms.length; i++) {
    const p = transforms[i], expected = Matrix.RotationY(p.yaw); expected.setTranslationFromFloats(p.x, p.y, p.z);
    assert.deepEqual([...matrices[i].asArray()], [...expected.asArray()], 'instance transform changed');
    for (const point of mesh.rawBoundingInfo.boundingBox.vectors) {
      const world = Vector3.TransformCoordinates(point, matrices[i]);
      const bounds = mesh.getBoundingInfo().boundingBox;
      assert(world.x >= bounds.minimum.x - 1e-5 && world.x <= bounds.maximum.x + 1e-5 && world.y >= bounds.minimum.y - 1e-5 && world.y <= bounds.maximum.y + 1e-5 && world.z >= bounds.minimum.z - 1e-5 && world.z <= bounds.maximum.z + 1e-5, 'instance bounds clipped rendered geometry');
    }
  }
  assert.equal(refreshes, 1, 'static instance bounds were recalculated after buffer upload already calculated them');
  const grouped = new BrickKit(scene);
  grouped.anchor = { x: 3, z: 4 };
  grouped.box(2,0,3,1,1,1,'#547a3c');
  grouped.box(4,1,5,1,1,1,'#547a3c');
  const [tree] = grouped.flush('whole-tree');
  const anchors = tree.getVerticesData('edgeAnchor');
  for (let i=0;i<anchors.length;i+=2) assert.deepEqual(anchors.slice(i,i+2), [3,4], 'one tree was split into independent reveal pieces');
  console.log('PASS: exact instance transforms/bounds, one bounds calculation, unchanged geometry.');
} finally { Mesh.prototype.thinInstanceRefreshBoundingInfo = originalRefresh; scene.dispose(); engine.dispose(); }
