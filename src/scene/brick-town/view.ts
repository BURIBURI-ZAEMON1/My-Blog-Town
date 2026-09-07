export type BoardBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type PanBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type RainDrop = { x: number; z: number; y: number; speed: number };

export const createRainField = (
  random: () => number,
  count: number,
  board: BoardBounds,
  margin = 1.8,
): RainDrop[] => {
  const minX = board.minX - margin;
  const maxX = board.maxX + margin;
  const minZ = board.minZ - margin;
  const maxZ = board.maxZ + margin;
  return Array.from({ length: count }, () => ({
    x: minX + random() * (maxX - minX),
    z: minZ + random() * (maxZ - minZ),
    y: 1 + random() * 13,
    speed: 6 + random() * 4,
  }));
};

export const getCameraPanBounds = (
  board: BoardBounds,
  _alpha: number,
  _beta: number,
  _orthoWidth: number,
  _orthoHeight: number,
  edgeReveal = 6.5,
): PanBounds => {
  // In an orthographic diorama the target is a navigation point, not the
  // visible rectangle. The old clamp stopped at the town core; this keeps a
  // small safety inset from the raised board wall while still making every
  // outer district reachable at close zoom.
  const inset = Math.min(edgeReveal, (board.maxX - board.minX) * 0.18, (board.maxZ - board.minZ) * 0.18);
  return {
    minX: board.minX + inset,
    maxX: board.maxX - inset,
    minZ: board.minZ + inset,
    maxZ: board.maxZ - inset,
  };
};

export const clampToPanBounds = (point: { x: number; z: number }, bounds: PanBounds) => ({
  x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
  z: Math.max(bounds.minZ, Math.min(bounds.maxZ, point.z)),
});
