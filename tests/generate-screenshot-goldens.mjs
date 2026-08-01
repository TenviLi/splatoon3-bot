import fs from 'node:fs/promises'
import path from 'node:path'
import { listScreenshotDefinitions } from '../bot/run/RunPlan.mjs'
import { renderScreenshotArtifacts } from '../bot/screenshot/ScreenshotRunner.mjs'
import { getScreenshotGoldenDirectory } from './support/ScreenshotGoldenEnvironment.mjs'
import { defaultScreenshotAttribution } from '../src/common/screenshotAttribution.mjs'
import {
  screenshotGoldenFilename,
  screenshotGoldenLocales,
} from './support/ScreenshotGoldenLocale.mjs'

process.env.SPLATOON_DATA_DIRECTORY = 'tests/fixtures/data'
process.env.SPLATOON_PUBLIC_DIRECTORY = 'tests/fixtures/public'
const { build } = await import('vite')
const buildDirectory = path.join(process.cwd(), '.cache', 'visual-dist')
const outputDirectory = getScreenshotGoldenDirectory()
const renderTime = Date.parse('2026-07-29T19:00:00Z')

await build({ build: { outDir: buildDirectory, emptyOutDir: true } })
for (const { locale } of screenshotGoldenLocales) {
  const localeOutputDirectory = path.join(process.cwd(), '.cache', 'screenshot-goldens', locale)
  const artifacts = await renderScreenshotArtifacts(
    listScreenshotDefinitions().map((definition) => definition.name),
    {
      buildDirectory,
      outputDirectory: localeOutputDirectory,
      renderTime,
      locale,
      screenshotAttribution: defaultScreenshotAttribution,
      screenshotResolution: '1200x675',
    }
  )

  for (const artifact of artifacts) {
    const targetFilename = path.join(outputDirectory, screenshotGoldenFilename(artifact.name, locale))
    await fs.copyFile(artifact.filename, targetFilename)
    console.log(`${locale}/${artifact.name}: ${targetFilename}`)
  }
}
