import { describe, it, expect } from 'vitest'
import { hexDisk, coordKey } from '../src/board/coords.js'
import { generateBoard } from '../src/board/generator.js'

describe('hexDisk', () => {
  it('radius 0 returns only origin', () => {
    expect(hexDisk(0)).toHaveLength(1)
    const [tile] = hexDisk(0)
    expect(tile.q).toBe(0)
    expect(tile.r).toBe(0)
    expect(tile.s).toBe(0)
  })

  it('radius 2 returns 19 unique tiles', () => {
    const tiles = hexDisk(2)
    expect(tiles).toHaveLength(19)
    const keys = new Set(tiles.map(coordKey))
    expect(keys.size).toBe(19)
  })

  it('radius 3 returns 37 unique tiles', () => {
    const tiles = hexDisk(3)
    expect(tiles).toHaveLength(37)
    const keys = new Set(tiles.map(coordKey))
    expect(keys.size).toBe(37)
  })

  it('all tiles satisfy q+r+s=0', () => {
    for (const t of hexDisk(3)) {
      expect(t.q + t.r + t.s).toBe(0)
    }
  })

  it('produces no duplicates for any radius', () => {
    for (const r of [1, 2, 3, 4]) {
      const keys = hexDisk(r).map(coordKey)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('generateBoard', () => {
  it('generates a board with tiles', () => {
    const board = generateBoard('random', 'large', 'test-seed')
    expect(board.tiles.size).toBeGreaterThan(0)
  })

  it('no two red-number tiles share an edge (6/8 constraint)', () => {
    const board = generateBoard('random', 'large', 'test-seed-42')
    const redTiles: Array<{ q: number; r: number; s: number }> = []
    for (const tile of board.tiles.values()) {
      if (tile.number === 6 || tile.number === 8) redTiles.push(tile.coord)
    }
    for (const a of redTiles) {
      for (const b of redTiles) {
        if (a === b) continue
        const dist = Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s))
        expect(dist).toBeGreaterThan(1)
      }
    }
  })

  it('gives same result for same seed', () => {
    const b1 = generateBoard('random', 'large', 'stable')
    const b2 = generateBoard('random', 'large', 'stable')
    expect(b1.tiles.size).toBe(b2.tiles.size)
    for (const [k, t] of b1.tiles) {
      expect(b2.tiles.get(k)?.terrain).toBe(t.terrain)
      expect(b2.tiles.get(k)?.number).toBe(t.number)
    }
  })

  it('gives different boards for different seeds', () => {
    const b1 = generateBoard('random', 'large', 'seed-A')
    const b2 = generateBoard('random', 'large', 'seed-B')
    let diff = false
    for (const [k, t] of b1.tiles) {
      if (b2.tiles.get(k)?.terrain !== t.terrain) { diff = true; break }
    }
    expect(diff).toBe(true)
  })

  it('board has corners and edges', () => {
    const board = generateBoard('random', 'standard', 'test')
    expect(board.corners.size).toBeGreaterThan(0)
    expect(board.edges.size).toBeGreaterThan(0)
  })
})
