import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import sirv from 'sirv'
import { listScreenshotDefinitions } from '../bot/run/RunPlan.mjs'
import { resolveBrowserLaunchOptions } from '../bot/screenshot/BrowserRuntime.mjs'
import { supportedBotLocales } from '../src/common/botLocale.mjs'

const fixtureDirectory = path.join(process.cwd(), 'tests', 'fixtures')
const dataDirectory = path.join(fixtureDirectory, 'data')
const publicDirectory = path.join(fixtureDirectory, 'public')
const assetDirectory = path.join(publicDirectory, 'fixture-assets')
const buildDirectory = path.join(process.cwd(), '.cache', 'fixture-localization-dist')
const renderTime = Date.parse('2026-07-29T19:00:00Z')

process.env.SPLATOON_DATA_DIRECTORY = path.relative(process.cwd(), dataDirectory)
process.env.SPLATOON_PUBLIC_DIRECTORY = path.relative(process.cwd(), publicDirectory)
const { build } = await import('vite')
await build({ build: { outDir: buildDirectory, emptyOutDir: true } })

const server = http.createServer(sirv(buildDirectory, { dev: false }))
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const browser = await puppeteer.launch({
  ...(await resolveBrowserLaunchOptions({ additionalArgs: ['--no-first-run'] })),
  headless: true,
})
const externalUrls = new Set()

try {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => localStorage.setItem('lang', 'zh-CN'))
  await page.emulateTimezone('Asia/Shanghai')
  for (const definition of listScreenshotDefinitions()) {
    await page.setViewport({ ...definition.viewport, deviceScaleFactor: 1 })
    const url = `http://127.0.0.1:${server.address().port}/screenshots.html#/${definition.route}?time=${renderTime}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.documentElement.dataset.screenshotReady === 'true')
    const sources = await page.evaluate(() => [...document.images].map((image) => image.currentSrc || image.src))
    for (const source of sources) {
      if (/^https?:/.test(source) && !source.includes('127.0.0.1')) {
        externalUrls.add(source)
      }
    }
  }
} finally {
  await browser.close()
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

await fs.mkdir(assetDirectory, { recursive: true })
const replacements = new Map()
await Promise.all(
  [...externalUrls].map(async (url) => {
    const extension = path.extname(new URL(url).pathname) || '.bin'
    const filename = `${crypto.createHash('sha256').update(url).digest('hex')}${extension}`
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) {
      throw new Error(`Failed to download fixture asset ${url}: HTTP ${response.status}`)
    }
    await fs.writeFile(path.join(assetDirectory, filename), Buffer.from(await response.arrayBuffer()))
    replacements.set(url, `/fixture-assets/${filename}`)
  })
)

function replaceUrls(value) {
  if (typeof value === 'string') {
    return replacements.get(value) || value
  }
  if (Array.isArray(value)) {
    return value.map(replaceUrls)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceUrls(entry)]))
  }
  return value
}

const dataFiles = [
  'schedules.json',
  'gear.json',
  'festivals.json',
  'coop.json',
  ...supportedBotLocales.map((locale) => `locale/${locale}.json`),
]
for (const relativeFilename of dataFiles) {
  const filename = path.join(dataDirectory, relativeFilename)
  const value = JSON.parse(await fs.readFile(filename, 'utf8'))
  await fs.writeFile(filename, `${JSON.stringify(replaceUrls(value), null, 2)}\n`)
}

console.log(`Localized ${replacements.size} fixture assets`)
