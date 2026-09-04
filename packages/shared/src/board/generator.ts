import type { Board, BoardDefinition, BoardSize, CubeCoord, CoordKey, CornerKey, EdgeKey, Port, Resource, TerrainType, Tile } from '../types.js'
import { coordKey, hexDisk, tileNeighbours, cornerKey, edgeKey, tileCorners } from './coords.js'
import { SeededRng } from '../util/rng.js'

// ─── Standard board resource distribution ────────────────────────────────────

const BASE_RESOURCES: TerrainType[] = [
  'wood', 'wood', 'wood', 'wood',
  'brick', 'brick', 'brick',
  'sheep', 'sheep', 'sheep', 'sheep',
  'wheat', 'wheat', 'wheat', 'wheat',
  'ore', 'ore', 'ore',
  'desert',
]

const BASE_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

const RADIUS: Record<BoardSize, number> = {
  standard: 2,
  large: 3,
  xl: 4,
}

// ─── Standard port layout (Base board, radius 2) ──────────────────────────────

function buildStandardPorts(landCoords: CubeCoord[], rng: SeededRng): Port[] {
  const portTypes: Array<'3:1' | Resource> = [
    '3:1', '3:1', '3:1', '3:1',
    'wood', 'brick', 'sheep', 'wheat', 'ore',
  ]
  rng.shuffle(portTypes)

  // Find boundary edges (edges between a land tile and a sea tile)
  const landSet = new Set(landCoords.map(coordKey))
  const boundaryEdges: EdgeKey[] = []
  for (const coord of landCoords) {
    for (const nb of tileNeighbours(coord)) {
      if (!landSet.has(coordKey(nb))) {
        boundaryEdges.push(edgeKey(coord, nb))
      }
    }
  }

  // Deduplicate
  const uniqueEdges = [...new Set(boundaryEdges)]
  rng.shuffle(uniqueEdges)

  const ports: Port[] = []
  for (let i = 0; i < Math.min(portTypes.length, uniqueEdges.length); i++) {
    const e = uniqueEdges[i]
    const [aKey, bKey] = e.split('|')
    const a: CubeCoord = { q: +aKey.split(',')[0], r: +aKey.split(',')[1], s: +aKey.split(',')[2] }
    const b: CubeCoord = { q: +bKey.split(',')[0], r: +bKey.split(',')[1], s: +bKey.split(',')[2] }
    const aNb = tileNeighbours(a)
    const shared = aNb.filter(n => {
      const k = coordKey(n)
      return k === coordKey(b) ? false : tileNeighbours(b).some(m => coordKey(m) === k)
    })
    const thirds = shared.slice(0, 2)
    while (thirds.length < 2) thirds.push(thirds[0] ?? a)
    ports.push({
      edge: e,
      corners: [cornerKey(a, b, thirds[0]), cornerKey(a, b, thirds[1])],
      type: portTypes[i],
    })
  }
  return ports
}

// ─── Red-number balance constraint ───────────────────────────────────────────

function hasRedNeighbour(coord: CubeCoord, tileMap: Map<CoordKey, Tile>): boolean {
  for (const nb of tileNeighbours(coord)) {
    const tile = tileMap.get(coordKey(nb))
    if (tile?.number === 6 || tile?.number === 8) return true
  }
  return false
}

/**
 * Assign numbers to land (non-desert/sea) tiles.
 * Rules:
 *  - No two tiles with 6 or 8 may share an edge.
 *  - At most 2 tiles of 6 and at most 2 tiles of 8 total.
 * Uses backtracking with shuffled order.
 */
