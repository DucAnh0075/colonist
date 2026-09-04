import type { GameState, Action } from '../types.js'
import { validate } from './validate.js'

/** Returns all actions that are currently legal for the given player. */
export function legalActions(state: GameState, playerId: string): Action[] {
  const candidates: Action[] = buildCandidates(state, playerId)
  return candidates.filter(a => validate(state, a, playerId).ok)
}

function buildCandidates(state: GameState, playerId: string): Action[] {
  const actions: Action[] = []
  const player = state.players.find(p => p.id === playerId)
  if (!player) return []

  switch (state.phase) {
    case 'setup':
      if (player.roads.length < player.settlements.length) {
        for (const edge of state.board.edges) actions.push({ type: 'placeInitialRoad', edge })
      } else {
        for (const corner of state.board.corners) actions.push({ type: 'placeInitialSettlement', corner })
      }
      break

    case 'roll':
      actions.push({ type: 'rollDice' })
      // Can play knight before rolling
      if (player.devCards.some(c => c.type === 'knight' && c.boughtOnTurn < state.turnNumber)) {
        actions.push({ type: 'playKnight' })
      }
      break

    case 'discard':
      // Discard candidates are generated dynamically based on hand — omit here
      break

    case 'moveRobber':
      for (const [key, tile] of state.board.tiles) {
        if (tile.terrain !== 'sea') actions.push({ type: 'moveRobber', coord: tile.coord })
      }
      break

    case 'steal':
      // Steal candidates depend on who is adjacent to the robber — simplified here
      for (const p of state.players) {
        if (p.id !== playerId && p.settlements.length + p.cities.length > 0) {
          actions.push({ type: 'steal', fromPlayerId: p.id })
        }
      }
      actions.push({ type: 'skipSteal' })
      break

    case 'main': {
      actions.push({ type: 'endTurn' })
      for (const corner of state.board.corners) {
        actions.push({ type: 'buildSettlement', corner })
        if (player.settlements.includes(corner)) actions.push({ type: 'buildCity', corner })
      }
      for (const edge of state.board.edges) actions.push({ type: 'buildRoad', edge })
      actions.push({ type: 'buyDevCard' })
      break
    }

    case 'tradeOffer':
      if (state.activeTradeOffer) {
        actions.push({ type: 'acceptTrade', offerId: state.activeTradeOffer.id })
        actions.push({ type: 'rejectTrade', offerId: state.activeTradeOffer.id })
        if (state.activeTradeOffer.fromPlayerId === playerId) {
          actions.push({ type: 'cancelTrade', offerId: state.activeTradeOffer.id })
        }
      }
      break

    default:
      break
  }

  return actions
}
