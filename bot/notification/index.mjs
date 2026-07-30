import { deliverNotificationChannel } from './NotificationDelivery.mjs'
import { readRunManifest } from '../run/RunManifest.mjs'

const [profileName, channelName] = process.argv.slice(2)

if (!profileName || !channelName) {
  throw new Error('Usage: node bot/notification/index.mjs <run-profile> <notification-channel>')
}

try {
  const manifest = await readRunManifest()
  if (manifest.profile !== profileName) {
    throw new Error(`Run manifest profile ${manifest.profile} does not match ${profileName}`)
  }
  const results = await deliverNotificationChannel({ profileName, channelName, now: manifest.renderTime })
  for (const result of results) {
    console.log(`${result.channel}/${result.target}/${result.notification}: delivered`)
  }
} catch (error) {
  for (const result of error.results || []) {
    if (result.status === 'fulfilled') {
      console.log(`${result.channel}/${result.target}/${result.notification}: delivered`)
    } else {
      console.error(`${result.channel}/${result.target}/${result.notification}: ${result.error.message}`)
    }
  }
  throw error
}
