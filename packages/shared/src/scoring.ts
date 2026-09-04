import type { GameState, Player, CornerKey, EdgeKey } from './types.js'

export function computeScores(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const p of state.players) {
    let vp = p.settlements.length + p.cities.length * 2
    vp += p.devCards.filter(c => c.type === 'victoryPoint').length
    if (p.hasLongestRoad) vp += 2
    if (p.hasLargestArmy) vp += 2
    scores[p.id] = vp
  }
  return scores
}

export function longestRoad(state: GameState): { holderId: string | null; length: number } {
  let best = { holderId: null as string | null, length: 0 }
  for (const p of state.players) {
    const length = calcLongestRoad(p, state)
    if (length > best.length) best = { holderId: p.id, length }
  }
  return best
}

export function largestArmy(state: GameState): { holderId: string | null; count: number } {
  let best = { holderId: null as string | null, count: 0 }
  for (const p of state.players) {
    if (p.knightsPlayed > best.count) best = { holderId: p.id, count: p.knightsPlayed }
  }
  return best
}

function calcLongestRoad(player: Player, state: GameState): number {
  if (player.roads.length === 0) return 0

  // Build adjacency: corner → set of edges that connect to it
  // An edge key is "tileA|tileB" and its two endpoints (corners) each share 2 of those tiles
  // We use the road-edge set and derive which corners they touch
  const edgeSet = new Set(player.roads)
  const cornerToEdges = new Map<CornerKey, EdgeKey[]>()

  for (const edge of player.roads) {
    const [, ...rest] = getEdgeCorners(edge, state)
    for (const corner of getEdgeCornersFromState(edge, state)) {
      if (!cornerToEdges.has(corner)) cornerToEdges.set(corner, [])
      cornerToEdges.get(corner)!.push(edge)
    }
  }

  // DFS to find longest path (no repeating edges)
  let maxLength = 0

  function dfs(edge: EdgeKey, visitedEdges: Set<EdgeKey>, length: number): void {
    maxLength = Math.max(maxLength, length)
    const corners = getEdgeCornersFromState(edge, state)
    for (const corner of corners) {
      // Skip if an enemy has a settlement/city here (breaks the road)
      const blocked = state.players.some(p => p.id !== player.id && (p.settlements.includes(corner) || p.cities.includes(corner)))
      if (blocked) continue

      for (const nextEdge of (cornerToEdges.get(corner) ?? [])) {
        if (!visitedEdges.has(nextEdge)) {
          visitedEdges.add(nextEdge)
          dfs(nextEdge, visitedEdges, length + 1)
          visitedEdges.delete(nextEdge)
        }
      }
    }
  }

  for (const road of player.roads) {
    const visited = new Set([road])
    dfs(road, visited, 1)
  }

  return maxLength
}

function getEdgeCornersFromState(edge: EdgeKey, state: GameState): CornerKey[] {
  // Derive the two corners of an edge from the board's corner set
  // An edge "A|B" has corners that contain both A and B in their key
  const [tileA, tileB] = edge.split('|')
  const result: CornerKey[] = []
  for (const corner of state.board.corners) {
    const parts = corner.split('|')
    if (parts.includes(tileA) && parts.includes(tileB)) {
      result.push(corner)
    }
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getEdgeCorners(edge: EdgeKey, _state: GameState): CornerKey[] {
  return []
}
