import assert from 'node:assert/strict'
import test from 'node:test'
import puppeteer from 'puppeteer-core'
import { resolveBrowserLaunchOptions } from '../bot/screenshot/BrowserRuntime.mjs'

test('launches Chrome with the Linux CI sandbox fallback', { timeout: 120_000 }, async (context) => {
  const launchOptions = await resolveBrowserLaunchOptions({
    additionalArgs: ['--disable-dev-shm-usage', '--no-first-run'],
    runtimePlatform: 'linux',
    ci: true,
  })

  assert.ok(launchOptions.args.includes('--no-sandbox'))
  assert.ok(launchOptions.args.includes('--disable-setuid-sandbox'))

  const browser = await puppeteer.launch({ ...launchOptions, headless: true })
  context.after(() => browser.close())

  const page = await browser.newPage()
  await page.setContent('<main data-ci-browser-ready="true">ready</main>')
  assert.equal(await page.locator('[data-ci-browser-ready="true"]').map((element) => element.textContent).wait(), 'ready')
})
