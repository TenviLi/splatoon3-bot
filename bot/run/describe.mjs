import fs from 'node:fs/promises'
import { getRunPlan } from './RunPlan.mjs'

const [profileName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/run/describe.mjs <profile>')
}

const plan = getRunPlan(profileName)
const description = {
  profile: plan.name,
  artifactName: plan.artifactName,
  screenshots: plan.screenshots,
  notifications: plan.notifications,
}

if (process.env.GITHUB_OUTPUT) {
  const outputs = [
    `profile=${description.profile}`,
    `artifact_name=${description.artifactName}`,
    `screenshots=${description.screenshots.join(',')}`,
    `notifications=${description.notifications.join(',')}`,
  ]

  await fs.appendFile(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`)
} else {
  console.log(JSON.stringify(description, null, 2))
}
