import { parseBrandingConfiguration } from './BrandingConfiguration.mjs'
import { resolveBotTimeZone } from './BotTimeZone.mjs'
import { resolveScreenshotAttribution } from './ScreenshotAttribution.mjs'
import { prepareConfiguredNotificationChannels } from '../notification/NotificationConfiguration.mjs'
import { parseS3Configuration } from '../publish/S3Configuration.mjs'
import { getRunPlan } from '../run/RunPlan.mjs'

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

function inspectNotifications({ profileName, channelName, environment }) {
  try {
    const configuration = prepareConfiguredNotificationChannels({ profileName, channelName, environment })
    if (configuration.channels.length === 0) {
      return [skipped('Notification Channels', 'no Channel Secrets configured; publication-only run')]
    }

    return configuration.channels.map((channel) => {
      const name = `Notification Channel ${channel.channelName}`
      if (channel.status === 'rejected') {
        return rejected(name, channel.error)
      }
      if (channel.status === 'skipped') {
        return skipped(name, `${channel.targetCount} Target(s), none selected by ${profileName}`)
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

export function inspectBotConfiguration({ profileName, channelName, environment = process.env } = {}) {
  const profileCheck = inspect('Run Profile', () => getRunPlan(profileName), (plan) => plan.name)
  const checks = [
    profileCheck,
    inspect(
      'BOT_TIME_ZONE',
      () => resolveBotTimeZone(environment.BOT_TIME_ZONE),
      (timeZone) => timeZone
    ),
    inspect(
      'BOT_SCREENSHOT_ATTRIBUTION',
      () => resolveScreenshotAttribution(environment.BOT_SCREENSHOT_ATTRIBUTION),
      (attribution) => attribution
    ),
    inspect(
      'BOT_BRANDING_CONFIG',
      () => parseBrandingConfiguration(environment.BOT_BRANDING_CONFIG),
      () => '3 public icon URLs'
    ),
    inspect('S3_CONFIG', () => parseS3Configuration(environment.S3_CONFIG), () => 'valid publication credentials'),
    ...(profileCheck.status === 'ready'
      ? inspectNotifications({ profileName, channelName, environment })
      : [skipped('Notification Channels', 'not evaluated because the Run Profile is invalid')]),
  ]

  return Object.freeze({
    profileName,
    valid: checks.every(({ status }) => status !== 'rejected'),
    checks: Object.freeze(checks),
  })
}

export function formatBotPreflightReport(report) {
  const symbol = { ready: '✓', skipped: '○', rejected: '✗' }
  const lines = [`Bot configuration preflight for ${report.profileName}`]
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
    `Run Profile: \`${report.profileName}\``,
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
