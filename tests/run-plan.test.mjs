import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getScreenshotDefinition,
  listScreenshotDefinitions,
  resolveRunPlan,
  resolveRunPlanFromEnvironment,
} from '../bot/run/RunPlan.mjs'
import { getScreenshotRouteDefinition } from '../src/common/screenshotRoutes.mjs'

test('run selections use Screenshot IDs in canonical order', () => {
  assert.deepEqual(resolveRunPlan('schedules').screenshots, ['schedules'])
  assert.deepEqual(resolveRunPlan('schedules-regular').screenshots, ['schedules-regular'])
  assert.deepEqual(resolveRunPlan('schedules-anarchy').screenshots, ['schedules-anarchy'])
  assert.deepEqual(resolveRunPlan('schedules-x').screenshots, ['schedules-x'])
  assert.deepEqual(resolveRunPlan('gear-dailydrop').screenshots, ['gear-dailydrop'])
  assert.deepEqual(resolveRunPlan('challenges').notifications, ['challenges'])
  assert.deepEqual(resolveRunPlan(['gear-regular', 'salmon-run']).notifications, ['salmon-run', 'gear-regular'])
  const plan = resolveRunPlan(
    'splatfest-ap,gear-salmon-run,splatfest-jp,gear-regular,splatfest-eu,gear-dailydrop,splatfest-na,schedules,salmon-run,challenges,schedules-x,schedules-anarchy,schedules-regular,schedules'
  )
  assert.deepEqual(plan.selection, [
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
    'schedules_schedules-regular_schedules-anarchy_schedules-x_challenges_salmon-run_gear-dailydrop_gear-regular_gear-salmon-run_splatfest-na_splatfest-eu_splatfest-jp_splatfest-ap'
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
    assert.equal(
      definition.environmentVariable,
      `RUN_${definition.name.replaceAll('-', '_').toUpperCase()}`
    )
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
      RUN_GEAR_DAILYDROP: 'true',
      RUN_GEAR_REGULAR: 'false',
      RUN_GEAR_SALMON_RUN: 'true',
      RUN_SPLATFEST_NA: 'false',
      RUN_SPLATFEST_EU: 'true',
      RUN_SPLATFEST_JP: 'false',
      RUN_SPLATFEST_AP: 'true',
    }).selection,
    ['schedules', 'schedules-anarchy', 'gear-dailydrop', 'gear-salmon-run', 'splatfest-eu', 'splatfest-ap']
  )
})

test('invalid or empty selections fail before a Bot Run starts', () => {
  assert.throws(() => resolveRunPlan('unknown'), /Unknown Screenshot ID/)
  assert.throws(() => resolveRunPlan('gear'), /Unknown Screenshot ID/)
  assert.throws(() => resolveRunPlan('splatfest'), /Unknown Screenshot ID/)
  assert.throws(() => resolveRunPlan([]), /Select at least one Screenshot ID/)
  assert.throws(
    () => resolveRunPlanFromEnvironment({ RUN_SCHEDULES: 'false' }),
    /Select at least one Screenshot ID/
  )
})
