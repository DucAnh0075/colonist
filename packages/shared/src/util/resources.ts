import type { Resource, ResourceMap } from '../types.js'

export const ALL_RESOURCES: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore']

export function emptyResourceMap(): ResourceMap {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }
}

export function addResources(a: ResourceMap, b: Partial<ResourceMap>): ResourceMap {
  const r = { ...a }
  for (const res of ALL_RESOURCES) r[res] += b[res] ?? 0
  return r
}

export function subtractResources(a: ResourceMap, b: Partial<ResourceMap>): ResourceMap {
  const r = { ...a }
  for (const res of ALL_RESOURCES) r[res] -= b[res] ?? 0
  return r
}

export function hasResources(map: ResourceMap, cost: Partial<ResourceMap>): boolean {
  return ALL_RESOURCES.every(r => (map[r] ?? 0) >= (cost[r] ?? 0))
}

export function totalResources(map: Partial<ResourceMap>): number {
  return ALL_RESOURCES.reduce((s, r) => s + (map[r] ?? 0), 0)
}

export const ROAD_COST: Partial<ResourceMap> = { wood: 1, brick: 1 }
export const SETTLEMENT_COST: Partial<ResourceMap> = { wood: 1, brick: 1, sheep: 1, wheat: 1 }
export const CITY_COST: Partial<ResourceMap> = { wheat: 2, ore: 3 }
export const DEV_CARD_COST: Partial<ResourceMap> = { sheep: 1, wheat: 1, ore: 1 }
