import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getRunPlan,
  getScreenshotDefinition,
} from '../bot/run/RunPlan.mjs'

test('run profiles concentrate screenshot and notification selections', () => {
  assert.deepEqual(getRunPlan('gear').screenshots, ['gear-dailydrop', 'gear-regular'])
  assert.deepEqual(getRunPlan('salmon-run-and-gear').notifications, [
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
  ])
  assert.deepEqual(getRunPlan('all').notifications, [
    'schedules',
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
  ])
  assert.equal(getScreenshotDefinition('gear-regular').outputFilename, 'gear-regular.png')
})

test('unknown catalog entries fail before a Bot Run starts', () => {
  assert.throws(() => getRunPlan('unknown'), /Unknown run profile/)
})
