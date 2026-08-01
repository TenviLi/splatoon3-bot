import assert from 'node:assert/strict'
import test from 'node:test'
import { stringify as stringifyYaml } from 'yaml'
import {
  formatBotPreflightReport,
  formatBotPreflightStepSummary,
  inspectBotConfiguration,
} from '../bot/config/BotPreflight.mjs'
import { parseBrandingConfiguration } from '../bot/config/BrandingConfiguration.mjs'
import { defaultBotTimeZone, resolveBotTimeZone } from '../bot/config/BotTimeZone.mjs'
import {
  defaultScreenshotAttribution,
  resolveScreenshotAttribution,
} from '../bot/config/ScreenshotAttribution.mjs'

function validEnvironment(overrides = {}) {
  return {
    BOT_TIME_ZONE: 'UTC',
    BOT_SCREENSHOT_ATTRIBUTION: 'ink.example.com',
    BOT_BRANDING_CONFIG: stringifyYaml({
      icons: {
        schedules: 'https://brand.example.com/schedules.png',
        salmonRun: 'https://brand.example.com/salmon-run.png',
        gear: 'https://brand.example.com/gear.png',
      },
    }),
    S3_CONFIG: stringifyYaml({
      bucket: 'splatoon-assets',
      region: 'us-east-1',
      publicBaseUrl: 'https://assets.example.com',
      credentials: {
        accessKeyId: 'sensitive-access-key',
        secretAccessKey: 'sensitive-secret-key',
      },
    }),
    ...overrides,
  }
}

test('parses strict YAML branding URLs from a GitHub Variable', () => {
  assert.deepEqual(
    parseBrandingConfiguration(`
icons:
  schedules: https://brand.example.com/icon.png
  salmonRun: https://brand.example.com/icon2.png
  gear: https://brand.example.com/icon3.png
`),
    {
      icons: {
        schedules: 'https://brand.example.com/icon.png',
        salmonRun: 'https://brand.example.com/icon2.png',
        gear: 'https://brand.example.com/icon3.png',
      },
    }
  )

  assert.throws(
    () =>
      parseBrandingConfiguration(`
icons:
  schedules: https://brand.example.com/icon.png?token=secret
  salmonRun: https://brand.example.com/icon2.png
  gear: https://brand.example.com/icon3.png
`),
    /must not include credentials, a query, or a fragment/
  )
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
      { name: 'BOT_SCREENSHOT_ATTRIBUTION', status: 'ready' },
      { name: 'BOT_BRANDING_CONFIG', status: 'ready' },
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
      BOT_SCREENSHOT_ATTRIBUTION: 'a'.repeat(41),
      BOT_BRANDING_CONFIG: 'icons: {}',
      S3_CONFIG: 'bucket: only',
      BOT_WECOM_CONFIG: 'targets: [',
    },
  })

  assert.equal(report.valid, false)
  assert.equal(report.checks.filter(({ status }) => status === 'rejected').length, 5)
  assert.match(formatBotPreflightReport(report), /Configuration has errors/)
})
