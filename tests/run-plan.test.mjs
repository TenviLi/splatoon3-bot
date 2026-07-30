import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getRunPlan,
  getScreenshotDefinition,
  selectNotificationChannels,
} from '../bot/run/RunPlan.mjs'

test('run profiles concentrate screenshot and notification selections', () => {
  assert.deepEqual(getRunPlan('gear').screenshots, ['gear-dailydrop', 'gear-regular'])
  assert.deepEqual(getRunPlan('salmon-run-and-gear').notifications, [
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
  ])
  assert.equal(getScreenshotDefinition('gear-regular').outputFilename, 'gear-regular.png')
})

test('notification channel selection is normalized and deduplicated', () => {
  assert.deepEqual(
    selectNotificationChannels(' WeCom,discord,wecom ').map((channel) => channel.name),
    ['wecom', 'discord']
  )
})

test('unknown catalog entries fail before a Bot Run starts', () => {
  assert.throws(() => getRunPlan('unknown'), /Unknown run profile/)
  assert.throws(() => selectNotificationChannels('unknown'), /Unknown notification channel/)
})
