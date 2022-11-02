import ScreenshotHelper from './ScreenshotHelper.mjs'
import path from 'path'
import fs from 'fs/promises'
import config from './config.mjs'
;(async () => {
  const arg = process.argv.slice(2)
  const SCREENSHOT_NAME = arg[0]

  if (!SCREENSHOT_NAME) {
    console.error('Error: undefiend screenshot name')
    process.exit(1)
  }

  const screenshotNames = SCREENSHOT_NAME.split(',').map((n) => n.trim())
  console.log(screenshotNames)

  const screenshotHelper = new ScreenshotHelper()
  screenshotHelper.defaultParams = { time: Date.now() }
  console.log('puppeteer start')

  for (const screenshotName of screenshotNames) {
    if (!screenshotName in config) {
      console.error('Error: invalid screenshot name')
      process.exit(1)
    }

    console.log(`puppeteer screenshot "${screenshotName}" start`)
    const file = await screenshotHelper.capture(screenshotName, config[screenshotName])

    const filename = path.join(process.cwd(), `./screenshots/${screenshotName}.png`)
    console.log(`puppeteer screenshot "${filename}" succeeded`)

    await fs.writeFile(filename, file)
    console.log(`write screenshot "${filename}" succeeded`)
  }

  await screenshotHelper.close()
  console.log('puppeteer closed')
})()
