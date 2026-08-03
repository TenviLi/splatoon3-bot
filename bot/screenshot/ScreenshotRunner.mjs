import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import sirv from 'sirv'
import { resolveBotLocale } from '../config/BotLocale.mjs'
import { resolveScreenshotAttribution } from '../config/ScreenshotAttribution.mjs'
import { resolveScreenshotResolution } from '../config/ScreenshotResolution.mjs'
import { resolveBotTimeZone } from '../config/BotTimeZone.mjs'
import { getScreenshotDefinition } from '../run/RunPlan.mjs'
import { getPinnedBrowserVersion, resolveBrowserLaunchOptions } from './BrowserRuntime.mjs'

async function startStaticServer(rootDirectory) {
  const handler = sirv(rootDirectory, { dev: false })
  const server = http.createServer(handler)

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.once('listening', resolve)
    server.listen(0, '127.0.0.1')
  })

  return {
    port: server.address().port,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

async function writeFileAtomically(filename, buffer) {
  await fs.mkdir(path.dirname(filename), { recursive: true })
  const temporaryFilename = `${filename}.${process.pid}.tmp`
  await fs.writeFile(temporaryFilename, buffer)
  await fs.rename(temporaryFilename, filename)
}

async function inspectRenderState(page, requiredContentSelector, screenshotName) {
  return page.evaluate(({ selector, screenshotId }) => {
    const root = document.querySelector('[data-screenshot-root]')
    const footer = document.querySelector('[data-screenshot-footer]')
    const attribution = document.querySelector('[data-screenshot-attribution]')
    const rootRect = root?.getBoundingClientRect()
    const footerRect = footer?.getBoundingClientRect()
    const footerText = footer?.textContent?.trim() || ''
    const rootStyle = getComputedStyle(document.documentElement)
    const images = [...document.images]
    const fittedTextElements = [...document.querySelectorAll('[data-screenshot-fit]')]
    const stageRows = [...document.querySelectorAll('[data-screenshot-stage-row]')].map((row) => {
      const containerRect = row.parentElement?.getBoundingClientRect()
      const itemRects = [...row.children].map((item) => item.getBoundingClientRect())
      const firstItem = itemRects[0]
      const lastItem = itemRects.at(-1)

      return {
        display: getComputedStyle(row).display,
        itemCount: itemRects.length,
        gap: itemRects.length > 1 ? itemRects[1].left - firstItem.right : null,
        leftInset: firstItem && containerRect ? firstItem.left - containerRect.left : null,
        rightInset: lastItem && containerRect ? containerRect.right - lastItem.right : null,
        centerOffset:
          firstItem && lastItem && containerRect
            ? (firstItem.left + lastItem.right) / 2 - (containerRect.left + containerRect.right) / 2
            : null,
      }
    })
    const externalImageUrls = images
      .map((image) => image.currentSrc || image.src)
      .filter(Boolean)
      .filter((source) => {
        const url = new URL(source, window.location.href)
        return ['http:', 'https:'].includes(url.protocol) && url.origin !== window.location.origin
      })
    const issues = []

    if (document.documentElement.dataset.screenshotReady !== 'true') {
      issues.push('document is not marked ready')
    }
    if (selector && !document.querySelector(selector)) {
      issues.push(
        `expected domain content for Screenshot ID "${screenshotId}" was not rendered; the page did not report a more specific availability reason`
      )
    }
    if (document.fonts.status !== 'loaded') {
      issues.push(`fonts are ${document.fonts.status}`)
    }
    if (images.some((image) => !image.complete || image.naturalWidth === 0)) {
      issues.push('one or more images did not load')
    }
    if (!rootRect) {
      issues.push('screenshot root is missing')
    } else {
      if (Math.abs(rootRect.top) > 0.5 || Math.abs(rootRect.left) > 0.5) {
        issues.push(`root starts at ${rootRect.left},${rootRect.top}`)
      }
      if (Math.abs(rootRect.width - window.innerWidth) > 0.5) {
        issues.push(`root width ${rootRect.width} does not match viewport ${window.innerWidth}`)
      }
      if (Math.abs(rootRect.height - window.innerHeight) > 0.5) {
        issues.push(`root height ${rootRect.height} does not match viewport ${window.innerHeight}`)
      }
    }
    if (document.documentElement.scrollWidth !== window.innerWidth) {
      issues.push(`document width ${document.documentElement.scrollWidth} overflows viewport ${window.innerWidth}`)
    }
    if (document.documentElement.scrollHeight !== window.innerHeight) {
      issues.push(`document height ${document.documentElement.scrollHeight} overflows viewport ${window.innerHeight}`)
    }
    for (const element of fittedTextElements) {
      if (element.scrollWidth > element.clientWidth + 1.5) {
        issues.push(`fitted text is clipped: ${element.textContent?.trim() || '(empty)'}`)
      }
    }
    if (!footerRect) {
      issues.push('screenshot footer is missing')
    } else if (Math.abs(window.innerHeight - footerRect.bottom - 16) > 0.5) {
      issues.push(`footer bottom margin is ${window.innerHeight - footerRect.bottom}, expected 16`)
    }
    if (/Invalid Date|\bNaN\b/.test(footerText)) {
      issues.push(`footer contains an invalid value: ${footerText}`)
    }

    return {
      issues,
      locale: document.documentElement.lang,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      root: rootRect ? { x: rootRect.x, y: rootRect.y, width: rootRect.width, height: rootRect.height } : null,
      footer: footerRect
        ? { x: footerRect.x, y: footerRect.y, width: footerRect.width, height: footerRect.height, bottom: footerRect.bottom }
        : null,
      footerText,
      attribution: attribution?.textContent?.trim() || '',
      fontFamilies: {
        s1: rootStyle.getPropertyValue('--font-family-s1').trim(),
        s2: rootStyle.getPropertyValue('--font-family-s2').trim(),
      },
      imageCount: images.length,
      fittedTextCount: fittedTextElements.length,
      stageRows,
      splatfestResultsCount: document.querySelectorAll('[data-screenshot-splatfest-results]').length,
      externalImageUrls,
    }
  }, { selector: requiredContentSelector, screenshotId: screenshotName })
}

async function inspectReadinessState(page) {
  return page.evaluate(() => ({
    marker: document.documentElement.dataset.screenshotReady || 'missing',
    fontStatus: document.fonts.status,
    incompleteImages: [...document.images]
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src || '(missing source)'),
  }))
}

