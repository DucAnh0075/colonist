import type { GameState, GameConfig, Player, PlayerColor, DevCardType, ResourceMap, BoardDefinition } from '../types.js'
import { generateBoard } from '../board/generator.js'
import { SeededRng } from '../util/rng.js'
import { emptyResourceMap } from '../util/resources.js'

const COLORS: PlayerColor[] = ['red', 'blue', 'green', 'orange', 'purple', 'white']

const DEV_CARD_DECK: DevCardType[] = [
  ...Array<DevCardType>(14).fill('knight'),
  ...Array<DevCardType>(5).fill('victoryPoint'),
  ...Array<DevCardType>(2).fill('roadBuilding'),
  ...Array<DevCardType>(2).fill('yearOfPlenty'),
  ...Array<DevCardType>(2).fill('monopoly'),
]

export function createInitialState(config: GameConfig, playerNames: string[], seed: string): GameState {
  const rng = new SeededRng(seed + ':deck')
  const deck = [...DEV_CARD_DECK]
  rng.shuffle(deck)

  const boardDef: BoardDefinition | 'random' =
    typeof config.boardPreset === 'string' ? 'random' : config.boardPreset
  const board = generateBoard(boardDef, 'large', seed + ':board')

  const players: Player[] = playerNames.map((name, i) => ({
    id: `player-${i}`,
    name,
    color: COLORS[i % COLORS.length],
    resources: emptyResourceMap(),
    devCards: [],
    settlements: [],
    cities: [],
    roads: [],
    knightsPlayed: 0,
    hasLongestRoad: false,
    hasLargestArmy: false,
    victoryPoints: 0,
  }))

  return {
    id: seed,
    config,
    board,
    players,
    activePlayerIndex: 0,
    phase: 'setup',
    turnNumber: 0,
    setupStep: 0,
    devCardDeck: deck,
    tradeHistory: [],
    pendingDiscards: {},
    seq: 0,
  }
}
