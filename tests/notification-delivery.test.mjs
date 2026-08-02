import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { PNG } from 'pngjs'
import { stringify as stringifyYaml } from 'yaml'
import {
  deliverConfiguredNotificationChannels,
  deliverNotificationChannel,
} from '../bot/notification/NotificationDelivery.mjs'
import { createPublicationManifestFixture } from './support/PublicationManifestFixture.mjs'

function response(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function pngResponse(width, height) {
  const buffer = PNG.sync.write(new PNG({ width, height }))
  return new Response(buffer, { status: 200, headers: { 'content-type': 'image/png' } })
}

test('fans out Targets in parallel and preserves partial delivery results', async () => {
  const startedTargets = []
  let releaseRequests
  const allRequestsStarted = new Promise((resolve) => {
    releaseRequests = resolve
  })
  const targets = ['alpha', 'beta', 'gamma']
  const delivery = deliverNotificationChannel({
    selection: 'schedules',
    channelName: 'wecom',
    rawConfig: stringifyYaml(
      targets.map((name) => ({ name, webhookUrl: `https://example.com/${name}` }))
    ),
    publicationManifest: createPublicationManifestFixture('schedules'),
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

test('composes notifications from exact Publication Manifest URLs', async () => {
  const publicationManifest = createPublicationManifestFixture('schedules')
  const expectedImageUrl = publicationManifest.artifacts[0].notificationImage.url
  const expectedIconUrl = publicationManifest.branding.icons.schedules.url
  let payload

  await deliverNotificationChannel({
    selection: 'schedules',
    channelName: 'wecom',
    rawConfig: stringifyYaml([{ name: 'wecom', webhookUrl: 'https://wecom.example.com/webhook' }]),
    publicationManifest,
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body)
      return response({ errcode: 0 })
    },
  })

  assert.equal(payload.template_card.card_image.url, expectedImageUrl)
  assert.equal(payload.template_card.card_action.url, expectedImageUrl)
  assert.equal(payload.template_card.source.icon_url, expectedIconUrl)
})

test('uses the Publication Manifest locale for notification copy', async () => {
  for (const [locale, expectedSource, expectedTitle] of [
    ['en-US', 'Ready for another match?', 'Schedules updated'],
    ['ja-JP', '今日もナワバリ！', 'スケジュールが更新されました'],
  ]) {
    let payload
    await deliverNotificationChannel({
      selection: 'schedules',
      channelName: 'wecom',
      rawConfig: stringifyYaml([{ name: locale, webhookUrl: 'https://wecom.example.com/webhook' }]),
      publicationManifest: createPublicationManifestFixture('schedules', { locale }),
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
      now: Date.parse('2026-07-29T19:00:00Z'),
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body)
        return response({ errcode: 0 })
      },
    })

    assert.equal(payload.template_card.source.desc, expectedSource)
    assert.equal(payload.template_card.main_title.title, expectedTitle)
  }
})

test('rejects a valid archived Data Snapshot from another Bot Run', async () => {
  const publicationManifest = createPublicationManifestFixture('schedules')
  publicationManifest.snapshotManifestSha256 = 'c'.repeat(64)
  let requested = false

  await assert.rejects(
    deliverNotificationChannel({
      selection: 'schedules',
      channelName: 'wecom',
      rawConfig: stringifyYaml([{ name: 'wecom', webhookUrl: 'https://wecom.example.com/webhook' }]),
      publicationManifest,
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
      now: Date.parse('2026-07-29T19:00:00Z'),
      fetchImpl: async () => {
        requested = true
        return response({ errcode: 0 })
      },
    }),
    /Archived Data Snapshot Manifest does not match Publication Manifest/
  )
  assert.equal(requested, false)
})

test('discovers configured Channel Secrets and preserves cross-channel partial results', async () => {
  const startedChannels = []
  let releaseRequests
  const allRequestsStarted = new Promise((resolve) => {
    releaseRequests = resolve
  })
  const delivery = deliverConfiguredNotificationChannels({
    selection: 'schedules',
    environment: {
      BOT_WECOM_CONFIG: stringifyYaml([
        { name: 'wecom', webhookUrl: 'https://wecom.example.com/webhook' },
      ]),
      BOT_DISCORD_CONFIG: stringifyYaml([
        { name: 'discord', webhookUrl: 'https://discord.example.com/webhook' },
      ]),
    },
    publicationManifest: createPublicationManifestFixture('schedules'),
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
      selection: 'schedules',
      environment: {
        BOT_WECOM_CONFIG: stringifyYaml([
          { name: 'wecom', webhookUrl: 'https://wecom.example.com/webhook' },
        ]),
        BOT_DISCORD_CONFIG: stringifyYaml([
          { name: 'discord', webhookUrl: 'https://discord.example.com/webhook' },
        ]),
      },
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, false)
      assert.match(error.message, /expected object/)
      assert.equal(error.report.sharedError, error)
      assert.deepEqual(
        error.report.channelResults.map(({ channelName, status }) => ({ channelName, status })),
        [
          { channelName: 'wecom', status: 'blocked' },
          { channelName: 'discord', status: 'blocked' },
        ]
      )
      return true
    }
  )
})

