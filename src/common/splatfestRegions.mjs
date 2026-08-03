const definitions = [
  { name: 'NA', dataKey: 'US', slug: 'na' },
  { name: 'EU', dataKey: 'EU', slug: 'eu' },
  { name: 'JP', dataKey: 'JP', slug: 'jp' },
  { name: 'AP', dataKey: 'AP', slug: 'ap' },
]

export const splatfestRegions = Object.freeze(
  definitions.map((definition) => Object.freeze(definition))
)

export const splatfestRegionNames = Object.freeze(splatfestRegions.map(({ name }) => name))

export function getSplatfestRegion(name) {
  const definition = splatfestRegions.find((candidate) => candidate.name === name)
  if (!definition) {
    throw new Error(`Unknown Splatfest region: ${name}`)
  }
  return definition
}

export function isSplatfestRegion(name) {
  return splatfestRegionNames.includes(name)
}
