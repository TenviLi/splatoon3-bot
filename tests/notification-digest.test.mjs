import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { stringify as stringifyYaml } from 'yaml'
import { createNotification } from '../bot/notification/Notification.mjs'
import { createMemoryDeliveryLedgerStore } from '../bot/notification/DeliveryLedger.mjs'
import { deliverNotificationChannel } from '../bot/notification/NotificationDelivery.mjs'
import { getChannelAdapter } from '../bot/notification/channels/index.mjs'
import { deliverDingTalkDigest } from '../bot/notification/channels/DingTalkChannel.mjs'
import { deliverDiscordDigest } from '../bot/notification/channels/DiscordChannel.mjs'
import { deliverLineDigest } from '../bot/notification/channels/LineChannel.mjs'
import { deliverSlackDigest } from '../bot/notification/channels/SlackChannel.mjs'
import { deliverWeComDigest } from '../bot/notification/channels/WeComChannel.mjs'
import { createPublicationManifestFixture } from './support/PublicationManifestFixture.mjs'

function response(value, status = 200) {
  return new Response(typeof value === 'string' ? value : JSON.stringify(value), {
    status,
    headers: { 'content-type': typeof value === 'string' ? 'text/plain' : 'application/json' },
  })
}

function notification(id, index) {
  return createNotification({
    id,
    source: { name: `Mode ${index}`, iconUrl: 'https://example.com/icon.png' },
    title: `Update ${index}`,
    subtitle: `Rotation ${index}`,
    image: {
      url: `https://example.com/${id}.png`,
      width: 1200,
      height: 675,
      aspectRatio: 16 / 9,
      alt: `Screenshot ${index}`,
      variants: {
        line: {
          url: `https://example.com/line-${id}.png`,
          width: 1024,
          height: 576,
          aspectRatio: 16 / 9,
        },
        whatsapp: {
          url: `https://example.com/whatsapp-${id}.png`,
          width: 1024,
          height: 576,
          aspectRatio: 16 / 9,
        },
      },
    },
    sections: [{ title: 'Stages', text: `Stage ${index}`, listItems: [] }],
    facts: [],
    action: { label: 'Open screenshot', url: `https://example.com/${id}.png` },
  })
}

const notifications = [notification('schedules', 1), notification('salmon-run', 2)]

test('native Digest adapters use each platform multi-item presentation', async () => {
  const payloads = {}
  await deliverDiscordDigest(notifications, { name: 'discord', webhookUrl: 'https://discord.example.com/hook' }, {
    fetchImpl: async (_url, options) => {
      payloads.discord = JSON.parse(options.body)
      return response({ id: 'discord-message' })
    },
  })
  await deliverWeComDigest(notifications, { name: 'wecom', webhookUrl: 'https://wecom.example.com/hook' }, {
    fetchImpl: async (_url, options) => {
      payloads.wecom = JSON.parse(options.body)
      return response({ errcode: 0 })
    },
  })
  await deliverDingTalkDigest(notifications, { name: 'dingtalk', webhookUrl: 'https://dingtalk.example.com/hook' }, {
    fetchImpl: async (_url, options) => {
      payloads.dingtalk = JSON.parse(options.body)
      return response({ errcode: 0 })
    },
  })
  await deliverSlackDigest(notifications, { name: 'slack', webhookUrl: 'https://hooks.slack.com/services/T/B/key' }, {
    fetchImpl: async (_url, options) => {
      payloads.slack = JSON.parse(options.body)
      return response('ok')
    },
  })
  await deliverLineDigest(
    notifications,
    {
      name: 'line',
      channelAccessToken: 'token',
      targetType: 'user',
      targetId: 'U0123456789abcdef0123456789abcdef',
    },
    {
      retryKey: '00000000-0000-4000-8000-000000000000',
      inspectImage: async () => ({ format: 'png', width: 1024, height: 576, bytes: 500_000 }),
      fetchImpl: async (_url, options) => {
        payloads.line = JSON.parse(options.body)
        return response({})
      },
    }
  )

  assert.equal(payloads.discord.embeds.length, 2)
  assert.equal(payloads.wecom.msgtype, 'template_card')
  assert.equal(payloads.wecom.template_card.vertical_content_list.length, 2)
  assert.equal(payloads.dingtalk.msgtype, 'feedCard')
  assert.equal(payloads.dingtalk.feedCard.links.length, 2)
  assert.equal(payloads.slack.blocks.filter(({ type }) => type === 'section').length, 2)
  assert.equal(payloads.line.messages[0].contents.type, 'carousel')
  assert.equal(payloads.line.messages[0].contents.contents.length, 2)
})

