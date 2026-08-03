import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'
import { br2nl } from '../src/common/util.mjs'

let server
let stores

before(async () => {
  server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@': path.join(process.cwd(), 'src'),
        '@data': path.join(process.cwd(), 'tests', 'fixtures', 'data'),
      },
    },
    server: { middlewareMode: true },
  })
  stores = {
    ...await server.ssrLoadModule('/src/stores/data.mjs'),
    ...await server.ssrLoadModule('/src/stores/gear.mjs'),
    ...await server.ssrLoadModule('/src/stores/schedules.mjs'),
    ...await server.ssrLoadModule('/src/stores/time.mjs'),
  }
})

after(async () => {
  await server?.close()
})

function activateStoreTest() {
  setActivePinia(createPinia())
  const time = stores.useTimeStore()
  time.setNow(Date.parse('2026-08-03T12:00:00Z'))
  return time
}

function emptyScheduleData(overrides = {}) {
  return {
    regularSchedules: { nodes: [] },
    bankaraSchedules: { nodes: [] },
    xSchedules: { nodes: [] },
    festSchedules: { nodes: [] },
    eventSchedules: { nodes: [] },
    coopGroupingSchedule: {
      regularSchedules: { nodes: [] },
      bigRunSchedules: { nodes: [] },
      teamContestSchedules: { nodes: [] },
    },
    vsStages: { nodes: [] },
    ...overrides,
  }
}

function salmonRunNode(startTime, { weaponId = 'ordinary', isRandom = false } = {}) {
  return {
    startTime,
    endTime: '2026-08-04T00:00:00Z',
    setting: {
      weapons: [{
        name: isRandom ? 'Random' : 'Splattershot',
        __splatoon3ink_id: weaponId,
      }],
    },
  }
}

test('preserves upstream time guards and HTML line-break normalization', () => {
  const time = activateStoreTest()

  assert.equal(time.isActive('2026-08-03T10:00:00Z', '2026-08-03T14:00:00Z'), true)
  assert.equal(time.isActive(null, '2026-08-03T14:00:00Z'), false)
  assert.equal(time.isActive('2026-08-03T10:00:00Z', null), false)
  assert.equal(time.isCurrent(null), false)
  assert.equal(time.isUpcoming(null), false)
  assert.equal(br2nl('one<BR>two<br />three'), 'one\ntwo\nthree')
})

test('preserves upstream schedule filtering, ordering, and mystery-weapon detection', () => {
  activateStoreTest()
  const schedulesData = stores.useSchedulesDataStore()
  schedulesData.setData({ data: emptyScheduleData({
    regularSchedules: {
      nodes: [
        {
          startTime: '2026-08-03T10:00:00Z',
          endTime: '2026-08-03T14:00:00Z',
          regularMatchSetting: null,
        },
      ],
    },
    coopGroupingSchedule: {
      regularSchedules: {
        nodes: [salmonRunNode('2026-08-03T14:00:00Z')],
      },
      bigRunSchedules: {
        nodes: [salmonRunNode('2026-08-03T13:00:00Z', {
          weaponId: '747937841598fff7',
          isRandom: true,
        })],
      },
      teamContestSchedules: { nodes: [] },
    },
  }) })

  const regular = stores.useRegularSchedulesStore()
  const salmonRun = stores.useSalmonRunSchedulesStore()

  assert.deepEqual(regular.schedules, [])
  assert.deepEqual(salmonRun.schedules.map(({ startTime }) => startTime), [
    '2026-08-03T13:00:00Z',
    '2026-08-03T14:00:00Z',
  ])
  assert.equal(salmonRun.schedules[0].isBigRun, true)
  assert.equal(salmonRun.schedules[0].isMystery, true)
  assert.equal(salmonRun.schedules[0].isGrizzcoMystery, true)
  assert.equal(salmonRun.schedules[1].isBigRun, false)
})

test('preserves upstream current-gear filtering and empty pickup-brand safety', () => {
  activateStoreTest()
  const gearData = stores.useGearDataStore()
  gearData.setData({ data: {
    gesotown: {
      pickupBrand: null,
      limitedGears: [
        { id: 'expired', saleEndTime: '2026-08-03T11:00:00Z' },
        { id: 'current', saleEndTime: '2026-08-03T13:00:00Z' },
      ],
    },
  } })

  const gear = stores.useGearStore()
  assert.equal(gear.dailyDropBrand, null)
  assert.deepEqual(gear.dailyDropGear, [])
  assert.deepEqual(gear.regularGear.map(({ id }) => id), ['current'])
})
