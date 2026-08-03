import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { listScreenshotDefinitions } from '../bot/run/RunPlan.mjs'
import { renderScreenshotArtifacts } from '../bot/screenshot/ScreenshotRunner.mjs'
import { renderFixtureScreenshotArtifacts } from './support/ScreenshotFixtureRenderer.mjs'
import {
  getScreenshotGoldenDirectory,
  listScreenshotGoldenEnvironments,
} from './support/ScreenshotGoldenEnvironment.mjs'
import { supportedBotLocales } from '../src/common/botLocale.mjs'
import { defaultScreenshotAttribution } from '../src/common/screenshotAttribution.mjs'
import { getLocaleFontFamilies } from '../src/common/fontFamilies.mjs'
import {
  screenshotGoldenFilename,
  screenshotGoldenLocales,
  screenshotGoldenPath,
} from './support/ScreenshotGoldenLocale.mjs'

test('screenshot artifacts match structural and visual contracts', { timeout: 600_000 }, async () => {
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
  const expectedGoldenFilenames = definitions.map(({ name }) => screenshotGoldenFilename(name)).sort()

  for (const environment of listScreenshotGoldenEnvironments()) {
    const environmentDirectory = getScreenshotGoldenDirectory(environment)
    const localeDirectories = (await fs.readdir(environmentDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    assert.deepEqual(
      localeDirectories,
      screenshotGoldenLocales.map(({ locale }) => locale).sort(),
      `${environment} golden locale directories are incomplete`
    )
    for (const { locale } of screenshotGoldenLocales) {
      const filenames = (await fs.readdir(path.join(environmentDirectory, locale)))
        .filter((filename) => filename.endsWith('.png'))
        .sort()
      assert.deepEqual(
        filenames,
        expectedGoldenFilenames,
        `${environment}/${locale} golden screenshots are incomplete`
      )
    }
  }

  await build({ build: { outDir: buildDirectory, emptyOutDir: true } })
  await fs.mkdir(diffDirectory, { recursive: true })
  await assert.rejects(
    renderScreenshotArtifacts(['schedules'], {
      buildDirectory,
      outputDirectory: path.join(outputDirectory, 'missing-festival-schedules'),
      renderTime: Date.parse('2026-07-12T12:00:00Z'),
      locale: 'en-US',
      screenshotAttribution: defaultScreenshotAttribution,
      screenshotResolution: '1200x675',
    }),
    /required content is unavailable: \[data-screenshot-content="schedules"\]/,
    'an active Splatfest without its battle schedules must not publish a partial screenshot'
  )
  const [activeSplatfestArtifact] = await renderScreenshotArtifacts(['splatfest-na'], {
    buildDirectory,
    outputDirectory: path.join(outputDirectory, 'active-splatfest'),
    renderTime: Date.parse('2026-07-12T12:00:00Z'),
    locale: 'en-US',
    screenshotAttribution: defaultScreenshotAttribution,
    screenshotResolution: '1200x675',
  })
  assert.equal(
    activeSplatfestArtifact.renderState.splatfestResultsCount,
    0,
    'an active Splatfest screenshot must not reveal result data'
  )
  for (const { locale } of screenshotGoldenLocales) {
    const localeOutputDirectory = path.join(outputDirectory, locale)
    const artifacts = await renderFixtureScreenshotArtifacts(
      definitions.map((definition) => definition.name),
      {
        buildDirectory,
        outputDirectory: localeOutputDirectory,
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
      assert.deepEqual(artifact.renderState.fontFamilies, getLocaleFontFamilies(locale))
      if (['schedules-regular', 'schedules-x'].includes(artifact.name)) {
        assert.equal(artifact.renderState.stageRows.length, 1, `${label} stage row is missing`)
        const [stageRow] = artifact.renderState.stageRows
        assert.ok(['flex', 'grid'].includes(stageRow.display), `${label} stage row uses ${stageRow.display}`)
        assert.equal(stageRow.itemCount, 2, `${label} stage row item count changed`)
        assert.ok(stageRow.gap >= 22 && stageRow.gap <= 26, `${label} stage gap is ${stageRow.gap}px`)
        assert.ok(stageRow.leftInset >= stageRow.gap - 1, `${label} left inset is ${stageRow.leftInset}px`)
        assert.ok(stageRow.rightInset >= stageRow.gap - 1, `${label} right inset is ${stageRow.rightInset}px`)
        assert.ok(
          Math.abs(stageRow.leftInset - stageRow.rightInset) <= 1,
          `${label} side insets differ by ${Math.abs(stageRow.leftInset - stageRow.rightInset)}px`
        )
        assert.ok(Math.abs(stageRow.centerOffset) <= 1, `${label} stage row is off center by ${stageRow.centerOffset}px`)
      }
      if (artifact.name.startsWith('splatfest-')) {
        assert.equal(
          artifact.renderState.splatfestResultsCount,
          1,
          `${label} completed Splatfest results card is missing`
        )
      }
      const current = PNG.sync.read(await fs.readFile(artifact.filename))
      const golden = PNG.sync.read(
        await fs.readFile(screenshotGoldenPath(goldenDirectory, artifact.name, locale))
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
        const diffFilename = screenshotGoldenPath(diffDirectory, artifact.name, locale)
        await fs.mkdir(path.dirname(diffFilename), { recursive: true })
        await fs.writeFile(diffFilename, PNG.sync.write(diff))
      }
      assert.ok(differenceRatio <= 0.001, `${label} visual difference is ${(differenceRatio * 100).toFixed(3)}%`)
    }
  }

  const goldenLocales = new Set(screenshotGoldenLocales.map(({ locale }) => locale))
  for (const locale of supportedBotLocales.filter((candidate) => !goldenLocales.has(candidate))) {
    const artifacts = await renderFixtureScreenshotArtifacts(
      definitions.map((definition) => definition.name),
      {
        buildDirectory,
        outputDirectory: path.join(localeOutputDirectory, locale),
        locale,
        screenshotAttribution: defaultScreenshotAttribution,
        screenshotResolution: '1200x675',
      }
    )
    for (const artifact of artifacts) {
      assert.equal(artifact.renderState.locale, locale)
      assert.equal(artifact.renderState.attribution, defaultScreenshotAttribution)
      assert.deepEqual(artifact.renderState.fontFamilies, getLocaleFontFamilies(locale))
      if (['schedules', 'salmon-run'].includes(artifact.name)) {
        assert.ok(artifact.renderState.fittedTextCount > 0, `${locale}/${artifact.name} did not inspect fitted text`)
      }
      assert.equal(artifact.width, 1_200)
      assert.equal(artifact.height, 675)
    }
  }

  const customScreenshotAttribution = 'a'.repeat(40)
  const productionArtifacts = await renderFixtureScreenshotArtifacts(
    definitions.map((definition) => definition.name),
    {
      buildDirectory,
      outputDirectory: productionOutputDirectory,
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
