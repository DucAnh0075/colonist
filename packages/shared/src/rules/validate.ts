import type { GameState, Action, CornerKey, EdgeKey } from '../types.js'
import { coordKey } from '../board/coords.js'
import { hasResources, ROAD_COST, SETTLEMENT_COST, CITY_COST, DEV_CARD_COST } from '../util/resources.js'

type ValidationResult = { ok: true } | { ok: false; reason: string }
const ok = (): ValidationResult => ({ ok: true })
const fail = (reason: string): ValidationResult => ({ ok: false, reason })

export function validate(state: GameState, action: Action, playerId: string): ValidationResult {
  const playerIdx = state.players.findIndex(p => p.id === playerId)
  if (playerIdx === -1) return fail('Unknown player')
  const player = state.players[playerIdx]
  const isActive = playerIdx === state.activePlayerIndex

  switch (action.type) {
    case 'rollDice':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'roll') return fail('Not in roll phase')
      return ok()

    case 'placeInitialSettlement':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'setup') return fail('Not in setup phase')
      if (!isCornerFree(state, action.corner)) return fail('Corner occupied or too close')
      if (!state.board.corners.has(action.corner)) return fail('Invalid corner')
      return ok()

    case 'placeInitialRoad':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'setup') return fail('Not in setup phase')
      if (player.roads.length >= player.settlements.length) return fail('Place settlement first')
      if (!state.board.edges.has(action.edge)) return fail('Invalid edge')
      if (!isEdgeAdjacentToLastSettlement(state, action.edge, player)) return fail('Road must connect to your last settlement')
      if (state.players.some(p => p.roads.includes(action.edge))) return fail('Edge occupied')
      return ok()

    case 'buildSettlement':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main') return fail('Not in main phase')
      if (!hasResources(player.resources, SETTLEMENT_COST)) return fail('Insufficient resources')
      if (player.settlements.length >= 5) return fail('No settlements left')
      if (!state.board.corners.has(action.corner)) return fail('Invalid corner')
      if (!isCornerFree(state, action.corner)) return fail('Corner occupied or too close')
      if (!isCornerConnectedToRoad(state, action.corner, player)) return fail('Not connected to your road')
      return ok()

    case 'buildCity':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main') return fail('Not in main phase')
      if (!hasResources(player.resources, CITY_COST)) return fail('Insufficient resources')
      if (player.cities.length >= 4) return fail('No cities left')
      if (!player.settlements.includes(action.corner)) return fail('No settlement there')
      return ok()

    case 'buildRoad':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main') return fail('Not in main phase')
      if (!hasResources(player.resources, ROAD_COST)) return fail('Insufficient resources')
      if (player.roads.length >= 15) return fail('No roads left')
      if (!state.board.edges.has(action.edge)) return fail('Invalid edge')
      if (state.players.some(p => p.roads.includes(action.edge))) return fail('Edge occupied')
      if (!isEdgeConnectedToPlayer(state, action.edge, player)) return fail('Road not connected')
      return ok()

    case 'buyDevCard':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main') return fail('Not in main phase')
      if (!hasResources(player.resources, DEV_CARD_COST)) return fail('Insufficient resources')
      if (state.devCardDeck.length === 0) return fail('Dev card deck empty')
      return ok()

    case 'playKnight':
    case 'playRoadBuilding':
    case 'playYearOfPlenty':
    case 'playMonopoly': {
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main' && state.phase !== 'roll') return fail('Cannot play dev card now')
      const cardType = actionToCardType(action.type)
      const card = player.devCards.find(c => c.type === cardType && c.boughtOnTurn < state.turnNumber)
      if (!card) return fail(`No playable ${cardType} card`)
      return ok()
    }

    case 'moveRobber':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'moveRobber') return fail('Not moving robber')
      if (!state.board.tiles.has(coordKey(action.coord))) return fail('Invalid tile')
      return ok()

    case 'steal':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'steal') return fail('Not in steal phase')
      return ok()

    case 'skipSteal':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'steal') return fail('Not in steal phase')
      return ok()

    case 'discard': {
      const needed = state.pendingDiscards[playerId]
      if (!needed) return fail('You do not need to discard')
      if (state.phase !== 'discard') return fail('Not in discard phase')
      const total = Object.values(action.resources).reduce((s, n) => s + (n ?? 0), 0)
      if (total !== needed) return fail(`Must discard exactly ${needed} cards`)
      for (const [res, count] of Object.entries(action.resources)) {
        if ((player.resources[res as keyof typeof player.resources] ?? 0) < (count ?? 0))
          return fail('Not enough of that resource')
      }
      return ok()
    }

    case 'offerTrade':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main') return fail('Not in main phase')
      if (state.activeTradeOffer) return fail('Trade offer already active')
      return ok()

    case 'counterOffer':
    case 'acceptTrade':
    case 'rejectTrade':
      if (state.phase !== 'tradeOffer') return fail('No active trade')
      return ok()

    case 'cancelTrade':
      if (state.phase !== 'tradeOffer') return fail('No active trade')
      if (state.activeTradeOffer?.fromPlayerId !== playerId) return fail('Not your offer')
      return ok()

    case 'bankTrade':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main') return fail('Not in main phase')
      {
        const rate = getBankRate(state, player, action.want)
        if (player.resources[action.give] < action.giveCount) return fail('Insufficient resources')
        if (action.giveCount !== rate) return fail(`Trade rate is ${rate}:1 for that resource`)
      }
      return ok()

    case 'endTurn':
      if (!isActive) return fail('Not your turn')
      if (state.phase !== 'main') return fail('Not in main phase')
      return ok()

    default:
      return fail('Unknown action')
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isCornerFree(state: GameState, corner: CornerKey): boolean {
  for (const player of state.players) {
    if (player.settlements.includes(corner)) return false
    if (player.cities.includes(corner)) return false
  }
  // Distance rule: no adjacent occupied corner
  // (corners adjacent to this one share 2 of its 3 tiles)
  const [k1, k2, k3] = corner.split('|')
  const adjacent = getAdjacentCorners(state, corner)
  for (const adj of adjacent) {
    for (const player of state.players) {
      if (player.settlements.includes(adj) || player.cities.includes(adj)) return false
    }
  }
  return true
}

