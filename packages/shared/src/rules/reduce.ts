import type { GameState, Action, GameEvent, Player, Resource, ResourceMap, DevCardType } from '../types.js'
import { validate } from './validate.js'
import { coordKey } from '../board/coords.js'
import { addResources, subtractResources, emptyResourceMap, totalResources, ALL_RESOURCES, ROAD_COST, SETTLEMENT_COST, CITY_COST, DEV_CARD_COST } from '../util/resources.js'
import { computeScores, longestRoad, largestArmy } from '../scoring.js'
import { SeededRng } from '../util/rng.js'

export type ReduceResult = { state: GameState; events: GameEvent[] }

export function reduce(state: GameState, action: Action, playerId: string): ReduceResult {
  const v = validate(state, action, playerId)
  if (!v.ok) throw new Error(v.reason)

  let s = deepClone(state)
  const events: GameEvent[] = []
  const playerIdx = s.players.findIndex(p => p.id === playerId)
  const player = s.players[playerIdx]

  switch (action.type) {
    case 'rollDice': {
      const rng = new SeededRng(`${s.id}:roll:${s.seq}`)
      const d1 = rng.int(6) + 1
      const d2 = rng.int(6) + 1
      const roll = d1 + d2
      s.diceRoll = [d1, d2]
      events.push({ type: 'diceRolled', playerId, roll: [d1, d2] })

      if (roll === 7) {
        // Check who must discard
        for (const p of s.players) {
          const total = totalResources(p.resources)
          if (total > s.config.discardLimit) {
            s.pendingDiscards[p.id] = Math.floor(total / 2)
          }
        }
        if (Object.keys(s.pendingDiscards).length > 0) {
          s.phase = 'discard'
        } else {
          s.phase = 'moveRobber'
        }
      } else {
        // Distribute resources
        const gains: Record<string, Partial<ResourceMap>> = {}
        for (const [key, tile] of s.board.tiles) {
          if (tile.number !== roll || tile.hasRobber) continue
          for (const p of s.players) {
            let count = p.settlements.filter(c => isTileCorner(c, tile.coord)).length
            count += p.cities.filter(c => isTileCorner(c, tile.coord)).length * 2
            if (count > 0 && tile.terrain !== 'sea' && tile.terrain !== 'desert') {
              const res = tile.terrain as Resource
              if (!gains[p.id]) gains[p.id] = emptyResourceMap()
              ;(gains[p.id][res] as number) = ((gains[p.id][res] ?? 0) as number) + count
            }
          }
        }
        for (const p of s.players) {
          if (gains[p.id]) p.resources = addResources(p.resources, gains[p.id])
        }
        if (Object.keys(gains).length > 0) events.push({ type: 'resourcesDistributed', gains })
        s.phase = 'main'
      }
      break
    }

    case 'placeInitialSettlement': {
      player.settlements.push(action.corner)
      player.victoryPoints += 1
      events.push({ type: 'settlementPlaced', playerId, corner: action.corner })
      break
    }

    case 'placeInitialRoad': {
      player.roads.push(action.edge)
      events.push({ type: 'roadPlaced', playerId, edge: action.edge })
      // Advance setup
      advanceSetup(s)
      break
    }

    case 'buildSettlement': {
      player.resources = subtractResources(player.resources, SETTLEMENT_COST)
      player.settlements.push(action.corner)
      player.victoryPoints += 1
      events.push({ type: 'settlementPlaced', playerId, corner: action.corner })
      updateSpecialCards(s, events)
      break
    }

    case 'buildCity': {
      player.resources = subtractResources(player.resources, CITY_COST)
      player.settlements = player.settlements.filter(c => c !== action.corner)
      player.cities.push(action.corner)
      player.victoryPoints += 1
      events.push({ type: 'cityPlaced', playerId, corner: action.corner })
      break
    }

    case 'buildRoad': {
      player.resources = subtractResources(player.resources, ROAD_COST)
      player.roads.push(action.edge)
      events.push({ type: 'roadPlaced', playerId, edge: action.edge })
      updateSpecialCards(s, events)
      break
    }

    case 'buyDevCard': {
      player.resources = subtractResources(player.resources, DEV_CARD_COST)
      const cardType = s.devCardDeck.shift()!
      player.devCards.push({ type: cardType, boughtOnTurn: s.turnNumber })
      events.push({ type: 'devCardBought', playerId })
      break
    }

    case 'playKnight': {
      const card = player.devCards.find(c => c.type === 'knight' && c.boughtOnTurn < s.turnNumber)!
      player.devCards.splice(player.devCards.indexOf(card), 1)
      player.knightsPlayed += 1
      events.push({ type: 'devCardPlayed', playerId, cardType: 'knight' })
      updateSpecialCards(s, events)
      s.phase = 'moveRobber'
      break
    }

    case 'playRoadBuilding': {
      const card = player.devCards.find(c => c.type === 'roadBuilding' && c.boughtOnTurn < s.turnNumber)!
      player.devCards.splice(player.devCards.indexOf(card), 1)
      events.push({ type: 'devCardPlayed', playerId, cardType: 'roadBuilding' })
      // Two free roads — just give resources that the UI will use to build roads
      // (simplified: handled in UI; server grants 2 road builds)
      player.resources = addResources(player.resources, { wood: 2, brick: 2 })
      break
    }

    case 'playYearOfPlenty': {
      const card = player.devCards.find(c => c.type === 'yearOfPlenty' && c.boughtOnTurn < s.turnNumber)!
      player.devCards.splice(player.devCards.indexOf(card), 1)
      events.push({ type: 'devCardPlayed', playerId, cardType: 'yearOfPlenty' })
      const [r1, r2] = action.resources
      player.resources = addResources(player.resources, { [r1]: 1, [r2]: 1 } as Partial<ResourceMap>)
      break
    }

    case 'playMonopoly': {
      const card = player.devCards.find(c => c.type === 'monopoly' && c.boughtOnTurn < s.turnNumber)!
      player.devCards.splice(player.devCards.indexOf(card), 1)
      events.push({ type: 'devCardPlayed', playerId, cardType: 'monopoly' })
      for (const p of s.players) {
        if (p.id === playerId) continue
        const amount = p.resources[action.resource]
        p.resources[action.resource] = 0
        player.resources = addResources(player.resources, { [action.resource]: amount } as Partial<ResourceMap>)
      }
      break
    }

    case 'moveRobber': {
      // Remove robber from current tile
      for (const tile of s.board.tiles.values()) {
        if (tile.hasRobber) tile.hasRobber = false
      }
      const targetKey = coordKey(action.coord)
      const target = s.board.tiles.get(targetKey)
      if (target) target.hasRobber = true
      events.push({ type: 'robberMoved', playerId, coord: action.coord })

      // Check if there are players to steal from
      const victims = getVictimsAtCorner(s, action.coord, playerId)
      if (victims.length > 0 && !s.config.friendlyRobber) {
        s.phase = 'steal'
      } else {
        s.phase = 'main'
      }
      break
    }

    case 'steal': {
      const victim = s.players.find(p => p.id === action.fromPlayerId)!
      const availableResources = ALL_RESOURCES.filter(r => victim.resources[r] > 0)
      if (availableResources.length > 0) {
        const rng = new SeededRng(`${s.id}:steal:${s.seq}`)
        const stolen = availableResources[rng.int(availableResources.length)]
        victim.resources[stolen] -= 1
        player.resources[stolen] += 1
        events.push({ type: 'stolen', fromPlayerId: action.fromPlayerId, toPlayerId: playerId })
      }
      s.phase = 'main'
      break
    }

    case 'skipSteal': {
      s.phase = 'main'
      break
    }

    case 'discard': {
      for (const [res, count] of Object.entries(action.resources)) {
        player.resources[res as Resource] -= count ?? 0
      }
      events.push({ type: 'discarded', playerId, count: s.pendingDiscards[playerId] })
      delete s.pendingDiscards[playerId]
      if (Object.keys(s.pendingDiscards).length === 0) {
        s.phase = 'moveRobber'
      }
      break
    }

    case 'offerTrade': {
      s.activeTradeOffer = {
        id: `trade-${s.seq}`,
        fromPlayerId: playerId,
        give: action.give,
        want: action.want,
        toPlayerIds: action.toPlayerIds,
        status: 'pending',
      }
      s.phase = 'tradeOffer'
      break
    }

    case 'acceptTrade': {
      const offer = s.activeTradeOffer!
      const from = s.players.find(p => p.id === offer.fromPlayerId)!
      const to = player
      // Exchange resources
      for (const [res, count] of Object.entries(offer.give)) {
        from.resources[res as Resource] -= count ?? 0
        to.resources[res as Resource] += count ?? 0
      }
      for (const [res, count] of Object.entries(offer.want)) {
        to.resources[res as Resource] -= count ?? 0
        from.resources[res as Resource] += count ?? 0
      }
      offer.status = 'accepted'
      s.tradeHistory.push({ ...offer })
      events.push({ type: 'tradeCompleted', offer })
      s.activeTradeOffer = undefined
      s.phase = 'main'
      break
    }

    case 'rejectTrade': {
      s.activeTradeOffer!.status = 'rejected'
      s.activeTradeOffer = undefined
      s.phase = 'main'
      break
    }

    case 'cancelTrade': {
      s.activeTradeOffer!.status = 'cancelled'
      s.activeTradeOffer = undefined
      s.phase = 'main'
      break
    }

    case 'bankTrade': {
      player.resources[action.give] -= action.giveCount
      player.resources[action.want] += 1
      events.push({ type: 'bankTraded', playerId, give: action.give, giveCount: action.giveCount, want: action.want })
      break
    }

    case 'endTurn': {
      events.push({ type: 'turnEnded', playerId })
      // Check win
      const scores = computeScores(s)
      if (scores[playerId] >= s.config.victoryPoints) {
        s.phase = 'ended'
        s.winner = playerId
        events.push({ type: 'gameWon', playerId, victoryPoints: scores[playerId] })
      } else {
        s.activePlayerIndex = (s.activePlayerIndex + 1) % s.players.length
        s.turnNumber += 1
        s.phase = 'roll'
        s.diceRoll = undefined
      }
      break
    }
  }

  s.seq += 1
  return { state: s, events }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (value instanceof Map) return { __map: true, entries: [...value.entries()] }
    if (value instanceof Set) return { __set: true, values: [...value.values()] }
    return value
  }), (_key, value) => {
    if (value?.__map) return new Map(value.entries)
    if (value?.__set) return new Set(value.values)
    return value
  })
}

