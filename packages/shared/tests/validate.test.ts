import { describe, it, expect, beforeEach } from 'vitest'
import { validate } from '../src/rules/validate.js'
import { createInitialState } from '../src/rules/state.js'
import type { GameState, GameConfig } from '../src/types.js'

const BASE_CONFIG: GameConfig = {
  mode: 'base',
  boardPreset: 'base',
  maxPlayers: 2,
  victoryPoints: 10,
  discardLimit: 7,
  turnTimerSeconds: null,
  friendlyRobber: false,
  hideBankCards: false,
  balancedDice: false,
  noTrolls: false,
  privateRoom: false,
}

describe('validate', () => {
  let state: GameState

  beforeEach(() => {
    state = createInitialState(BASE_CONFIG, ['Alice', 'Bob'], 'test-seed')
  })

  it('rejects actions for unknown player', () => {
    const result = validate(state, { type: 'rollDice' }, 'unknown-id')
    expect(result.ok).toBe(false)
  })

  it('rejects rollDice in setup phase', () => {
    expect(state.phase).toBe('setup')
    const result = validate(state, { type: 'rollDice' }, state.players[0].id)
    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/roll|setup/i)
  })

  it('rejects actions from non-active player', () => {
    expect(state.phase).toBe('setup')
    const nonActive = state.players[1]
    const result = validate(state, { type: 'placeInitialSettlement', corner: 'any' }, nonActive.id)
    expect(result.ok).toBe(false)
  })

  it('allows placing initial settlement on a valid corner (active player)', () => {
    const corner = [...state.board.corners][0]
    const activeId = state.players[state.activePlayerIndex].id
    const result = validate(state, { type: 'placeInitialSettlement', corner }, activeId)
    expect(result.ok).toBe(true)
  })

  it('rejects invalid corner for initial settlement', () => {
    const activeId = state.players[state.activePlayerIndex].id
    const result = validate(state, { type: 'placeInitialSettlement', corner: 'not-a-real-corner' }, activeId)
    expect(result.ok).toBe(false)
  })

  it('rejects building with insufficient resources', () => {
    state.phase = 'main'
    const activeId = state.players[state.activePlayerIndex].id
    const corner = [...state.board.corners][0]
    const result = validate(state, { type: 'buildSettlement', corner }, activeId)
    expect(result.ok).toBe(false)
    expect((result as any).reason).toMatch(/resource/i)
  })

  it('rejects endTurn outside main phase', () => {
    expect(state.phase).toBe('setup')
    const activeId = state.players[state.activePlayerIndex].id
    const result = validate(state, { type: 'endTurn' }, activeId)
    expect(result.ok).toBe(false)
  })
})
