import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { listScreenshotDefinitions } from '../bot/run/RunPlan.mjs'
import { renderScreenshotArtifacts } from '../bot/screenshot/ScreenshotRunner.mjs'
import {
  getScreenshotGoldenDirectory,
  listScreenshotGoldenEnvironments,
} from './support/ScreenshotGoldenEnvironment.mjs'

test('screenshot artifacts match structural and visual contracts', { timeout: 120_000 }, async () => {
  process.env.SPLATOON_DATA_DIRECTORY = 'tests/fixtures/data'
  process.env.SPLATOON_PUBLIC_DIRECTORY = 'tests/fixtures/public'
  const { build } = await import('vite')
  const buildDirectory = path.join(process.cwd(), '.cache', 'visual-dist')
  const outputDirectory = path.join(process.cwd(), '.cache', 'visual-current')
  const productionOutputDirectory = path.join(process.cwd(), '.cache', 'production-media-current')
  const diffDirectory = path.join(process.cwd(), '.cache', 'visual-diff')
  const goldenDirectory = getScreenshotGoldenDirectory()
  const definitions = listScreenshotDefinitions()
  const expectedGoldenFilenames = definitions.map((definition) => definition.outputFilename).sort()

  for (const environment of listScreenshotGoldenEnvironments()) {
    const filenames = (await fs.readdir(getScreenshotGoldenDirectory(environment)))
      .filter((filename) => filename.endsWith('.png'))
      .sort()
    assert.deepEqual(filenames, expectedGoldenFilenames, `${environment} golden screenshots are incomplete`)
  }

  await build({ build: { outDir: buildDirectory, emptyOutDir: true } })
  const artifacts = await renderScreenshotArtifacts(
    definitions.map((definition) => definition.name),
    {
      buildDirectory,
      outputDirectory,
      renderTime: Date.parse('2026-07-29T19:00:00Z'),
      deviceScaleFactor: 1,
    }
  )

  await fs.mkdir(diffDirectory, { recursive: true })
  for (const artifact of artifacts) {
    assert.deepEqual(artifact.renderState.externalImageUrls, [], `${artifact.name} loaded external fixture images`)
    const current = PNG.sync.read(await fs.readFile(artifact.filename))
    const golden = PNG.sync.read(await fs.readFile(path.join(goldenDirectory, `${artifact.name}.png`)))
    assert.equal(current.width, golden.width, `${artifact.name} width changed`)
    assert.equal(current.height, golden.height, `${artifact.name} height changed`)
    const diff = new PNG({ width: current.width, height: current.height })
    const differentPixels = pixelmatch(current.data, golden.data, diff.data, current.width, current.height, {
      threshold: 0.1,
      includeAA: false,
    })
    const differenceRatio = differentPixels / (current.width * current.height)

    if (differenceRatio > 0.001) {
      await fs.writeFile(path.join(diffDirectory, `${artifact.name}.png`), PNG.sync.write(diff))
    }
    assert.ok(differenceRatio <= 0.001, `${artifact.name} visual difference is ${(differenceRatio * 100).toFixed(3)}%`)
  }

  const productionArtifacts = await renderScreenshotArtifacts(
    definitions.map((definition) => definition.name),
    {
      buildDirectory,
      outputDirectory: productionOutputDirectory,
      renderTime: Date.parse('2026-07-29T19:00:00Z'),
    }
  )
  for (const artifact of productionArtifacts) {
    const imageBytes = await fs.readFile(artifact.filename)
    const image = PNG.sync.read(imageBytes)
    assert.ok(imageBytes.byteLength <= 10 * 1024 * 1024, `${artifact.name} exceeds Telegram's 10 MB photo limit`)
    assert.ok(image.width + image.height <= 10_000, `${artifact.name} exceeds Telegram's dimension sum limit`)
    assert.ok(
      Math.max(image.width / image.height, image.height / image.width) <= 20,
      `${artifact.name} exceeds Telegram's aspect-ratio limit`
    )
  }
})