test('delivers valid Channels after another configured Channel fails validation', async () => {
  const requestedUrls = []
  const delivery = deliverConfiguredNotificationChannels({
    selection: 'schedules',
    environment: {
      BOT_WECOM_CONFIG: 'targets: [',
      BOT_DISCORD_CONFIG: stringifyYaml([
        { name: 'discord', webhookUrl: 'https://discord.example.com/webhook' },
      ]),
    },
    publicationManifest: createPublicationManifestFixture('schedules'),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async (url) => {
      requestedUrls.push(String(url))
      return response({ id: 'message' })
    },
  })

  await assert.rejects(delivery, (error) => {
    assert.deepEqual(
      error.report.channelResults.map(({ channelName, status }) => ({ channelName, status })),
      [
        { channelName: 'wecom', status: 'rejected' },
        { channelName: 'discord', status: 'fulfilled' },
      ]
    )
    assert.equal(requestedUrls.length, 1)
    assert.match(requestedUrls[0], /discord\.example\.com/)
    return true
  })
})

test('rejects invalid notification asset origins before delivery', async () => {
  const invalidOrigins = [
    ['cdn.example.com', /assetBaseUrl must be an absolute HTTPS URL/],
    ['https://user:password@cdn.example.com', /must not include credentials/],
    ['https://cdn.example.com?token=secret', /must not include credentials/],
    ['https://cdn.example.com#private', /must not include credentials/],
  ]

  for (const [assetBaseUrl, expectedError] of invalidOrigins) {
    await assert.rejects(
      deliverConfiguredNotificationChannels({
        selection: 'schedules',
        environment: {
          BOT_DISCORD_CONFIG: 'targets: [',
          BOT_WECOM_CONFIG: stringifyYaml([
            { name: 'wecom', webhookUrl: 'https://wecom.example.com/webhook' },
          ]),
        },
        publicationManifest: createPublicationManifestFixture('schedules', { assetBaseUrl }),
        snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'missing'),
      }),
      (error) => {
        assert.match(error.message, expectedError)
        assert.deepEqual(
          error.report.channelResults.map(({ channelName, status }) => ({ channelName, status })),
          [
            { channelName: 'wecom', status: 'blocked' },
            { channelName: 'discord', status: 'rejected' },
          ]
        )
        return true
      }
    )
  }
})

test('skips delivery without configured Secrets and requires an explicitly selected Channel', async () => {
  const report = await deliverConfiguredNotificationChannels({
    selection: 'schedules',
    environment: {},
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'missing'),
  })

  assert.deepEqual(report.channelResults, [])
  assert.deepEqual(report.deliveryResults, [])

  await assert.rejects(
    deliverConfiguredNotificationChannels({
      selection: 'schedules',
      channelName: 'telegram',
      environment: {},
    }),
    /BOT_TELEGRAM_CONFIG is required/
  )
})

