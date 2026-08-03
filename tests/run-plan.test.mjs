import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getScreenshotDefinition,
  listScreenshotDefinitions,
  resolveRunPlan,
  resolveRunPlanFromEnvironment,
} from '../bot/run/RunPlan.mjs'
import { getScreenshotRouteDefinition } from '../src/common/screenshotRoutes.mjs'

test('run selections compose Content Groups in canonical order', () => {
  assert.deepEqual(resolveRunPlan('schedules').screenshots, ['schedules'])
  assert.deepEqual(resolveRunPlan('schedules-regular').screenshots, ['schedules-regular'])
  assert.deepEqual(resolveRunPlan('schedules-anarchy').screenshots, ['schedules-anarchy'])
  assert.deepEqual(resolveRunPlan('schedules-x').screenshots, ['schedules-x'])
  assert.deepEqual(resolveRunPlan('gear').screenshots, ['gear-dailydrop', 'gear-regular', 'gear-salmon-run'])
  assert.deepEqual(resolveRunPlan('challenges').notifications, ['challenges'])
  assert.deepEqual(resolveRunPlan('splatfest').screenshots, [
    'splatfest-na',
    'splatfest-eu',
    'splatfest-jp',
    'splatfest-ap',
  ])
  assert.deepEqual(resolveRunPlan(['gear', 'salmon-run']).notifications, [
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
    'gear-salmon-run',
  ])
  const plan = resolveRunPlan(
    'gear,splatfest,schedules,salmon-run,challenges,schedules-x,schedules-anarchy,schedules-regular,schedules'
  )
  assert.deepEqual(plan.selection, [
    'schedules',
    'schedules-regular',
    'schedules-anarchy',
    'schedules-x',
    'challenges',
    'salmon-run',
    'gear',
    'splatfest',
  ])
  assert.deepEqual(plan.notifications, [
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
  ])
  assert.equal(
    plan.artifactName,
    'schedules_schedules-regular_schedules-anarchy_schedules-x_challenges_salmon-run_gear_splatfest'
  )
  assert.equal(getScreenshotDefinition('gear-regular').outputFilename, 'gear-regular.png')
  assert.deepEqual(getScreenshotDefinition('gear-regular').viewport, { width: 1200, height: 675 })
  assert.equal(
    getScreenshotDefinition('challenges').requiredContentSelector,
    '[data-screenshot-content="challenges"]'
  )
  assert.equal(
    getScreenshotDefinition('schedules-regular').requiredContentSelector,
    '[data-screenshot-content="schedules-regular"]'
  )
  assert.equal(
    getScreenshotDefinition('schedules-anarchy').requiredContentSelector,
    '[data-screenshot-content="schedules-anarchy"]'
  )
  assert.equal(
    getScreenshotDefinition('schedules-x').requiredContentSelector,
    '[data-screenshot-content="schedules-x"]'
  )
  assert.equal(
    getScreenshotDefinition('splatfest-jp').requiredContentSelector,
    '[data-screenshot-content="splatfest-jp"]'
  )
  for (const definition of listScreenshotDefinitions()) {
    assert.equal(
      definition.requiredContentSelector,
      `[data-screenshot-content="${definition.name}"]`,
      `${definition.name} must fail before publication when its domain content is unavailable`
    )
    assert.equal(`/${definition.route}`, getScreenshotRouteDefinition(definition.name).path)
  }
})

test('environment checkboxes resolve through the same Run Plan interface', () => {
  assert.deepEqual(
    resolveRunPlanFromEnvironment({
      RUN_SCHEDULES: 'true',
      RUN_SCHEDULES_REGULAR: 'false',
      RUN_SCHEDULES_ANARCHY: 'true',
      RUN_SCHEDULES_X: 'false',
      RUN_CHALLENGES: 'false',
      RUN_SALMON_RUN: 'false',
      RUN_GEAR: 'true',
      RUN_SPLATFEST: 'true',
    }).selection,
    ['schedules', 'schedules-anarchy', 'gear', 'splatfest']
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
