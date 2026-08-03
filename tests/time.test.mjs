import assert from 'node:assert/strict'
import test from 'node:test'
import { getDurationParts } from '../src/common/time.js'

test('duration parts preserve the latest splatoon3.ink day and hour breakdown', async (context) => {
  const cases = [
    [0, { negative: '', days: 0, hours: 0, minutes: 0, seconds: 0 }],
    [59, { negative: '', days: 0, hours: 0, minutes: 0, seconds: 59 }],
    [3_661, { negative: '', days: 0, hours: 1, minutes: 1, seconds: 1 }],
    [86_400, { negative: '', days: 1, hours: 0, minutes: 0, seconds: 0 }],
    [90_061, { negative: '', days: 1, hours: 1, minutes: 1, seconds: 1 }],
    [-90_061, { negative: '-', days: 1, hours: 1, minutes: 1, seconds: 1 }],
  ]

  for (const [value, expected] of cases) {
    await context.test(String(value), () => {
      assert.deepEqual(getDurationParts(value), expected)
    })
  }
})