test('Discord Digest shares the aggregate 6000-character budget across every Embed', async () => {
  let payload
  const dense = Array.from({ length: 10 }, (_, index) => createNotification({
    ...notification(`dense-${index}`, index),
    title: `Title ${index} ${'T'.repeat(500)}`,
    subtitle: `Subtitle ${'S'.repeat(1000)}`,
    sections: [{ title: 'Section', text: 'D'.repeat(2000), listItems: [] }],
  }))
  await getChannelAdapter('discord').deliver(
    { mode: 'digest', notifications: dense },
    { name: 'dense', webhookUrl: 'https://discord.example.com/hook' },
    {
      fetchImpl: async (_url, request) => {
        payload = JSON.parse(request.body)
        return response({ id: 'dense-message' })
      },
    }
  )

  const characterCount = payload.embeds.reduce((total, embed) =>
    total +
      (embed.author?.name.length || 0) +
      (embed.title?.length || 0) +
      (embed.description?.length || 0) +
      (embed.footer?.text.length || 0) +
      embed.fields.reduce((fieldTotal, field) => fieldTotal + field.name.length + field.value.length, 0), 0)
  assert.ok(characterCount <= 6000, `Discord Embed characters: ${characterCount}`)
})

test('Target mode digest becomes one native delivery operation', async () => {
  const requests = []
  const results = await deliverNotificationChannel({
    selection: ['salmon-run', 'gear-regular'],
    channelName: 'wecom',
    rawConfig: stringifyYaml([{
      name: 'daily',
      mode: 'digest',
      webhookUrl: 'https://example.com/daily',
    }]),
    publicationManifest: createPublicationManifestFixture(['salmon-run', 'gear-regular']),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body))
      return response({ errcode: 0 })
    },
  })

  assert.equal(requests.length, 1)
  assert.equal(results.length, 1)
  assert.equal(results[0].mode, 'digest')
  assert.deepEqual(results[0].notifications, ['salmon-run', 'gear-regular'])
})

test('non-native Digest support has an explicit individual fallback policy', () => {
  const telegram = getChannelAdapter('telegram')
  const operations = telegram.createDeliveryOperations(
    { name: 'chat', mode: 'digest' },
    ['schedules', 'salmon-run']
  )

  assert.equal(telegram.capabilities.digest.policy, 'individual-fallback')
  assert.deepEqual(operations.map(({ mode }) => mode), ['individual', 'individual'])
  assert.ok(operations.every(({ fallbackReason }) => fallbackReason === 'adapter uses individual fallback'))
})

test('oversized native Digests preserve successful batches when a later batch is retried', async (context) => {
  const selection = [
    'schedules',
    'schedules-regular',
    'schedules-anarchy',
    'schedules-x',
    'challenges',
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
    'gear-salmon-run',
    'splatfest-na',
    'splatfest-eu',
    'splatfest-jp',
    'splatfest-ap',
  ]
  const ledgerStore = createMemoryDeliveryLedgerStore()
  const snapshotDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-digest-snapshot-'))
  context.after(() => fs.rm(snapshotDirectory, { recursive: true, force: true }))
  await fs.cp(path.join(process.cwd(), 'tests', 'fixtures', 'data'), snapshotDirectory, { recursive: true })
  const festivalsFilename = path.join(snapshotDirectory, 'festivals.json')
  const festivals = JSON.parse(await fs.readFile(festivalsFilename, 'utf8'))
  for (const region of Object.values(festivals)) {
    const festival = region.data.festRecords.nodes[0]
    festival.startTime = '2026-07-27T00:00:00Z'
    festival.endTime = '2026-07-29T18:00:00Z'
  }
  const festivalsBody = `${JSON.stringify(festivals, null, 2)}\n`
  await fs.writeFile(festivalsFilename, festivalsBody)
  const snapshotManifestFilename = path.join(snapshotDirectory, '.snapshot.json')
  const snapshotManifest = JSON.parse(await fs.readFile(snapshotManifestFilename, 'utf8'))
  snapshotManifest.files['festivals.json'] = {
    sha256: crypto.createHash('sha256').update(festivalsBody).digest('hex'),
    bytes: Buffer.byteLength(festivalsBody),
  }
  const snapshotManifestBody = `${JSON.stringify(snapshotManifest, null, 2)}\n`
  await fs.writeFile(snapshotManifestFilename, snapshotManifestBody)
  const publicationManifest = createPublicationManifestFixture(selection)
  publicationManifest.snapshotManifestSha256 = crypto
    .createHash('sha256')
    .update(snapshotManifestBody)
    .digest('hex')
  let failSecondBatch = true
  const batchSizes = []
  const options = {
    selection,
    channelName: 'wecom',
    rawConfig: stringifyYaml([{
      name: 'everything',
      mode: 'digest',
      webhookUrl: 'https://example.com/everything',
    }]),
    publicationManifest,
    snapshotDirectory,
    now: Date.parse('2026-07-29T19:00:00Z'),
    ledgerStore,
    fetchImpl: async (_url, request) => {
      const payload = JSON.parse(request.body)
      const size = payload.template_card.vertical_content_list.length +
        payload.template_card.horizontal_content_list.length
      batchSizes.push(size)
      return response({ errcode: failSecondBatch && batchSizes.length === 2 ? 93000 : 0 })
    },
  }

  await assert.rejects(deliverNotificationChannel(options), /notification deliveries failed/)
  assert.deepEqual(batchSizes, [10, 3])

  failSecondBatch = false
  batchSizes.length = 0
  const results = await deliverNotificationChannel(options)
  assert.deepEqual(batchSizes, [3])
  assert.deepEqual(results.map(({ status }) => status), ['preserved', 'fulfilled'])
  assert.deepEqual(results.map(({ notifications }) => notifications.length), [10, 3])
})
