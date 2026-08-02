import fs from 'node:fs/promises'
import { resolveRunPlan, resolveRunPlanFromEnvironment } from './RunPlan.mjs'

const selectionArguments = process.argv.slice(2)

const plan = selectionArguments.length > 0
  ? resolveRunPlan(selectionArguments)
  : resolveRunPlanFromEnvironment()
const description = {
  selection: plan.selection,
  label: plan.label,
  artifactName: plan.artifactName,
  screenshots: plan.screenshots,
  notifications: plan.notifications,
}

if (process.env.GITHUB_OUTPUT) {
  const outputs = [
    `selection=${description.selection.join(',')}`,
    `selection_label=${description.label}`,
    `artifact_name=${description.artifactName}`,
    `screenshots=${description.screenshots.join(',')}`,
    `notifications=${description.notifications.join(',')}`,
  ]

  await fs.appendFile(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`)
} else {
  console.log(JSON.stringify(description, null, 2))
}
