import fs from 'node:fs/promises'
import path from 'node:path'
import { listScreenshotDefinitions } from '../bot/run/RunPlan.mjs'
import { getScreenshotGoldenDirectory } from './support/ScreenshotGoldenEnvironment.mjs'
import { renderFixtureScreenshotArtifacts } from './support/ScreenshotFixtureRenderer.mjs'
import { defaultScreenshotAttribution } from '../src/common/screenshotAttribution.mjs'
import {
  screenshotGoldenLocales,
  screenshotGoldenPath,
} from './support/ScreenshotGoldenLocale.mjs'

process.env.SPLATOON_DATA_DIRECTORY = 'tests/fixtures/data'
process.env.SPLATOON_PUBLIC_DIRECTORY = 'tests/fixtures/public'
const { build } = await import('vite')
const buildDirectory = path.join(process.cwd(), '.cache', 'visual-dist')
const outputDirectory = getScreenshotGoldenDirectory()

await build({ build: { outDir: buildDirectory, emptyOutDir: true } })
for (const { locale } of screenshotGoldenLocales) {
  const localeOutputDirectory = path.join(process.cwd(), '.cache', 'screenshot-goldens', locale)
  const artifacts = await renderFixtureScreenshotArtifacts(
    listScreenshotDefinitions().map((definition) => definition.name),
    {
      buildDirectory,
      outputDirectory: localeOutputDirectory,
      locale,
      screenshotAttribution: defaultScreenshotAttribution,
      screenshotResolution: '1200x675',
    }
  )

  await fs.mkdir(path.join(outputDirectory, locale), { recursive: true })
  for (const artifact of artifacts) {
    const targetFilename = screenshotGoldenPath(outputDirectory, artifact.name, locale)
    await fs.copyFile(artifact.filename, targetFilename)
    console.log(`${locale}/${artifact.name}: ${targetFilename}`)
  }
}
