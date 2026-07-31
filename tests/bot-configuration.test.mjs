import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBrandingConfiguration } from '../bot/config/BrandingConfiguration.mjs'
import { defaultBotTimeZone, resolveBotTimeZone } from '../bot/config/BotTimeZone.mjs'

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
