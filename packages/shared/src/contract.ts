/**
 * ENGINE CONTRACT — the only surface B (server) and C (web) import from @colonist/shared.
 *
 * All functions are pure (no side effects, no I/O).
 * State is immutable: reduce() returns a NEW state, never mutates the input.
 *
 * Functions are implemented in rules/ and board/; this file re-exports them
 * so B and C have a single stable import target.
 *
 * CHANGING A SIGNATURE HERE requires coordination with all 3 streams.
 */

import type {
  GameState,
  PublicGameState,
  GameConfig,
  Board,
  BoardDefinition,
  BoardSize,
  Action,
  GameEvent,
} from './types.js'

export type {
  GameState,
  PublicGameState,
  GameConfig,
  Board,
  BoardDefinition,
  BoardSize,
  Action,
  GameEvent,
  CubeCoord,
  CoordKey,
  CornerKey,
  EdgeKey,
  Tile,
  Port,
  Player,
  PublicPlayer,
  PlayerColor,
  Resource,
  TerrainType,
  DevCard,
  DevCardType,
  ResourceMap,
  TradeOffer,
  GamePhase,
  GameMode,
} from './types.js'

// ─── Board ───────────────────────────────────────────────────────────────────

/**
 * Generate a Board from a definition (or 'random' for a fully random standard board).
 * Terrains marked 'random' in the definition are assigned randomly.
 * Numbers are ALWAYS assigned randomly (never stored in BoardDefinition).
 * Red-number balance rule: at most 2 tiles of 6 and at most 2 tiles of 8,
 * and no two red-number tiles may share an edge.
 *
 * @param seed - Deterministic seed string for reproducible boards.
 */
export { generateBoard } from './board/generator.js'

/**
 * Return the full set of corner keys and edge keys for the given board.
 * These are derived from the tile coords and stored on Board at creation time.
 */
export { hexDisk, cornerKey, edgeKey, tileNeighbours, cornerTiles, edgeCorners } from './board/coords.js'

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Create the initial GameState for a new game.
 * Board is generated and shuffled here; dev card deck is shuffled.
 */
export { createInitialState } from './rules/state.js'

/**
 * Return all legal actions for playerId in the current state.
 * Used by the client for UI highlighting (legal = highlight).
 */
export { legalActions } from './rules/legal.js'

/**
 * Validate a single action without applying it.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export { validate } from './rules/validate.js'

/**
 * Apply an action authoritatively. Returns the new state + events to broadcast.
 * Throws (or returns error) if the action is illegal — server should reject.
 */
export { reduce } from './rules/reduce.js'

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Compute public victory points for all players.
 * Longest road / largest army cards count; hidden VP dev cards count ONLY
 * for the player themselves (pass own playerId to get true total).
 */
export { computeScores, longestRoad, largestArmy } from './scoring.js'

// ─── View ────────────────────────────────────────────────────────────────────

/**
 * Filter GameState to what a specific player may see:
 * - Own resources + devCards: full
 * - Other players' resources: count only; devCards: count only (type hidden)
 * Server MUST call this before sending state to any client.
 */
export { publicView } from './rules/view.js'
