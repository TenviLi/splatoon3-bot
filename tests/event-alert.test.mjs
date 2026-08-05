import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { stringify as stringifyYaml } from 'yaml'
import { createStableDeliveryId } from '../bot/notification/DeliveryLedger.mjs'
import { composeEventAlerts, eventAlertConfigurationSchema } from '../bot/notification/EventAlert.mjs'
import { createNotification } from '../bot/notification/Notification.mjs'
import { deliverNotificationChannel } from '../bot/notification/NotificationDelivery.mjs'
import { getChannelAdapter } from '../bot/notification/channels/index.mjs'
import { createPublicationManifestFixture } from './support/PublicationManifestFixture.mjs'

function notification(id) {
  return createNotification({
    id,
    source: { name: id, iconUrl: 'https://example.com/icon.png' },
    title: `${id} title`,
    subtitle: `${id} subtitle`,
    image: {
      url: `https://example.com/${id}.png`,
      width: 1200,
      height: 675,
      aspectRatio: 16 / 9,
      alt: id,
      variants: {
        line: { url: `https://example.com/line-${id}.png`, width: 1024, height: 576, aspectRatio: 16 / 9 },
        whatsapp: { url: `https://example.com/wa-${id}.png`, width: 1024, height: 576, aspectRatio: 16 / 9 },
      },
    },
    sections: [{ title: `${id} details`, text: 'details', listItems: [] }],
    facts: [],
    action: { label: 'Open', url: `https://example.com/${id}.png` },
  })
}

const notificationIds = [
  'challenges',
  'salmon-run',
  'splatfest-na',
  'gear-regular',
]
const notifications = new Map(notificationIds.map((id) => [id, notification(id)]))

test('composes state-change alerts for every supported event family', () => {
  const now = Date.parse('2026-08-05T00:00:00Z')
  const context = {
    now,
    locale: 'en-US',
    challenge: {
      __splatoon3ink_id: 'challenge-1',
      settings: { leagueMatchEvent: { id: 'event-1' } },
      timePeriods: [{
        startTime: '2026-08-05T00:30:00Z',
        endTime: '2026-08-05T02:30:00Z',
      }],
    },
    schedules: {
      salmonRun: {
        startTime: '2026-08-05T00:00:00Z',
        endTime: '2026-08-06T16:00:00Z',
        isBigRun: true,
        settings: { weapons: [{ name: 'Random' }] },
      },
    },
    splatfests: {
      NA: {
        __splatoon3ink_id: 'fest-1',
        status: 'active',
        startTime: '2026-08-04T00:00:00Z',
        endTime: '2026-08-06T00:00:00Z',
        teams: [],
      },
    },
    gear: {
      dailyDropGear: [],
      regularGear: [{
        saleEndTime: '2026-08-05T10:00:00Z',
        gear: {
          __splatoon3ink_id: 'gear-1',
          name: 'Cool Hat',
          primaryGearPower: { __splatoon3ink_id: 'power-1' },
        },
      }],
      salmonRun: null,
    },
  }
  const target = {
    alerts: eventAlertConfigurationSchema.parse({
      challengeReminderMinutes: [60, 15],
      bigRun: true,
      randomWeapons: true,
      splatfest: true,
      gearWatchlist: { primaryPowerIds: ['power-1'] },
    }),
  }
  const alerts = composeEventAlerts({ context, notifications, target, notificationIds })

  assert.deepEqual(
    alerts.map(({ eventKey }) => eventKey.split(':')[0]),
    ['challenge-reminder', 'big-run', 'random-weapons', 'splatfest', 'gear-watchlist']
  )
  assert.match(alerts[0].eventKey, /:60$/)
  assert.match(alerts[0].notification.subtitle, /in 30 minutes/)
  assert.match(alerts[1].notification.title, /🚨/)
  assert.match(alerts[2].notification.title, /🎲/)
  assert.match(alerts[3].eventKey, /:start:/)
  assert.match(alerts[4].notification.sections[0].text, /Cool Hat/)
})

