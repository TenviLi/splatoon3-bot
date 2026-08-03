import { resolveRunPlan } from '../run/RunPlan.mjs'
import { renderScreenshotArtifacts } from './ScreenshotRunner.mjs'

const [selection] = process.argv.slice(2)

if (!selection) {
  throw new Error('Usage: node bot/screenshot/index.mjs <screenshot-ids>')
}

const plan = resolveRunPlan(selection)
const artifacts = await renderScreenshotArtifacts(plan.screenshots)

for (const artifact of artifacts) {
  console.log(
    `${artifact.name}: ${artifact.filename} (${artifact.bytes} bytes, ${artifact.renderState.viewport.width}x${artifact.renderState.viewport.height}@${artifact.renderState.viewport.devicePixelRatio})`
  )
}
