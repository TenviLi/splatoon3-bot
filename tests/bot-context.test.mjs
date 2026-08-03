import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createBotContext } from '../bot/notification/BotContext.mjs'
import { selectRelevantSplatfest } from '../src/common/splatfestSelection.mjs'

const snapshotDirectory = path.join(process.cwd(), 'tests', 'fixtures', 'data')

test('projects every notification data type from the archived Data Snapshot', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-29T19:00:00Z'),
  })

  assert.equal(context.schedules.anarchySeries.settings.bankaraMode, 'CHALLENGE')
  assert.equal(context.schedules.isSplatfestActive, false)
  assert.equal(context.schedules.anarchyOpen.settings.bankaraMode, 'OPEN')
  assert.ok(context.schedules.xMatch.settings)
  assert.equal(context.challenge.settings.leagueMatchEvent.name, "Sheldon's Dress-Up Showdown")
  assert.equal(context.schedules.salmonRun.settings.boss.name, 'Cohozuna')
  assert.equal(context.gear.salmonRun.name, 'Five-Alarm Helmet')
  assert.deepEqual(
    Object.fromEntries(Object.entries(context.splatfests).map(([region, festival]) => [region, festival])),
    { NA: null, EU: null, JP: null, AP: null },
    'stale Splatfests must not be presented as current content'
  )
})

test('projects active regional Splatfests without coupling them to battle schedules', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-12T12:00:00Z'),
  })

  assert.deepEqual(Object.keys(context.splatfests), ['NA', 'EU', 'JP', 'AP'])
  assert.equal(context.schedules.isSplatfestActive, true)
  for (const festival of Object.values(context.splatfests)) {
    assert.equal(festival.status, 'active')
    assert.equal(festival.hasResults, false)
    assert.equal(festival.teams.length, 3)
    assert.equal(festival.teams.some((team) => 'result' in team), false)
  }
})

test('reveals complete Splatfest results only after the festival ends', async () => {
  const context = await createBotContext({
    snapshotDirectory,
    now: Date.parse('2026-07-14T12:00:00Z'),
  })

  for (const festival of Object.values(context.splatfests)) {
    assert.equal(festival.status, 'past')
    assert.equal(festival.hasResults, true)
    assert.equal(festival.teams.filter((team) => team.result?.isWinner).length, 1)
  }
})

test('selects the nearest relevant Splatfest independently of API ordering', () => {
  const now = Date.parse('2026-07-29T19:45:00Z')
  const festival = (id, startTime, endTime) => ({
    __splatoon3ink_id: id,
    startTime,
    endTime,
    teams: [],
  })
  const selected = selectRelevantSplatfest([
    festival('later', '2026-08-08T00:00:00Z', '2026-08-10T00:00:00Z'),
    festival('stale', '2026-07-20T00:00:00Z', '2026-07-22T00:00:00Z'),
    festival('next', '2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z'),
  ], now)

  assert.equal(selected.__splatoon3ink_id, 'next')
  assert.equal(selected.status, 'upcoming')
  assert.equal(selectRelevantSplatfest([
    festival('stale', '2026-07-20T00:00:00Z', '2026-07-22T00:00:00Z'),
  ], now), null)
})