test('skips configured Channels whose Targets do not select the active Run Selection', async () => {
  const report = await deliverConfiguredNotificationChannels({
    selection: 'schedules',
    environment: {
      BOT_WECOM_CONFIG: stringifyYaml([
        {
          name: 'gear-only',
          notifications: ['gear-dailydrop', 'gear-regular'],
          webhookUrl: 'https://example.com/gear',
        },
      ]),
    },
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'missing'),
  })

  assert.deepEqual(
    report.channelResults.map(({ channelName, status }) => ({ channelName, status })),
    [{ channelName: 'wecom', status: 'skipped' }]
  )
  assert.deepEqual(report.deliveryResults, [])
})

test('routes only selected Notifications to each Target', async () => {
  const results = await deliverNotificationChannel({
    selection: ['salmon-run', 'gear'],
    channelName: 'wecom',
    rawConfig: stringifyYaml([
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
    publicationManifest: createPublicationManifestFixture(['salmon-run', 'gear']),
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
      selection: 'schedules',
      channelName: 'wecom',
      rawConfig: stringifyYaml([
        {
          name: 'unknown-notification',
          notifications: ['unknown'],
          webhookUrl: 'https://example.com/unknown',
        },
      ]),
      publicationManifest: createPublicationManifestFixture('schedules'),
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    /Unknown Notification: unknown/
  )

  await assert.rejects(
    deliverNotificationChannel({
      selection: 'schedules',
      channelName: 'wecom',
      rawConfig: stringifyYaml([
        {
          name: 'salmon-run-only',
          notifications: ['salmon-run'],
          webhookUrl: 'https://example.com/salmon-run',
        },
      ]),
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'missing'),
    }),
    /No wecom Notification Targets select Schedules Notifications/
  )

  await assert.rejects(
    deliverNotificationChannel({
      selection: 'schedules',
      channelName: 'wecom',
      rawConfig: stringifyYaml({ name: 'not-an-array' }),
      publicationManifest: createPublicationManifestFixture('schedules'),
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    /expected array/
  )

  await assert.rejects(
    deliverNotificationChannel({
      selection: 'schedules',
      channelName: 'wecom',
      rawConfig: stringifyYaml([
        { name: 'duplicate', webhookUrl: 'https://example.com/one' },
        { name: 'duplicate', webhookUrl: 'https://example.com/two' },
      ]),
      publicationManifest: createPublicationManifestFixture('schedules'),
      snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    }),
    /Duplicate Notification Target name/
  )
})

test('passes the normalized asset origin into WhatsApp template validation', async () => {
  let payload
  const publicationManifest = createPublicationManifestFixture('schedules', {
    assetBaseUrl: 'https://cdn.example.com/',
  })
  const results = await deliverNotificationChannel({
    selection: 'schedules',
    channelName: 'whatsapp',
    rawConfig: stringifyYaml([
      {
        name: 'personal',
        accessToken: 'token',
        phoneNumberId: '123456789012345',
        recipientPhoneNumber: '8613800000000',
        templateName: 'splatoon_notification',
        languageCode: 'zh_CN',
      },
    ]),
    publicationManifest,
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async (url, options) => {
      if (String(url).startsWith('https://cdn.example.com/')) {
        return pngResponse(1024, 576)
      }
      payload = JSON.parse(options.body)
      return response({ messages: [{ id: 'wamid.1' }] })
    },
  })

  assert.equal(results[0].status, 'fulfilled')
  assert.equal(
    payload.template.components[0].parameters[0].image.link,
    publicationManifest.artifacts[0].platformImages.whatsapp.url
  )
  assert.equal(
    payload.template.components[2].parameters[0].text,
    `notification-images/${'a'.repeat(64)}/schedules.png`
  )
})