function isTileCorner(corner: string, tileCoord: { q: number; r: number; s: number }): boolean {
  const tKey = coordKey(tileCoord)
  return corner.split('|').includes(tKey)
}

function advanceSetup(s: GameState): void {
  const n = s.players.length
  const total = n * 2
  s.setupStep += 1

  if (s.setupStep >= total) {
    // Setup done, give starting resources for 2nd settlement
    for (const player of s.players) {
      if (player.settlements.length >= 2) {
        const lastSettlement = player.settlements[1]
        for (const [key, tile] of s.board.tiles) {
          if (tile.number && isTileCorner(lastSettlement, tile.coord) && tile.terrain !== 'sea' && tile.terrain !== 'desert') {
            player.resources = addResources(player.resources, { [tile.terrain as Resource]: 1 } as Partial<ResourceMap>)
          }
        }
      }
    }
    s.phase = 'roll'
    s.activePlayerIndex = 0
    return
  }

  // Snake order: 0,1,2,3,3,2,1,0
  const half = n
  if (s.setupStep < half) {
    s.activePlayerIndex = s.setupStep
  } else {
    s.activePlayerIndex = total - 1 - s.setupStep
  }
}

function getVictimsAtCorner(s: GameState, coord: typeof s.board.tiles extends Map<any, infer T> ? T extends { coord: infer C } ? C : never : never, playerId: string): string[] {
  const victims = new Set<string>()
  const tKey = coordKey(coord)
  for (const p of s.players) {
    if (p.id === playerId) continue
    const hasBuilding = [...p.settlements, ...p.cities].some(c => c.split('|').includes(tKey))
    if (hasBuilding && totalResources(p.resources) > 0) victims.add(p.id)
  }
  return [...victims]
}

