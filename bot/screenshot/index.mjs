import { getRunPlan } from '../run/RunPlan.mjs'
import { renderScreenshotArtifacts } from './ScreenshotRunner.mjs'

const [profileName] = process.argv.slice(2)

if (!profileName) {
  throw new Error('Usage: node bot/screenshot/index.mjs <run-profile>')
}

const plan = getRunPlan(profileName)
const artifacts = await renderScreenshotArtifacts(plan.screenshots)

for (const artifact of artifacts) {
  console.log(
    `${artifact.name}: ${artifact.filename} (${artifact.bytes} bytes, ${artifact.renderState.viewport.width}x${artifact.renderState.viewport.height}@${artifact.renderState.viewport.devicePixelRatio})`
  )
}
