import { describe, it, expect } from 'vitest'
import { computeScores, longestRoad } from '../src/scoring.js'
import type { GameState, Player } from '../src/types.js'
import { generateBoard } from '../src/board/generator.js'

function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: 'p1',
    name: 'Test',
    color: 'red',
    resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    devCards: [],
    settlements: [],
    cities: [],
    roads: [],
    knightsPlayed: 0,
    hasLongestRoad: false,
    hasLargestArmy: false,
    victoryPoints: 0,
    ...overrides,
  }
}

function makeState(players: Player[]): GameState {
  const board = generateBoard('random', 'standard', 'test-scoring')
  return {
    id: 'test',
    config: {
      mode: 'base', boardPreset: 'base', maxPlayers: 4,
      victoryPoints: 10, discardLimit: 7, turnTimerSeconds: null,
      friendlyRobber: false, hideBankCards: false, balancedDice: false,
      noTrolls: false, privateRoom: false,
    },
    board,
    players,
    activePlayerIndex: 0,
    phase: 'main',
    turnNumber: 1,
    setupStep: 0,
    devCardDeck: [],
    tradeHistory: [],
    pendingDiscards: {},
    seq: 0,
  }
}

describe('computeScores', () => {
  it('counts settlements (1 VP each)', () => {
    const p = makePlayer({ id: 'p1', settlements: ['c1', 'c2'] })
    const state = makeState([p])
    expect(computeScores(state)['p1']).toBe(2)
  })

  it('counts cities (2 VP each)', () => {
    const p = makePlayer({ id: 'p1', cities: ['c1', 'c2'] })
    const state = makeState([p])
    expect(computeScores(state)['p1']).toBe(4)
  })

  it('counts VP dev cards', () => {
    const p = makePlayer({
      id: 'p1',
      devCards: [
        { type: 'victoryPoint', boughtOnTurn: 0 },
        { type: 'victoryPoint', boughtOnTurn: 1 },
      ],
    })
    const state = makeState([p])
    expect(computeScores(state)['p1']).toBe(2)
  })

  it('adds 2 for longest road holder', () => {
    const p = makePlayer({ id: 'p1', hasLongestRoad: true })
    const state = makeState([p])
    expect(computeScores(state)['p1']).toBe(2)
  })

  it('adds 2 for largest army holder', () => {
    const p = makePlayer({ id: 'p1', hasLargestArmy: true })
    const state = makeState([p])
    expect(computeScores(state)['p1']).toBe(2)
  })

  it('combines all VP sources correctly', () => {
    const p = makePlayer({
      id: 'p1',
      settlements: ['c1'],
      cities: ['c2'],
      devCards: [{ type: 'victoryPoint', boughtOnTurn: 0 }],
      hasLongestRoad: true,
      hasLargestArmy: true,
    })
    const state = makeState([p])
    // 1 settlement (1) + 1 city (2) + 1 VP card (1) + longest (2) + army (2) = 8
    expect(computeScores(state)['p1']).toBe(8)
  })
})

describe('longestRoad', () => {
  it('returns null holder and 0 for no roads', () => {
    const p = makePlayer({ id: 'p1' })
    const state = makeState([p])
    const { holderId, length } = longestRoad(state)
    expect(length).toBe(0)
  })
})
