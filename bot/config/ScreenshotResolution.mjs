import { z } from 'zod'

const screenshotResolutionNames = Object.freeze(['1200x675', '1920x1080', '2400x1350', '3840x2160'])
const logicalViewport = Object.freeze({ width: 1200, height: 675 })
const screenshotResolutionPresets = Object.freeze(
  Object.fromEntries(
    screenshotResolutionNames.map((name) => {
      const [width, height] = name.split('x').map(Number)
      return [
        name,
        Object.freeze({
          name,
          width,
          height,
          deviceScaleFactor: width / logicalViewport.width,
        }),
      ]
    })
  )
)

export const defaultScreenshotResolution = '2400x1350'
export const screenshotResolutionSchema = z.enum(screenshotResolutionNames)

export function getScreenshotResolution(name) {
  const preset = screenshotResolutionPresets[name]
  if (!preset) {
    throw new Error(`BOT_SCREENSHOT_RESOLUTION must be one of: ${screenshotResolutionNames.join(', ')}`)
  }
  return preset
}

export function listScreenshotResolutions() {
  return Object.values(screenshotResolutionPresets)
}

export function resolveScreenshotResolution(value = process.env.BOT_SCREENSHOT_RESOLUTION) {
  const result = screenshotResolutionSchema.safeParse(String(value || defaultScreenshotResolution).trim())
  if (!result.success) {
    throw new Error(`BOT_SCREENSHOT_RESOLUTION must be one of: ${screenshotResolutionNames.join(', ')}`, {
      cause: result.error,
    })
  }
  return getScreenshotResolution(result.data)
}
