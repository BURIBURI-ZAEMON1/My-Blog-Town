import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createTownLayout, riverCenterline, riverWidth, roadCenterlines, roadWidths, type TownLayout, type TownPlot, type WorldRegion } from '../data/town-layout';
import { corridorMeshData, corridorMeshDataFromSamples, corridorPolygon, extendPathEndpoints, pathSegmentsInsidePolygon, samplePath } from '../data/town-spatial';
import type { ArticleSection } from '../lib/markdown';

export type TownPost = {
  id: string;
  townId: string;
  title: string;
  category: string;
  tags: string[];
  series?: string;
  seriesIndex?: number;
  description: string;
  date: string;
  updatedAt?: string;
  readingTime: number;
  wordCount: number;
  building: 'a' | 'b' | 'c' | 'forge' | 'shop' | 'home';
  mapId: string;
  cover?: string;
  coverAlt?: string;
  sections: ArticleSection[];
  searchText: string;
};

export type SceneAnchor = { x: number; y: number };

type Props = {
  posts: TownPost[];
  layout?: TownLayout;
  activePostId?: string;
  hoveredPostId?: string;
  query: string;
  category?: string;
  tag?: string;
  categoryPreview?: boolean;
  tagPreview?: boolean;
  colorMode: 'day' | 'night';
  reducedMotion: boolean;
  onHoverPost: (id?: string, anchor?: SceneAnchor) => void;
  onResolvePostAnchor: (id: string, anchor: SceneAnchor) => void;
  onSelectPost: (id: string) => void;
};

type Palette = {
  ground: number;
  groundDark: number;
  groundLight: number;
  soil: number;
  road: number;
  roadEdge: number;
  river: number;
  riverLight: number;
  forest: number;
  forestDark: number;
  forestLight: number;
  hill: number;
  hillFar: number;
  stone: number;
  ink: number;
  fog: number;
  sky: number;
};
type Point = { x: number; z: number };
type SpawnNode = { object: THREE.Object3D; delay: number; from: number; duration: number };
type SwayNode = { object: THREE.Object3D; phase: number; speed: number; amplitude: number; baseX: number; baseZ: number; baseScaleX: number; baseScaleY: number; baseScaleZ: number };
type WaterNode = { object: THREE.Object3D; material: THREE.Material & { opacity: number }; phase: number; speed: number; amplitude: number; baseX: number; baseZ: number; baseOpacity: number; flowX: number; flowZ: number };
type SmokeNode = { object: THREE.Mesh; material: THREE.MeshBasicMaterial; phase: number; height: number; drift: number; baseX: number; baseY: number; baseZ: number };
type PedestrianNode = { object: THREE.Group; route: Point[]; distances: number[]; totalDistance: number; distance: number; direction: 1 | -1; speed: number; phase: number; waitUntil: number; leftLeg: THREE.Object3D; rightLeg: THREE.Object3D; leftArm: THREE.Object3D; rightArm: THREE.Object3D };
type RainSystem = { group: THREE.LineSegments; positions: Float32Array; velocities: Float32Array; count: number; area: { minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom: number } };

type BuildingResult = { group: THREE.Group; floors: THREE.Mesh[]; smoke: SmokeNode[] };

const PALETTE: Record<'day' | 'night', Palette> = {
  day: {
    ground: 0x9ca77b,
    groundDark: 0x7f9067,
    groundLight: 0xb2b889,
    soil: 0x8a6c4e,
    road: 0xb79b72,
    roadEdge: 0x80694e,
    river: 0x5d8791,
    riverLight: 0xa5c1bd,
    forest: 0x526d50,
    forestDark: 0x344d3d,
    forestLight: 0x71845d,
    hill: 0x70806c,
    hillFar: 0x879187,
    stone: 0x888673,
    ink: 0x3d4035,
    fog: 0xb9c0ad,
    sky: 0xd2d5c7,
  },
  night: {
    ground: 0x3c514b,
    groundDark: 0x30463f,
    groundLight: 0x52665b,
    soil: 0x58483a,
    road: 0x746451,
    roadEdge: 0x4e4438,
    river: 0x3d7180,
    riverLight: 0x7399a0,
    forest: 0x2d493f,
    forestDark: 0x1f3732,
    forestLight: 0x456052,
    hill: 0x495b54,
    hillFar: 0x5f6c67,
    stone: 0x5d655f,
    ink: 0x1c2927,
    fog: 0x263532,
    sky: 0x1c2a2e,
  },
};

const toonGradient = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([34, 92, 156, 218, 255]), 5, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
})();

const toon = (params: THREE.MeshToonMaterialParameters) => {
  const material = new THREE.MeshToonMaterial({ gradientMap: toonGradient, ...params });
  (material as THREE.MeshToonMaterial & { flatShading?: boolean }).flatShading = true;
  material.needsUpdate = true;
  return material;
};

const addInkOutline = (mesh: THREE.Mesh, color = 0x3d4035, opacity = 0.34, threshold = 30) => {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, threshold),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  line.name = 'ink-outline';
  mesh.add(line);
  return line;
};

const addStateOutline = (mesh: THREE.Mesh) => {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 24),
    new THREE.LineBasicMaterial({ color: 0x6dc3d5, transparent: true, opacity: 1, depthWrite: false }),
  );
  line.name = 'state-outline';
  line.visible = false;
  line.renderOrder = 9;
  mesh.add(line);

  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0x72c7d6,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  const shell = new THREE.Mesh(mesh.geometry, shellMaterial);
  shell.name = 'state-shell';
  shell.scale.setScalar(1.075);
  shell.visible = false;
  shell.renderOrder = 8;
  mesh.add(shell);
  return { line, shell };
};

const colorForWall = (walls: TownPlot['walls'], accent: number) => {
  const palette = walls === 'stone'
    ? [0x959582, 0x7d8780, 0xaaa18b]
    : walls === 'timber'
      ? [0x967353, 0x7b5e46, 0xac845d]
      : [0xaca088, 0x918a79, 0xc0ad8e];
  return palette[accent % palette.length];
};

const makeContactShadow = (width: number, depth: number, opacity = 0.18) => {
  const material = new THREE.MeshBasicMaterial({ color: 0x27342c, transparent: true, opacity, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(width * 0.72, depth * 0.66, 1);
  shadow.position.y = 0.018;
  return shadow;
};

const makeWindow = (x: number, y: number, z: number, color: number, rotationY = 0, shutters = false, emissiveIntensity = 0.045) => {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotationY;
  const wood = toon({ color: 0x51483a });
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.21, 0.052), toon({ color, emissive: color, emissiveIntensity }));
  pane.position.z = 0.012;
  group.add(pane);
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.035, 0.068), wood);
  const frameBottom = frameTop.clone();
  frameTop.position.set(0, 0.135, 0.018);
  frameBottom.position.set(0, -0.135, 0.018);
  const frameSide = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.068), wood);
  const frameLeft = frameSide.clone();
  const frameRight = frameSide.clone();
  frameLeft.position.set(-0.108, 0, 0.018);
  frameRight.position.set(0.108, 0, 0.018);
  const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.23, 0.074), wood);
  const mullionH = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.018, 0.074), wood);
  mullionV.position.z = mullionH.position.z = 0.025;
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.035, 0.1), toon({ color: 0x6b5b48 }));
  sill.position.set(0, -0.17, 0.035);
  group.add(frameTop, frameBottom, frameLeft, frameRight, mullionV, mullionH, sill);
  if (shutters) {
    const shutterMaterial = toon({ color: 0x64725e });
    for (const side of [-1, 1]) {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.28, 0.035), shutterMaterial);
      shutter.position.set(side * 0.17, 0, -0.005);
      shutter.rotation.y = side * -0.12;
      group.add(shutter);
    }
  }
  return group;
};

const makeArticleMarker = (y: number, z: number, accent: number) => {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.035), toon({ color: 0x443c31 }));
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.165, 0.052), toon({ color: [0xd1aa64, 0x9eae76, 0x78aeb7, 0xb77b61][accent % 4] }));
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), toon({ color: 0xe2c27c }));
  rim.position.set(0, y, z - 0.02);
  plaque.position.set(0, y, z);
  pin.position.set(0, y, z + 0.035);
  group.add(rim, plaque, pin);
  return group;
};

const makeGableRoof = (width: number, depth: number, color: number, ink: number) => {
  const group = new THREE.Group();
  const pitch = 0.47;
  const slopeWidth = width * 0.62;
  const roofMaterial = toon({ color });
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slopeWidth, 0.075, depth * 1.18), roofMaterial);
    slab.position.set(side * width * 0.235, 0.12, 0);
    slab.rotation.z = -side * pitch;
    slab.castShadow = true;
    addInkOutline(slab, ink, 0.45, 20);
    group.add(slab);
    for (let tile = -2; tile <= 2; tile += 1) {
      const batten = new THREE.Mesh(new THREE.BoxGeometry(slopeWidth * 0.94, 0.018, 0.025), toon({ color: color - 0x11100c }));
      batten.position.set(side * width * 0.235, 0.165, tile * depth * 0.205);
      batten.rotation.z = -side * pitch;
      group.add(batten);
    }
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, depth * 1.2, 7), toon({ color: color - 0x15120f }));
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = width * 0.27;
  group.add(ridge);
  return group;
};

const makeHipRoof = (width: number, depth: number, height: number, color: number, ink: number) => {
  const group = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, height, 4, 1), toon({ color }));
  roof.geometry.rotateY(Math.PI / 4);
  roof.scale.set(width * 0.73, 1, depth * 0.73);
  roof.castShadow = true;
  addInkOutline(roof, ink, 0.46, 18);
  group.add(roof);
  for (let index = 0; index < 4; index += 1) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), toon({ color: color - 0x11100c }));
    cap.position.y = height * 0.5 + 0.02;
    group.add(cap);
  }
  return group;
};

