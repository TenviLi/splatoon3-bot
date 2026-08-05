import { listChannelAdapters } from '../notification/channels/index.mjs'

const publicationImageVariantDefinitions = Object.freeze({
  notificationImage: Object.freeze({
    name: 'notificationImage',
    directory: 'notification-images',
  }),
  originalImage: Object.freeze({
    name: 'originalImage',
    directory: 'originals',
  }),
})

const platformImageVariantDefinitions = Object.freeze(
  Object.values(
    Object.fromEntries(
      listChannelAdapters()
        .map(({ capabilities }) => capabilities.asset.variantDefinition)
        .filter(Boolean)
        .map((definition) => [definition.name, definition])
      )
  ).sort((left, right) => left.name.localeCompare(right.name))
)

export function getPublicationImageVariantDefinition(name) {
  const definition =
    publicationImageVariantDefinitions[name] ||
    platformImageVariantDefinitions.find((candidate) => candidate.name === name)
  if (!definition) {
    throw new Error(`Unknown publication image variant: ${name}`)
  }
  return definition
}

export function listPlatformImageVariantDefinitions() {
  return platformImageVariantDefinitions
}
