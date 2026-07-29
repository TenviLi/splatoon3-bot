import { URL } from 'url'
import puppeteer from 'puppeteer-core'
import HttpServer from './HttpServer.mjs'

const defaultViewport = {
  // Using a 16:9 ratio here by default to match Twitter's image card dimensions
  width: 400,
  height: 720,
  deviceScaleFactor: 2,
}

export default class ScreenshotHelper {
  /** @type {HttpServer} */
  #httpServer = null
  /** @type {puppeteer.Browser} */
  #browser = null
  /** @type {puppeteer.Page} */
  #page = null

  defaultParams = null

  get isOpen() {
    return !!this.#browser
  }

  /** @type {puppeteer.Page} */
  get page() {
    return this.#page
  }

  async open() {
    await this.close()

    // Start the HTTP server
    this.#httpServer = new HttpServer()
    await this.#httpServer.open()

    // Launch a new Chrome instance
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.PUPPETEER_EXEC_PATH
    const launchOptions = {
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-first-run',
      ],
    }

    if (executablePath) {
      launchOptions.executablePath = executablePath
    } else {
      launchOptions.channel = process.env.PUPPETEER_CHANNEL || 'chrome'
    }

    this.#browser = await puppeteer.launch(launchOptions)

    // Create a new page and set the viewport
    this.#page = await this.#browser.newPage()
    await this.#page.evaluateOnNewDocument(() => localStorage.setItem('lang', 'zh-CN'))
    await this.applyTimezone()
    await this.applyViewport()
  }

  async applyViewport(viewport = {}) {
    if (this.#page) {
      await this.#page.setViewport({
        ...defaultViewport,
        ...viewport,
      })
    }
  }

  async applyTimezone(timezone = 'Asia/Shanghai') {
    if (this.#page) {
      await this.#page.emulateTimezone(timezone)
    }
  }

  async capture(path, options = {}) {
    if (!this.isOpen) {
      await this.open()
    }

    await this.applyViewport(options.viewport)

    // Navigate to the URL
    const url = new URL(`http://127.0.0.1:${this.#httpServer.port}/screenshots.html`)
    url.hash = path

    if (this.defaultParams) {
      const params = new URLSearchParams(this.defaultParams)
      url.hash += `?${params}`
    }

    await this.#page.goto(url, {
      waitUntil: 'networkidle0', // Wait until the network is idle
    })

    // Wait an additional 500ms
    await this.#page.waitForNetworkIdle({ idleTime: 500 })
    // await new Promise((r) => setTimeout(r, 100000000))

    const screenshotOptions = {
      type: 'png',
      fullPage: false,
      captureBeyondViewport: false,
    }
    const buffer = await this.#page.screenshot(screenshotOptions)
    return buffer
  }

  async close() {
    if (this.#httpServer) {
      await this.#httpServer.close()
    }
    this.#httpServer = null

    if (this.#page) {
      await this.#page.close()
    }
    this.#page = null

    if (this.#browser) {
      await this.#browser.close()
    }
    this.#browser = null
  }
}
