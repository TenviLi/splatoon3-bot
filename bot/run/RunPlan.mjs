import { splatfestRegions } from '../../src/common/splatfestRegions.mjs'
import { getScreenshotRouteDefinition } from '../../src/common/screenshotRoutes.mjs'

const screenshotViewport = Object.freeze({ width: 1200, height: 675 })

function defineScreenshot(name, options = {}) {
  const route = getScreenshotRouteDefinition(name)
  return Object.freeze({
    name,
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
      defineScreenshot(name, { region }),
    ]
  })
)

const screenshotDefinitions = Object.freeze({
  schedules: defineScreenshot('schedules'),
  'schedules-regular': defineScreenshot('schedules-regular'),
  'schedules-anarchy': defineScreenshot('schedules-anarchy'),
  'schedules-x': defineScreenshot('schedules-x'),
  challenges: defineScreenshot('challenges'),
  'salmon-run': defineScreenshot('salmon-run'),
  'gear-dailydrop': defineScreenshot('gear-dailydrop'),
  'gear-regular': defineScreenshot('gear-regular'),
  'gear-salmon-run': defineScreenshot('gear-salmon-run'),
  ...splatfestScreenshotDefinitions,
})

const notificationDefinitions = Object.freeze(
  Object.fromEntries(
    Object.values(screenshotDefinitions).map(({ name, region }) => [
      name,
      Object.freeze({ name, screenshot: name, ...(region ? { region } : {}) }),
    ])
  )
)

function defineContentGroup({ screenshots, ...definition }) {
  const contentNames = Object.freeze(screenshots)
  return Object.freeze({
    ...definition,
    screenshots: contentNames,
    notifications: contentNames,
  })
}

const runContentGroups = Object.freeze({
  schedules: defineContentGroup({
    name: 'schedules',
    label: 'Battle Schedules',
    environmentVariable: 'RUN_SCHEDULES',
    screenshots: ['schedules'],
  }),
  'schedules-regular': defineContentGroup({
    name: 'schedules-regular',
    label: 'Regular Battle Schedule',
    environmentVariable: 'RUN_SCHEDULES_REGULAR',
    screenshots: ['schedules-regular'],
  }),
  'schedules-anarchy': defineContentGroup({
    name: 'schedules-anarchy',
    label: 'Anarchy Battle Schedules',
    environmentVariable: 'RUN_SCHEDULES_ANARCHY',
    screenshots: ['schedules-anarchy'],
  }),
  'schedules-x': defineContentGroup({
    name: 'schedules-x',
    label: 'X Battle Schedule',
    environmentVariable: 'RUN_SCHEDULES_X',
    screenshots: ['schedules-x'],
  }),
  challenges: defineContentGroup({
    name: 'challenges',
    label: 'Challenges',
    environmentVariable: 'RUN_CHALLENGES',
    screenshots: ['challenges'],
  }),
  'salmon-run': defineContentGroup({
    name: 'salmon-run',
    label: 'Salmon Run',
    environmentVariable: 'RUN_SALMON_RUN',
    screenshots: ['salmon-run'],
  }),
  gear: defineContentGroup({
    name: 'gear',
    label: 'Gear',
    environmentVariable: 'RUN_GEAR',
    screenshots: ['gear-dailydrop', 'gear-regular', 'gear-salmon-run'],
  }),
  splatfest: defineContentGroup({
    name: 'splatfest',
    label: 'Splatfest (all regions)',
    environmentVariable: 'RUN_SPLATFEST',
    screenshots: splatfestRegions.map(({ slug }) => `splatfest-${slug}`),
  }),
})

const runContentGroupNames = Object.freeze(Object.keys(runContentGroups))

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
    requireEntry(runContentGroups, name, 'run content group')
    selectedNames.add(name)
  }

  const normalized = runContentGroupNames.filter((name) => selectedNames.has(name))
  if (normalized.length === 0) {
    throw new Error('Select at least one Run Content Group')
  }
  return normalized
}

export function resolveRunPlan(selection) {
  const selectedNames = normalizeRunSelection(selection)
  const selectedGroups = selectedNames.map((name) => runContentGroups[name])
  return Object.freeze({
    selection: Object.freeze(selectedNames),
    label: selectedGroups.map(({ label }) => label).join(' + '),
    artifactName: selectedNames.join('_'),
    screenshots: Object.freeze(selectedGroups.flatMap(({ screenshots }) => screenshots)),
    notifications: Object.freeze(selectedGroups.flatMap(({ notifications }) => notifications)),
  })
}

export function resolveRunPlanFromEnvironment(environment = process.env) {
  return resolveRunPlan(
    listRunContentGroups()
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

export function listRunContentGroups() {
  return Object.values(runContentGroups)
}

export function listScreenshotDefinitions() {
  return Object.values(screenshotDefinitions)
}

export function listNotificationDefinitions() {
  return Object.values(notificationDefinitions)
}
