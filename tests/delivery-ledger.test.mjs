import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { stringify as stringifyYaml } from 'yaml'
import {
  createDeliveryLedgerRecord,
  createMemoryDeliveryLedgerStore,
  createFileDeliveryLedgerStore,
  createStableDeliveryId,
} from '../bot/notification/DeliveryLedger.mjs'
import { deliverNotificationChannel } from '../bot/notification/NotificationDelivery.mjs'
import { getChannelAdapter } from '../bot/notification/channels/index.mjs'
import { createPublicationManifestFixture } from './support/PublicationManifestFixture.mjs'

function response(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('Periodic Delivery IDs are stable within one Bot Run and change across scheduled runs', () => {
  const channel = getChannelAdapter('wecom')
  const notification = {
    id: 'schedules',
    title: 'Schedules updated',
    image: { url: 'https://cdn.example.com/schedules.png' },
  }
  const first = createStableDeliveryId({
    channel,
    target: { name: 'main', webhookUrl: 'https://example.com/webhook?key=secret-one' },
    mode: 'individual',
    notifications: [notification],
    runKey: { renderTime: 1, snapshotManifestSha256: 'a'.repeat(64) },
  })
  const repeated = createStableDeliveryId({
    channel,
    target: { name: 'main', webhookUrl: 'https://example.com/webhook?key=secret-one' },
    mode: 'individual',
    notifications: [notification],
    runKey: { renderTime: 1, snapshotManifestSha256: 'a'.repeat(64) },
  })
  const changed = createStableDeliveryId({
    channel,
    target: { name: 'main', webhookUrl: 'https://example.com/webhook?key=secret-two' },
    mode: 'individual',
    notifications: [notification],
    runKey: { renderTime: 1, snapshotManifestSha256: 'a'.repeat(64) },
  })
  const renamed = createStableDeliveryId({
    channel,
    target: { name: 'renamed', webhookUrl: 'https://example.com/webhook?key=secret-one' },
    mode: 'individual',
    notifications: [notification],
    runKey: { renderTime: 1, snapshotManifestSha256: 'a'.repeat(64) },
  })
  const nextRun = createStableDeliveryId({
    channel,
    target: { name: 'main', webhookUrl: 'https://example.com/webhook?key=secret-one' },
    mode: 'individual',
    notifications: [notification],
    runKey: { renderTime: 2, snapshotManifestSha256: 'a'.repeat(64) },
  })

  assert.equal(first, repeated)
  assert.notEqual(first, changed)
  assert.notEqual(first, renamed)
  assert.notEqual(first, nextRun)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(first, /secret/)
  assert.throws(
    () => createStableDeliveryId({ channel, target: { name: 'main' }, mode: 'individual', notifications: [notification] }),
    /require a Bot Run identity/
  )
})

test('separate scheduled Bot Runs send unchanged periodic Notifications again', async () => {
  const ledgerStore = createMemoryDeliveryLedgerStore()
  let requests = 0
  const base = {
    selection: 'schedules',
    channelName: 'wecom',
    rawConfig: stringifyYaml([{ name: 'main', webhookUrl: 'https://example.com/main' }]),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    ledgerStore,
    fetchImpl: async () => {
      requests += 1
      return response({ errcode: 0 })
    },
  }
  const firstManifest = createPublicationManifestFixture('schedules')
  const secondManifest = structuredClone(firstManifest)
  secondManifest.renderTime += 1

  await deliverNotificationChannel({ ...base, publicationManifest: firstManifest })
  await deliverNotificationChannel({ ...base, publicationManifest: secondManifest })

  assert.equal(requests, 2)
  assert.equal(ledgerStore.list().filter(({ status }) => status === 'fulfilled').length, 2)
})

test('Delivery Ledger preserves successes and retries only failed Targets', async () => {
  const ledgerStore = createMemoryDeliveryLedgerStore()
  const requests = []
  let betaFails = true
  const options = {
    selection: 'schedules',
    channelName: 'wecom',
    rawConfig: stringifyYaml([
      { name: 'alpha', webhookUrl: 'https://example.com/alpha' },
      { name: 'beta', webhookUrl: 'https://example.com/beta' },
    ]),
    publicationManifest: createPublicationManifestFixture('schedules'),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    ledgerStore,
    fetchImpl: async (url) => {
      const target = new URL(url).pathname.slice(1)
      requests.push(target)
      return response(target === 'beta' && betaFails ? { errcode: 93000 } : { errcode: 0 })
    },
  }

  await assert.rejects(deliverNotificationChannel(options), /notification deliveries failed/)
  assert.deepEqual(requests.sort(), ['alpha', 'beta'])
  betaFails = false
  requests.length = 0

  const results = await deliverNotificationChannel(options)
  assert.deepEqual(requests, ['beta'])
  assert.deepEqual(
    results.map(({ target, status, attempts }) => ({ target, status, attempts })),
    [
      { target: 'alpha', status: 'preserved', attempts: 1 },
      { target: 'beta', status: 'fulfilled', attempts: 2 },
    ]
  )
  assert.equal(ledgerStore.list().filter(({ status }) => status === 'fulfilled').length, 2)
})

test('Delivery Ledger counts transport retries as delivery attempts', async () => {
  const ledgerStore = createMemoryDeliveryLedgerStore()
  let requests = 0
  const results = await deliverNotificationChannel({
    selection: 'schedules',
    channelName: 'slack',
    rawConfig: stringifyYaml([
      { name: 'team', webhookUrl: 'https://hooks.slack.com/services/T/B/key' },
    ]),
    publicationManifest: createPublicationManifestFixture('schedules'),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    ledgerStore,
    fetchImpl: async () => {
      requests += 1
      return new Response(requests === 1 ? 'rate_limited' : 'ok', {
        status: requests === 1 ? 429 : 200,
        headers: requests === 1 ? { 'retry-after': '0' } : {},
      })
    },
  })

  assert.equal(requests, 2)
  assert.equal(results[0].attempts, 2)
  assert.equal(ledgerStore.list()[0].attempts, 2)
})

test('file Delivery Ledger writes private cache records atomically', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-delivery-ledger-'))
  context.after(() => fs.rm(directory, { recursive: true, force: true }))
  const store = createFileDeliveryLedgerStore(directory)
  const id = 'a'.repeat(64)
  assert.equal(await store.read(id), null)
  const record = { version: 1, id, status: 'fulfilled' }
  await store.write(record)

  assert.deepEqual(await store.read(id), record)
  assert.deepEqual(await fs.readdir(directory), [`${id}.json`])
  await assert.rejects(store.read('../outside'), /Invalid Stable Delivery ID/)
})

