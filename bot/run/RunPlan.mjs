import { splatfestRegions } from '../../src/common/splatfestRegions.mjs'
import { getScreenshotRouteDefinition } from '../../src/common/screenshotRoutes.mjs'

const screenshotViewport = Object.freeze({ width: 1200, height: 675 })

function screenshotEnvironmentVariable(name) {
  return `RUN_${name.replaceAll('-', '_').toUpperCase()}`
}

function defineScreenshot(name, label, options = {}) {
  const route = getScreenshotRouteDefinition(name)
  return Object.freeze({
    name,
    label,
    environmentVariable: screenshotEnvironmentVariable(name),
    route: route.path.slice(1),
    outputFilename: `${name}.png`,
    viewport: screenshotViewport,
    requiredContentSelector: `[data-screenshot-content="${name}"]`,
    ...options,
  })
}

const splatfestScreenshotDefinitions = Object.fromEntries(
  splatfestRegions.map(({ name: region, slug }) => {
    const name = `splatfest-${slug}`
    return [
      name,
      defineScreenshot(name, `${region} Splatfest`, { region }),
    ]
  })
)

const screenshotDefinitions = Object.freeze({
  schedules: defineScreenshot('schedules', 'Battle Overview'),
  'schedules-regular': defineScreenshot('schedules-regular', 'Regular Battle'),
  'schedules-anarchy': defineScreenshot('schedules-anarchy', 'Anarchy Battle'),
  'schedules-x': defineScreenshot('schedules-x', 'X Battle'),
  challenges: defineScreenshot('challenges', 'Challenges'),
  'salmon-run': defineScreenshot('salmon-run', 'Salmon Run'),
  'gear-dailydrop': defineScreenshot('gear-dailydrop', 'Daily Drop Gear'),
  'gear-regular': defineScreenshot('gear-regular', 'Gear on Sale'),
  'gear-salmon-run': defineScreenshot('gear-salmon-run', 'Monthly Salmon Run Gear'),
  ...splatfestScreenshotDefinitions,
})
const screenshotDefinitionNames = Object.freeze(Object.keys(screenshotDefinitions))

const notificationDefinitions = Object.freeze(
  Object.fromEntries(
    Object.values(screenshotDefinitions).map(({ name, region }) => [
      name,
      Object.freeze({ name, screenshot: name, ...(region ? { region } : {}) }),
    ])
  )
)

function requireEntry(catalog, name, label) {
  const entry = catalog[name]

  if (!entry) {
    throw new Error(`Unknown ${label}: ${name}`)
  }

  return entry
}

function selectionValues(selection) {
  const values = Array.isArray(selection) ? selection : [selection]
  return values.flatMap((value) => (typeof value === 'string' ? value.split(',') : [value]))
}

function normalizeRunSelection(selection) {
  const selectedNames = new Set()
  for (const value of selectionValues(selection)) {
    if (typeof value !== 'string' || value.trim() === '') {
      continue
    }
    const name = value.trim()
    requireEntry(screenshotDefinitions, name, 'Screenshot ID')
    selectedNames.add(name)
  }

  const normalized = screenshotDefinitionNames.filter((name) => selectedNames.has(name))
  if (normalized.length === 0) {
    throw new Error('Select at least one Screenshot ID')
  }
  return normalized
}

export function resolveRunPlan(selection) {
  const selectedNames = normalizeRunSelection(selection)
  const selectedDefinitions = selectedNames.map((name) => screenshotDefinitions[name])
  return Object.freeze({
    selection: Object.freeze(selectedNames),
    label: selectedDefinitions.map(({ label }) => label).join(' + '),
    artifactName: selectedNames.join('_'),
    screenshots: Object.freeze([...selectedNames]),
    notifications: Object.freeze([...selectedNames]),
  })
}

export function resolveRunPlanFromEnvironment(environment = process.env) {
  return resolveRunPlan(
    listScreenshotDefinitions()
      .filter(({ environmentVariable }) => environment[environmentVariable] === 'true')
      .map(({ name }) => name)
  )
}

export function getScreenshotDefinition(name) {
  return requireEntry(screenshotDefinitions, name, 'screenshot definition')
}

export function getNotificationDefinition(name) {
  return requireEntry(notificationDefinitions, name, 'notification')
}

export function listScreenshotDefinitions() {
  return Object.values(screenshotDefinitions)
}

export function listNotificationDefinitions() {
  return Object.values(notificationDefinitions)
}
