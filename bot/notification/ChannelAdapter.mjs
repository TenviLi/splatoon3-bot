const deliveryModes = new Set(['individual', 'digest'])

function freezeCapabilities({ asset = {}, digest = {}, messageBudget = {}, retry = {} } = {}) {
  const digestPolicy = digest.policy || 'individual-fallback'
  if (!['native', 'individual-fallback'].includes(digestPolicy)) {
    throw new Error(`Unknown digest policy: ${digestPolicy}`)
  }

  return Object.freeze({
    asset: Object.freeze({
      protocol: asset.protocol || 'http-or-https',
      variant: asset.variant || 'notificationImage',
      ...(asset.variantDefinition
        ? { variantDefinition: Object.freeze({ ...asset.variantDefinition }) }
        : {}),
    }),
    digest: Object.freeze({
      policy: digestPolicy,
      ...(digest.maximumItemsPerDelivery !== undefined
        ? { maximumItemsPerDelivery: digest.maximumItemsPerDelivery }
        : {}),
    }),
    messageBudget: Object.freeze({ ...messageBudget }),
    retry: Object.freeze({
      idempotency: retry.idempotency || 'none',
      maximumAttempts: retry.maximumAttempts ?? 2,
      retryableStatuses: Object.freeze([...(retry.retryableStatuses || [429])]),
    }),
  })
}

function validatePublicationUrl(adapter, publicBaseUrl) {
  const url = new URL(publicBaseUrl)
  if (adapter.capabilities.asset.protocol === 'https-only' && url.protocol !== 'https:') {
    throw new Error(`${adapter.name} requires S3_CONFIG.publicBaseUrl to use HTTPS`)
  }
  return url
}

function createDeliveryOperations(adapter, target, notificationIds) {
  const requestedMode = target.mode || 'individual'
  if (!deliveryModes.has(requestedMode)) {
    throw new Error(`Unknown Notification delivery mode: ${requestedMode}`)
  }

  if (requestedMode === 'digest' && adapter.capabilities.digest.policy === 'native') {
    const maximumItems = adapter.capabilities.digest.maximumItemsPerDelivery || notificationIds.length
    const operations = []
    for (let index = 0; index < notificationIds.length; index += maximumItems) {
      operations.push(Object.freeze({
        mode: 'digest',
        requestedMode,
        notificationIds: Object.freeze(notificationIds.slice(index, index + maximumItems)),
      }))
    }
    return Object.freeze(operations)
  }

  return Object.freeze(
    notificationIds.map((notificationId) =>
      Object.freeze({
        mode: 'individual',
        requestedMode,
        ...(requestedMode === 'digest' ? { fallbackReason: 'adapter uses individual fallback' } : {}),
        notificationIds: Object.freeze([notificationId]),
      })
    )
  )
}

export function defineChannelAdapter({
  name,
  configurationEnvironmentVariable,
  targetSchema,
  capabilities,
  deliver,
  deliverDigest,
  deliveryOptionsFactory = () => Object.freeze({}),
  extractReceipt = () => undefined,
}) {
  if (!name || !configurationEnvironmentVariable || !targetSchema || !deliver) {
    throw new Error('Channel Adapter requires name, configuration environment variable, target schema, and delivery')
  }

  const normalizedCapabilities = freezeCapabilities(capabilities)
  if (normalizedCapabilities.digest.policy === 'native' && !deliverDigest) {
    throw new Error(`${name} declares native Digest support without a Digest delivery function`)
  }
  if (
    normalizedCapabilities.digest.maximumItemsPerDelivery !== undefined &&
    (!Number.isInteger(normalizedCapabilities.digest.maximumItemsPerDelivery) ||
      normalizedCapabilities.digest.maximumItemsPerDelivery < 1)
  ) {
    throw new Error(`${name} Digest maximumItemsPerDelivery must be a positive integer`)
  }
  if (
    !Number.isInteger(normalizedCapabilities.retry.maximumAttempts) ||
    normalizedCapabilities.retry.maximumAttempts < 1
  ) {
    throw new Error(`${name} retry maximumAttempts must be a positive integer`)
  }
  if (
    normalizedCapabilities.retry.retryableStatuses.some(
      (status) => !Number.isInteger(status) || status < 400 || status > 599
    )
  ) {
    throw new Error(`${name} retryable HTTP statuses must be integers from 400 to 599`)
  }

  const adapter = {
    name,
    configurationEnvironmentVariable,
    targetSchema,
    capabilities: normalizedCapabilities,
    validatePublicationConfiguration(configuration) {
      return validatePublicationUrl(adapter, configuration.publicBaseUrl)
    },
    createDeliveryOperations(target, notificationIds) {
      return createDeliveryOperations(adapter, target, notificationIds)
    },
    createDeliveryOptions(deliveryId) {
      return Object.freeze({ ...deliveryOptionsFactory(deliveryId) })
    },
    async deliver(operation, target, options = {}) {
      const notifications = operation.notifications
      const deliveryOptions = {
        ...options,
        attempts: normalizedCapabilities.retry.maximumAttempts,
        retryableStatuses: normalizedCapabilities.retry.retryableStatuses,
        capabilities: normalizedCapabilities,
      }
      if (operation.mode === 'digest') {
        return deliverDigest(notifications, target, deliveryOptions)
      }
      return deliver(notifications[0], target, deliveryOptions)
    },
    extractReceipt,
  }

  return Object.freeze(adapter)
}
