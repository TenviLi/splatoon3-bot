import { listChannelAdapters } from './channels/index.mjs'

function describeDigest(digest) {
  if (digest.policy !== 'native') {
    return 'individual fallback'
  }
  return digest.maximumItemsPerDelivery
    ? `native; ${digest.maximumItemsPerDelivery} items/delivery`
    : 'native'
}

function describeBudget(messageBudget) {
  const entries = Object.entries(messageBudget).sort(([left], [right]) => left.localeCompare(right))
  return entries.length > 0
    ? entries.map(([name, value]) => `${name}=${value}`).join(', ')
    : 'platform implementation'
}

function describeRetry(retry) {
  const statuses = retry.retryableStatuses.length > 0
    ? retry.retryableStatuses.join('/')
    : 'none'
  return `${retry.maximumAttempts} attempts on ${statuses}`
}

export function formatChannelCapabilitiesMarkdown(adapters = listChannelAdapters()) {
  const lines = [
    '| Channel | Public asset | Image variant | Digest | Retry | Idempotency | Message budget |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
  ]
  for (const adapter of adapters) {
    const { asset, digest, retry, messageBudget } = adapter.capabilities
    lines.push(
      `| ${adapter.name} | ${asset.protocol} | ${asset.variant} | ${describeDigest(digest)} | ${describeRetry(retry)} | ${retry.idempotency} | ${describeBudget(messageBudget)} |`
    )
  }
  return `${lines.join('\n')}\n`
}
