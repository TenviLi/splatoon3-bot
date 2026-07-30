import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  deliverConfiguredNotificationChannels,
  deliverNotificationChannel,
} from '../bot/notification/NotificationDelivery.mjs'

function response(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

test('fans out Targets in parallel and preserves partial delivery results', async () => {
  const startedTargets = []
  let releaseRequests
  const allRequestsStarted = new Promise((resolve) => {
    releaseRequests = resolve
  })
  const targets = ['alpha', 'beta', 'gamma']
  const delivery = deliverNotificationChannel({
    profileName: 'schedules',
    channelName: 'wecom',
    rawConfig: JSON.stringify(
      targets.map((name) => ({ name, webhookUrl: `https://example.com/${name}` }))
    ),
    assetBaseUrl: 'https://cdn.example.com',
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async (url) => {
      const target = new URL(url).pathname.slice(1)
      startedTargets.push(target)
      if (startedTargets.length === targets.length) {
        releaseRequests()
      }
      await allRequestsStarted
      return response(target === 'beta' ? { errcode: 93000, errmsg: 'rejected' } : { errcode: 0 })
    },
  })

  await assert.rejects(delivery, (error) => {
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(startedTargets.sort(), targets)
    assert.equal(error.results.length, 3)
    assert.equal(error.results.filter((result) => result.status === 'fulfilled').length, 2)
    assert.equal(error.results.filter((result) => result.status === 'rejected').length, 1)
    return true
  })
})

test('discovers configured Channel Secrets and preserves cross-channel partial results', async () => {
  const startedChannels = []
  let releaseRequests
  const allRequestsStarted = new Promise((resolve) => {
    releaseRequests = resolve
  })
  const delivery = deliverConfiguredNotificationChannels({
    profileName: 'schedules',
    environment: {
      BOT_WECOM_CONFIG: JSON.stringify([
        { name: 'wecom', webhookUrl: 'https://wecom.example.com/webhook' },
      ]),
      BOT_DISCORD_CONFIG: JSON.stringify([
        { name: 'discord', webhookUrl: 'https://discord.example.com/webhook' },
      ]),
      UPYUN_DOMAIN: 'https://cdn.example.com',
    },
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async (url) => {
      const channel = new URL(url).hostname.split('.')[0]
      startedChannels.push(channel)
      if (startedChannels.length === 2) {
        releaseRequests()
      }
      await allRequestsStarted
      return response(channel === 'wecom' ? { errcode: 93000, errmsg: 'rejected' } : { id: 'message' })
    },
  })

  await assert.rejects(delivery, (error) => {
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(startedChannels.sort(), ['discord', 'wecom'])
    assert.deepEqual(
      error.report.channelResults.map(({ channelName, status }) => ({ channelName, status })),
      [
        { channelName: 'wecom', status: 'rejected' },
        { channelName: 'discord', status: 'fulfilled' },
      ]
    )
    assert.equal(error.report.deliveryResults.filter(({ status }) => status === 'fulfilled').length, 1)
    assert.equal(error.report.deliveryResults.filter(({ status }) => status === 'rejected').length, 1)
    return true
  })
})

test('prepares shared Notification data once before delivering configured Channels', async () => {
  await assert.rejects(
    deliverConfiguredNotificationChannels({
      profileName: 'schedules',
      environment: {
        BOT_WECOM_CONFIG: JSON.stringify([
          { name: 'wecom', webhookUrl: 'https://wecom.example.com/webhook' },
        ]),
        BOT_DISCORD_CONFIG: JSON.stringify([
          { name: 'discord', webhookUrl: 'https://discord.example.com/webhook' },
        ]),
      },
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, false)
      assert.match(error.message, /UPYUN_DOMAIN is required/)
      assert.equal(error.report, undefined)
      return true
    }
  )
})

test('skips delivery without configured Secrets and requires an explicitly selected Channel', async () => {
  const report = await deliverConfiguredNotificationChannels({
    profileName: 'schedules',
    environment: {},
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'missing'),
  })

  assert.deepEqual(report.channelResults, [])
  assert.deepEqual(report.deliveryResults, [])

  await assert.rejects(
    deliverConfiguredNotificationChannels({
      profileName: 'schedules',
      channelName: 'telegram',
      environment: {},
    }),
    /BOT_TELEGRAM_CONFIG is required for telegram/
  )
})

test('routes only selected Notifications to each Target', async () => {
  const results = await deliverNotificationChannel({
    profileName: 'salmon-run-and-gear',
    channelName: 'wecom',
    rawConfig: JSON.stringify([
      {
        name: 'schedules',
        notifications: ['schedules'],
        webhookUrl: 'https://example.com/schedules',
      },
      {
        name: 'salmon-run',
        notifications: ['salmon-run'],
        webhookUrl: 'https://example.com/salmon-run',
      },
      {
        name: 'gear',
        notifications: ['gear-dailydrop', 'gear-regular'],
        webhookUrl: 'https://example.com/gear',
      },
    ]),
    assetBaseUrl: 'https://cdn.example.com',
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async () => response({ errcode: 0 }),
  })

  assert.deepEqual(
    results.map(({ target, notification }) => ({ target, notification })),
    [
      { target: 'salmon-run', notification: 'salmon-run' },
      { target: 'gear', notification: 'gear-dailydrop' },
      { target: 'gear', notification: 'gear-regular' },
    ]
  )
})

test('rejects invalid direct Target arrays before delivery', async () => {
  await assert.rejects(
    deliverNotificationChannel({
      profileName: 'schedules',
      channelName: 'wecom',
      rawConfig: JSON.stringify([
        {
          name: 'unknown-notification',
          notifications: ['unknown'],
          webhookUrl: 'https://example.com/unknown',
        },
      ]),
      assetBaseUrl: 'https://cdn.example.com',
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    /Unknown Notification: unknown/
  )

  await assert.rejects(
    deliverNotificationChannel({
      profileName: 'schedules',
      channelName: 'wecom',
      rawConfig: JSON.stringify([
        {
          name: 'salmon-run-only',
          notifications: ['salmon-run'],
          webhookUrl: 'https://example.com/salmon-run',
        },
      ]),
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'missing'),
    }),
    /No wecom Notification Targets select schedules Notifications/
  )

  await assert.rejects(
    deliverNotificationChannel({
      profileName: 'schedules',
      channelName: 'wecom',
      rawConfig: JSON.stringify({ name: 'not-an-array' }),
      assetBaseUrl: 'https://cdn.example.com',
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    /expected array/
  )

  await assert.rejects(
    deliverNotificationChannel({
      profileName: 'schedules',
      channelName: 'wecom',
      rawConfig: JSON.stringify([
        { name: 'duplicate', webhookUrl: 'https://example.com/one' },
        { name: 'duplicate', webhookUrl: 'https://example.com/two' },
      ]),
      assetBaseUrl: 'https://cdn.example.com',
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    /Duplicate Notification Target name/
  )
})
