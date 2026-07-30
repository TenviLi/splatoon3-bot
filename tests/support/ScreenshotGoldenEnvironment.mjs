import path from 'node:path'

const screenshotGoldenEnvironments = Object.freeze(['darwin-arm64', 'linux-x64'])

export function getScreenshotGoldenEnvironment(platform = process.platform, arch = process.arch) {
  const environment = `${platform}-${arch}`

  if (!screenshotGoldenEnvironments.includes(environment)) {
    throw new Error(
      `Unsupported screenshot golden environment: ${environment}. Supported environments: ${screenshotGoldenEnvironments.join(', ')}`
    )
  }

  return environment
}

export function getScreenshotGoldenDirectory(environment = getScreenshotGoldenEnvironment()) {
  return path.join(process.cwd(), 'tests', 'golden', 'screenshots', environment)
}

export function listScreenshotGoldenEnvironments() {
  return screenshotGoldenEnvironments
}
