import type { GameState, PublicGameState, PublicPlayer } from '../types.js'

export function publicView(state: GameState, forPlayerId: string): PublicGameState {
  return {
    ...state,
    viewForPlayerId: forPlayerId,
    players: state.players.map(p => {
      if (p.id === forPlayerId) {
        return {
          ...p,
          devCards: p.devCards,
          devCardCount: p.devCards.length,
        } satisfies PublicPlayer
      }
      return {
        ...p,
        devCards: undefined,
        devCardCount: p.devCards.length,
      } satisfies PublicPlayer
    }),
  }
}
