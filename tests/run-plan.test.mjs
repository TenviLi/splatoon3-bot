import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getScreenshotDefinition,
  resolveRunPlan,
  resolveRunPlanFromEnvironment,
} from '../bot/run/RunPlan.mjs'

test('run selections compose Content Groups in canonical order', () => {
  assert.deepEqual(resolveRunPlan('gear').screenshots, ['gear-dailydrop', 'gear-regular'])
  assert.deepEqual(resolveRunPlan(['gear', 'salmon-run']).notifications, [
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
  ])
  const plan = resolveRunPlan('gear,schedules,salmon-run,schedules')
  assert.deepEqual(plan.selection, ['schedules', 'salmon-run', 'gear'])
  assert.deepEqual(plan.notifications, [
    'schedules',
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
  ])
  assert.equal(plan.artifactName, 'schedules_salmon-run_gear')
  assert.equal(getScreenshotDefinition('gear-regular').outputFilename, 'gear-regular.png')
  assert.deepEqual(getScreenshotDefinition('gear-regular').viewport, { width: 1200, height: 675 })
})

test('environment checkboxes resolve through the same Run Plan interface', () => {
  assert.deepEqual(
    resolveRunPlanFromEnvironment({
      RUN_SCHEDULES: 'true',
      RUN_SALMON_RUN: 'false',
      RUN_GEAR: 'true',
    }).selection,
    ['schedules', 'gear']
  )
})

test('invalid or empty selections fail before a Bot Run starts', () => {
  assert.throws(() => resolveRunPlan('unknown'), /Unknown run content group/)
  assert.throws(() => resolveRunPlan([]), /Select at least one Run Content Group/)
  assert.throws(
    () => resolveRunPlanFromEnvironment({ RUN_SCHEDULES: 'false' }),
    /Select at least one Run Content Group/
  )
})
