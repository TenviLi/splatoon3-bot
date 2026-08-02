const publicationImageVariantDefinitions = Object.freeze({
  notificationImage: Object.freeze({
    name: 'notificationImage',
    directory: 'notification-images',
  }),
  line: Object.freeze({
    name: 'line',
    directory: 'line-images',
    dimensions: Object.freeze({ width: 1024, height: 576 }),
    maximumBytes: 1_000_000,
    maximumBytesLabel: '1 MB',
    paletteFallback: true,
  }),
  whatsapp: Object.freeze({
    name: 'whatsapp',
    directory: 'whatsapp-images',
    dimensions: Object.freeze({ width: 1024, height: 576 }),
    maximumBytes: 5 * 1024 * 1024,
    maximumBytesLabel: '5 MB',
    paletteFallback: false,
  }),
  originalImage: Object.freeze({
    name: 'originalImage',
    directory: 'originals',
  }),
})

const platformImageVariantNames = Object.freeze(['line', 'whatsapp'])

export function getPublicationImageVariantDefinition(name) {
  const definition = publicationImageVariantDefinitions[name]
  if (!definition) {
    throw new Error(`Unknown publication image variant: ${name}`)
  }
  return definition
}

export function listPlatformImageVariantDefinitions() {
  return platformImageVariantNames.map(getPublicationImageVariantDefinition)
}
