import fs from 'node:fs/promises'
import { getRunPlan, selectNotificationChannels } from './RunPlan.mjs'

const [profileName, configuredChannels = process.env.BOT_NOTIFICATION_CHANNELS || 'wecom'] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/run/describe.mjs <profile> [channels]')
}

const plan = getRunPlan(profileName)
const channels = selectNotificationChannels(configuredChannels)
const description = {
  profile: plan.name,
  artifactName: plan.artifactName,
  screenshots: plan.screenshots,
  notifications: plan.notifications,
  notificationMatrix: {
    include: channels.map(({ name, secret }) => ({ channel: name, secret })),
  },
}

if (process.env.GITHUB_OUTPUT) {
  const outputs = [
    `profile=${description.profile}`,
    `artifact_name=${description.artifactName}`,
    `screenshots=${description.screenshots.join(',')}`,
    `notifications=${description.notifications.join(',')}`,
    `notification_matrix=${JSON.stringify(description.notificationMatrix)}`,
  ]

  await fs.appendFile(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`)
} else {
  console.log(JSON.stringify(description, null, 2))
}
