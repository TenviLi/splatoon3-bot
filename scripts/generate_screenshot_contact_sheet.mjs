import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { listScreenshotDefinitions } from '../bot/run/RunPlan.mjs'

const contactSheetLocales = Object.freeze(['en-US', 'zh-CN', 'ja-JP'])

function positiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

function nonNegativeInteger(value, label) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return parsed
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function labelImage(name, width, height) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      '<rect width="100%" height="100%" fill="#1f2937"/>' +
      `<text x="${width / 2}" y="${height / 2}" dominant-baseline="middle" text-anchor="middle" ` +
      'fill="#f3f4f6" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18">' +
      `${escapeXml(name)}</text></svg>`
  )
}

export function screenshotGoldenLocaleDirectory(inputDirectory, locale) {
  if (!contactSheetLocales.includes(locale)) {
    throw new Error(`Unsupported contact-sheet locale: ${locale}. Use ${contactSheetLocales.join(', ')}`)
  }
  return path.join(inputDirectory, locale)
}

export async function generateScreenshotContactSheet({
  names = listScreenshotDefinitions().map(({ name }) => name),
  inputDirectory,
  outputFilename,
  locale = 'en-US',
  columns = 3,
  tileWidth = 480,
  gap = 12,
} = {}) {
  if (!inputDirectory || !outputFilename) {
    throw new Error('inputDirectory and outputFilename are required')
  }
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('Select at least one screenshot for the contact sheet')
  }

  const normalizedColumns = positiveInteger(columns, 'columns')
  const normalizedTileWidth = positiveInteger(tileWidth, 'tileWidth')
  const normalizedGap = nonNegativeInteger(gap, 'gap')
  const imageHeight = Math.round(normalizedTileWidth * 9 / 16)
  const labelHeight = 36
  const tileHeight = imageHeight + labelHeight
  const rows = Math.ceil(names.length / normalizedColumns)
  const width = normalizedColumns * normalizedTileWidth + (normalizedColumns + 1) * normalizedGap
  const height = rows * tileHeight + (rows + 1) * normalizedGap
  const localeDirectory = screenshotGoldenLocaleDirectory(inputDirectory, locale)
  const inputs = names.map((name) => ({
    name,
    filename: path.join(localeDirectory, `${name}.png`),
  }))

  for (const { name, filename } of inputs) {
    try {
      await fs.access(filename)
    } catch (error) {
      throw new Error(`Missing screenshot golden for ${name}: ${filename}`, { cause: error })
    }
  }

  const composites = []
  for (const [index, { name, filename }] of inputs.entries()) {
    const left = normalizedGap + (index % normalizedColumns) * (normalizedTileWidth + normalizedGap)
    const top = normalizedGap + Math.floor(index / normalizedColumns) * (tileHeight + normalizedGap)
    composites.push({
      input: await sharp(filename)
        .resize(normalizedTileWidth, imageHeight, { fit: 'cover' })
        .png()
        .toBuffer(),
      left,
      top,
    })
    composites.push({
      input: labelImage(name, normalizedTileWidth, labelHeight),
      left,
      top: top + imageHeight,
    })
  }

  await fs.mkdir(path.dirname(outputFilename), { recursive: true })
  const temporaryFilename = `${outputFilename}.${process.pid}.tmp.png`
  try {
    await sharp({
      create: { width, height, channels: 4, background: '#111827' },
    })
      .composite(composites)
      .png()
      .toFile(temporaryFilename)
    await fs.rename(temporaryFilename, outputFilename)
  } catch (error) {
    await fs.rm(temporaryFilename, { force: true })
    throw error
  }

  return Object.freeze({ outputFilename, width, height, count: names.length, locale })
}

function defaultPlatform() {
  return `${process.platform}-${process.arch}`
}

function usage() {
  return `Generate a labeled contact sheet from deterministic screenshot goldens.

Usage:
  pnpm run screenshots:contact-sheet -- [options]

Options:
  --platform <name>    Golden platform directory (default: ${defaultPlatform()})
  --locale <locale>    en-US, zh-CN, or ja-JP (default: en-US)
  --columns <count>    Number of columns (default: 3)
  --tile-width <px>    Width of each 16:9 screenshot tile (default: 480)
  --gap <px>           Gap around and between tiles (default: 12)
  --input <directory>  Override the golden input directory
  --output <filename>  Override the output PNG filename
  --help               Show this help
`
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--') {
    args.shift()
  }
  const { values } = parseArgs({
    args,
    options: {
      platform: { type: 'string', default: defaultPlatform() },
      locale: { type: 'string', default: 'en-US' },
      columns: { type: 'string', default: '3' },
      'tile-width': { type: 'string', default: '480' },
      gap: { type: 'string', default: '12' },
      input: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.help) {
    process.stdout.write(usage())
    return
  }

  const inputDirectory = path.resolve(
    values.input || path.join('tests', 'golden', 'screenshots', values.platform)
  )
  const outputFilename = path.resolve(
    values.output || path.join('.cache', 'contact-sheets', `screenshots.${values.platform}.${values.locale}.png`)
  )
  const result = await generateScreenshotContactSheet({
    inputDirectory,
    outputFilename,
    locale: values.locale,
    columns: values.columns,
    tileWidth: values['tile-width'],
    gap: values.gap,
  })
  process.stdout.write(`${result.outputFilename}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}
