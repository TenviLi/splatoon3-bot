const screenshotDefinitions = Object.freeze({
  schedules: Object.freeze({
    name: 'schedules',
    route: 'schedules',
    outputFilename: 'schedules.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
  }),
  'salmon-run': Object.freeze({
    name: 'salmon-run',
    route: 'salmon-run',
    outputFilename: 'salmon-run.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
  }),
  'gear-dailydrop': Object.freeze({
    name: 'gear-dailydrop',
    route: 'gear-dailydrop',
    outputFilename: 'gear-dailydrop.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
  }),
  'gear-regular': Object.freeze({
    name: 'gear-regular',
    route: 'gear-regular',
    outputFilename: 'gear-regular.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
  }),
})

const notificationDefinitions = Object.freeze({
  schedules: Object.freeze({ name: 'schedules', screenshot: 'schedules' }),
  'salmon-run': Object.freeze({ name: 'salmon-run', screenshot: 'salmon-run' }),
  'gear-dailydrop': Object.freeze({ name: 'gear-dailydrop', screenshot: 'gear-dailydrop' }),
  'gear-regular': Object.freeze({ name: 'gear-regular', screenshot: 'gear-regular' }),
})

const runContentGroups = Object.freeze({
  schedules: Object.freeze({
    name: 'schedules',
    label: 'Schedules',
    environmentVariable: 'RUN_SCHEDULES',
    screenshots: Object.freeze(['schedules']),
    notifications: Object.freeze(['schedules']),
  }),
  'salmon-run': Object.freeze({
    name: 'salmon-run',
    label: 'Salmon Run',
    environmentVariable: 'RUN_SALMON_RUN',
    screenshots: Object.freeze(['salmon-run']),
    notifications: Object.freeze(['salmon-run']),
  }),
  gear: Object.freeze({
    name: 'gear',
    label: 'Gear',
    environmentVariable: 'RUN_GEAR',
    screenshots: Object.freeze(['gear-dailydrop', 'gear-regular']),
    notifications: Object.freeze(['gear-dailydrop', 'gear-regular']),
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