test('LINE derives the same valid retry UUID from one Stable Delivery ID', () => {
  const adapter = getChannelAdapter('line')
  const first = adapter.createDeliveryOptions('delivery-id').retryKey
  const second = adapter.createDeliveryOptions('delivery-id').retryKey
  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
})

test('Delivery Ledger error records redact credentials before private cache persistence', () => {
  const targetUrl = 'https://example.com/hooks/target-private-value'
  const record = createDeliveryLedgerRecord({
    deliveryId: 'b'.repeat(64),
    channel: getChannelAdapter('wecom'),
    target: { name: 'main', webhookUrl: targetUrl },
    operation: {
      mode: 'individual',
      requestedMode: 'individual',
      notifications: [{ id: 'schedules' }],
    },
    status: 'rejected',
    error: new Error(`request failed for ${targetUrl}; response={"client_secret":"private-value"}`),
  })

  assert.match(record.error.message, /\[redacted credential\]/)
  assert.doesNotMatch(JSON.stringify(record), /target-private-value|private-value/)
})

test('Delivery Results redact destination credentials before logs and reports can observe them', async () => {
  const targetUrl = 'https://example.com/hooks/target-private-value'
  let deliveryError

  try {
    await deliverNotificationChannel({
      selection: 'schedules',
      channelName: 'wecom',
      rawConfig: stringifyYaml([{ name: 'main', webhookUrl: targetUrl }]),
      publicationManifest: createPublicationManifestFixture('schedules'),
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
      now: Date.parse('2026-07-29T19:00:00Z'),
      fetchImpl: async (url) => {
        throw new Error(`network failure for ${url}`)
      },
    })
  } catch (error) {
    deliveryError = error
  }

  assert.ok(deliveryError)
  assert.doesNotMatch(deliveryError.results[0].error.message, /target-private-value/)
})

