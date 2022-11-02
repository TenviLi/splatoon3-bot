import { URL } from 'url'
import puppeteer from 'puppeteer'
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
    this.#browser = await puppeteer.launch({
      headless: true,
      // headless: false, // test
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--no-sandbox',
        '--no-zygote',
        '--single-process',
      ],
      executablePath: process.env.PUPPETEER_EXEC_PATH, // set by docker container
    })
    // https://stackoverflow.com/questions/51789038/set-localstorage-items-before-page-loads-in-puppeteer
    this.#browser.on('targetchanged', async (target) => {
      const targetPage = await target.page()
      const client = await targetPage.target().createCDPSession()
      await client.send('Runtime.evaluate', {
        expression: `localStorage.setItem('lang', 'zh-CN')`,
      })
    })

    // Create a new page and set the viewport
    this.#page = await this.#browser.newPage()
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
    let url = new URL(`http://localhost:${this.#httpServer.port}/screenshots.html`)
    url.hash = path

    if (this.defaultParams) {
      // We can't use url.searchParams because they need to come after the hash
      url.hash += '?'
      for (let key in this.defaultParams) {
        url.hash += `${key}=${this.defaultParams[key]}`
      }
    }

    await this.#page.goto(url, {
      waitUntil: 'networkidle0', // Wait until the network is idle
    })

    // Wait an additional 500ms
    await this.#page.waitForNetworkIdle({ idleTime: 500 })
    // await new Promise((r) => setTimeout(r, 100000000))

    // Take the screenshot
    const body = (await this.#page.$('#app')) || (await this.#page.$('body'))
    const randData = {
      // encoding: 'base64',
      type: 'png',
      // omitBackground: true,
      // quality: 80, // 不支持 png
      // path: '',
    }
    const buffer = await body.screenshot(randData)
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
