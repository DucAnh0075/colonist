/** Seeded pseudo-random number generator (mulberry32). Deterministic. */
export class SeededRng {
  private state: number

  constructor(seed: string) {
    // Hash the string seed to a uint32
    let h = 0x9dc5811c
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 0x9e3779b9)
      h ^= h >>> 16
    }
    this.state = h >>> 0
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state += 0x6d2b79f5
    let z = this.state
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
  }

  /** Integer in [0, max) */
  int(max: number): number {
    return Math.floor(this.next() * max)
  }

  /** Fisher-Yates in-place shuffle */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1)
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
  }
}