const makeFlatRoof = (width: number, depth: number, color: number, ink: number) => {
  const group = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width * 1.1, 0.12, depth * 1.1), toon({ color }));
  deck.castShadow = true;
  addInkOutline(deck, ink, 0.45, 20);
  group.add(deck);
  const parapetMaterial = toon({ color: color - 0x0c0b08 });
  const front = new THREE.Mesh(new THREE.BoxGeometry(width * 1.12, 0.13, 0.07), parapetMaterial);
  const back = front.clone();
  front.position.set(0, 0.09, depth * 0.55);
  back.position.set(0, 0.09, -depth * 0.55);
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, depth * 1.12), parapetMaterial);
  const left = side.clone();
  const right = side.clone();
  left.position.set(-width * 0.55, 0.09, 0);
  right.position.set(width * 0.55, 0.09, 0);
  group.add(front, back, left, right);
  return group;
};

const makeRoof = (plot: TownPlot, width: number, depth: number, color: number, ink: number) => {
  if (plot.roof === 'flat') return makeFlatRoof(width, depth, color, ink);
  if (plot.roof === 'gable') return makeGableRoof(width, depth, color, ink);
  return makeHipRoof(width, depth, 0.56, color, ink);
};

const makeDoor = (depth: number, accent: number) => {
  const group = new THREE.Group();
  group.position.set(0, 0.24, depth / 2 + 0.045);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.43, 0.06), toon({ color: [0x5d4737, 0x5b5545, 0x6b4d3a, 0x4d5c51][accent % 4] }));
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.085), toon({ color: 0x554636 }));
  lintel.position.y = 0.24;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.47, 0.085), toon({ color: 0x554636 }));
  const right = left.clone();
  left.position.x = -0.16;
  right.position.x = 0.16;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 7, 5), toon({ color: 0xc19b58 }));
  knob.position.set(0.075, -0.015, 0.045);
  group.add(door, lintel, left, right, knob);
  return group;
};

const makeBarrel = (x: number, z: number, scale = 1) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.11 * scale, 0.24 * scale, 9), toon({ color: 0x76583d }));
  body.position.y = 0.12 * scale;
  group.add(body);
  for (const y of [0.045, 0.19]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105 * scale, 0.012 * scale, 5, 10), toon({ color: 0x3f433b }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y * scale;
    group.add(ring);
  }
  return group;
};

const makeCrate = (x: number, z: number, scale = 1, color = 0x846344) => {
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.22 * scale, 0.18 * scale, 0.22 * scale), toon({ color }));
  crate.position.set(x, 0.09 * scale, z);
  addInkOutline(crate, 0x3f3d34, 0.38, 15);
  return crate;
};

const makeSmokePuffs = (x: number, y: number, z: number, colorMode: 'day' | 'night') => {
  const nodes: SmokeNode[] = [];
  const group = new THREE.Group();
  for (let index = 0; index < 5; index += 1) {
    const material = new THREE.MeshBasicMaterial({ color: colorMode === 'night' ? 0x93aaa8 : 0xb8b6a9, transparent: true, opacity: colorMode === 'night' ? 0.28 : 0.24, depthWrite: false });
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.095 + index * 0.016, 1), material);
    puff.renderOrder = 13;
    puff.position.set(x, y + index * 0.17, z);
    group.add(puff);
    nodes.push({ object: puff, material, phase: index * 1.6, height: 0.62, drift: 0.1 + index * 0.018, baseX: x, baseY: y, baseZ: z });
  }
  return { group, nodes };
};

const makeBuilding = (plot: TownPlot, post: TownPost | undefined, colorMode: 'day' | 'night', ink: number, smokeEnabled: boolean): BuildingResult => {
  const group = new THREE.Group();
  group.position.set(plot.x, 0, plot.z);
  const width = plot.width;
  const depth = plot.depth;
  const floorCount = plot.seriesPostIds?.length ?? 1;
  const floorHeight = 0.62;
  const wallColor = colorForWall(plot.walls, plot.accent);
  const roofColor = [0x53645f, 0x745548, 0x656957, 0x765f49][plot.accent % 4];
  const floors: THREE.Mesh[] = [];
  const smoke: SmokeNode[] = [];

  group.add(makeContactShadow(width, depth, colorMode === 'night' ? 0.27 : 0.18));
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(width * 1.06, 0.14, depth * 1.06), toon({ color: colorMode === 'night' ? 0x56605a : 0x858375 }));
  foundation.position.y = 0.07;
  foundation.receiveShadow = true;
  addInkOutline(foundation, ink, 0.3, 24);
  group.add(foundation);

  for (let floor = 0; floor < floorCount; floor += 1) {
    const floorPost = plot.seriesPostIds?.[floor] ?? plot.postId;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, floorHeight, depth), toon({ color: wallColor }));
    wall.position.y = 0.14 + floorHeight / 2 + floor * floorHeight;
    wall.userData = { postId: floorPost, floor, plotId: plot.id, kind: 'building-floor' };
    wall.castShadow = true;
    wall.receiveShadow = true;
    const state = addStateOutline(wall);
    wall.userData.outline = state.line;
    wall.userData.stateShell = state.shell;
    addInkOutline(wall, ink, 0.25, 34);
    floors.push(wall);
    group.add(wall);

    const windowColor = colorMode === 'night' ? 0xe0c37a : 0xd8c58c;
    const y = wall.position.y + 0.015;
    group.add(makeWindow(-width * 0.24, y, depth / 2 + 0.032, windowColor, 0, floor % 2 === 0));
    group.add(makeWindow(width * 0.24, y, depth / 2 + 0.032, windowColor, 0, floor % 2 === 1));
    group.add(makeWindow(width / 2 + 0.032, y, -depth * 0.2, windowColor, Math.PI / 2, plot.walls === 'plaster'));

    const band = new THREE.Mesh(new THREE.BoxGeometry(width * 1.025, 0.045, depth * 1.025), toon({ color: plot.walls === 'timber' ? 0x584435 : 0x766c59 }));
    band.position.y = 0.14 + (floor + 1) * floorHeight - 0.025;
    group.add(band);

    if (plot.walls === 'timber') {
      const timberMaterial = toon({ color: 0x584435 });
      for (const side of [-1, 1]) {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, floorHeight * 0.96, 0.065), timberMaterial);
        upright.position.set(side * width * 0.46, wall.position.y, depth / 2 + 0.045);
        group.add(upright);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 0.045, 0.065), timberMaterial);
        brace.position.set(side * width * 0.25, wall.position.y, depth / 2 + 0.048);
        brace.rotation.z = side * 0.68;
        group.add(brace);
      }
    }

    if (plot.walls === 'stone') {
      const quoinMaterial = toon({ color: 0x77796e });
      for (const sideX of [-1, 1]) {
        for (let block = -1; block <= 1; block += 1) {
          const quoin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.1), quoinMaterial);
          quoin.position.set(sideX * width * 0.49, wall.position.y + block * 0.2, depth / 2 + 0.025);
          group.add(quoin);
        }
      }
    }

    if (floor === 0) {
      group.add(makeDoor(depth, plot.accent));
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 0.22), toon({ color: 0x746b59 }));
      step.position.set(0, 0.035, depth / 2 + 0.14);
      group.add(step);
      // A tiny timber canopy and flower box add a readable entrance at the
      // camera scale without changing the plot footprint.
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.2), toon({ color: 0x6b503d }));
      canopy.position.set(0, wall.position.y + 0.28, depth / 2 + 0.12);
      canopy.rotation.x = -0.1;
      const canopySupport = toon({ color: 0x574334 });
      for (const side of [-1, 1]) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.035), canopySupport);
        bracket.position.set(side * 0.2, wall.position.y + 0.19, depth / 2 + 0.13);
        bracket.rotation.z = side * 0.38;
        group.add(bracket);
      }
      group.add(canopy);
      if (plot.accent % 2 === 0) {
        const flowerBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.1), toon({ color: 0x76513e }));
        flowerBox.position.set(width * 0.24, wall.position.y - 0.04, depth / 2 + 0.075);
        group.add(flowerBox);
        for (let flower = 0; flower < 3; flower += 1) {
          const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), toon({ color: [0xc77c6a, 0xd5b36a, 0x8da47a][(flower + plot.accent) % 3] }));
          bloom.position.set(width * 0.13 + flower * 0.1, wall.position.y + 0.015, depth / 2 + 0.08);
          group.add(bloom);
        }
      }
    }
    if (floorPost) group.add(makeArticleMarker(wall.position.y + 0.055, depth / 2 + 0.095, floor + plot.accent));
  }

  const roof = makeRoof(plot, width, depth, roofColor, ink);
  const roofBaseY = 0.14 + floorCount * floorHeight;
  roof.position.y = roofBaseY + (plot.roof === 'gable' ? 0.12 : 0.28);
  group.add(roof);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(width * 1.1, 0.065, depth * 1.1), toon({ color: 0x554a3b }));
  eave.position.y = roofBaseY + 0.055;
  addInkOutline(eave, ink, 0.34, 22);
  group.add(eave);
  // Dark fascia boards give the roof a crisp, constructed edge and improve
  // separation from the sky and distant hills.
  for (const side of [-1, 1]) {
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(width * 1.13, 0.045, 0.055), toon({ color: 0x4e4135 }));
    fascia.position.set(0, roofBaseY + 0.075, side * depth * 0.58);
    fascia.rotation.x = side * 0.03;
    group.add(fascia);
  }

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.15, plot.special === 'forge' ? 0.62 : 0.42, 0.15), toon({ color: plot.special === 'forge' ? 0x56554e : 0x686158 }));
  chimney.position.set(width * 0.27, roofBaseY + (plot.special === 'forge' ? 0.43 : 0.31), -depth * 0.12);
  addInkOutline(chimney, ink, 0.38, 18);
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), toon({ color: 0x494a44 }));
  chimneyCap.position.set(chimney.position.x, chimney.position.y + chimney.geometry.parameters.height / 2 + 0.025, chimney.position.z);
  group.add(chimney, chimneyCap);
  if (smokeEnabled) {
    const smokePuffs = makeSmokePuffs(chimney.position.x, chimneyCap.position.y + 0.08, chimney.position.z, colorMode);
    group.add(smokePuffs.group);
    smoke.push(...smokePuffs.nodes);
  }

  if (plot.special === 'shop') {
    const awning = new THREE.Group();
    awning.position.set(0, 0.72, depth * 0.65);
    for (let stripe = -2; stripe <= 2; stripe += 1) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(width * 0.205, 0.055, depth * 0.3), toon({ color: stripe % 2 === 0 ? 0xb98a58 : 0xd0b882 }));
      strip.position.x = stripe * width * 0.2;
      strip.rotation.x = 0.16;
      awning.add(strip);
    }
    group.add(awning);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.09, 0.22), toon({ color: 0x694f3a }));
    counter.position.set(0, 0.34, depth * 0.72);
    group.add(counter, makeCrate(-width * 0.35, depth * 0.76, 0.75, 0x8b6745), makeCrate(width * 0.34, depth * 0.77, 0.66, 0x76563d));
    for (let index = 0; index < 4; index += 1) {
      const produce = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), toon({ color: [0xa55f48, 0xc0914d, 0x7d925c, 0x9f6848][index] }));
      produce.position.set((index - 1.5) * 0.11, 0.43, depth * 0.77);
      group.add(produce);
    }
  } else if (plot.special === 'forge') {
    const forge = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.32, 8), toon({ color: 0x514b43 }));
    forge.position.set(width * 0.37, 0.18, -depth * 0.63);
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.025, 8), toon({ color: 0xc4663c, emissive: 0xd15632, emissiveIntensity: 0.7 }));
    ember.position.set(width * 0.37, 0.35, -depth * 0.63);
    const anvilBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.2, 6), toon({ color: 0x4c504b }));
    anvilBase.position.set(-width * 0.38, 0.11, -depth * 0.65);
    const anvilTop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.12), toon({ color: 0x4b514f }));
    anvilTop.position.set(-width * 0.38, 0.24, -depth * 0.65);
    group.add(forge, ember, anvilBase, anvilTop, makeBarrel(width * 0.46, depth * 0.55, 0.86));
  } else {
    group.add(makeBarrel(-width * 0.47, depth * 0.55, 0.76), makeCrate(width * 0.47, -depth * 0.49, 0.65));
  }

  if (post || plot.postId) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.38, 5), toon({ color: 0x5d503e }));
    pole.position.set(width * 0.42, roofBaseY + 0.45, 0);
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 3), toon({ color: 0xc39857 }));
    flag.rotation.z = -Math.PI / 2;
    flag.position.set(width * 0.42 + 0.075, roofBaseY + 0.57, 0);
    group.add(pole, flag);
  }

  group.userData = { plotId: plot.id, postId: post?.id ?? plot.postId, floorMeshes: floors };
  return { group, floors, smoke };
};

