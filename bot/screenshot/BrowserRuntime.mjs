import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Browser, computeExecutablePath, detectBrowserPlatform, install } from '@puppeteer/browsers'
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js'

async function isExecutable(filename) {
  try {
    await fs.access(filename, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveBrowserLaunchOptions() {
  const explicitExecutable = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.PUPPETEER_EXEC_PATH
  if (explicitExecutable) {
    return { executablePath: explicitExecutable }
  }

  if (process.env.PUPPETEER_CHANNEL) {
    return { channel: process.env.PUPPETEER_CHANNEL }
  }

  const platform = detectBrowserPlatform()
  if (!platform) {
    throw new Error(`Unsupported browser platform: ${process.platform}/${process.arch}`)
  }

  const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer')
  const buildId = process.env.PUPPETEER_BROWSER_VERSION || PUPPETEER_REVISIONS.chrome
  const installOptions = {
    browser: Browser.CHROME,
    buildId,
    cacheDir,
    platform,
  }
  let executablePath = computeExecutablePath(installOptions)

  if (!(await isExecutable(executablePath))) {
    const installedBrowser = await install({
      ...installOptions,
      downloadProgressCallback: process.env.CI ? undefined : 'default',
    })
    executablePath = installedBrowser.executablePath
  }

  return { executablePath }
}

export function getPinnedBrowserVersion() {
  return process.env.PUPPETEER_BROWSER_VERSION || PUPPETEER_REVISIONS.chrome
}