test('credential redaction covers numeric recipient IDs and temporary or signing secrets', () => {
  const record = createDeliveryLedgerRecord({
    deliveryId: 'c'.repeat(64),
    channel: getChannelAdapter('telegram'),
    target: {
      name: 'main',
      botToken: 'example-bot-token',
      chatId: -1001234567890,
    },
    operation: {
      mode: 'individual',
      requestedMode: 'individual',
      notifications: [{ id: 'schedules' }],
    },
    status: 'rejected',
    error: new Error('chat=-1001234567890 sessionToken=temporary-value secret=signing-value'),
  })

  const serialized = JSON.stringify(record)
  assert.doesNotMatch(serialized, /1001234567890|temporary-value|signing-value/)
  assert.match(record.error.message, /\[redacted target\]|\[redacted credential\]/)
})

test('credential redaction covers short numeric recipient IDs without corrupting status codes', () => {
  const record = createDeliveryLedgerRecord({
    deliveryId: 'd'.repeat(64),
    channel: getChannelAdapter('telegram'),
    target: {
      name: 'main',
      botToken: 'example-bot-token',
      chatId: 42,
      messageThreadId: 7,
    },
    operation: {
      mode: 'individual',
      requestedMode: 'individual',
      notifications: [{ id: 'schedules' }],
    },
    status: 'rejected',
    error: new Error('chat=42 thread=7 failed with HTTP 503'),
  })

  assert.doesNotMatch(record.error.message, /chat=42|thread=7/)
  assert.match(record.error.message, /HTTP 503/)
})

test('credential redaction keeps complete placeholders after exact-value redaction', () => {
  const record = createDeliveryLedgerRecord({
    deliveryId: 'e'.repeat(64),
    channel: getChannelAdapter('telegram'),
    target: { name: 'main', botToken: 'secret-token', chatId: 42 },
    operation: {
      mode: 'individual',
      requestedMode: 'individual',
      notifications: [{ id: 'schedules' }],
    },
    status: 'rejected',
    error: new Error('botToken=secret-token chat=42'),
  })

  assert.equal(record.error.message, '[redacted credential] chat=[redacted target]')
})

test('non-idempotent network uncertainty fails closed without a blind retry', async () => {
  const ledgerStore = createMemoryDeliveryLedgerStore()
  let requests = 0
  const options = {
    selection: 'schedules',
    channelName: 'wecom',
    rawConfig: stringifyYaml([{ name: 'main', webhookUrl: 'https://example.com/hooks/main' }]),
    publicationManifest: createPublicationManifestFixture('schedules'),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    ledgerStore,
    fetchImpl: async () => {
      requests += 1
      throw new Error('connection closed after request transmission')
    },
  }

  await assert.rejects(deliverNotificationChannel(options), (error) => {
    assert.match(error.results[0].error.action, /destination message history/)
    return true
  })
  assert.equal(requests, 1)
  assert.equal(ledgerStore.list()[0].status, 'uncertain')

  await assert.rejects(deliverNotificationChannel(options), (error) => {
    assert.match(error.results[0].error.message, /unresolved previous attempt/)
    return true
  })
  assert.equal(requests, 1)
})

test('QQ token acquisition failures remain safely retryable in the Delivery Ledger', async () => {
  const ledgerStore = createMemoryDeliveryLedgerStore()
  let tokenAvailable = false
  let tokenRequests = 0
  let messageRequests = 0
  const options = {
    selection: 'schedules',
    channelName: 'qq',
    rawConfig: stringifyYaml([{
      name: 'main',
      appId: 'ledger-token-retry-app',
      clientSecret: 'client-secret',
      targetType: 'group',
      targetId: 'group-openid',
    }]),
    publicationManifest: createPublicationManifestFixture('schedules'),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    ledgerStore,
    fetchImpl: async (url) => {
      if (String(url).includes('getAppAccessToken')) {
        tokenRequests += 1
        if (!tokenAvailable) {
          throw new Error('token endpoint connection failed')
        }
        return response({ access_token: 'access-token', expires_in: '7200' })
      }
      messageRequests += 1
      return response({ id: 'message' })
    },
  }

  await assert.rejects(deliverNotificationChannel(options), (error) => {
    assert.equal(error.results[0].error.deliveryOutcome, 'rejected')
    assert.doesNotMatch(error.results[0].error.action || '', /destination message history/)
    return true
  })
  assert.equal(tokenRequests, 2)
  assert.equal(messageRequests, 0)
  assert.equal(ledgerStore.list()[0].status, 'rejected')

  tokenAvailable = true
  const results = await deliverNotificationChannel(options)
  assert.equal(tokenRequests, 3)
  assert.equal(messageRequests, 1)
  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[0].attempts, 2)
})