const makeTree = (x: number, z: number, scale: number, palette: Palette, variant = 0) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = variant * 0.47;
  group.add(makeContactShadow(scale * 1.35, scale * 1.15, 0.1));
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.065 * scale, 0.13 * scale, 0.72 * scale, 7), toon({ color: 0x604f3e }));
  trunk.position.y = 0.36 * scale;
  trunk.castShadow = true;
  group.add(trunk);
  const branchMaterial = toon({ color: 0x66533e });
  for (const side of [-1, 1]) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * scale, 0.04 * scale, 0.4 * scale, 5), branchMaterial);
    branch.position.set(side * 0.17 * scale, 0.63 * scale, 0);
    branch.rotation.z = side * -0.82;
    group.add(branch);
  }

  const crown = new THREE.Group();
  crown.position.y = 0.56 * scale;
  const colors = [palette.forest, palette.forestDark, palette.forestLight];
  if (variant % 3 === 0) {
    for (let layer = 0; layer < 4; layer += 1) {
      const foliage = new THREE.Mesh(new THREE.ConeGeometry((0.66 - layer * 0.1) * scale, (0.82 - layer * 0.05) * scale, 8), toon({ color: colors[layer % colors.length] }));
      foliage.position.y = (0.35 + layer * 0.27) * scale;
      foliage.rotation.y = layer * 0.57;
      foliage.castShadow = true;
      crown.add(foliage);
    }
  } else {
    const clusters = 5 + (variant % 2);
    for (let index = 0; index < clusters; index += 1) {
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry((0.31 + (index % 3) * 0.055) * scale, 1), toon({ color: colors[index % colors.length] }));
      const angle = (index / clusters) * Math.PI * 2;
      foliage.position.set(Math.cos(angle) * 0.28 * scale, (0.42 + (index % 3) * 0.16) * scale, Math.sin(angle) * 0.24 * scale);
      foliage.scale.y = 1.08 + (index % 2) * 0.14;
      foliage.castShadow = true;
      crown.add(foliage);
    }
  }
  // Small, individually shaded leaf clusters soften the silhouette and make
  // each tree feel hand-built rather than stamped from one primitive.
  const leafAccent = toon({ color: colors[(variant + 1) % colors.length] });
  for (let leaf = 0; leaf < 4; leaf += 1) {
    const angle = (leaf / 4) * Math.PI * 2 + variant * 0.21;
    const detail = new THREE.Mesh(new THREE.SphereGeometry(0.13 * scale, 7, 5), leafAccent);
    detail.position.set(Math.cos(angle) * 0.38 * scale, (0.62 + (leaf % 2) * 0.16) * scale, Math.sin(angle) * 0.3 * scale);
    detail.scale.y = 0.82;
    detail.castShadow = true;
    crown.add(detail);
  }
  group.add(crown);
  group.userData.swayTarget = crown;
  return group;
};

const makeShrub = (x: number, z: number, scale: number, palette: Palette, variant = 0) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const colors = [palette.forest, palette.forestDark, palette.forestLight];
  for (let index = 0; index < 4; index += 1) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry((0.17 + index * 0.025) * scale, 1), toon({ color: colors[(index + variant) % colors.length] }));
    blob.position.set((index - 1.5) * 0.12 * scale, 0.15 * scale + (index % 2) * 0.055, ((index + variant) % 3 - 1) * 0.08 * scale);
    blob.castShadow = true;
    group.add(blob);
  }
  if (variant % 3 === 0) {
    for (let flower = 0; flower < 3; flower += 1) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.025 * scale, 6, 4), toon({ color: variant % 2 ? 0xd2bd79 : 0xc48672 }));
      bloom.position.set((flower - 1) * 0.13 * scale, 0.29 * scale, (flower % 2) * 0.08);
      group.add(bloom);
    }
  }
  return group;
};

const makeRock = (x: number, z: number, scale: number, color: number, ink = 0x3d4035) => {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), toon({ color }));
  rock.position.set(x, scale * 0.42, z);
  rock.rotation.set(0.2, scale * 3.7, -0.18);
  rock.scale.set(1.25, 0.72, 1);
  rock.castShadow = true;
  addInkOutline(rock, ink, 0.24, 26);
  return rock;
};

const makeReed = (x: number, z: number, scale: number, palette: Palette) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const reedMaterial = toon({ color: palette.forestDark });
  for (let index = 0; index < 5; index += 1) {
    const reed = new THREE.Mesh(new THREE.ConeGeometry(0.014 * scale, 0.34 * scale, 4), reedMaterial);
    reed.position.set((index - 2) * 0.045 * scale, 0.17 * scale, ((index * 3) % 2) * 0.045);
    reed.rotation.z = (index - 2) * 0.12;
    group.add(reed);
    if (index % 2 === 0) {
      const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.018 * scale, 0.055 * scale, 2, 5), toon({ color: 0x6c573d }));
      head.position.set(reed.position.x, 0.35 * scale, reed.position.z);
      group.add(head);
    }
  }
  group.userData.swayTarget = group;
  return group;
};


const makeCorridorSurface = (centerline: Point[], width: number, material: THREE.Material, y: number) => {
  const { positions, indices } = corridorMeshData(centerline, width, y);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
};

const makeOverlapBridge = (centerlineSegment: Point[], roadWidth: number, material: THREE.Material, ink: number) => {
  const bridge = new THREE.Group();
  bridge.name = 'road-river-overlap-bridge';
  // The deck itself is the same curved corridor mesh as the road. This keeps
  // the bridge's edge and tangent identical to the road at every sample,
  // rather than replacing a curved overlap with a straight chord.
  const deckData = corridorMeshDataFromSamples(centerlineSegment, roadWidth, 0.126);
  const deckGeometry = new THREE.BufferGeometry();
  deckGeometry.setAttribute('position', new THREE.Float32BufferAttribute(deckData.positions, 3));
  deckGeometry.setIndex(deckData.indices);
  deckGeometry.computeVertexNormals();
  const deck = new THREE.Mesh(deckGeometry, material);
  deck.renderOrder = 8;
  deck.receiveShadow = true;
  deck.castShadow = true;
  addInkOutline(deck, ink, 0.58, 18);
  bridge.add(deck);

  // Individual boards follow the local tangent of the shared road samples.
  // They make the material read as a bridge while remaining locked to the
  // overlap path, including on a gentle bend.
  const wood = new THREE.MeshToonMaterial({ color: 0x4f382c });
  const samples = centerlineSegment;
  for (let index = 0; index < samples.length; index += 1) {
    const point = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const next = samples[Math.min(samples.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.055, roadWidth - 0.08), wood);
    board.position.set(point.x, 0.17, point.z);
    board.rotation.y = Math.atan2(-dz / length, dx / length);
    board.castShadow = true;
    board.renderOrder = 9;
    addInkOutline(board, ink, 0.38, 18);
    bridge.add(board);
  }

  // Low side rails also follow the road tangent, so they never drift away
  // from the bridge edges when the overlap corridor bends.
  const railMaterial = new THREE.MeshToonMaterial({ color: 0x493429 });
  const railPoints = samples.filter((_, index) => index % 2 === 0 || index === samples.length - 1);
  for (const side of [-1, 1]) {
    const railZ = side * (roadWidth * 0.5 - 0.09);
    for (let index = 0; index < railPoints.length; index += 1) {
      const point = railPoints[index];
      const previous = railPoints[Math.max(0, index - 1)];
      const next = railPoints[Math.min(railPoints.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const normalX = -dz / length;
      const normalZ = dx / length;
      const railPost = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.38, 0.055), railMaterial);
      railPost.position.set(point.x + normalX * railZ, 0.31, point.z + normalZ * railZ);
      railPost.castShadow = true;
      bridge.add(railPost);
    }
    for (let index = 0; index < railPoints.length - 1; index += 1) {
      const first = railPoints[index];
      const second = railPoints[index + 1];
      const dx = second.x - first.x;
      const dz = second.z - first.z;
      const length = Math.hypot(dx, dz) || 1;
      const normalX = -dz / length;
      const normalZ = dx / length;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length + 0.06, 0.07, 0.07), railMaterial);
      rail.position.set((first.x + second.x) / 2 + normalX * railZ, 0.48, (first.z + second.z) / 2 + normalZ * railZ);
      rail.rotation.y = Math.atan2(-dz, dx);
      rail.castShadow = true;
      bridge.add(rail);
    }
  }
  return bridge;
};

