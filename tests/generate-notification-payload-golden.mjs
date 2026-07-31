import fs from 'node:fs/promises'
import path from 'node:path'
import { createNotificationPayloadGolden } from './support/NotificationPayloadGolden.mjs'

const goldenPath = path.join(process.cwd(), 'tests', 'golden', 'notifications', 'payloads.json')
const payloads = await createNotificationPayloadGolden()

await fs.writeFile(goldenPath, `${JSON.stringify(payloads, null, 2)}\n`)
console.log(`Updated ${goldenPath}`)
