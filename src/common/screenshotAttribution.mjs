export const defaultScreenshotAttribution = 'splatoon3.ink'

export function normalizeScreenshotAttribution(value = defaultScreenshotAttribution) {
  const attribution = String(value || defaultScreenshotAttribution).trim()
  if (!attribution) {
    return defaultScreenshotAttribution
  }
  if ([...attribution].length > 40) {
    throw new Error('BOT_SCREENSHOT_ATTRIBUTION must not exceed 40 characters')
  }
  if (/\p{Cc}/u.test(attribution)) {
    throw new Error('BOT_SCREENSHOT_ATTRIBUTION must not contain control characters')
  }
  return attribution
}
