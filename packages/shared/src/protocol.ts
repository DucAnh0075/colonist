/**
 * NETWORK PROTOCOL CONTRACT — defines all messages between server (B) and client (C).
 *
 * Server uses Colyseus 0.15. Client uses colyseus.js.
 *
 * CHANGING A TYPE HERE requires coordination with all 3 streams.
 */

import type { Action, GameEvent, GameConfig, BoardDefinition, PublicGameState } from './types.js'

export type { Action, GameEvent, GameConfig, BoardDefinition, PublicGameState }

// ─── Room join options ────────────────────────────────────────────────────────

export interface JoinOptions {
  /** Display name (no account required) */
  name: string
  /**
   * Token stored in sessionStorage on first join, sent on reconnect.
   * Server uses it to restore the player's seat.
   */
  reconnectToken?: string
}

// ─── Client → Server messages ─────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'action'; action: Action }
  | { type: 'chat'; text: string }
  | { type: 'lobbyPatch'; patch: Partial<GameConfig> }
  | { type: 'ready' }
  | { type: 'unready' }
  | { type: 'start' }
  | { type: 'kick'; playerId: string }
  | { type: 'uploadMap'; definition: BoardDefinition; name: string }

// ─── Server → Client broadcasts ──────────────────────────────────────────────

/**
 * Server broadcasts a GameEvent after every state change.
 * The full state is sent via Colyseus Schema room.state (PublicGameState-shaped).
 */
export type ServerBroadcast =
  | { type: 'event'; event: GameEvent }
  | { type: 'error'; reason: string }
  | { type: 'reconnected'; seat: number }
  | { type: 'playerJoined'; playerId: string; name: string }
  | { type: 'playerLeft'; playerId: string; name: string }
  | { type: 'playerReady'; playerId: string; ready: boolean }
  | { type: 'lobbyUpdated'; config: GameConfig }
  | { type: 'mapUploaded'; name: string; definition: BoardDefinition }
  | { type: 'turnTimer'; remainingMs: number }

// ─── Colyseus Room State shape ────────────────────────────────────────────────
//
// The Colyseus Schema that B sends to C mirrors PublicGameState.
// C reads it via room.state (Colyseus auto-patches the state on every change).
// B must call publicView(state, seat.playerId) and map the result into the Schema.
//
// Key fields C can rely on being present in room.state:
//
//   room.state.phase          — GamePhase
//   room.state.players[]      — PublicPlayer[]
//   room.state.board          — Board (tiles, ports, corners, edges)
//   room.state.activePlayerIndex
//   room.state.diceRoll       — [number, number] | undefined
//   room.state.activeTradeOffer
//   room.state.config         — GameConfig (lobby settings)
//   room.state.seq            — monotonic seq number
//   room.state.winner         — string | undefined
//
// B also sends a `reconnectToken` as a private message to each player on join.

export interface ReconnectTokenMessage {
  type: 'reconnectToken'
  token: string
}

// ─── Lobby player slot (before game starts) ───────────────────────────────────

export interface LobbySlot {
  playerId: string
  name: string
  color: string
  ready: boolean
  isHost: boolean
  isSpectator: boolean
  /** undefined = human; future: 'easy' | 'medium' | 'hard' for bots */
  botDifficulty?: never
}

// ─── Custom map sharing ───────────────────────────────────────────────────────

export interface SavedMap {
  id: string
  name: string
  definition: BoardDefinition
  createdAt: number
}
