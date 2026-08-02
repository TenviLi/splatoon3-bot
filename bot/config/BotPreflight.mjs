import { resolveBotLocale } from './BotLocale.mjs'
import { resolveBotTimeZone } from './BotTimeZone.mjs'
import { resolveScreenshotAttribution } from './ScreenshotAttribution.mjs'
import { resolveScreenshotResolution } from './ScreenshotResolution.mjs'
import { prepareConfiguredNotificationChannels } from '../notification/NotificationConfiguration.mjs'
import { parseS3Configuration } from '../publish/S3Configuration.mjs'
import { resolveRunPlan } from '../run/RunPlan.mjs'

function ready(name, detail) {
  return Object.freeze({ name, status: 'ready', detail })
}

function skipped(name, detail) {
  return Object.freeze({ name, status: 'skipped', detail })
}

function rejected(name, error) {
  return Object.freeze({ name, status: 'rejected', error })
}

function inspect(name, read, describe) {
  try {
    return ready(name, describe(read()))
  } catch (error) {
    return rejected(name, error)
  }
}

function inspectNotifications({ plan, channelName, environment }) {
  try {
    const configuration = prepareConfiguredNotificationChannels({
      selection: plan.selection,
      channelName,
      environment,
    })
    if (configuration.channels.length === 0) {
      return [skipped('Notification Channels', 'no Channel Secrets configured; publication-only run')]
    }

    return configuration.channels.map((channel) => {
      const name = `Notification Channel ${channel.channelName}`
      if (channel.status === 'rejected') {
        return rejected(name, channel.error)
      }
      if (channel.status === 'skipped') {
        return skipped(name, `${channel.targetCount} Target(s), none selected by ${plan.label}`)
      }

      const notificationCount = channel.deliveries.reduce(
        (count, delivery) => count + delivery.notificationIds.length,
        0
      )
      return ready(
        name,
        `${channel.deliveries.length}/${channel.targetCount} Target(s), ${notificationCount} delivery operation(s)`
      )
    })
  } catch (error) {
    return [rejected('Notification Channels', error)]
  }
}

export function inspectBotConfiguration({ selection, channelName, environment = process.env } = {}) {
  let plan
  const selectionCheck = inspect(
    'Run Selection',
    () => {
      plan = resolveRunPlan(selection)
      return plan
    },
    (resolvedPlan) => resolvedPlan.label
  )
  const checks = [
    selectionCheck,
    inspect(
      'BOT_TIME_ZONE',
      () => resolveBotTimeZone(environment.BOT_TIME_ZONE),
      (timeZone) => timeZone
    ),
    inspect(
      'BOT_LOCALE',
      () => resolveBotLocale(environment.BOT_LOCALE),
      (locale) => locale
    ),
    inspect(
      'BOT_SCREENSHOT_RESOLUTION',
      () => resolveScreenshotResolution(environment.BOT_SCREENSHOT_RESOLUTION),
      (resolution) => resolution.name
    ),
    inspect(
      'BOT_SCREENSHOT_ATTRIBUTION',
      () => resolveScreenshotAttribution(environment.BOT_SCREENSHOT_ATTRIBUTION),
      (attribution) => attribution
    ),
    inspect('S3_CONFIG', () => parseS3Configuration(environment.S3_CONFIG), () => 'valid publication credentials'),
    ...(selectionCheck.status === 'ready'
      ? inspectNotifications({ plan, channelName, environment })
      : [skipped('Notification Channels', 'not evaluated because the Run Selection is invalid')]),
  ]

  return Object.freeze({
    selection: plan?.selection || selection,
    selectionLabel: plan?.label || String(selection || ''),
    valid: checks.every(({ status }) => status !== 'rejected'),
    checks: Object.freeze(checks),
  })
}

export function formatBotPreflightReport(report) {
  const symbol = { ready: '✓', skipped: '○', rejected: '✗' }
  const lines = [`Bot configuration preflight for ${report.selectionLabel}`]
  for (const check of report.checks) {
    const detail = check.status === 'rejected' ? check.error.message : check.detail
    lines.push(`${symbol[check.status]} ${check.name}: ${detail}`)
  }
  lines.push(report.valid ? 'Configuration is ready' : 'Configuration has errors')
  return `${lines.join('\n')}\n`
}

export function formatBotPreflightStepSummary(report) {
  const label = { ready: 'Ready', skipped: 'Skipped', rejected: 'Rejected' }
  const lines = [
    '## Bot Configuration Preflight',
    '',
    `Run Selection: \`${report.selectionLabel}\``,
    '',
    '| Status | Check | Detail |',
    '| --- | --- | --- |',
  ]
  for (const check of report.checks) {
    const detail = check.status === 'rejected' ? check.error.message : check.detail
    const safeDetail = String(detail).replaceAll('|', '\\|').replace(/\s+/g, ' ').trim()
    lines.push(`| ${label[check.status]} | ${check.name} | ${safeDetail} |`)
  }
  lines.push('', report.valid ? '**Configuration is ready.**' : '**Configuration has errors.**', '')
  return lines.join('\n')
}
