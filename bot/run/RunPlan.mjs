const screenshotDefinitions = Object.freeze({
  schedules: Object.freeze({
    name: 'schedules',
    route: 'schedules',
    outputFilename: 'schedules.png',
    viewport: Object.freeze({ width: 1200, height: 675, deviceScaleFactor: 2 }),
  }),
  'salmon-run': Object.freeze({
    name: 'salmon-run',
    route: 'salmon-run',
    outputFilename: 'salmon-run.png',
    viewport: Object.freeze({ width: 1200, height: 675, deviceScaleFactor: 2 }),
  }),
  'gear-dailydrop': Object.freeze({
    name: 'gear-dailydrop',
    route: 'gear-dailydrop',
    outputFilename: 'gear-dailydrop.png',
    viewport: Object.freeze({ width: 1200, height: 675, deviceScaleFactor: 2 }),
  }),
  'gear-regular': Object.freeze({
    name: 'gear-regular',
    route: 'gear-regular',
    outputFilename: 'gear-regular.png',
    viewport: Object.freeze({ width: 1200, height: 675, deviceScaleFactor: 2 }),
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
})

const notificationChannels = Object.freeze({
  wecom: Object.freeze({ name: 'wecom', secret: 'BOT_WECOM_CONFIG' }),
  discord: Object.freeze({ name: 'discord', secret: 'BOT_DISCORD_CONFIG' }),
  telegram: Object.freeze({ name: 'telegram', secret: 'BOT_TELEGRAM_CONFIG' }),
  qq: Object.freeze({ name: 'qq', secret: 'BOT_QQ_CONFIG' }),
  feishu: Object.freeze({ name: 'feishu', secret: 'BOT_FEISHU_CONFIG' }),
  dingtalk: Object.freeze({ name: 'dingtalk', secret: 'BOT_DINGTALK_CONFIG' }),
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

export function getNotificationChannel(name) {
  return requireEntry(notificationChannels, name, 'notification channel')
}

export function listRunProfiles() {
  return Object.values(runProfiles)
}

export function listScreenshotDefinitions() {
  return Object.values(screenshotDefinitions)
}

export function listNotificationChannels() {
  return Object.values(notificationChannels)
}

export function selectNotificationChannels(value = 'wecom') {
  const names = [...new Set(String(value || 'wecom').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean))]

  if (names.length === 0) {
    throw new Error('At least one notification channel must be enabled')
  }

  return names.map(getNotificationChannel)
}
