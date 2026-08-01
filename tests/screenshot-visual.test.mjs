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
import { supportedBotLocales } from '../src/common/botLocale.mjs'
import { defaultScreenshotAttribution } from '../src/common/screenshotAttribution.mjs'
import {
  screenshotGoldenFilename,
  screenshotGoldenLocales,
} from './support/ScreenshotGoldenLocale.mjs'

test('screenshot artifacts match structural and visual contracts', { timeout: 180_000 }, async () => {
  process.env.SPLATOON_DATA_DIRECTORY = 'tests/fixtures/data'
  process.env.SPLATOON_PUBLIC_DIRECTORY = 'tests/fixtures/public'
  const { build } = await import('vite')
  const buildDirectory = path.join(process.cwd(), '.cache', 'visual-dist')
  const outputDirectory = path.join(process.cwd(), '.cache', 'visual-current')
  const productionOutputDirectory = path.join(process.cwd(), '.cache', 'production-media-current')
  const localeOutputDirectory = path.join(process.cwd(), '.cache', 'locale-structural-current')
  const diffDirectory = path.join(process.cwd(), '.cache', 'visual-diff')
  const goldenDirectory = getScreenshotGoldenDirectory()
  const definitions = listScreenshotDefinitions()
  const expectedGoldenFilenames = screenshotGoldenLocales
    .flatMap(({ locale }) => definitions.map(({ name }) => screenshotGoldenFilename(name, locale)))
    .sort()

  for (const environment of listScreenshotGoldenEnvironments()) {
    const filenames = (await fs.readdir(getScreenshotGoldenDirectory(environment)))
      .filter((filename) => filename.endsWith('.png'))
      .sort()
    assert.deepEqual(filenames, expectedGoldenFilenames, `${environment} golden screenshots are incomplete`)
  }

  await build({ build: { outDir: buildDirectory, emptyOutDir: true } })
  await fs.mkdir(diffDirectory, { recursive: true })
  for (const { locale } of screenshotGoldenLocales) {
    const localeOutputDirectory = path.join(outputDirectory, locale)
    const artifacts = await renderScreenshotArtifacts(
      definitions.map((definition) => definition.name),
      {
        buildDirectory,
        outputDirectory: localeOutputDirectory,
        renderTime: Date.parse('2026-07-29T19:00:00Z'),
        locale,
        screenshotAttribution: defaultScreenshotAttribution,
        screenshotResolution: '1200x675',
      }
    )

    for (const artifact of artifacts) {
      const label = `${locale}/${artifact.name}`
      assert.deepEqual(artifact.renderState.externalImageUrls, [], `${label} loaded external fixture images`)
      assert.equal(artifact.renderState.locale, locale)
      assert.equal(artifact.renderState.attribution, defaultScreenshotAttribution)
      const current = PNG.sync.read(await fs.readFile(artifact.filename))
      const golden = PNG.sync.read(
        await fs.readFile(path.join(goldenDirectory, screenshotGoldenFilename(artifact.name, locale)))
      )
      assert.equal(current.width, golden.width, `${label} width changed`)
      assert.equal(current.height, golden.height, `${label} height changed`)
      const diff = new PNG({ width: current.width, height: current.height })
      const differentPixels = pixelmatch(current.data, golden.data, diff.data, current.width, current.height, {
        threshold: 0.1,
        includeAA: false,
      })
      const differenceRatio = differentPixels / (current.width * current.height)

      if (differenceRatio > 0.001) {
        await fs.writeFile(path.join(diffDirectory, screenshotGoldenFilename(artifact.name, locale)), PNG.sync.write(diff))
      }
      assert.ok(differenceRatio <= 0.001, `${label} visual difference is ${(differenceRatio * 100).toFixed(3)}%`)
    }
  }

  const goldenLocales = new Set(screenshotGoldenLocales.map(({ locale }) => locale))
  for (const locale of supportedBotLocales.filter((candidate) => !goldenLocales.has(candidate))) {
    const artifacts = await renderScreenshotArtifacts(
      definitions.map((definition) => definition.name),
      {
        buildDirectory,
        outputDirectory: path.join(localeOutputDirectory, locale),
        renderTime: Date.parse('2026-07-29T19:00:00Z'),
        locale,
        screenshotAttribution: defaultScreenshotAttribution,
        screenshotResolution: '1200x675',
      }
    )
    for (const artifact of artifacts) {
      assert.equal(artifact.renderState.locale, locale)
      assert.equal(artifact.renderState.attribution, defaultScreenshotAttribution)
      if (['schedules', 'salmon-run'].includes(artifact.name)) {
        assert.ok(artifact.renderState.fittedTextCount > 0, `${locale}/${artifact.name} did not inspect fitted text`)
      }
      assert.equal(artifact.width, 1_200)
      assert.equal(artifact.height, 675)
    }
  }

  const customScreenshotAttribution = 'a'.repeat(40)
  const productionArtifacts = await renderScreenshotArtifacts(
    definitions.map((definition) => definition.name),
    {
      buildDirectory,
      outputDirectory: productionOutputDirectory,
      renderTime: Date.parse('2026-07-29T19:00:00Z'),
      locale: 'zh-CN',
      screenshotAttribution: customScreenshotAttribution,
      screenshotResolution: '2400x1350',
    }
  )
  for (const artifact of productionArtifacts) {
    assert.equal(artifact.renderState.attribution, customScreenshotAttribution)
    const imageBytes = await fs.readFile(artifact.filename)
    const image = PNG.sync.read(imageBytes)
    assert.ok(imageBytes.byteLength <= 10 * 1024 * 1024, `${artifact.name} exceeds Telegram's 10 MB photo limit`)
    assert.ok(image.width + image.height <= 10_000, `${artifact.name} exceeds Telegram's dimension sum limit`)
    assert.ok(
      Math.max(image.width / image.height, image.height / image.width) <= 20,
      `${artifact.name} exceeds Telegram's aspect-ratio limit`
    )
  }

  for (const [screenshotResolution, width, height, deviceScaleFactor] of [
    ['1920x1080', 1_920, 1_080, 1.6],
    ['3840x2160', 3_840, 2_160, 3.2],
  ]) {
    const [artifact] = await renderScreenshotArtifacts(['schedules'], {
      buildDirectory,
      outputDirectory: path.join(productionOutputDirectory, screenshotResolution),
      renderTime: Date.parse('2026-07-29T19:00:00Z'),
      locale: 'en-US',
      screenshotAttribution: defaultScreenshotAttribution,
      screenshotResolution,
    })
    const image = PNG.sync.read(await fs.readFile(artifact.filename))
    assert.equal(artifact.width, width)
    assert.equal(artifact.height, height)
    assert.ok(
      Math.abs(artifact.renderState.viewport.devicePixelRatio - deviceScaleFactor) < 1e-6,
      `${screenshotResolution} device scale factor changed`
    )
    assert.equal(image.width, width)
    assert.equal(image.height, height)
  }
})
