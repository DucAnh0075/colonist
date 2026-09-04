# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Colonist** — a self-hosted multiplayer Catan clone (colonist.io-style) playable with friends via room code, no account required. Hosted free on Render.com (no credit card). All features that colonist.io gates behind membership are unlocked here.

This is a **pnpm monorepo** with three workspaces being developed by three parallel streams:

| Stream | Branch | Directory | Responsibility |
|--------|--------|-----------|----------------|
| A – Engine | `stream/engine` | `packages/shared/` | Rule engine, types, board gen |
| B – Server | `stream/server` | `apps/server/` | Colyseus room, state sync |
| C – Web | `stream/web` | `apps/web/` | React UI, SVG board, Map Builder |

**Each stream owns its directory exclusively.** Cross-stream changes require coordination via `contract.ts` / `protocol.ts`.

## Commands

```bash
export PATH="$HOME/.local/share/pnpm:$PATH"   # WSL: pnpm must be in PATH

pnpm install                                   # Install all workspaces
pnpm --filter @colonist/shared build           # Build shared (required before server/web)
pnpm --filter @colonist/server dev             # Server on :3000
pnpm --filter @colonist/web dev                # Web on :5173
pnpm test                                      # Run all tests (Vitest)
pnpm --filter @colonist/shared test            # Tests for engine only
pnpm --filter @colonist/shared test -- --reporter=verbose   # Verbose test output
```

**Build order matters:** `@colonist/shared` must be built before `server` or `web` start, because both import from `dist/`.

## Architecture

### `packages/shared` — Engine (A owns this)

The **complete Catan rule engine as pure functions**. No I/O, no side effects. Both server and web import from here.

**The two contract files that B and C import from:**
- `src/contract.ts` — engine API (re-exports all engine functions with JSDoc). **Only import from `@colonist/shared`, never from deep paths.**
- `src/protocol.ts` — all network message types (`ClientMessage`, `ServerBroadcast`, `JoinOptions`, `LobbySlot`)

**Key engine functions (all in `contract.ts`):**
- `createInitialState(config, playerNames, seed)` → `GameState`
- `generateBoard(def | 'random', size, seed)` → `Board` — numbers always random; red-number (6/8) balance enforced via backtracking
- `validate(state, action, playerId)` → `{ ok: true } | { ok: false, reason }`
- `reduce(state, action, playerId)` → `{ state, events }` — returns NEW state (never mutates)
- `legalActions(state, playerId)` → `Action[]` — used by web for UI highlighting
- `publicView(state, playerId)` → `PublicGameState` — server MUST call this before sending to client (hides opponents' hands/dev cards)
- `computeScores`, `longestRoad`, `largestArmy`

**Coordinate system:** Cube coordinates `{q, r, s}` where `q+r+s=0`. `hexDisk(radius)` uses direct enumeration (NOT hexRing — that had duplicate bugs). Board radii: standard=2 (19 tiles), large=3 (37 tiles), xl=4.

**Keys (all are canonical strings, sorted to avoid duplicates):**
- `CoordKey` = `"q,r,s"` — tile identity
- `CornerKey` = three sorted CoordKeys joined by `|` — vertex shared by 3 tiles
- `EdgeKey` = two sorted CoordKeys joined by `|` — edge shared by 2 tiles

**`BoardDefinition`:** stores tile coords + terrain (`'random'` = assigned at game start). Numbers are **never** stored in definitions — always generated at runtime.

**`GameState` phases:** `lobby → setup → roll → main → [discard → moveRobber → steal →] main → ended`. Trade inserts `tradeOffer` phase mid-main.

### `apps/server` — Colyseus Room (B owns this, not yet created)

- Node + Colyseus 0.15, CommonJS (no `"type":"module"`), tsx for dev
- One `GameRoom` = one lobby/game, addressed by room code (e.g. "area2438")
- Imports engine via `@colonist/shared` and calls `reduce()` authoritatively
- Must call `publicView(state, playerId)` before sending state to each client

### `apps/web` — React Frontend (C owns this, not yet created)

- React 18 + Vite + TypeScript + Tailwind + Zustand
- SVG-based hex board (sharp scaling, easy hit zones for corners/edges/tiles)
- Until real server exists: `src/net/mockRoom.ts` calls engine directly in-memory
- Real network: `colyseus.js` client, `VITE_SERVER_URL` env var → `wss://...`

## Key Invariants

- **`reduce()` never mutates state** — always returns a deep-cloned new state. `deepClone` in `reduce.ts` handles `Map` and `Set` via custom JSON replacer/reviver.
- **Red numbers balanced:** generator uses backtracking so no two 6/8 tiles are adjacent, max 2 of each.
- **Dev cards bought this turn cannot be played** — enforced via `boughtOnTurn < state.turnNumber`.
- **Setup order is snake:** players place in order 0→n-1, then n-1→0 (second round reversed).
- **`publicView` is mandatory** before any network send — opponents must never see resource counts or dev card types.

## Changing the Engine Contract

`contract.ts` and `protocol.ts` are the only files all three streams share. Any signature change must be coordinated across all streams and committed as a standalone PR to `stream/engine`, then pulled by B and C before proceeding.

## Testing

Tests live in `packages/shared/tests/`. Run with Vitest. Current coverage: board generation (hex disk, red-number constraint, seed determinism), scoring (VP sources, longest road), and action validation. Tests import directly from `src/` (not `dist/`).

To add a test for a new rule: create a `GameState` with `makeState()` helper pattern from existing tests, call `validate()` or `reduce()` directly.

## Deployment (target: Render.com, free tier, no credit card)

- **Server:** Render Web Service — `pnpm install && pnpm --filter @colonist/shared build && pnpm --filter @colonist/server build`, start `node apps/server/dist/index.js`, `PORT` from env.
- **Web:** Render Static Site — Vite build, `VITE_SERVER_URL=wss://your-server.onrender.com`.
- Server sleeps after ~15 min inactivity (free tier cold start). Reconnect logic in Colyseus handles this.
