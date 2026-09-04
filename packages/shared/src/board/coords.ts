import type { CubeCoord, CoordKey, CornerKey, EdgeKey } from '../types.js'

export const coordKey = (c: CubeCoord): CoordKey => `${c.q},${c.r},${c.s}`

/** All 6 axial neighbours of a cube coord */
const CUBE_DIRS: CubeCoord[] = [
  { q: 1, r: 0, s: -1 }, { q: 1, r: -1, s: 0 }, { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 }, { q: -1, r: 1, s: 0 }, { q: 0, r: 1, s: -1 },
]

export function tileNeighbours(c: CubeCoord): CubeCoord[] {
  return CUBE_DIRS.map(d => ({ q: c.q + d.q, r: c.r + d.r, s: c.s + d.s }))
}

/**
 * Canonical corner key for a vertex shared by three tiles.
 * The three coords are sorted lexicographically so the key is unique.
 */
export function cornerKey(a: CubeCoord, b: CubeCoord, c: CubeCoord): CornerKey {
  return [coordKey(a), coordKey(b), coordKey(c)].sort().join('|')
}

/**
 * Canonical edge key for the edge between two adjacent tiles.
 */
export function edgeKey(a: CubeCoord, b: CubeCoord): EdgeKey {
  return [coordKey(a), coordKey(b)].sort().join('|')
}

/**
 * hexDisk: all cube coords within radius r of origin (0,0,0).
 * Uses direct cube-coord enumeration — NOT hexRing (which had duplicate bugs).
 */
export function hexDisk(radius: number): CubeCoord[] {
  const results: CubeCoord[] = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) {
      // Use +0 trick to avoid -0 from JS integer arithmetic
      results.push({ q: q || 0, r: r || 0, s: (-q - r) || 0 })
    }
  }
  return results
}

/**
 * All corners (vertex keys) of a single tile.
 * Each hex has 6 corners, shared with 2 neighbours each.
 */
export function tileCorners(coord: CubeCoord, tileSet: Set<CoordKey>): CornerKey[] {
  const neighbours = tileNeighbours(coord)
  const corners: CornerKey[] = []
  // Each corner is the intersection of this tile + 2 consecutive neighbours
  for (let i = 0; i < 6; i++) {
    const a = neighbours[i]
    const b = neighbours[(i + 1) % 6]
    corners.push(cornerKey(coord, a, b))
  }
  return corners
}

/**
 * All tiles that share a given corner (up to 3).
 * Returns the CubeCoords parsed back from the corner key.
 */
export function cornerTiles(corner: CornerKey): CubeCoord[] {
  return corner.split('|').map(k => {
    const [q, r, s] = k.split(',').map(Number)
    return { q, r, s }
  })
}

/**
 * The two corners at either end of an edge.
 * An edge is shared by exactly 2 tiles; the edge's two endpoints
 * are each shared by 3 tiles (the 2 edge-tiles + 1 more on each side).
 */
export function edgeCorners(edge: EdgeKey, tileSet: Set<CoordKey>): [CornerKey, CornerKey] {
  const [aKey, bKey] = edge.split('|')
  const a = coordKey2cube(aKey)
  const b = coordKey2cube(bKey)
  const aN = tileNeighbours(a)
  const bN = tileNeighbours(b)
  // Shared neighbours of a and b (besides each other) form the corner-third tiles
  const shared = aN.filter(n => bN.some(m => coordKey(n) === coordKey(m)))
  if (shared.length < 2) {
    // Edge is on the board boundary; one or both thirds may not be land tiles
    // Still compute the corner keys (third tile may be sea)
    const allThirds: CubeCoord[] = []
    for (const n of aN) {
      if (bN.some(m => coordKey(n) === coordKey(m))) allThirds.push(n)
    }
    const [t1, t2] = allThirds.length >= 2 ? allThirds : [allThirds[0], allThirds[0]]
    return [cornerKey(a, b, t1), cornerKey(a, b, t2 ?? t1)]
  }
  return [cornerKey(a, b, shared[0]), cornerKey(a, b, shared[1])]
}

function coordKey2cube(key: CoordKey): CubeCoord {
  const [q, r, s] = key.split(',').map(Number)
  return { q, r, s }
}