const makeRibbon = (points: Point[], color: number, radius = 0.025, opacity = 0.48, y = 0.1) => {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point.x, y, point.z)));

  const material = toon({ color, transparent: true, opacity, depthWrite: false });
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), radius, 5, false), material);
  ribbon.renderOrder = 2;
  return ribbon;
};

const distanceToPath = (point: Point, path: Point[]) => {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - 1; index += 1) {
    const first = path[index];
    const second = path[index + 1];
    const dx = second.x - first.x;
    const dz = second.z - first.z;
    const lengthSquared = dx * dx + dz * dz || 1;
    const amount = Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.z - first.z) * dz) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(point.x - (first.x + dx * amount), point.z - (first.z + dz * amount)));
  }
  return nearest;
};

const offsetPath = (centerline: Point[], offset: number) => samplePath(centerline, 10).map((point, index, samples) => {
  const previous = samples[Math.max(0, index - 1)];
  const next = samples[Math.min(samples.length - 1, index + 1)];
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: point.x - (dz / length) * offset, z: point.z + (dx / length) * offset };
});

const makeWaterRipple = (x: number, z: number, rotation: number, scale: number, palette: Palette, phase: number): WaterNode => {
  const material = new THREE.MeshBasicMaterial({ color: palette.riverLight, transparent: true, opacity: 0.52, depthWrite: false });
  const group = new THREE.Group();
  group.position.set(x, 0.115, z);
  group.rotation.y = rotation;
  for (let line = 0; line < 3; line += 1) {
    const ripple = new THREE.Mesh(new THREE.BoxGeometry((0.28 + line * 0.14) * scale, 0.012, 0.018), material);
    ripple.position.set((line - 1) * 0.05, 0, (line - 1) * 0.07);
    group.add(ripple);
  }
  return {
    object: group,
    material,
    phase,
    speed: 0.52 + (phase % 3) * 0.06,
    amplitude: 0.055,
    baseX: x,
    baseZ: z,
    baseOpacity: 0.52,
    flowX: Math.cos(rotation),
    flowZ: Math.sin(rotation),
  };
};

const makeFence = (x: number, z: number, length: number, rotation: number, color = 0x6d573e) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const material = toon({ color });
  const rails = [-0.09, 0.09].map((offset) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.045, 0.045), material);
    rail.position.set(0, 0.22 + offset, 0);
    return rail;
  });
  group.add(...rails);
  const count = Math.max(2, Math.round(length / 0.42));
  for (let index = 0; index <= count; index += 1) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.055), material);
    post.position.set(-length / 2 + index * (length / count), 0.22, 0);
    post.rotation.z = (index % 2 ? 1 : -1) * 0.035;
    group.add(post);
  }
  return group;
};

const makeWell = (colorMode: 'day' | 'night', ink: number) => {
  const group = new THREE.Group();
  const stoneColor = colorMode === 'night' ? 0x66716a : 0x8d8c7a;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.36, 12), toon({ color: stoneColor }));
  base.position.y = 0.18;
  base.castShadow = true;
  addInkOutline(base, ink, 0.38, 22);
  group.add(base);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.04, 12), toon({ color: colorMode === 'night' ? 0x24414a : 0x486f77 }));
  inner.position.y = 0.38;
  group.add(inner);
  const wood = toon({ color: 0x66503b });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.85, 0.075), wood);
    post.position.set(side * 0.49, 0.67, 0);
    group.add(post);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.06, 7), wood);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 0.72;
  group.add(axle);
  const roof = makeGableRoof(1.2, 0.82, colorMode === 'night' ? 0x4e5c57 : 0x6f6751, ink);
  roof.position.y = 1.06;
  roof.scale.setScalar(0.72);
  group.add(roof);
  return group;
};

