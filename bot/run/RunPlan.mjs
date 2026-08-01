const notificationImage = Object.freeze({ width: 1024, height: 576 })

const screenshotDefinitions = Object.freeze({
  schedules: Object.freeze({
    name: 'schedules',
    route: 'schedules',
    outputFilename: 'schedules.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
    notificationImage,
  }),
  'salmon-run': Object.freeze({
    name: 'salmon-run',
    route: 'salmon-run',
    outputFilename: 'salmon-run.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
    notificationImage,
  }),
  'gear-dailydrop': Object.freeze({
    name: 'gear-dailydrop',
    route: 'gear-dailydrop',
    outputFilename: 'gear-dailydrop.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
    notificationImage,
  }),
  'gear-regular': Object.freeze({
    name: 'gear-regular',
    route: 'gear-regular',
    outputFilename: 'gear-regular.png',
    viewport: Object.freeze({ width: 1200, height: 675 }),
    notificationImage,
  }),
})

const notificationDefinitions = Object.freeze({
  schedules: Object.freeze({ name: 'schedules', screenshot: 'schedules' }),
  'salmon-run': Object.freeze({ name: 'salmon-run', screenshot: 'salmon-run' }),
  'gear-dailydrop': Object.freeze({ name: 'gear-dailydrop', screenshot: 'gear-dailydrop' }),
  'gear-regular': Object.freeze({ name: 'gear-regular', screenshot: 'gear-regular' }),
})

const runProfiles = Object.freeze({
  schedules: Object.freeze({
    name: 'schedules',
    artifactName: 'schedules',
    screenshots: Object.freeze(['schedules']),
    notifications: Object.freeze(['schedules']),
  }),
  'salmon-run': Object.freeze({
    name: 'salmon-run',
    artifactName: 'salmon-run',
    screenshots: Object.freeze(['salmon-run']),
    notifications: Object.freeze(['salmon-run']),
  }),
  gear: Object.freeze({
    name: 'gear',
    artifactName: 'gear',
    screenshots: Object.freeze(['gear-dailydrop', 'gear-regular']),
    notifications: Object.freeze(['gear-dailydrop', 'gear-regular']),
  }),
  'salmon-run-and-gear': Object.freeze({
    name: 'salmon-run-and-gear',
    artifactName: 'salmon-run-and-gear',
    screenshots: Object.freeze(['salmon-run', 'gear-dailydrop', 'gear-regular']),
    notifications: Object.freeze(['salmon-run', 'gear-dailydrop', 'gear-regular']),
  }),
  all: Object.freeze({
    name: 'all',
    artifactName: 'all',
    screenshots: Object.freeze(['schedules', 'salmon-run', 'gear-dailydrop', 'gear-regular']),
    notifications: Object.freeze(['schedules', 'salmon-run', 'gear-dailydrop', 'gear-regular']),
  }),
})

function requireEntry(catalog, name, label) {
  const entry = catalog[name]

  if (!entry) {
    throw new Error(`Unknown ${label}: ${name}`)
  }

  return entry
}

export function getRunPlan(name) {
  return requireEntry(runProfiles, name, 'run profile')
}

export function getScreenshotDefinition(name) {
  return requireEntry(screenshotDefinitions, name, 'screenshot definition')
}

export function getNotificationDefinition(name) {
  return requireEntry(notificationDefinitions, name, 'notification')
}

export function listRunProfiles() {
  return Object.values(runProfiles)
}

export function listScreenshotDefinitions() {
  return Object.values(screenshotDefinitions)
}
