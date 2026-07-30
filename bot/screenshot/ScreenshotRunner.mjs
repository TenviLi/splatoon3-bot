import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import sirv from 'sirv'
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

async function inspectRenderState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-screenshot-root]')
    const footer = document.querySelector('[data-screenshot-footer]')
    const rootRect = root?.getBoundingClientRect()
    const footerRect = footer?.getBoundingClientRect()
    const footerText = footer?.textContent?.trim() || ''
    const images = [...document.images]
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
      imageCount: images.length,
      externalImageUrls,
    }
  })
}

export async function renderScreenshotArtifacts(
  screenshotNames,
  {
    buildDirectory = path.join(process.cwd(), 'dist'),
    outputDirectory = path.join(process.cwd(), 'screenshots'),
    renderTime = Date.now(),
    deviceScaleFactor = null,
    readyTimeoutMs = 20_000,
  } = {}
) {
  const definitions = screenshotNames.map(getScreenshotDefinition)
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
        deviceScaleFactor: deviceScaleFactor ?? definition.viewport.deviceScaleFactor,
      }
      const pageErrors = []
      const failedRequests = []
      const onPageError = (error) => pageErrors.push(error.message)
      const onRequestFailed = (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`)
      page.on('pageerror', onPageError)
      page.on('requestfailed', onRequestFailed)

      try {
        await page.evaluateOnNewDocument(() => localStorage.setItem('lang', 'zh-CN'))
        await page.emulateTimezone('Asia/Shanghai')
        await page.setViewport(viewport)
        const url = new URL(`http://127.0.0.1:${server.port}/screenshots.html`)
        url.hash = `/${definition.route}?${new URLSearchParams({ time: String(renderTime) })}`

        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
          () => document.documentElement.dataset.screenshotReady === 'true',
          { timeout: readyTimeoutMs }
        )

        const renderState = await inspectRenderState(page)
        const diagnostics = [...pageErrors, ...failedRequests, ...renderState.issues]
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
