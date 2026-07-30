import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveBrowserLaunchOptions } from '../bot/screenshot/BrowserRuntime.mjs'

test('disables the Chrome sandbox in CI runners that cannot provide one', async () => {
  const previousCi = process.env.CI
  const previousExecutable = process.env.PUPPETEER_EXECUTABLE_PATH
  process.env.CI = 'true'
  process.env.PUPPETEER_EXECUTABLE_PATH = '/bin/true'

  try {
    const options = await resolveBrowserLaunchOptions({
      additionalArgs: ['--disable-dev-shm-usage', '--no-first-run'],
      runtimePlatform: 'linux',
      ci: true,
    })
    assert.ok(options.args?.includes('--no-sandbox'))
    assert.ok(options.args?.includes('--disable-setuid-sandbox'))
    assert.ok(options.args?.includes('--disable-dev-shm-usage'))
    assert.ok(options.args?.includes('--no-first-run'))
  } finally {
    if (previousCi === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = previousCi
    }
    if (previousExecutable === undefined) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH
    } else {
      process.env.PUPPETEER_EXECUTABLE_PATH = previousExecutable
    }
  }
})

test('keeps the Chrome sandbox enabled outside Linux CI', async () => {
  const previousExecutable = process.env.PUPPETEER_EXECUTABLE_PATH
  process.env.PUPPETEER_EXECUTABLE_PATH = '/bin/true'

  try {
    const options = await resolveBrowserLaunchOptions({ runtimePlatform: 'darwin', ci: true })
    assert.ok(!options.args.includes('--no-sandbox'))
    assert.ok(!options.args.includes('--disable-setuid-sandbox'))
  } finally {
    if (previousExecutable === undefined) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH
    } else {
      process.env.PUPPETEER_EXECUTABLE_PATH = previousExecutable
    }
  }
})
