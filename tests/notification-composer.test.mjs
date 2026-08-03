import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createBotContext } from '../bot/notification/BotContext.mjs'
import { composeNotification } from '../bot/notification/NotificationComposer.mjs'
import { listNotificationDefinitions } from '../bot/run/RunPlan.mjs'
import { supportedBotLocales } from '../src/common/botLocale.mjs'
import { createPublicationManifestFixture } from './support/PublicationManifestFixture.mjs'

const snapshotDirectory = path.join(process.cwd(), 'tests', 'fixtures', 'data')
const publicationManifest = createPublicationManifestFixture([
  'schedules',
  'schedules-regular',
  'schedules-anarchy',
  'schedules-x',
])
const completePublicationManifest = createPublicationManifestFixture([
  'schedules',
  'challenges',
  'salmon-run',
  'gear',
  'splatfest',
])

test('schedules-regular remains one standalone Regular Battle notification', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-29T19:00:00Z'),
  })
  const notification = composeNotification('schedules-regular', context, { publicationManifest })

  assert.equal(notification.id, 'schedules-regular')
  assert.equal(notification.sections.length, 1)
  assert.match(notification.sections[0].title, /一般比赛/)
  assert.equal(notification.action.label, '查看一般比赛截图')
  assert.doesNotMatch(JSON.stringify(notification), /鲑鱼跑|鱿鱼须商城/)
})

test('focused battle schedule notifications preserve their intended card boundaries', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-29T19:00:00Z'),
  })
  const anarchy = composeNotification('schedules-anarchy', context, { publicationManifest })
  const xBattle = composeNotification('schedules-x', context, { publicationManifest })

  assert.equal(anarchy.sections.length, 2)
  assert.match(anarchy.sections[0].title, /挑战/)
  assert.match(anarchy.sections[1].title, /开放/)
  assert.equal(anarchy.accentColor, 0xf97316)
  assert.equal(anarchy.action.label, '查看蛮颓比赛截图')
  assert.equal(xBattle.sections.length, 1)
  assert.match(xBattle.sections[0].title, /X比赛/)
  assert.equal(xBattle.accentColor, 0x06b6d4)
  assert.equal(xBattle.action.label, '查看X比赛截图')
  assert.doesNotMatch(JSON.stringify([anarchy, xBattle]), /鲑鱼跑|鱿鱼须商城/)
})

test('festival schedules do not depend on an unavailable Regular Battle schedule', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-29T19:00:00Z'),
  })
  const [tricolorStage, secondTricolorStage] = context.schedules.regular.settings.vsStages
  const festivalContext = {
    ...context,
    schedules: {
      ...context.schedules,
      isSplatfestActive: true,
      regular: null,
      anarchySeries: null,
      anarchyOpen: null,
      xMatch: null,
      splatfestOpen: context.schedules.regular,
      splatfestPro: context.schedules.anarchyOpen,
      tricolor: {
        teams: Array.from({ length: 3 }, () => ({ color: { r: 1, g: 1, b: 1, a: 1 } })),
        tricolorStage,
        tricolorStages: [tricolorStage, secondTricolorStage],
      },
    },
  }
  const notification = composeNotification('schedules', festivalContext, { publicationManifest })

  assert.equal(notification.sections.length, 3)
  assert.match(notification.sections[0].title, /开放/)
  assert.match(notification.sections[1].title, /祭典|挑战/)
  assert.match(notification.sections[2].title, /三色/)
  assert.equal(notification.sections[2].text.split(' · ').length, 2)
  assert.equal(notification.accentColor, 0xec4899)
})

test('keeps active Splatfest cards free of premature result data', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-12T12:00:00Z'),
  })
  const notification = composeNotification('splatfest-na', context, {
    publicationManifest: completePublicationManifest,
  })

  assert.equal(notification.sections.length, 0)
  assert.equal(notification.facts.length, 3)
  assert.doesNotMatch(JSON.stringify(notification), /🏆|🗳️|🏁/u)
})

test('presents completed Splatfest winners and results after the festival ends', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-14T12:00:00Z'),
  })
  const notification = composeNotification('splatfest-na', context, {
    publicationManifest: completePublicationManifest,
  })

  assert.equal(notification.sections.length, 1)
  assert.match(notification.sections[0].title, /🏆/u)
  assert.equal(notification.facts.length, 3)
  assert.match(JSON.stringify(notification.facts), /🗳️/u)
})

test('gives monthly Salmon Run gear a useful native-card detail', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-29T19:00:00Z'),
  })
  const notification = composeNotification('gear-salmon-run', context, {
    publicationManifest: completePublicationManifest,
  })

  assert.equal(notification.title, '消防盔')
  assert.equal(notification.facts.length, 1)
  assert.equal(notification.facts[0].label, '🧢')
  assert.match(notification.facts[0].value, /鲑鱼跑/u)
})

test('composes every Notification ID through every supported Bot locale', async (context) => {
  const notificationIds = listNotificationDefinitions().map(({ name }) => name)

  for (const locale of supportedBotLocales) {
    await context.test(locale, async () => {
      const regularContext = await createBotContext({
        snapshotDirectory,
        now: Date.parse('2026-07-29T19:00:00Z'),
        locale,
      })
      const splatfestContext = await createBotContext({
        snapshotDirectory,
        now: Date.parse('2026-07-12T12:00:00Z'),
        locale,
      })
      const localeManifest = createPublicationManifestFixture(
        ['schedules', 'schedules-regular', 'schedules-anarchy', 'schedules-x', 'challenges', 'salmon-run', 'gear', 'splatfest'],
        { locale }
      )

      for (const notificationId of notificationIds) {
        const notification = composeNotification(
          notificationId,
          notificationId.startsWith('splatfest-') ? splatfestContext : regularContext,
          { publicationManifest: localeManifest }
        )
        assert.equal(notification.id, notificationId)
        assert.ok(notification.title.trim(), `${locale}/${notificationId} title`)
        assert.ok(notification.source.name.trim(), `${locale}/${notificationId} source`)
        assert.ok(notification.action.label.trim(), `${locale}/${notificationId} action`)
        assert.doesNotMatch(
          JSON.stringify(notification),
          /(?:notification|screenshot)\.[a-z][A-Za-z.]+/u,
          `${locale}/${notificationId} contains an unresolved Bot message key`
        )
      }
    })
  }
})