function updateSpecialCards(s: GameState, events: GameEvent[]): void {
  // Longest road
  const { holderId: roadHolder, length: roadLength } = longestRoad(s)
  if (roadLength >= 5) {
    const current = s.players.find(p => p.hasLongestRoad)
    if (!current || (current.id !== roadHolder && roadLength > (longestRoad(s).length ?? 0))) {
      if (current) {
        current.hasLongestRoad = false
        current.victoryPoints -= 2
      }
      const next = s.players.find(p => p.id === roadHolder)
      if (next && !next.hasLongestRoad) {
        next.hasLongestRoad = true
        next.victoryPoints += 2
        events.push({ type: 'longestRoadChanged', playerId: roadHolder!, length: roadLength })
      }
    }
  }

  // Largest army
  const { holderId: armyHolder, count: armyCount } = largestArmy(s)
  if (armyCount >= 3) {
    const current = s.players.find(p => p.hasLargestArmy)
    if (!current || current.id !== armyHolder) {
      if (current) {
        current.hasLargestArmy = false
        current.victoryPoints -= 2
      }
      const next = s.players.find(p => p.id === armyHolder)
      if (next && !next.hasLargestArmy) {
        next.hasLargestArmy = true
        next.victoryPoints += 2
        events.push({ type: 'largestArmyChanged', playerId: armyHolder!, count: armyCount })
      }
    }
  }
}
