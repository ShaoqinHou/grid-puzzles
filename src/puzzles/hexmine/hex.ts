import type { AxialCoord, OffsetCoord } from './types';

/** The 6 axial neighbor offsets (pointy-top hex, clockwise from east) */
export const AXIAL_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: 0 },   // E
  { q: 1, r: -1 },  // NE
  { q: 0, r: -1 },  // NW
  { q: -1, r: 0 },  // W
  { q: -1, r: 1 },  // SW
  { q: 0, r: 1 },   // SE
];

/**
 * Even-r offset neighbor table.
 * Even rows and odd rows have different neighbor column offsets.
 */
const EVEN_ROW_NEIGHBORS: readonly OffsetCoord[] = [
  { row: -1, col: 0 },  { row: -1, col: -1 },
  { row: 0, col: -1 },  { row: 0, col: 1 },
  { row: 1, col: 0 },   { row: 1, col: -1 },
];

const ODD_ROW_NEIGHBORS: readonly OffsetCoord[] = [
  { row: -1, col: 1 },  { row: -1, col: 0 },
  { row: 0, col: -1 },  { row: 0, col: 1 },
  { row: 1, col: 1 },   { row: 1, col: 0 },
];

/** Convert axial (q, r) to even-r offset (row, col) */
export function axialToOffset(q: number, r: number): OffsetCoord {
  const col = q + Math.floor(r / 2);
  return { row: r, col };
}

/** Convert even-r offset (row, col) to axial (q, r) */
export function offsetToAxial(row: number, col: number): AxialCoord {
  const q = col - Math.floor(row / 2);
  return { q, r: row };
}

/** Get bounds-checked neighbors in offset coordinates */
export function getOffsetNeighbors(
  row: number,
  col: number,
  width: number,
  height: number,
): OffsetCoord[] {
  const deltas = row % 2 === 0 ? EVEN_ROW_NEIGHBORS : ODD_ROW_NEIGHBORS;
  const result: OffsetCoord[] = [];
  for (const d of deltas) {
    const nr = row + d.row;
    const nc = col + d.col;
    if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
      result.push({ row: nr, col: nc });
    }
  }
  return result;
}

/** Axial distance between two hex cells */
export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/** Convert axial coords to pixel position (pointy-top hex) */
export function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

/** Generate 6 SVG polygon vertices for a pointy-top hex */
export function getHexVertices(cx: number, cy: number, size: number): Array<{ x: number; y: number }> {
  const vertices: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30;
    const angleRad = (Math.PI / 180) * angleDeg;
    vertices.push({
      x: cx + size * Math.cos(angleRad),
      y: cy + size * Math.sin(angleRad),
    });
  }
  return vertices;
}

/** Convert vertices to SVG polygon points string */
export function verticesToPointsString(vertices: Array<{ x: number; y: number }>): string {
  return vertices.map((v) => `${v.x},${v.y}`).join(' ');
}

/** Coordinate key for Maps/Sets */
export function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Get 6 neighbors in clockwise order (E, NE, NW, W, SW, SE).
 * Returns null for out-of-bounds neighbors, preserving the ring structure
 * needed for circular contiguity checks on adjacent clues.
 */
export function getNeighborsClockwise(
  row: number,
  col: number,
  width: number,
  height: number,
): (OffsetCoord | null)[] {
  const { q, r } = offsetToAxial(row, col);
  return AXIAL_DIRECTIONS.map((d) => {
    const off = axialToOffset(q + d.q, r + d.r);
    if (off.row < 0 || off.row >= height || off.col < 0 || off.col >= width) return null;
    return off;
  });
}

/**
 * Trace a ray from a starting cell in one of 6 directions.
 * Returns cells along the ray EXCLUDING the origin, stopping at grid boundary.
 */
export function getLineCells(
  row: number,
  col: number,
  directionIndex: number,
  width: number,
  height: number,
): OffsetCoord[] {
  const result: OffsetCoord[] = [];
  const { q, r } = offsetToAxial(row, col);
  const d = AXIAL_DIRECTIONS[directionIndex];
  let cq = q + d.q;
  let cr = r + d.r;
  while (true) {
    const off = axialToOffset(cq, cr);
    if (off.row < 0 || off.row >= height || off.col < 0 || off.col >= width) break;
    result.push(off);
    cq += d.q;
    cr += d.r;
  }
  return result;
}

/**
 * Get all cells within axial distance `radius` of center, excluding center.
 */
export function getCellsInRange(
  row: number,
  col: number,
  radius: number,
  width: number,
  height: number,
): OffsetCoord[] {
  const center = offsetToAxial(row, col);
  const result: OffsetCoord[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (r === row && c === col) continue;
      const ax = offsetToAxial(r, c);
      if (axialDistance(center, ax) <= radius) {
        result.push({ row: r, col: c });
      }
    }
  }
  return result;
}
