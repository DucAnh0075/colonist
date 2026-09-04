// ─── Coordinates ────────────────────────────────────────────────────────────

export interface CubeCoord {
  q: number
  r: number
  s: number
}

/** Unique string key for a cube coordinate, e.g. "1,0,-1" */
export type CoordKey = string
export const coordKey = (c: CubeCoord): CoordKey => `${c.q},${c.r},${c.s}`

/**
 * A Corner is shared by exactly 3 tiles. Its canonical ID is the sorted
 * list of the three neighbouring cube-coord keys joined by '|'.
 */
export type CornerKey = string

/**
 * An Edge is shared by exactly 2 tiles. Its canonical ID is the sorted
 * pair of the two neighbouring cube-coord keys joined by '|'.
 */
export type EdgeKey = string

// ─── Resources & Terrain ────────────────────────────────────────────────────

export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore'
export type TerrainType = Resource | 'desert' | 'sea' | 'gold' | 'fog'

export interface Tile {
  coord: CubeCoord
  terrain: TerrainType
  /** 2–12, undefined for sea/desert */
  number?: number
  hasRobber: boolean
}

export interface Port {
  /** The edge (between sea and land tile) the port occupies */
  edge: EdgeKey
  /** Which two corners players can build on to use this port */
  corners: [CornerKey, CornerKey]
  type: '3:1' | Resource
}

// ─── Board ──────────────────────────────────────────────────────────────────

export type BoardSize = 'standard' | 'large' | 'xl'

export interface BoardDefinition {
  /** Each entry: fixed terrain OR 'random' (assigned at game start) */
  tiles: Array<{ coord: CubeCoord; terrain: TerrainType | 'random' }>
  ports: Array<Omit<Port, 'corners'> & { edge: EdgeKey }>
  size: BoardSize
}

export interface Board {
  tiles: Map<CoordKey, Tile>
  ports: Port[]
  corners: Set<CornerKey>
  edges: Set<EdgeKey>
}

// ─── Players ────────────────────────────────────────────────────────────────

export type ResourceMap = Record<Resource, number>

export type DevCardType = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint'

export interface DevCard {
  type: DevCardType
  /** Turn on which it was bought (can't play same turn) */
  boughtOnTurn: number
}

export interface Player {
  id: string
  name: string
  color: PlayerColor
  resources: ResourceMap
  devCards: DevCard[]
  /** Settlements + cities on the board */
  settlements: CornerKey[]
  cities: CornerKey[]
  roads: EdgeKey[]
  knightsPlayed: number
  hasLongestRoad: boolean
  hasLargestArmy: boolean
  victoryPoints: number
}

export type PlayerColor = 'red' | 'blue' | 'green' | 'orange' | 'purple' | 'white'

// ─── Trade ──────────────────────────────────────────────────────────────────

export interface TradeOffer {
  id: string
  fromPlayerId: string
  give: Partial<ResourceMap>
  want: Partial<ResourceMap>
  /** undefined = open to all; string[] = specific players */
  toPlayerIds?: string[]
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  counterOfferId?: string
}

// ─── Game Config ─────────────────────────────────────────────────────────────

export interface GameConfig {
  mode: GameMode
  boardPreset: string | BoardDefinition
  maxPlayers: number
  victoryPoints: number
  discardLimit: number
  turnTimerSeconds: number | null
  /** no random events (friendly robber = robber doesn't steal) */
  friendlyRobber: boolean
  /** hide bank card counts from opponents */
  hideBankCards: boolean
  /** balanced dice: weighted to match statistical expectation */
  balancedDice: boolean
  /** no trolls: block offensive chat (placeholder) */
  noTrolls: boolean
  /** private: room hidden from public listing */
  privateRoom: boolean
}

export type GameMode =
  | 'base'
  | 'base56'
  | 'base78'
  | 'seafarers'
  | 'seafarers56'
  | 'citiesAndKnights'
  | 'citiesAndKnights56'
  | 'seafarersAndCitiesAndKnights'
  | 'seafarersAndCitiesAndKnights56'

// ─── Game Phase ──────────────────────────────────────────────────────────────