const pointInPolygon = (point: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = ((a.z > point.z) !== (b.z > point.z)) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

const boundsOf = (polygon: Point[]) => ({ minX: Math.min(...polygon.map((point) => point.x)), maxX: Math.max(...polygon.map((point) => point.x)), minZ: Math.min(...polygon.map((point) => point.z)), maxZ: Math.max(...polygon.map((point) => point.z)) });
const hash = (value: string) => [...value].reduce((sum, char) => (sum * 33 + char.charCodeAt(0)) >>> 0, 5381);
const randomFor = (seed: string) => {
  let state = hash(seed);
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const makeGroundGeometry = (width: number, depth: number, segmentsX: number, segmentsZ: number, palette: Palette, seed: string) => {
  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
  const colors: number[] = [];
  const random = randomFor(`${seed}:ground-tones`);
  const color = new THREE.Color();
  const dark = new THREE.Color(palette.groundDark);
  const base = new THREE.Color(palette.ground);
  const light = new THREE.Color(palette.groundLight);
  const positionAttribute = geometry.getAttribute('position');
  for (let index = 0; index < positionAttribute.count; index += 1) {
    const x = positionAttribute.getX(index);
    const z = -positionAttribute.getY(index);
    const relief = (Math.sin(x * 0.24) + Math.cos(z * 0.17) + Math.sin((x - z) * 0.13)) * 0.018;
    positionAttribute.setZ(index, relief);
    const broad = (Math.sin(x * 0.23 + 0.7) + Math.cos(z * 0.19 - 0.4) + Math.sin((x + z) * 0.11)) / 3;
    const fine = (random() - 0.5) * 0.12;
    const tone = Math.max(-1, Math.min(1, broad * 0.68 + fine));
    if (tone < 0) color.copy(base).lerp(dark, -tone * 0.46);
    else color.copy(base).lerp(light, tone * 0.38);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const makeGroundTexture = (seed: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const random = randomFor(`${seed}:ground-grain`);
  context.fillStyle = '#f7f1df';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 860; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 0.28 + random() * 1.65;
    const alpha = 0.028 + random() * 0.09;
    context.fillStyle = index % 4 === 0 ? `rgba(42,54,39,${alpha})` : `rgba(246,235,193,${alpha * 0.72})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (let index = 0; index < 160; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    context.strokeStyle = index % 5 === 0
      ? `rgba(75,84,56,${0.045 + random() * 0.06})`
      : `rgba(54,64,45,${0.028 + random() * 0.06})`;
    context.lineWidth = 0.35 + random() * 0.65;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + 2 + random() * 4, y - 1 + random() * 2, x + 4 + random() * 9, y + (random() - 0.5) * 3);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5.4, 4.2);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

const makeRoadTexture = (seed: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const random = randomFor(`${seed}:road-surface`);
  // Keep the road surface material-based: gentle tonal drift and granular
  // aggregate, without raised wheel tracks or painted-looking line geometry.
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#c7aa80');
  gradient.addColorStop(0.48, '#d7bd91');
  gradient.addColorStop(1, '#c2a47a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 520; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 0.25 + random() * 1.35;
    const alpha = 0.035 + random() * 0.12;
    context.fillStyle = index % 3 === 0
      ? `rgba(91,72,51,${alpha})`
      : `rgba(250,230,188,${alpha * 0.78})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  for (let index = 0; index < 120; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 1 + random() * 2.8;
    context.fillStyle = `rgba(112,87,59,${0.025 + random() * 0.055})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.8, 2.2);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

const makeFarmTexture = (seed: string, variant: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const random = randomFor(`${seed}:farm-surface:${variant}`);
  const base = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, variant % 2 ? '#806044' : '#74553c');
  base.addColorStop(0.52, variant % 2 ? '#916e4d' : '#866345');
  base.addColorStop(1, '#674b37');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Low-contrast furrows are painted into the material itself. This keeps the
  // farm footprint unchanged while giving the soil a readable, cultivated
  // grain at the map's oblique camera distance.
  for (let row = -1; row <= 8; row += 1) {
    const y = 12 + row * 22 + (random() - 0.5) * 4;
    context.strokeStyle = 'rgba(58,42,30,.46)';
    context.lineWidth = 3.4 + random() * 1.8;
    context.beginPath();
    context.moveTo(-12, y);
    context.bezierCurveTo(70, y - 4, 170, y + 5, 332, y - 2);
    context.stroke();
    context.strokeStyle = 'rgba(196,145,89,.28)';
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(-10, y - 3.2);
    context.bezierCurveTo(76, y - 7, 182, y + 2, 330, y - 5);
    context.stroke();
  }
  for (let index = 0; index < 180; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const length = 2 + random() * 7;
    context.strokeStyle = index % 3 === 0 ? 'rgba(211,166,102,.38)' : 'rgba(47,38,29,.28)';
    context.lineWidth = 0.45 + random() * 0.65;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + length, y - 1.5 - random() * 2.5);
    context.stroke();
  }
  for (let index = 0; index < 42; index += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    context.fillStyle = index % 2 ? 'rgba(111,136,71,.68)' : 'rgba(145,150,74,.62)';
    context.beginPath();
    context.ellipse(x, y, 2 + random() * 1.4, 0.8 + random() * 0.7, random() * 0.7, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

const makeBridgeTexture = (seed: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const random = randomFor(`${seed}:bridge-wood`);
  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, '#5b4434');
  base.addColorStop(0.45, '#856548');
  base.addColorStop(1, '#4f3b30');
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 100; index += 1) {
    const y = random() * canvas.height;
    context.strokeStyle = index % 3 ? 'rgba(45,32,25,.2)' : 'rgba(222,167,101,.16)';
    context.lineWidth = 0.35 + random() * 0.9;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(64, y + (random() - 0.5) * 8, 168, y + (random() - 0.5) * 8, canvas.width, y + (random() - 0.5) * 5);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

const scatterRegion = (region: WorldRegion, seed: string, count: number) => {
  const random = randomFor(`${seed}:${region.id}`);
  const bounds = boundsOf(region.polygon);
  const points: Point[] = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 40) {
    attempts += 1;
    const point = { x: bounds.minX + random() * (bounds.maxX - bounds.minX), z: bounds.minZ + random() * (bounds.maxZ - bounds.minZ) };
    if (pointInPolygon(point, region.polygon)) points.push(point);
  }
  return points;
};

const routeMetrics = (route: Point[]) => {
  const distances = [0];
  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    distances.push(distances[index - 1] + Math.hypot(current.x - previous.x, current.z - previous.z));
  }
  return { distances, totalDistance: distances[distances.length - 1] ?? 0 };
};

const pointAtRouteDistance = (route: Point[], distances: number[], distance: number) => {
  const clamped = Math.max(0, Math.min(distance, distances[distances.length - 1] ?? 0));
  let index = 1;
  while (index < distances.length && distances[index] < clamped) index += 1;
  const previous = route[Math.max(0, index - 1)] ?? route[0];
  const current = route[Math.min(route.length - 1, index)] ?? previous;
  const segmentStart = distances[Math.max(0, index - 1)] ?? 0;
  const segmentLength = Math.max(0.0001, (distances[index] ?? segmentStart) - segmentStart);
  const amount = (clamped - segmentStart) / segmentLength;
  return {
    point: { x: previous.x + (current.x - previous.x) * amount, z: previous.z + (current.z - previous.z) * amount },
    tangent: { x: current.x - previous.x, z: current.z - previous.z },
  };
};

const makePedestrian = (index: number, night: boolean, rainy: boolean) => {
  const group = new THREE.Group();
  const coatColors = [0x536b67, 0x7a5d4e, 0x6d6a52, 0x4d5b70, 0x806b51];
  const skinColors = [0xd0a27e, 0xb98163, 0xe0b48b];
  const coat = toon({ color: coatColors[index % coatColors.length] });
  const skin = toon({ color: skinColors[index % skinColors.length] });
  const dark = toon({ color: night ? 0x242e2d : 0x3c4039 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.13, 3, 6), coat);
  body.position.y = 0.2;
  body.scale.set(0.8, 1.05, 0.62);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skin);
  head.position.y = 0.37;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.035, 8), dark);
  hat.position.y = 0.435;
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.035), dark);
  const rightLeg = leftLeg.clone();
  leftLeg.position.set(-0.035, 0.075, 0);
  rightLeg.position.set(0.035, 0.075, 0);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.14, 0.028), coat);
  const rightArm = leftArm.clone();
  leftArm.position.set(-0.075, 0.22, 0);
  rightArm.position.set(0.075, 0.22, 0);
  leftArm.rotation.z = -0.2;
  rightArm.rotation.z = 0.2;
  group.add(body, head, hat, leftLeg, rightLeg, leftArm, rightArm);

  if (rainy) {
    const umbrella = new THREE.Group();
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: [0x657a83, 0x806f65, 0x697d68][index % 3] }));
    canopy.position.y = 0.56;
    canopy.scale.y = 0.56;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 5), dark);
    shaft.position.y = 0.46;
    umbrella.add(canopy, shaft);
    group.add(umbrella);
  } else if (night) {
    const torch = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), dark);
    handle.position.y = 0.25;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 5), new THREE.MeshBasicMaterial({ color: 0xffc36b }));
    flame.position.y = 0.36;
    torch.add(handle, flame);
    const light = new THREE.PointLight(0xffb35f, 0.32, 1.5, 2);
    light.position.y = 0.36;
    torch.add(light);
    torch.position.x = 0.11;
    group.add(torch);
  }
  group.scale.setScalar(0.72 + (index % 3) * 0.08);
  return { group, leftLeg, rightLeg, leftArm, rightArm };
};

const makeRainSystem = (seed: string, colorMode: 'day' | 'night'): RainSystem => {
  const random = randomFor(`${seed}:rain`);
  const count = 150;
  const positions = new Float32Array(count * 6);
  const velocities = new Float32Array(count);
  const area = { minX: -30, maxX: 30, minZ: -25, maxZ: 30, top: 18, bottom: 0.1 };
  for (let index = 0; index < count; index += 1) {
    const x = area.minX + random() * (area.maxX - area.minX);
    const y = area.bottom + random() * (area.top - area.bottom);
    const z = area.minZ + random() * (area.maxZ - area.minZ);
    const offset = index * 6;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    positions[offset + 3] = x + 0.06;
    positions[offset + 4] = y - 0.34;
    positions[offset + 5] = z + 0.018;
    velocities[index] = 8.5 + random() * 4.5;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: colorMode === 'night' ? 0x9fc8d0 : 0x7eabb5, transparent: true, opacity: colorMode === 'night' ? 0.42 : 0.3, depthWrite: false });
  const group = new THREE.LineSegments(geometry, material);
  group.name = 'weather-rain';
  group.renderOrder = 20;
  return { group, positions, velocities, count, area };
};

const addSpawn = (nodes: SpawnNode[], object: THREE.Object3D, distance: number, reducedMotion: boolean, from = 0.24) => {
  if (!reducedMotion) object.scale.setScalar(from);
  nodes.push({ object, delay: Math.min(distance * 0.018, 0.42), from, duration: 0.46 });
};

export default function TownScene({ posts, layout = createTownLayout('river-bend-demo-v2', posts), activePostId, hoveredPostId, query, category, tag, categoryPreview = false, tagPreview = false, colorMode, reducedMotion, onHoverPost, onResolvePostAnchor, onSelectPost }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const interactiveRef = useRef<THREE.Mesh[]>([]);
  const frameRef = useRef<number | undefined>(undefined);
  const postById = useRef(new Map(posts.map((post) => [post.id, post])));
  const onHoverPostRef = useRef(onHoverPost);
  const onSelectPostRef = useRef(onSelectPost);
  const onResolvePostAnchorRef = useRef(onResolvePostAnchor);
  const resolveAnchorRef = useRef<(id: string) => void>(() => undefined);
  onHoverPostRef.current = onHoverPost;
  onSelectPostRef.current = onSelectPost;
  onResolvePostAnchorRef.current = onResolvePostAnchor;

  useEffect(() => {
    postById.current = new Map(posts.map((post) => [post.id, post]));
  }, [posts]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const palette = PALETTE[colorMode];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.sky);
    scene.fog = new THREE.Fog(palette.fog, 80, 145);

    const camera = new THREE.OrthographicCamera(-14, 14, 11, -11, 0.1, 110);
    camera.position.set(28, 25, 30);
    camera.lookAt(0, 0.15, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.25 : 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = colorMode === 'night' ? 0.96 : 1.04;
    renderer.domElement.setAttribute('aria-label', '文章小镇程序化 3D 地图');
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const hemisphere = new THREE.HemisphereLight(colorMode === 'night' ? 0xb8d1d4 : 0xfff0ce, palette.forestDark, colorMode === 'night' ? 0.9 : 1.32);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(colorMode === 'night' ? 0xb5d0de : 0xffe4b5, colorMode === 'night' ? 1.35 : 2.55);
    sun.position.set(-13, 25, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.00025;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(colorMode === 'night' ? 0x66849a : 0xb4c8ad, colorMode === 'night' ? 0.35 : 0.48);
    fill.position.set(18, 12, -16);
    scene.add(fill);

    const waterRegions = layout.regions.filter((region) => region.kind === 'river');
    const isWaterPoint = (point: Point) => waterRegions.some((region) => pointInPolygon(point, region.polygon));
    const isNearWater = (point: Point, clearance = 0) => {
      if (!isWaterPoint(point)) {
        for (const offset of [{ x: clearance, z: 0 }, { x: -clearance, z: 0 }, { x: 0, z: clearance }, { x: 0, z: -clearance }]) {
          if (isWaterPoint({ x: point.x + offset.x, z: point.z + offset.z })) return true;
        }
        return false;
      }
      return true;
    };
    const groundGeometry = makeGroundGeometry(90, 70, 48, 36, palette, layout.seed);
    const groundTexture = makeGroundTexture(layout.seed);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: groundTexture ?? undefined,
      roughness: 0.92,
      metalness: 0,
      bumpMap: groundTexture ?? undefined,
      bumpScale: 0.045,
      roughnessMap: groundTexture ?? undefined,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    if (groundTexture) {
      const textureMaterial = new THREE.MeshBasicMaterial({ map: groundTexture, color: 0xffffff, transparent: true, opacity: colorMode === 'night' ? 0.24 : 0.38, depthWrite: false });
      const texturePlane = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), textureMaterial);
      texturePlane.rotation.x = -Math.PI / 2;
      texturePlane.position.y = 0.014;
      scene.add(texturePlane);
    }
    const soilGrain = new THREE.Mesh(new THREE.PlaneGeometry(88, 68, 1, 1), new THREE.MeshBasicMaterial({ color: colorMode === 'night' ? 0x31443b : 0x756f4e, transparent: true, opacity: colorMode === 'night' ? 0.04 : 0.06, depthWrite: false, blending: THREE.MultiplyBlending }));
    soilGrain.rotation.x = -Math.PI / 2;
    soilGrain.position.y = 0.018;
    scene.add(soilGrain);

    const townLayer = new THREE.Group();
    const animationNodes: SpawnNode[] = [];
    const swayNodes: SwayNode[] = [];
    const waterNodes: WaterNode[] = [];
    const smokeNodes: SmokeNode[] = [];
    const pedestrianNodes: PedestrianNode[] = [];
    const weatherHour = Math.floor(Date.now() / 3600000);
    const isRainy = randomFor(`${layout.seed}:weather:${weatherHour}`)() < 0.3;
    const rainSystem = isRainy ? makeRainSystem(`${layout.seed}:${weatherHour}`, colorMode) : undefined;
    townLayer.scale.setScalar(reducedMotion ? 1 : 0.72);
    scene.add(townLayer);
    if (rainSystem) scene.add(rainSystem.group);

    const groundDecor = new THREE.Group();
    townLayer.add(groundDecor);
    const meadowMaterials = [
      toon({ color: palette.groundDark, transparent: true, opacity: 0.56 }),
      toon({ color: palette.groundLight, transparent: true, opacity: 0.42 }),
      toon({ color: palette.soil, transparent: true, opacity: 0.32 }),
    ];
    const meadowPatches = [
      [-24, -17, 7.2, 2.3, 0], [-14, -10, 3.8, 2.0, 1], [-7, 10, 3.8, 1.6, 0], [11, -8, 4.2, 2.1, 2],
      [16, 7, 3.2, 2.5, 1], [23, 16, 6.8, 2.5, 0], [-23, 16, 5.8, 2.1, 1], [2.5, -9, 3.1, 1.1, 2],
      [-4.5, 7.8, 2.8, 1.1, 1], [8.5, 10, 3.6, 1.4, 0],
    ] as const;
    meadowPatches.forEach(([x, z, width, depth, materialIndex], index) => {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 18), meadowMaterials[materialIndex]);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = index * 0.27;
      patch.position.set(x, 0.015 + index * 0.0002, z);
      patch.scale.set(width, depth, 1);
      groundDecor.add(patch);
      if (index < 7) {
        const contour = new THREE.LineLoop(
          new THREE.EdgesGeometry(new THREE.CircleGeometry(1, 18)),
          new THREE.LineBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.09, depthWrite: false }),
        );
        contour.rotation.x = -Math.PI / 2;
        contour.position.set(x, 0.025, z);
        contour.scale.set(width * 0.94, depth * 0.94, 1);
        groundDecor.add(contour);
      }
    });

    const grassRandom = randomFor(`${layout.seed}:grass-detail-v3`);
    const grassGeometry = new THREE.ConeGeometry(0.017, 0.22, 3);
    const grassMaterial = toon({ color: palette.forestLight });
    const grassInstances = new THREE.InstancedMesh(grassGeometry, grassMaterial, 720);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scaleVector = new THREE.Vector3();
    let grassIndex = 0;
    let grassAttempts = 0;
    while (grassIndex < 720 && grassAttempts < 2600) {
      grassAttempts += 1;
      const point = { x: -40 + grassRandom() * 80, z: -30 + grassRandom() * 58 };
      if (isNearWater(point, 0.18)) continue;
      position.set(point.x, 0.085, point.z);
      quaternion.setFromEuler(new THREE.Euler(0, grassRandom() * Math.PI, (grassRandom() - 0.5) * 0.28));
      const scale = 0.7 + grassRandom() * 0.75;
      scaleVector.set(scale * (0.8 + grassRandom() * 0.3), scale, scale);
      matrix.compose(position, quaternion, scaleVector);
      grassInstances.setMatrixAt(grassIndex, matrix);
      grassIndex += 1;
    }
    grassInstances.instanceMatrix.needsUpdate = true;
    grassInstances.receiveShadow = true;
    groundDecor.add(grassInstances);

    const pebbleRandom = randomFor(`${layout.seed}:pebbles`);
    const pebbleGeometry = new THREE.DodecahedronGeometry(0.09, 0);
    const pebbleMaterial = toon({ color: palette.stone });
    const pebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, 100);
    let pebbleIndex = 0;
    let pebbleAttempts = 0;
    while (pebbleIndex < 100 && pebbleAttempts < 600) {
      pebbleAttempts += 1;
      const point = { x: -18 + pebbleRandom() * 36, z: -14 + pebbleRandom() * 28 };
      if (isNearWater(point, 0.22)) continue;
      position.set(point.x, 0.055, point.z);
      quaternion.setFromEuler(new THREE.Euler(pebbleRandom() * 0.3, pebbleRandom() * Math.PI, pebbleRandom() * 0.2));
      const size = 0.45 + pebbleRandom() * 0.8;
      scaleVector.set(size * 1.25, size * 0.5, size);
      matrix.compose(position, quaternion, scaleVector);
      pebbles.setMatrixAt(pebbleIndex, matrix);
      pebbleIndex += 1;
    }
    pebbles.instanceMatrix.needsUpdate = true;
    pebbles.castShadow = true;
    groundDecor.add(pebbles);

    const hills = new THREE.Group();
    const hillMaterial = toon({ color: palette.hill, transparent: true, opacity: 0.98 });
    const farHillMaterial = toon({ color: palette.hillFar, transparent: true, opacity: 0.86 });
    [-34, -27, -19, -11, -3, 5, 13, 21, 29, 36].forEach((x, index) => {
      const farHill = new THREE.Mesh(new THREE.SphereGeometry(4.5 + (index % 3) * 0.9, 16, 7), farHillMaterial);
      farHill.position.set(x, 1.3 + (index % 2) * 0.5, 25 + (index % 3) * 0.7);
      farHill.scale.set(1.32, 0.75, 0.4);
      hills.add(farHill);
      const hill = new THREE.Mesh(new THREE.SphereGeometry(3.6 + (index % 3) * 0.72, 14, 7), hillMaterial);
      hill.position.set(x + 1.4, 1.65 + (index % 2) * 0.62, 21.5 + (index % 3) * 0.65);
      hill.scale.set(1.28, 0.9 + (index % 2) * 0.12, 0.43);
      addInkOutline(hill, palette.ink, 0.12, 40);
      hills.add(hill);
      for (let contour = 0; contour < 2; contour += 1) {
        const stripe = new THREE.Mesh(new THREE.TorusGeometry((2.0 + contour * 0.48), 0.025, 4, 18, Math.PI * 0.82), toon({ color: palette.groundLight, transparent: true, opacity: 0.22 }));
        stripe.rotation.set(Math.PI / 2, 0, 0.15);
        stripe.position.set(x + 1.3, 1.55 + contour * 0.26, 20.15 + (index % 3) * 0.65);
        stripe.scale.set(1.2, 0.4, 0.7);
        hills.add(stripe);
      }
    });
    scene.add(hills);

    const roadTexture = makeRoadTexture(layout.seed);
    const roadMaterial = toon({ color: 0xffffff, map: roadTexture ?? undefined });
    const roadEdgeMaterial = toon({ color: palette.roadEdge, transparent: true, opacity: 0.76 });
    const roadDefinitions = [
      { path: roadCenterlines.main, width: roadWidths.main },
      { path: roadCenterlines.east, width: roadWidths.east },
      { path: roadCenterlines.west, width: roadWidths.west },
      { path: roadCenterlines.north, width: roadWidths.north },
    ];
    roadDefinitions.forEach(({ path, width }) => {
      townLayer.add(makeCorridorSurface(path, width + 0.18, roadEdgeMaterial, 0.04));
      townLayer.add(makeCorridorSurface(path, width, roadMaterial, 0.072));
    });


    const junctionMaterial = toon({ color: 0xffffff, map: roadTexture ?? undefined });
    const junctions = [
      { x: 0.15, z: 0.05, radius: 1.22 },
      { x: 4.9, z: 1.18, radius: 1.02 },
      { x: 1.15, z: 5.55, radius: 0.98 },
    ];
    junctions.forEach(({ x, z, radius }) => {
      const junction = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), junctionMaterial);
      junction.rotation.x = -Math.PI / 2;
      junction.position.set(x, 0.084, z);
      junction.scale.set(1.08, 0.82, 1);
      junction.receiveShadow = true;
      townLayer.add(junction);
    });

    const riverMaterial = toon({ color: palette.river, transparent: true, opacity: 0.985 });
    const riverBankMaterial = toon({ color: palette.soil });
    townLayer.add(makeCorridorSurface(riverCenterline, riverWidth + 0.22, riverBankMaterial, 0.052));
    townLayer.add(makeCorridorSurface(riverCenterline, riverWidth, riverMaterial, 0.087));
    const riverBankPolygon = corridorPolygon(riverCenterline, (riverWidth + 0.22) / 2);
    const bridgeSegments = pathSegmentsInsidePolygon(roadCenterlines.west, riverBankPolygon, 24);
    const bridgePath = bridgeSegments[0] ? extendPathEndpoints(bridgeSegments[0], 0.38, 0.68) : [];
    // Keep all animated water detail outside the bridge overlap. The bridge
    // below owns that exact shared segment, so a ripple must never draw above
    // its timber surface.
    const riverDetailSegments = [riverCenterline];
    riverDetailSegments.forEach((segment) => {
      townLayer.add(makeRibbon(offsetPath(segment, riverWidth * 0.35), palette.riverLight, 0.022, 0.24, 0.112));
      townLayer.add(makeRibbon(offsetPath(segment, -riverWidth * 0.27), palette.riverLight, 0.016, 0.18, 0.113));
      townLayer.add(makeRibbon(offsetPath(segment, riverWidth * 0.49), palette.soil, 0.028, 0.36, 0.102));
      townLayer.add(makeRibbon(offsetPath(segment, -riverWidth * 0.49), palette.soil, 0.028, 0.36, 0.102));
    });

    const riverSamples = riverCenterline.slice(1, -1);
    const riverDetailPoints = riverDetailSegments.flatMap((segment) => segment.slice(1, -1));
    riverDetailPoints.forEach((point, index) => {
      const next = riverDetailPoints[Math.min(riverDetailPoints.length - 1, index + 1)] ?? point;
      const previous = riverDetailPoints[Math.max(0, index - 1)] ?? point;
      const rotation = Math.atan2(next.z - previous.z, next.x - previous.x);
      const ripple = makeWaterRipple(point.x, point.z, rotation, 0.68 + (index % 3) * 0.12, palette, index * 0.73);
      townLayer.add(ripple.object);
      waterNodes.push(ripple);
    });
    riverSamples.forEach((point, index) => {
      const next = riverCenterline[Math.min(riverCenterline.length - 1, index + 2)];
      const previous = riverCenterline[Math.max(0, index)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const bankX = point.x - dz / length * 1.28;
      const bankZ = point.z + dx / length * 1.28;
      if (index % 2 === 0 && !isNearWater({ x: bankX, z: bankZ }, 0.05)) {
        const reed = makeReed(bankX, bankZ, 0.72, palette);
        townLayer.add(reed);
        const swayTarget = reed.userData.swayTarget as THREE.Object3D | undefined;
        if (swayTarget) swayNodes.push({ object: swayTarget, phase: index * 0.82, speed: 0.82, amplitude: 0.032, baseX: swayTarget.rotation.x, baseZ: swayTarget.rotation.z, baseScaleX: swayTarget.scale.x, baseScaleY: swayTarget.scale.y, baseScaleZ: swayTarget.scale.z });
      }
      const rockPoint = { x: point.x + dz / length * 1.02, z: point.z - dx / length * 1.02 };
      if (index % 3 === 0 && distanceToPath(rockPoint, bridgePath) > roadWidths.west * 0.5 + 0.3) {
        townLayer.add(makeRock(rockPoint.x, rockPoint.z, 0.14 + (index % 2) * 0.025, palette.stone, palette.ink));
      }
    });


    // The bridge is the road's own corridor over the river, recolored with a
    // timber material. Its path, width, endpoints, and tangent all come from
    // the same road/river overlap used by collision detection, so there is no
    // second position or rotation to drift out of alignment.
    const bridgeTexture = makeBridgeTexture(layout.seed);
    const bridgeMaterial = toon({ color: 0xffffff, map: bridgeTexture ?? undefined });
    bridgeSegments.forEach((segment) => {
      // Extend only along the shared road tangent. This covers the tiny
      // projection seam at the lower-left and upper-right land connections
      // without changing the river crossing itself.
      townLayer.add(makeOverlapBridge(extendPathEndpoints(segment, 0.38, 0.68), roadWidths.west, bridgeMaterial, palette.ink));
    });

    const forestRegions = layout.regions.filter((region) => region.kind === 'forest');
    forestRegions.forEach((region, regionIndex) => {
      scatterRegion(region, layout.seed, regionIndex === 0 ? 32 : 15).filter((point) => !isNearWater(point, 0.82)).forEach((point, index) => {
        const tree = makeTree(point.x, point.z, 0.42 + ((index + regionIndex) % 5) * 0.075, palette, index + regionIndex * 11);
        tree.traverse((object) => { if (object instanceof THREE.Mesh) object.castShadow = true; });
        townLayer.add(tree);
        const swayTarget = tree.userData.swayTarget as THREE.Object3D | undefined;
        if (swayTarget) swayNodes.push({ object: swayTarget, phase: index * 0.61 + regionIndex, speed: 0.54 + (index % 4) * 0.06, amplitude: 0.018 + (index % 3) * 0.006, baseX: swayTarget.rotation.x, baseZ: swayTarget.rotation.z, baseScaleX: swayTarget.scale.x, baseScaleY: swayTarget.scale.y, baseScaleZ: swayTarget.scale.z });
        addSpawn(animationNodes, tree, Math.hypot(point.x, point.z), reducedMotion, 0.18 + (index % 3) * 0.04);
      });
      scatterRegion(region, `${layout.seed}:shrubs-v3`, regionIndex === 0 ? 18 : 10).filter((point) => !isNearWater(point, 0.52)).forEach((point, index) => {
        const shrub = makeShrub(point.x, point.z, 0.7 + (index % 3) * 0.16, palette, index + regionIndex);
        townLayer.add(shrub);
        const swayTarget = shrub.userData.swayTarget as THREE.Object3D | undefined;
        if (swayTarget) swayNodes.push({ object: swayTarget, phase: index * 0.47 + regionIndex * 0.9, speed: 0.7 + (index % 3) * 0.08, amplitude: 0.022 + (index % 2) * 0.006, baseX: swayTarget.rotation.x, baseZ: swayTarget.rotation.z, baseScaleX: swayTarget.scale.x, baseScaleY: swayTarget.scale.y, baseScaleZ: swayTarget.scale.z });
      });
    });

    // Fixed shrub anchors are shared with the layout allocator so these visual
    // clusters also reserve space for future article buildings.
    layout.entities.filter((entity) => entity.kind === 'shrub').forEach((entity, index) => {
      const shrub = makeShrub(entity.x, entity.z, 0.72 + (index % 3) * 0.12, palette, index + 10);
      shrub.rotation.y = entity.rotation ?? 0;
      townLayer.add(shrub);
      const swayTarget = shrub.userData.swayTarget as THREE.Object3D | undefined;
      if (swayTarget) swayNodes.push({ object: swayTarget, phase: index * 0.73 + 1.2, speed: 0.66 + (index % 2) * 0.1, amplitude: 0.02 + (index % 2) * 0.005, baseX: swayTarget.rotation.x, baseZ: swayTarget.rotation.z, baseScaleX: swayTarget.scale.x, baseScaleY: swayTarget.scale.y, baseScaleZ: swayTarget.scale.z });
      if (index % 2 === 0) townLayer.add(makeRock(entity.x + 0.42, entity.z - 0.28, 0.11 + (index % 2) * 0.025, palette.stone, palette.ink));
    });

    // Farms and fences use the same authored entities that reserve building space.
    layout.entities.filter((entity) => entity.kind === 'farm').forEach((entity, farmIndex) => {
      const width = entity.width;
      const depth = entity.depth;
      const rotation = entity.rotation ?? 0;
      const farmTexture = makeFarmTexture(layout.seed, farmIndex);
      const farmMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: farmTexture ?? undefined,
        roughness: 0.96,
        metalness: 0,
        bumpMap: farmTexture ?? undefined,
        bumpScale: 0.018,
      });
      const bed = new THREE.Mesh(new THREE.BoxGeometry(width, 0.065, depth), farmMaterial);
      bed.position.set(entity.x, 0.055, entity.z);
      bed.rotation.y = rotation;
      bed.castShadow = true;
      bed.receiveShadow = true;
      addInkOutline(bed, palette.ink, 0.27, 24);
      townLayer.add(bed);
    });
    layout.entities.filter((entity) => entity.kind === 'fence').forEach((entity) => {
      townLayer.add(makeFence(entity.x, entity.z, entity.width, entity.rotation ?? 0));
    });

    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.72, 0.22, 12), toon({ color: colorMode === 'night' ? 0x70786c : 0xa99d7f }));
    plaza.position.set(0, 0.11, 0);
    plaza.receiveShadow = true;
    addInkOutline(plaza, palette.ink, 0.25, 28);
    townLayer.add(plaza);
    for (let ring = 0; ring < 10; ring += 1) {
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.035, 0.16), toon({ color: ring % 2 ? palette.stone : palette.roadEdge }));
      const angle = (ring / 10) * Math.PI * 2;
      stone.position.set(Math.cos(angle) * 1.15, 0.24, Math.sin(angle) * 1.15);
      stone.rotation.y = -angle;
      townLayer.add(stone);
    }
    const well = makeWell(colorMode, palette.ink);
    well.position.y = 0.22;
    townLayer.add(well);
    const benchMaterial = toon({ color: 0x684f39 });
    for (const side of [-1, 1]) {
      const bench = new THREE.Group();
      bench.position.set(side * 1.4, 0.28, 0.25);
      bench.rotation.y = side * Math.PI / 2;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.24), benchMaterial);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.06), benchMaterial);
      back.position.set(0, 0.18, -0.1);
      bench.add(seat, back);
      townLayer.add(bench);
    }

    const interactive: THREE.Mesh[] = [];
    const buildingLayer = new THREE.Group();
    const smokeRandom = randomFor(`${layout.seed}:smoke:${Math.random().toString(36).slice(2)}`);
    let smokeCount = 0;
    layout.plots.forEach((plot) => {
      const post = posts.find((candidate) => candidate.id === plot.postId);
      const smokeEnabled = smokeRandom() < 0.42;
      if (smokeEnabled) smokeCount += 1;
      const building = makeBuilding(plot, post, colorMode, palette.ink, smokeEnabled);
      building.group.position.y = 0.08;
      interactive.push(...building.floors);
      smokeNodes.push(...building.smoke);
      buildingLayer.add(building.group);
      addSpawn(animationNodes, building.group, Math.hypot(plot.x, plot.z), reducedMotion, 0.14);
    });
    if (layout.plots.length > 0 && smokeCount === 0) {
      const firstSmokeGroup = buildingLayer.children[0];
      if (firstSmokeGroup) {
        const plot = layout.plots[0];
        const chimneyX = plot.width * 0.27;
        const roofBaseY = 0.14 + (plot.seriesPostIds?.length ?? 1) * 0.62;
        const chimneyY = roofBaseY + (plot.special === 'forge' ? 0.43 : 0.31);
        const smokePuffs = makeSmokePuffs(chimneyX, chimneyY + 0.3, 0, colorMode);
        firstSmokeGroup.add(smokePuffs.group);
        smokeNodes.push(...smokePuffs.nodes);
      }
    }
    townLayer.add(buildingLayer);

    // A small, deterministic crowd keeps the scene lively without turning the
    // map into a particle simulation. Routes are the same sampled road
    // centerlines used by the rendered roads, so walkers never drift off the
    // street network or into the river.
    const pedestrianRandom = randomFor(`${layout.seed}:pedestrians:${weatherHour}`);
    const routeEntries = Object.entries(roadCenterlines);
    const basePedestrianCount = Math.max(2, Math.min(10, Math.round(layout.plots.length * (0.85 + pedestrianRandom() * 0.7))));
    const pedestrianCount = Math.max(1, Math.round(basePedestrianCount * (colorMode === 'night' ? 0.58 : 1) * (isRainy ? 0.62 : 1)));
    for (let index = 0; index < pedestrianCount; index += 1) {
      const companion = pedestrianNodes[index - 1];
      const routeEntry = index % 4 === 1 && companion
        ? undefined
        : routeEntries[(index * 7 + Math.floor(pedestrianRandom() * routeEntries.length)) % routeEntries.length];
      const route = companion && index % 4 === 1
        ? companion.route
        : samplePath(routeEntry?.[1] ?? roadCenterlines.main, 8);
      const metrics = routeMetrics(route);
      if (metrics.totalDistance < 0.5) continue;
      const person = makePedestrian(index, colorMode === 'night', isRainy);
      const node: PedestrianNode = {
        object: person.group,
        route,
        distances: metrics.distances,
        totalDistance: metrics.totalDistance,
        distance: companion && index % 4 === 1 ? Math.max(0, companion.distance + 0.5) : pedestrianRandom() * metrics.totalDistance,
        direction: pedestrianRandom() > 0.5 ? 1 : -1,
        speed: 0.34 + pedestrianRandom() * 0.14,
        phase: pedestrianRandom() * Math.PI * 2,
        waitUntil: 0,
        leftLeg: person.leftLeg,
        rightLeg: person.rightLeg,
        leftArm: person.leftArm,
        rightArm: person.rightArm,
      };
      const initial = pointAtRouteDistance(route, metrics.distances, node.distance);
      person.group.position.set(initial.point.x, 0.08, initial.point.z);
      townLayer.add(person.group);
      pedestrianNodes.push(node);
    }
    interactiveRef.current = interactive;

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      const aspect = width / Math.max(height, 1);
      const frustumHeight = 22;
      camera.left = (-frustumHeight * aspect) / 2;
      camera.right = (frustumHeight * aspect) / 2;
      camera.top = frustumHeight / 2;
      camera.bottom = -frustumHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    let isInViewport = true;
    let isDocumentVisible = !document.hidden;

    const stopAnimation = () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    };
    const resumeAnimation = () => {
      if (isInViewport && isDocumentVisible && frameRef.current === undefined) animate();
    };
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isInViewport = entry?.isIntersecting ?? true;
      if (isInViewport) resumeAnimation();
      else stopAnimation();
    }, { threshold: 0.01 });
    visibilityObserver.observe(host);
    const onVisibilityChange = () => {
      isDocumentVisible = !document.hidden;
      if (isDocumentVisible) resumeAnimation();
      else stopAnimation();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const resolvePostAnchor = (id: string) => {
      const mesh = interactiveRef.current.find((candidate) => candidate.userData.postId === id);
      if (!mesh) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const projected = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      onResolvePostAnchorRef.current(id, { x: rect.left + (projected.x + 1) * rect.width / 2, y: rect.top + (-projected.y + 1) * rect.height / 2 });
    };
    resolveAnchorRef.current = resolvePostAnchor;

    const pointer = new THREE.Vector2();
    const findHit = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1;
      raycasterRef.current.setFromCamera(pointer, camera);
      return { rect, hit: raycasterRef.current.intersectObjects(interactiveRef.current, false)[0] };
    };
    const handlePointerMove = (event: PointerEvent) => {
      const { rect, hit } = findHit(event);
      if (!hit) {
        renderer.domElement.style.cursor = 'default';
        onHoverPostRef.current(undefined);
        return;
      }
      renderer.domElement.style.cursor = 'pointer';
      const id = hit.object.userData.postId as string;
      const anchor = hit.point.clone().project(camera);
      onHoverPostRef.current(id, { x: rect.left + (anchor.x + 1) * rect.width / 2, y: rect.top + (-anchor.y + 1) * rect.height / 2 });
    };
    const handlePointerLeave = () => { renderer.domElement.style.cursor = 'default'; onHoverPostRef.current(undefined); };
    const handleClick = (event: PointerEvent) => {
      const { hit } = findHit(event);
      if (hit?.object.userData.postId) onSelectPostRef.current(hit.object.userData.postId as string);
    };
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('click', handleClick);

    const startedAt = performance.now();
    let previousElapsed = 0;
    function animate() {
      if (!isInViewport || !isDocumentVisible) {
        frameRef.current = undefined;
        return;
      }
      const elapsed = (performance.now() - startedAt) / 1000;
      if (!reducedMotion) {
        const overall = Math.min(1, elapsed / 0.72);
        const overallEase = 1 - (1 - overall) ** 3;
        townLayer.scale.setScalar(0.72 + 0.28 * overallEase);
        animationNodes.forEach(({ object, delay, from, duration }) => {
          const progress = Math.min(1, Math.max(0, (elapsed - delay) / duration));
          const eased = 1 - (1 - progress) ** 3;
          object.scale.setScalar(from + (1 - from) * eased);
        });
        swayNodes.forEach(({ object, phase, speed, amplitude, baseX, baseZ, baseScaleX, baseScaleY, baseScaleZ }) => {
          object.rotation.z = baseZ + Math.sin(elapsed * speed + phase) * amplitude;
          object.rotation.x = baseX + Math.cos(elapsed * speed * 0.72 + phase) * amplitude * 0.42;
          object.scale.set(baseScaleX, baseScaleY * (1 + Math.sin(elapsed * speed * 0.83 + phase * 1.7) * amplitude * 0.7), baseScaleZ);
        });
        const delta = Math.min(0.05, Math.max(0, elapsed - previousElapsed));
        previousElapsed = elapsed;
        pedestrianNodes.forEach((pedestrian) => {
          if (elapsed >= pedestrian.waitUntil) {
            pedestrian.distance += pedestrian.speed * delta * pedestrian.direction;
            if (pedestrian.distance <= 0 || pedestrian.distance >= pedestrian.totalDistance) {
              pedestrian.direction = pedestrian.direction === 1 ? -1 : 1;
              pedestrian.distance = Math.max(0.12, Math.min(pedestrian.totalDistance - 0.12, pedestrian.distance));
              pedestrian.waitUntil = elapsed + 0.8 + ((pedestrian.phase * 10) % 1.6);
            } else if (Math.sin(elapsed * 0.22 + pedestrian.phase) > 0.985) {
              // Brief, staggered pauses make pairs look like they are meeting
              // or chatting instead of moving in lockstep.
              pedestrian.waitUntil = elapsed + 1.1 + (Math.sin(pedestrian.phase) + 1) * 0.7;
            }
          }
          const location = pointAtRouteDistance(pedestrian.route, pedestrian.distances, pedestrian.distance);
          pedestrian.object.position.x = location.point.x;
          pedestrian.object.position.z = location.point.z;
          pedestrian.object.rotation.y = Math.atan2(location.tangent.x * pedestrian.direction, location.tangent.z * pedestrian.direction);
          const stride = Math.sin(elapsed * 7.5 + pedestrian.phase) * (elapsed < pedestrian.waitUntil ? 0.03 : 0.34);
          pedestrian.leftLeg.rotation.x = stride;
          pedestrian.rightLeg.rotation.x = -stride;
          pedestrian.leftArm.rotation.x = -stride * 0.7;
          pedestrian.rightArm.rotation.x = stride * 0.7;
        });
        if (rainSystem) {
          const positionAttribute = rainSystem.group.geometry.getAttribute('position') as THREE.BufferAttribute;
          for (let index = 0; index < rainSystem.count; index += 1) {
            const offset = index * 6;
            const fall = rainSystem.velocities[index] * delta;
            rainSystem.positions[offset + 1] -= fall;
            rainSystem.positions[offset + 4] -= fall;
            if (rainSystem.positions[offset + 1] < rainSystem.area.bottom) {
              const y = rainSystem.area.top;
              rainSystem.positions[offset + 1] = y;
              rainSystem.positions[offset + 4] = y - 0.34;
            }
          }
          positionAttribute.needsUpdate = true;
        }
        waterNodes.forEach(({ object, material, phase, speed, amplitude, baseX, baseZ, baseOpacity, flowX, flowZ }) => {
          const travel = ((elapsed * speed + phase * 0.13) % 1 + 1) % 1;
          const wave = (travel - 0.5) * 0.24;
          object.position.x = baseX + flowX * wave + Math.sin(elapsed * speed * 1.2 + phase) * amplitude;
          object.position.z = baseZ + flowZ * wave + Math.cos(elapsed * speed * 0.9 + phase) * amplitude * 0.42;
          object.scale.x = 0.86 + travel * 0.28;
          material.opacity = baseOpacity + Math.sin(elapsed * speed * 1.7 + phase) * 0.14;
        });
        smokeNodes.forEach(({ object, material, phase, height, drift, baseX, baseY, baseZ }) => {
          const progress = ((elapsed * 0.14 + phase * 0.1) % 1 + 1) % 1;
          object.position.y = baseY + progress * height;
          object.position.x = baseX + Math.sin(elapsed * 0.33 + phase) * drift + progress * drift;
          object.position.z = baseZ + Math.cos(elapsed * 0.24 + phase) * drift * 0.34;
          object.scale.setScalar(0.75 + progress * 0.9);
          material.opacity = Math.sin(progress * Math.PI) * (colorMode === 'night' ? 0.23 : 0.28);
        });
      }
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('click', handleClick);
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      const disposedGeometries = new Set<THREE.BufferGeometry>();
      const disposedMaterials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.LineLoop) {
          if (!disposedGeometries.has(object.geometry)) {
            object.geometry.dispose();
            disposedGeometries.add(object.geometry);
          }
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (!disposedMaterials.has(material)) {
              const textured = material as THREE.Material & { map?: THREE.Texture | null };
              textured.map?.dispose();
              material.dispose();
              disposedMaterials.add(material);
            }
          });
        }
      });
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
      interactiveRef.current = [];
      resolveAnchorRef.current = () => undefined;
    };
  }, [layout, colorMode, reducedMotion, posts]);

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    interactiveRef.current.forEach((mesh) => {
      const id = mesh.userData.postId as string;
      const post = postById.current.get(id);
      const outline = mesh.userData.outline as THREE.LineSegments | undefined;
      const shell = mesh.userData.stateShell as THREE.Mesh | undefined;
      if (!post || !outline || !shell) return;
      const haystack = [post.title, post.description, post.category, post.tags.join(' '), post.series ?? ''].join(' ').toLowerCase();
      const matches = Boolean((normalized || category || tag) && (!normalized || haystack.includes(normalized)) && (!category || post.category === category) && (!tag || post.tags.includes(tag)));
      const direct = id === activePostId || id === hoveredPostId
        || (Boolean(category) && post.category === category)
        || (Boolean(tag) && post.tags.includes(tag ?? ''));
      outline.visible = direct || matches;
      shell.visible = direct || matches;
      const outlineMaterial = outline.material as THREE.LineBasicMaterial;
      const shellMaterial = shell.material as THREE.MeshBasicMaterial;
      const color = direct ? 0x67c2d5 : 0xe3b75f;
      outlineMaterial.color.setHex(color);
      outlineMaterial.opacity = direct ? 1 : 0.98;
      shellMaterial.color.setHex(color);
      shellMaterial.opacity = direct ? 0.34 : 0.25;
      const floorMaterial = mesh.material as THREE.MeshToonMaterial;
      floorMaterial.emissive = new THREE.Color(direct ? 0x2b6570 : matches ? 0x72572f : 0x000000);
      floorMaterial.emissiveIntensity = direct ? 0.34 : matches ? 0.22 : 0;
    });
  }, [activePostId, hoveredPostId, query, category, tag, categoryPreview, tagPreview]);

  useEffect(() => {
    if (!hoveredPostId) return;
    const frame = window.requestAnimationFrame(() => resolveAnchorRef.current(hoveredPostId));
    return () => window.cancelAnimationFrame(frame);
  }, [hoveredPostId]);

  return <div className="town-canvas-host" ref={hostRef} data-testid="town-canvas" />;
}
