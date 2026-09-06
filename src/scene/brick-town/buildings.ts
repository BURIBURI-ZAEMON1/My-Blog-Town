import { TransformNode, type Scene } from '@babylonjs/core';
import type { TownPlot } from '../../data/town-layout';
import { BrickKit, COLORS as C, COURSE as H, STUD as S } from './kit';

export const FLOOR_HEIGHT = H * 7;
export const GROUND_Y = 0.10;

export function buildHouse(scene: Scene, plot: TownPlot) {
  const root = new TransformNode(`house:${plot.id}`, scene);
  root.position.set(plot.x, GROUND_Y, plot.z);
  const kit = new BrickKit(scene, root);
  const ids = plot.seriesPostIds ?? [plot.postId!];
  const styles = [
    { wall: C.cream, trim: C.ivory, roof: C.red, accent: C.darkRed },
    { wall: '#d4a75d', trim: C.ivory, roof: C.navy, accent: C.blue },
    { wall: '#a6b8a4', trim: C.ivory, roof: C.coral, accent: C.darkRed },
  ];
  const style = styles[plot.accent % styles.length];
  // Six by five studs. Footprint is exactly the layout footprint, no root scaling.
  const nx = Math.round(plot.width / S), nz = Math.round(plot.depth / S);
  const w = nx * S, d = nz * S;
  kit.brick(0, 0, 0, nx, nz, C.roadLight, H / 3, false, ids[0]);
  ids.forEach((id, floor) => {
    const base = H / 3 + floor * FLOOR_HEIGHT;
    for (let course = 0; course < 7; course++) {
      const y = base + course * H;
      // Each wall is individually moulded bricks with alternating mortar joints.
      for (const side of [-1, 1]) {
        for (let col = 0; col < nx; col++) {
          const x = (col - (nx - 1) / 2) * S;
          const isWindow = (col === 1 || col === nx - 2) && course >= 3 && course <= 5;
          const isDoor = side === 1 && (col === 2 || col === 3) && course <= 3;
          if (!isWindow && !isDoor) kit.brick(x, y, side * (d - S) / 2, 1, 1, course === 0 ? C.sand : style.wall, H, course === 6, id);
        }
        for (let row = 1; row < nz - 1; row++) {
          const isWindow = row === 2 && course >= 3 && course <= 5;
          if (!isWindow) kit.brick(side * (w - S) / 2, y, (row - (nz - 1) / 2) * S, 1, 1, course === 0 ? C.sand : style.wall, H, course === 6, id);
        }
      }
      if (course === 0 || course === 6) kit.box(0, y + H * 0.78, d / 2 - 0.02, w, H * 0.18, 0.06, style.trim, 0, id);
    }
    // Inset panes + raised sills + separate mullions on all visible facades.
    for (const facade of [-1, 1]) for (const side of [-1, 1]) {
      const x = side * (nx - 3) * S / 2, z = facade * (d / 2 - 0.06), wy = base + H * 4.5;
      kit.box(x, wy, z, S * 0.9, H * 2.9, 0.045, '#5e97a4', 0, id, true);
      for (const edge of [-1, 1]) kit.box(x + edge * S * 0.48, wy, z + facade * 0.055, 0.045, H * 3.2, 0.07, C.ivory, 0, id);
      for (const edge of [-1, 0, 1]) kit.box(x, wy + edge * H * 1.5, z + facade * 0.055, S * 1.08, 0.042, 0.07, C.ivory, 0, id);
      kit.box(x, wy, z + facade * 0.06, 0.025, H * 3, 0.07, C.ivory, 0, id);
      kit.box(x, base + H * 2.82, z + facade * 0.08, S * 1.3, 0.07, 0.16, C.sand, 0, id);
      // Flower boxes stay inside the occupied plot envelope.
      if (facade === 1) {
        kit.box(x, base + H * 2.4, d / 2 - 0.04, S * 1.2, 0.12, 0.14, C.brown, 0, id);
        for (const off of [-0.1, 0, 0.1]) {
          kit.cylinder(x + off, base + H * 2.7, d / 2 - 0.04, 0.11, 0.1, C.leaf, id);
          kit.cylinder(x + off, base + H * 2.96, d / 2 - 0.04, 0.085, 0.06, side === 1 ? C.yellow : C.coral, id);
        }
      }
    }
    for (const side of [-1, 1]) {
      const wy = base + H * 4.5, x = side * (w / 2 - 0.07);
      kit.box(x, wy, 0, 0.06, H * 2.9, S * 0.88, '#5e97a4', 0, id, true);
      for (const t of [-1, 1]) kit.box(x + side * 0.045, wy, t * S * 0.48, 0.07, H * 3.2, 0.035, C.ivory, 0, id);
      for (const t of [-1, 0, 1]) kit.box(x + side * 0.045, wy + t * H * 1.5, 0, 0.07, 0.035, S, C.ivory, 0, id);
    }
    const dy = base + H * 2;
    kit.box(0, dy, d / 2 - 0.07, S * 1.82, H * 3.8, 0.08, style.accent, 0, id);
    kit.box(0, dy + H * 0.7, d / 2 - 0.018, S * 1.25, H * 1.5, 0.035, '#74a8ac', 0, id, true);
    kit.cylinder(S * 0.55, dy - H * 0.4, d / 2 - 0.005, 0.055, 0.05, C.yellow, id);
    // Striped canopy over front entrance, at the top of the door rather than in midair.
    for (let col = 0; col < 4; col++) kit.box((col - 1.5) * S * 0.5, base + H * 4.1, d / 2 - 0.04, S * 0.5 - 0.012, 0.10, 0.28, col % 2 ? C.ivory : style.roof, 0, id);
  });
  const roofBase = H / 3 + ids.length * FLOOR_HEIGHT;
  // Stepped gable: horizontal roof tiles slope inward by one stud every course.
  const topId = ids.at(-1)!;
  for (let level = 0; level < Math.ceil(nx / 2); level++) {
    const rw = nx - level * 2;
    if (rw <= 0) break;
    for (let col = 0; col < rw; col++) for (let row = 0; row < nz; row++) {
      kit.brick((col - (rw - 1) / 2) * S, roofBase + level * H * 1.1, (row - (nz - 1) / 2) * S, 1, 1, (row + col) % 5 === 0 ? style.accent : style.roof, H * 1.1, true, topId);
    }
  }
  for (let i = 0; i < 4; i++) kit.brick(w * 0.25, roofBase + i * H, -d * 0.25, 1, 1, C.sand, H, i === 3, topId);
  kit.brick(w * 0.25, roofBase + H * 4, -d * 0.25, 1, 1, C.ivory, H / 3, false, topId);
  const meshes = kit.flush(`house:${plot.id}`);
  return { root, meshes, plot, ids, roofY: roofBase + H * 4 };
}