function getAdjacentCorners(state: GameState, corner: CornerKey): CornerKey[] {
  // Two corners are adjacent if they share exactly 2 tiles
  const tiles = corner.split('|').sort()
  const adjacent: CornerKey[] = []
  for (const c of state.board.corners) {
    if (c === corner) continue
    const otherTiles = c.split('|').sort()
    const shared = tiles.filter(t => otherTiles.includes(t))
    if (shared.length === 2) adjacent.push(c)
  }
  return adjacent
}

function isEdgeAdjacentToLastSettlement(state: GameState, edge: EdgeKey, player: Player): boolean {
  const lastSettlement = player.settlements[player.settlements.length - 1]
  if (!lastSettlement) return false
  const settlementTiles = lastSettlement.split('|')
  const edgeTiles = edge.split('|')
  // Edge is adjacent to a corner if they share 2 tile keys
  const shared = settlementTiles.filter(t => edgeTiles.includes(t))
  return shared.length >= 2
}

function isCornerConnectedToRoad(state: GameState, corner: CornerKey, player: Player): boolean {
  const cornerTiles = corner.split('|')
  for (const road of player.roads) {
    const roadTiles = road.split('|')
    const shared = cornerTiles.filter(t => roadTiles.includes(t))
    if (shared.length >= 2) return true
  }
  return false
}

function isEdgeConnectedToPlayer(state: GameState, edge: EdgeKey, player: Player): boolean {
  // Check if edge shares a corner with any existing road or settlement/city of this player
  const edgeTiles = edge.split('|')
  // Check roads
  for (const road of player.roads) {
    const roadTiles = road.split('|')
    if (edgeTiles.filter(t => roadTiles.includes(t)).length >= 2) return true // would be same edge
    // Share a corner: each has 2 tiles → they share exactly 1 tile means adjacent via corner
    if (edgeTiles.some(t => roadTiles.includes(t))) return true
  }
  // Check settlements/cities
  for (const s of [...player.settlements, ...player.cities]) {
    const settlementTiles = s.split('|')
    if (edgeTiles.filter(t => settlementTiles.includes(t)).length >= 2) return true
  }
  return false
}

function actionToCardType(actionType: string): string {
  const map: Record<string, string> = {
    playKnight: 'knight',
    playRoadBuilding: 'roadBuilding',
    playYearOfPlenty: 'yearOfPlenty',
    playMonopoly: 'monopoly',
  }
  return map[actionType] ?? ''
}

function getBankRate(state: GameState, player: typeof state.players[0], resource: string): number {
  // Check if player has a 2:1 port for this resource
  for (const port of state.board.ports) {
    if (port.type === resource) {
      if (port.corners.some(c => player.settlements.includes(c) || player.cities.includes(c))) return 2
    }
  }
  // Check 3:1 ports
  for (const port of state.board.ports) {
    if (port.type === '3:1') {
      if (port.corners.some(c => player.settlements.includes(c) || player.cities.includes(c))) return 3
    }
  }
  return 4
}

// Make Player available locally
type Player = GameState['players'][0]
