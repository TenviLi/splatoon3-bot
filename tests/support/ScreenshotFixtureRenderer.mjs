import { renderScreenshotArtifacts } from '../../bot/screenshot/ScreenshotRunner.mjs'

const scheduleRenderTime = Date.parse('2026-07-29T19:00:00Z')
const completedSplatfestRenderTime = Date.parse('2026-07-13T12:00:00Z')

export function getFixtureRenderTime(screenshotName) {
  return screenshotName.startsWith('splatfest-') ? completedSplatfestRenderTime : scheduleRenderTime
}

export async function renderFixtureScreenshotArtifacts(screenshotNames, options) {
  const groups = new Map()
  for (const name of screenshotNames) {
    const renderTime = getFixtureRenderTime(name)
    const group = groups.get(renderTime) || []
    group.push(name)
    groups.set(renderTime, group)
  }

  const artifacts = []
  for (const [renderTime, names] of groups) {
    artifacts.push(...await renderScreenshotArtifacts(names, { ...options, renderTime }))
  }

  const artifactsByName = new Map(artifacts.map((artifact) => [artifact.name, artifact]))
  return screenshotNames.map((name) => artifactsByName.get(name))
}