export function createScreenshotReadinessTimeoutError({
  screenshotName,
  timeoutMs,
  pageErrors = [],
  failedRequests = [],
  readinessState,
  cause,
}) {
  const diagnostics = [
    ...pageErrors,
    ...failedRequests,
    `ready marker is ${readinessState.marker}`,
    `fonts are ${readinessState.fontStatus}`,
    ...readinessState.incompleteImages.map((source) => `image is incomplete: ${source}`),
  ]
  return new Error(
    `Screenshot ${screenshotName} did not become ready within ${timeoutMs}ms:\n- ${diagnostics.join('\n- ')}`,
    { cause }
  )
}

export async function renderScreenshotArtifacts(
  screenshotNames,
  {
    buildDirectory = path.join(process.cwd(), 'dist'),
    outputDirectory = path.join(process.cwd(), 'screenshots'),
    renderTime = Date.now(),
    timeZone = resolveBotTimeZone(),
    locale = resolveBotLocale(),
    screenshotAttribution = resolveScreenshotAttribution(),
    screenshotResolution = resolveScreenshotResolution().name,
    readyTimeoutMs = 20_000,
  } = {}
) {
  const definitions = screenshotNames.map(getScreenshotDefinition)
  const resolution = resolveScreenshotResolution(screenshotResolution)
  const server = await startStaticServer(buildDirectory)
  const browser = await puppeteer.launch({
    ...(await resolveBrowserLaunchOptions({
      additionalArgs: ['--disable-dev-shm-usage', '--no-first-run'],
    })),
    headless: true,
  })
  const artifacts = []

  try {
    for (const definition of definitions) {
      const page = await browser.newPage()
      const viewport = {
        ...definition.viewport,
        deviceScaleFactor: resolution.deviceScaleFactor,
      }
      const pageErrors = []
      const failedRequests = []
      const onPageError = (error) => pageErrors.push(error.message)
      const onRequestFailed = (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`)
      page.on('pageerror', onPageError)
      page.on('requestfailed', onRequestFailed)

      try {
        await page.evaluateOnNewDocument((botLocale) => localStorage.setItem('lang', botLocale), locale)
        await page.emulateTimezone(timeZone)
        await page.setViewport(viewport)
        const url = new URL(`http://127.0.0.1:${server.port}/screenshots.html`)
        url.hash = `/${definition.route}?${new URLSearchParams({
          time: String(renderTime),
          attribution: screenshotAttribution,
        })}`

        await page.goto(url, { waitUntil: 'domcontentloaded' })
        try {
          await page.waitForFunction(
            () => document.documentElement.dataset.screenshotReady === 'true',
            { timeout: readyTimeoutMs }
          )
        } catch (error) {
          const readinessState = await inspectReadinessState(page)
          throw createScreenshotReadinessTimeoutError({
            screenshotName: definition.name,
            timeoutMs: readyTimeoutMs,
            pageErrors,
            failedRequests,
            readinessState,
            cause: error,
          })
        }

        const renderState = await inspectRenderState(
          page,
          definition.requiredContentSelector,
          definition.name
        )
        const diagnostics = [...pageErrors, ...failedRequests, ...renderState.issues]
        if (renderState.attribution !== screenshotAttribution) {
          diagnostics.push(
            `screenshot attribution is ${renderState.attribution || 'missing'}, expected ${screenshotAttribution}`
          )
        }
        if (renderState.locale !== locale) {
          diagnostics.push(`screenshot locale is ${renderState.locale || 'missing'}, expected ${locale}`)
        }
        if (diagnostics.length > 0) {
          throw new Error(`Screenshot ${definition.name} failed render validation:\n- ${diagnostics.join('\n- ')}`)
        }

        const buffer = await page.screenshot({ type: 'png', fullPage: false, captureBeyondViewport: false })
        const filename = path.join(outputDirectory, definition.outputFilename)
        await writeFileAtomically(filename, buffer)
        artifacts.push(
          Object.freeze({
            name: definition.name,
            filename,
            bytes: buffer.byteLength,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
            browserVersion: getPinnedBrowserVersion(),
            width: resolution.width,
            height: resolution.height,
            renderState,
          })
        )
      } finally {
        page.off('pageerror', onPageError)
        page.off('requestfailed', onRequestFailed)
        await page.close()
      }
    }

    return artifacts
  } finally {
    await browser.close()
    await server.close()
  }
}