function assignNumbers(
  landCoords: CubeCoord[],
  numbers: number[],
  rng: SeededRng,
): Map<CoordKey, number> {
  const shuffledCoords = [...landCoords]
  rng.shuffle(shuffledCoords)
  const shuffledNumbers = [...numbers]
  rng.shuffle(shuffledNumbers)

  const result = new Map<CoordKey, number>()

  function backtrack(coordIdx: number, remaining: number[]): boolean {
    if (coordIdx === shuffledCoords.length) return remaining.length === 0
    const coord = shuffledCoords[coordIdx]
    const key = coordKey(coord)

    for (let ni = 0; ni < remaining.length; ni++) {
      const num = remaining[ni]
      const isRed = num === 6 || num === 8

      if (isRed) {
        // Check no red neighbour
        let redNeighbour = false
        for (const nb of tileNeighbours(coord)) {
          const nbNum = result.get(coordKey(nb))
          if (nbNum === 6 || nbNum === 8) { redNeighbour = true; break }
        }
        if (redNeighbour) continue
      }

      result.set(key, num)
      const next = [...remaining.slice(0, ni), ...remaining.slice(ni + 1)]
      if (backtrack(coordIdx + 1, next)) return true
      result.delete(key)
    }
    return false
  }

  if (!backtrack(0, shuffledNumbers)) {
    // Fallback: assign naively (should rarely happen)
    shuffledCoords.forEach((c, i) => {
      if (i < shuffledNumbers.length) result.set(coordKey(c), shuffledNumbers[i])
    })
  }

  return result
}

// ─── Main generator ──────────────────────────────────────────────────────────

export function generateBoard(
  def: BoardDefinition | 'random',
  size: BoardSize,
  seed: string,
): Board {
  const rng = new SeededRng(seed)
  const radius = RADIUS[size]
  const allCoords = hexDisk(radius)

  let terrainAssignment: Map<CoordKey, TerrainType>

  if (def === 'random') {
    const resources = [...BASE_RESOURCES]
    rng.shuffle(resources)
    terrainAssignment = new Map(allCoords.map((c, i) => [coordKey(c), (resources[i] ?? 'sea') as TerrainType]))
  } else {
    terrainAssignment = new Map()
    const randomPool = [...BASE_RESOURCES]
    rng.shuffle(randomPool)
    let randomIdx = 0
    for (const entry of def.tiles) {
      const terrain: TerrainType = entry.terrain === 'random'
        ? (randomPool[randomIdx++] ?? 'wood')
        : entry.terrain as TerrainType
      terrainAssignment.set(coordKey(entry.coord), terrain)
    }
  }

  // Land tiles = everything that isn't sea
  const landCoords = allCoords.filter(c => {
    const t = terrainAssignment.get(coordKey(c))
    return t && t !== 'sea'
  })

  const numberPool = [...BASE_NUMBERS]
  const desertCoords = landCoords.filter(c => terrainAssignment.get(coordKey(c)) === 'desert')
  const numberableCoords = landCoords.filter(c => terrainAssignment.get(coordKey(c)) !== 'desert')

  // Trim number pool to match numberableCoords count
  while (numberPool.length > numberableCoords.length) numberPool.pop()

  const placeholderMap = new Map<CoordKey, Tile>()
  const numberAssignment = assignNumbers(numberableCoords, numberPool, rng)

  const tileMap = new Map<CoordKey, Tile>()
  for (const coord of allCoords) {
    const key = coordKey(coord)
    const terrain = terrainAssignment.get(key) ?? 'sea'
    tileMap.set(key, {
      coord,
      terrain,
      number: terrain !== 'desert' && terrain !== 'sea' ? numberAssignment.get(key) : undefined,
      hasRobber: terrain === 'desert',
    })
  }

  // Build corner and edge sets
  const landSet = new Set(landCoords.map(coordKey))
  const corners = new Set<CornerKey>()
  const edges = new Set<EdgeKey>()

  for (const coord of landCoords) {
    for (const ck of tileCorners(coord, landSet)) corners.add(ck)
    for (const nb of tileNeighbours(coord)) {
      if (landSet.has(coordKey(nb))) {
        edges.add(edgeKey(coord, nb))
      }
    }
  }

  const ports = def === 'random'
    ? buildStandardPorts(landCoords, rng)
    : buildStandardPorts(landCoords, rng)

  return { tiles: tileMap, ports, corners, edges }
}
