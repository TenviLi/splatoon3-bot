import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatContentSkip,
  resolveRunContentAvailability,
  RunContentPreflightError,
} from '../bot/run/RunContentPreflight.mjs'

function createCompletedSplatfest() {
  return {
    __splatoon3ink_id: 'JUEA-00201',
    title: '最強なのは？',
    startTime: '2026-07-11T00:00:00Z',
    endTime: '2026-07-13T00:00:00Z',
    image: { url: 'https://example.com/festival.png' },
    teams: ['速さ', '力', '技'].map((teamName, index) => ({
      id: `team-${index + 1}`,
      teamName,
      color: { r: 0.2 + index * 0.1, g: 0.4, b: 0.6, a: 1 },
      image: { url: `https://example.com/team-${index + 1}.png` },
      result: { isWinner: index === 0 },
    })),
  }
}

function createDataSnapshot(festivals = [createCompletedSplatfest()], dataKey = 'JP') {
  return {
    manifest: {
      createdAt: '2026-08-03T13:26:36.633Z',
      source: 'https://splatoon3.ink/data',
    },
    values: {
      festivals: {
        [dataKey]: { data: { festRecords: { nodes: festivals } } },
      },
    },
  }
}

const context = Object.freeze({
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
})

test('keeps a completed regional Splatfest inside the recent-results window', () => {
  const result = resolveRunContentAvailability(['splatfest-jp'], createDataSnapshot(), {
    ...context,
    renderTime: Date.parse('2026-07-14T00:00:00Z'),
  })

  assert.deepEqual(result.availableSelection, ['splatfest-jp'])
  assert.deepEqual(result.skipped, [])
})

test('skips stale regional Splatfests without dropping other selected content', () => {
  const result = resolveRunContentAvailability(
    ['schedules', 'splatfest-jp'],
    createDataSnapshot(),
    {
      ...context,
      renderTime: Date.parse('2026-08-03T13:26:36.633Z'),
    }
  )

  assert.deepEqual(result.availableSelection, ['schedules'])
  assert.equal(result.skipped.length, 1)
  const diagnostic = formatContentSkip(result.skipped[0])
  assert.match(diagnostic, /Skipped splatfest-jp/)
  assert.match(diagnostic, /Screenshot ID: splatfest-jp/)
  assert.match(diagnostic, /Region: JP \(Japan; independent of BOT_LOCALE\)/)
  assert.match(diagnostic, /BOT_LOCALE: zh-CN \(changes screenshot text only\)/)
  assert.match(diagnostic, /Render time: 2026-08-03T13:26:36\.633Z/)
  assert.match(diagnostic, /Time zone: Asia\/Shanghai/)
  assert.match(diagnostic, /Data Snapshot: 2026-08-03T13:26:36\.633Z from https:\/\/splatoon3\.ink\/data/)
  assert.match(diagnostic, /Region records: 1/)
  assert.match(diagnostic, /active, upcoming, or completed less than 72 hours ago/)
  assert.match(diagnostic, /latest JP Splatfest ended 21 days 13 hours ago/)
  assert.match(diagnostic, /Latest record: "最強なのは？" \(JUEA-00201\)/)
  assert.match(diagnostic, /2026-07-11T00:00:00\.000Z to 2026-07-13T00:00:00\.000Z/)
  assert.match(diagnostic, /no action is required/)
  assert.match(diagnostic, /Changing BOT_LOCALE will not affect availability/)
  assert.doesNotMatch(diagnostic, /data-screenshot-content|selector/i)
})

for (const { screenshotId, dataKey, region } of [
  { screenshotId: 'splatfest-na', dataKey: 'US', region: 'NA' },
  { screenshotId: 'splatfest-eu', dataKey: 'EU', region: 'EU' },
  { screenshotId: 'splatfest-jp', dataKey: 'JP', region: 'JP' },
  { screenshotId: 'splatfest-ap', dataKey: 'AP', region: 'AP' },
]) {
  test(`skips stale ${region} Splatfest content through the shared regional policy`, () => {
    const result = resolveRunContentAvailability(
      [screenshotId],
      createDataSnapshot([createCompletedSplatfest()], dataKey),
      {
        ...context,
        renderTime: Date.parse('2026-08-03T13:26:36.633Z'),
      }
    )

    assert.deepEqual(result.availableSelection, [])
    assert.equal(result.skipped.length, 1)
    assert.equal(result.skipped[0].screenshotId, screenshotId)
    assert.equal(result.skipped[0].region, region)
    assert.equal(result.skipped[0].outcome, 'skipped')
  })
}

test('still fails when a selected current Splatfest has incomplete source data', () => {
  const incomplete = { ...createCompletedSplatfest(), teams: [] }

  assert.throws(
    () =>
      resolveRunContentAvailability(['splatfest-jp'], createDataSnapshot([incomplete]), {
        ...context,
        renderTime: Date.parse('2026-07-12T00:00:00Z'),
      }),
    (error) => {
      assert.ok(error instanceof RunContentPreflightError)
      assert.equal(error.issues.length, 1)
      assert.equal(Object.keys(error).includes('issues'), false)
      assert.match(error.message, /invalid source data/)
      assert.match(error.message, /does not contain all fields required by the screenshot/)
      return true
    }
  )
})

test('turns malformed regional records into domain diagnostics', () => {
  const malformed = { ...createCompletedSplatfest() }
  delete malformed.teams

  assert.throws(
    () =>
      resolveRunContentAvailability(['splatfest-jp'], createDataSnapshot([malformed]), {
        ...context,
        renderTime: Date.parse('2026-07-12T00:00:00Z'),
      }),
    (error) => {
      assert.ok(error instanceof RunContentPreflightError)
      assert.match(error.message, /JP Splatfest records could not be evaluated/)
      assert.match(error.message, /Region: JP \(Japan; independent of BOT_LOCALE\)/)
      assert.doesNotMatch(error.message, /data-screenshot-content|selector/i)
      return true
    }
  )
})
