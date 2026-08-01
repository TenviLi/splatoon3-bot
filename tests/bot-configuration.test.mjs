import assert from 'node:assert/strict'
import test from 'node:test'
import { stringify as stringifyYaml } from 'yaml'
import {
  formatBotPreflightReport,
  formatBotPreflightStepSummary,
  inspectBotConfiguration,
} from '../bot/config/BotPreflight.mjs'
import { defaultBotLocale, resolveBotLocale } from '../bot/config/BotLocale.mjs'
import { defaultBotTimeZone, resolveBotTimeZone } from '../bot/config/BotTimeZone.mjs'
import {
  defaultScreenshotAttribution,
  resolveScreenshotAttribution,
} from '../bot/config/ScreenshotAttribution.mjs'
import {
  defaultScreenshotResolution,
  listScreenshotResolutions,
  resolveScreenshotResolution,
} from '../bot/config/ScreenshotResolution.mjs'

function validEnvironment(overrides = {}) {
  return {
    BOT_TIME_ZONE: 'UTC',
    BOT_LOCALE: 'ja-JP',
    BOT_SCREENSHOT_RESOLUTION: '1920x1080',
    BOT_SCREENSHOT_ATTRIBUTION: 'ink.example.com',
    S3_CONFIG: stringifyYaml({
      bucket: 'splatoon-assets',
      region: 'us-east-1',
      publicBaseUrl: 'https://assets.example.com',
      accessKeyId: 'sensitive-access-key',
      secretAccessKey: 'sensitive-secret-key',
    }),
    ...overrides,
  }
}

test('uses explicit locale and screenshot-resolution enumerations with stable defaults', () => {
  assert.equal(resolveBotLocale(), defaultBotLocale)
  assert.equal(resolveBotLocale(' ja-JP '), 'ja-JP')
  assert.throws(() => resolveBotLocale('fr-FR'), /must be one of: en-US, zh-CN, ja-JP/)

  assert.equal(resolveScreenshotResolution().name, defaultScreenshotResolution)
  assert.deepEqual(
    listScreenshotResolutions().map(({ name, width, height }) => ({ name, width, height })),
    [
      { name: '1200x675', width: 1200, height: 675 },
      { name: '1920x1080', width: 1920, height: 1080 },
      { name: '2400x1350', width: 2400, height: 1350 },
      { name: '3840x2160', width: 3840, height: 2160 },
    ]
  )
  assert.throws(() => resolveScreenshotResolution('2560x1440'), /must be one of/)
})

test('uses an explicit validated IANA time zone with a stable default', () => {
  assert.equal(resolveBotTimeZone(), defaultBotTimeZone)
  assert.equal(resolveBotTimeZone('America/Los_Angeles'), 'America/Los_Angeles')
  assert.equal(resolveBotTimeZone('  UTC  '), 'UTC')
  assert.throws(() => resolveBotTimeZone('Mars/Inkling'), /must be a valid IANA time zone/)
})

test('uses a concise screenshot attribution with a stable default', () => {
  assert.equal(resolveScreenshotAttribution(), defaultScreenshotAttribution)
  assert.equal(resolveScreenshotAttribution('  @Inkling  '), '@Inkling')
  assert.equal(resolveScreenshotAttribution('鱿'.repeat(40)), '鱿'.repeat(40))
  assert.throws(() => resolveScreenshotAttribution('a'.repeat(41)), /must not exceed 40 characters/)
  assert.throws(() => resolveScreenshotAttribution('line one\nline two'), /must not contain control characters/)
  assert.throws(() => resolveScreenshotAttribution('line one\u0085line two'), /must not contain control characters/)
})

test('preflights publication and routed Channel configuration without exposing Secrets', () => {
  const report = inspectBotConfiguration({
    profileName: 'schedules',
    environment: validEnvironment({
      BOT_WECOM_CONFIG: stringifyYaml([
        {
          name: 'schedules',
          webhookUrl: 'https://wecom.example.com/sensitive-webhook',
          notifications: ['schedules'],
        },
        {
          name: 'gear',
          webhookUrl: 'https://wecom.example.com/other-sensitive-webhook',
          notifications: ['gear-dailydrop', 'gear-regular'],
        },
      ]),
    }),
  })

  assert.equal(report.valid, true)
  assert.deepEqual(
    report.checks.map(({ name, status }) => ({ name, status })),
    [
      { name: 'Run Profile', status: 'ready' },
      { name: 'BOT_TIME_ZONE', status: 'ready' },
      { name: 'BOT_LOCALE', status: 'ready' },
      { name: 'BOT_SCREENSHOT_RESOLUTION', status: 'ready' },
      { name: 'BOT_SCREENSHOT_ATTRIBUTION', status: 'ready' },
      { name: 'S3_CONFIG', status: 'ready' },
      { name: 'Notification Channel wecom', status: 'ready' },
    ]
  )

  const output = formatBotPreflightReport(report)
  assert.match(output, /1\/2 Target\(s\), 1 delivery operation\(s\)/)
  assert.match(output, /Configuration is ready/)
  assert.doesNotMatch(output, /sensitive|webhook|splatoon-assets/)
  const stepSummary = formatBotPreflightStepSummary(report)
  assert.match(stepSummary, /## Bot Configuration Preflight/)
  assert.match(stepSummary, /\| Ready \| Notification Channel wecom \|/)
  assert.doesNotMatch(stepSummary, /sensitive|webhook|splatoon-assets/)
})

test('treats unmatched Channel routing as an intentional per-profile skip', () => {
  const environment = validEnvironment({
    BOT_WECOM_CONFIG: stringifyYaml([
      {
        name: 'gear-only',
        webhookUrl: 'https://wecom.example.com/gear',
        notifications: ['gear-dailydrop', 'gear-regular'],
      },
    ]),
  })
  const report = inspectBotConfiguration({
    profileName: 'schedules',
    environment,
  })

  assert.equal(report.valid, true)
  assert.equal(report.checks.at(-1).status, 'skipped')
  assert.match(formatBotPreflightReport(report), /none selected by schedules/)

  const selectedChannelReport = inspectBotConfiguration({
    profileName: 'schedules',
    channelName: 'wecom',
    environment,
  })
  assert.equal(selectedChannelReport.valid, false)
  assert.equal(selectedChannelReport.checks.at(-1).status, 'rejected')
})

test('reports every invalid required configuration before side effects', () => {
  const report = inspectBotConfiguration({
    profileName: 'schedules',
    environment: {
      BOT_TIME_ZONE: 'Mars/Inkling',
      BOT_LOCALE: 'fr-FR',
      BOT_SCREENSHOT_RESOLUTION: '2560x1440',
      BOT_SCREENSHOT_ATTRIBUTION: 'a'.repeat(41),
      S3_CONFIG: 'bucket: only',
      BOT_WECOM_CONFIG: 'targets: [',
    },
  })

  assert.equal(report.valid, false)
  assert.equal(report.checks.filter(({ status }) => status === 'rejected').length, 6)
  assert.match(formatBotPreflightReport(report), /Configuration has errors/)
})
