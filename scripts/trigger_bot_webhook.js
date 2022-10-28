import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const screenshot_filename = path.join(import.meta.url, `../../${process.env.SCREENSHOT_FILENAME}`)

if (!fs.existsSync(screenshot_filename)) {
  console.log(`screenshot \"${screenshot_filename}\" exists`)
} else {
  console.error(`screenshot \"${screenshot_filename}\" not found`)
  process.exit(1)
}

const buffer = fs.readFileSync(screenshot_filename)
const base64 = buffer.toString('base64')
const md5sum = crypto.createHash('md5').update(buffer).digest('hex')

const body = JSON.stringify({
  msgtype: 'image',
  image: { base64, md5: md5sum },
})

;(async () => {
  const request = await fetch(process.env.BOT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (res.ok) {
    const data = await res.json()
    console.log(data)
  }
})()