export type GamePhase =
  | 'lobby'
  | 'setup'           // placing initial settlements/roads
  | 'roll'            // waiting for active player to roll
  | 'discard'         // one or more players must discard after 7
  | 'moveRobber'      // active player moves robber
  | 'steal'           // active player steals from a neighbour
  | 'main'            // main turn: build, trade, buy dev cards
  | 'tradeOffer'      // an offer is live
  | 'ended'

// ─── Game State ──────────────────────────────────────────────────────────────

export interface GameState {
  id: string
  config: GameConfig
  board: Board
  players: Player[]
  /** Index into players[] */
  activePlayerIndex: number
  phase: GamePhase
  turnNumber: number
  /** Index for setup phase (goes 0..n-1, n-1..0) */
  setupStep: number
  devCardDeck: DevCardType[]
  activeTradeOffer?: TradeOffer
  tradeHistory: TradeOffer[]
  /** Players who still need to discard (after rolling 7) */
  pendingDiscards: Record<string, number>
  diceRoll?: [number, number]
  winner?: string
  /** Monotonically-increasing sequence number (for optimistic UI) */
  seq: number
}

/**
 * The view of GameState sent to a specific player:
 * - Own resources/devCards: full
 * - Other players' resources: count only; devCards: count only
 */
export interface PublicGameState extends Omit<GameState, 'players'> {
  players: PublicPlayer[]
  /** The player ID this view was generated for */
  viewForPlayerId: string
}

export interface PublicPlayer extends Omit<Player, 'devCards'> {
  /** Full list for own player; undefined for others */
  devCards?: DevCard[]
  devCardCount: number
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'rollDice' }
  | { type: 'placeInitialSettlement'; corner: CornerKey }
  | { type: 'placeInitialRoad'; edge: EdgeKey }
  | { type: 'buildSettlement'; corner: CornerKey }
  | { type: 'buildCity'; corner: CornerKey }
  | { type: 'buildRoad'; edge: EdgeKey }
  | { type: 'buyDevCard' }
  | { type: 'playKnight' }
  | { type: 'playRoadBuilding' }
  | { type: 'playYearOfPlenty'; resources: [Resource, Resource] }
  | { type: 'playMonopoly'; resource: Resource }
  | { type: 'moveRobber'; coord: CubeCoord }
  | { type: 'steal'; fromPlayerId: string }
  | { type: 'skipSteal' }
  | { type: 'discard'; resources: Partial<ResourceMap> }
  | { type: 'offerTrade'; give: Partial<ResourceMap>; want: Partial<ResourceMap>; toPlayerIds?: string[] }
  | { type: 'counterOffer'; offerId: string; give: Partial<ResourceMap>; want: Partial<ResourceMap> }
  | { type: 'acceptTrade'; offerId: string }
  | { type: 'rejectTrade'; offerId: string }
  | { type: 'cancelTrade'; offerId: string }
  | { type: 'bankTrade'; give: Resource; giveCount: number; want: Resource }
  | { type: 'endTurn' }

// ─── Events (server → client broadcasts) ─────────────────────────────────────

export type GameEvent =
  | { type: 'diceRolled'; playerId: string; roll: [number, number] }
  | { type: 'resourcesDistributed'; gains: Record<string, Partial<ResourceMap>> }
  | { type: 'settlementPlaced'; playerId: string; corner: CornerKey }
  | { type: 'cityPlaced'; playerId: string; corner: CornerKey }
  | { type: 'roadPlaced'; playerId: string; edge: EdgeKey }
  | { type: 'devCardBought'; playerId: string }
  | { type: 'devCardPlayed'; playerId: string; cardType: DevCardType }
  | { type: 'robberMoved'; playerId: string; coord: CubeCoord }
  | { type: 'stolen'; fromPlayerId: string; toPlayerId: string }
  | { type: 'tradeCompleted'; offer: TradeOffer }
  | { type: 'bankTraded'; playerId: string; give: Resource; giveCount: number; want: Resource }
  | { type: 'longestRoadChanged'; playerId: string; length: number }
  | { type: 'largestArmyChanged'; playerId: string; count: number }
  | { type: 'discarded'; playerId: string; count: number }
  | { type: 'turnEnded'; playerId: string }
  | { type: 'gameWon'; playerId: string; victoryPoints: number }
  | { type: 'chat'; playerId: string; name: string; text: string }
