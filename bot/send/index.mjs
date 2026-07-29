import fs from 'fs'
import path from 'path'
import SalmonRunCard from './cards/SalmonRunCard.mjs'
import SchedulesCard from './cards/SchedulesCard.mjs'
import DailyDropGearCard from './cards/DailyDropGearCard.mjs'
import RegularGearCard from './cards/RegularGearCard.mjs'

import WxWorkClient from './Client.mjs'
;(async () => {
  const arg = process.argv.slice(2)
  const SCREENSHOT_NAME = arg[0]

  if (!SCREENSHOT_NAME) {
    console.error('Error: undefined screenshot name')
    process.exit(1)
  }

  const screenshotNames = SCREENSHOT_NAME.split(',').map((n) => n.trim())
  console.log(screenshotNames)

  for (const screenshotName of screenshotNames) {
    const screenshot_filename = path.join(process.cwd(), `screenshots/${screenshotName}.png`)

    if (fs.existsSync(screenshot_filename)) {
      console.log(`screenshot \"${screenshotName}\" exists`)
    } else {
      console.error(`screenshot \"${screenshotName}\" not found`)
      process.exit(1)
    }

    switch (screenshotName) {
      case 'schedules':
        const schedulesCard = new SchedulesCard()
        await schedulesCard.sendMessage(new WxWorkClient(process.env.SPLATOON_SCHEDULES_BOT_URL))
        break
      case 'salmon-run':
        const salmonRunCard = new SalmonRunCard()
        await salmonRunCard.sendMessage(new WxWorkClient(process.env.SPLATOON_SALMON_RUN_BOT_URL))
        break
      case 'gear-dailydrop':
        const dailyDropGearCard = new DailyDropGearCard()
        await dailyDropGearCard.sendMessage(new WxWorkClient(process.env.SPLATOON_GEAR_BOT_URL))
        break
      case 'gear-regular':
        const regularGearCard = new RegularGearCard()
        await regularGearCard.sendMessage(new WxWorkClient(process.env.SPLATOON_GEAR_BOT_URL))
        break
    }
  }
})()
