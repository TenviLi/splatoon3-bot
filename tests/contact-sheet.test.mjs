import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import {
  generateScreenshotContactSheet,
  screenshotGoldenSuffix,
} from '../scripts/generate_screenshot_contact_sheet.mjs'

test('generates a labeled 16:9 screenshot contact sheet atomically', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon-contact-sheet-'))
  context.after(() => fs.rm(directory, { recursive: true, force: true }))
  const inputDirectory = path.join(directory, 'goldens')
  const outputFilename = path.join(directory, 'output', 'sheet.png')
  await fs.mkdir(inputDirectory, { recursive: true })

  for (const [name, background] of [['schedules', '#22c55e'], ['schedules-x', '#06b6d4']]) {
    await sharp({ create: { width: 160, height: 90, channels: 4, background } })
      .png()
      .toFile(path.join(inputDirectory, `${name}.png`))
  }

  const result = await generateScreenshotContactSheet({
    names: ['schedules', 'schedules-x'],
    inputDirectory,
    outputFilename,
    columns: 2,
    tileWidth: 160,
    gap: 10,
  })
  const metadata = await sharp(outputFilename).metadata()

  assert.deepEqual(result, {
    outputFilename,
    width: 350,
    height: 146,
    count: 2,
    locale: 'en-US',
  })
  assert.equal(metadata.width, result.width)
  assert.equal(metadata.height, result.height)
})

test('maps the three maintained screenshot locales to their golden suffixes', () => {
  assert.equal(screenshotGoldenSuffix('en-US'), '')
  assert.equal(screenshotGoldenSuffix('zh-CN'), '.zh-CN')
  assert.equal(screenshotGoldenSuffix('ja-JP'), '.ja')
  assert.throws(() => screenshotGoldenSuffix('de-DE'), /Unsupported contact-sheet locale/)
})