test('Event Alert state keys keep Delivery IDs stable across presentation-only changes', () => {
  const channel = getChannelAdapter('wecom')
  const target = { name: 'main', webhookUrl: 'https://example.com/hook' }
  const eventKey = 'big-run:2026-08-05T00:00:00Z:2026-08-06T16:00:00Z'
  const first = notification('salmon-run')
  const second = createNotification({
    ...first,
    subtitle: 'updated presentation copy',
    image: { ...first.image, url: 'https://example.com/new-render.png' },
  })

  assert.equal(
    createStableDeliveryId({ channel, target, mode: 'individual', notifications: [first], stateKey: eventKey }),
    createStableDeliveryId({ channel, target, mode: 'individual', notifications: [second], stateKey: eventKey })
  )
})

test('localizes the generic gear fallback when upstream identity has no display name', () => {
  const context = {
    now: Date.parse('2026-08-05T00:00:00Z'),
    locale: 'zh-CN',
    gear: {
      dailyDropGear: [],
      regularGear: [{
        saleEndTime: '2026-08-05T10:00:00Z',
        gear: { primaryGearPower: { __splatoon3ink_id: 'power-1' } },
      }],
      salmonRun: null,
    },
  }
  const alerts = composeEventAlerts({
    context,
    notifications: new Map([['gear-regular', notification('gear-regular')]]),
    target: {
      alerts: eventAlertConfigurationSchema.parse({
        gearWatchlist: { primaryPowerIds: ['power-1'] },
      }),
    },
    notificationIds: ['gear-regular'],
  })

  assert.equal(alerts[0].notification.sections[0].text, '装备')
})

test('completed Splatfests emit independent end and results state changes', () => {
  const screenshotId = 'splatfest-na'
  const completed = {
    now: Date.parse('2026-08-07T00:00:00Z'),
    locale: 'ja-JP',
    splatfests: {
      NA: {
        __splatoon3ink_id: 'fest-complete',
        status: 'past',
        hasResults: true,
        startTime: '2026-08-04T00:00:00Z',
        endTime: '2026-08-06T00:00:00Z',
        teams: [{ result: { isWinner: true } }, { result: { isWinner: false } }],
      },
    },
  }
  const alerts = composeEventAlerts({
    context: completed,
    notifications: new Map([[screenshotId, notification(screenshotId)]]),
    target: { alerts: eventAlertConfigurationSchema.parse({ splatfest: true }) },
    notificationIds: [screenshotId],
  })

  assert.deepEqual(
    alerts.map(({ eventKey }) => eventKey.split(':').at(-2)),
    ['end', 'results']
  )
  assert.deepEqual(
    alerts.map(({ notification: alert }) => alert.sections[0].title),
    ['NA · フェス終了', 'NA · フェス結果']
  )
})

test('rejects empty or ambiguous Event Alert configuration', () => {
  assert.equal(eventAlertConfigurationSchema.safeParse({}).success, false)
  assert.equal(eventAlertConfigurationSchema.safeParse({ gearWatchlist: {} }).success, false)
  assert.equal(
    eventAlertConfigurationSchema.safeParse({ challengeReminderMinutes: [60, 60] }).success,
    false
  )
})

test('includePeriodic false creates an alerts-only Target without sending an unmatched periodic message', async () => {
  let requests = 0
  const results = await deliverNotificationChannel({
    selection: 'gear-regular',
    channelName: 'wecom',
    rawConfig: stringifyYaml([{
      name: 'watchlist-only',
      webhookUrl: 'https://example.com/hook',
      alerts: {
        includePeriodic: false,
        gearWatchlist: { gearIds: ['not-present-in-the-current-snapshot'] },
      },
    }]),
    publicationManifest: createPublicationManifestFixture('gear-regular'),
    snapshotDirectory: path.join(process.cwd(), 'tests', 'fixtures', 'data'),
    now: Date.parse('2026-07-29T19:00:00Z'),
    fetchImpl: async () => {
      requests += 1
      return new Response(JSON.stringify({ errcode: 0 }), { status: 200 })
    },
  })

  assert.deepEqual(results, [])
  assert.equal(requests, 0)
})
