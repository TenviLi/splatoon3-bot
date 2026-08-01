import { z } from 'zod'
import {
  defaultScreenshotAttribution,
  normalizeScreenshotAttribution,
} from '../../src/common/screenshotAttribution.mjs'

export { defaultScreenshotAttribution }

export const screenshotAttributionSchema = z
  .string()
  .transform((value, context) => {
    try {
      return normalizeScreenshotAttribution(value)
    } catch (error) {
      context.addIssue({ code: 'custom', message: error.message })
      return z.NEVER
    }
  })

export function resolveScreenshotAttribution(value = process.env.BOT_SCREENSHOT_ATTRIBUTION) {
  const result = screenshotAttributionSchema.safeParse(value || defaultScreenshotAttribution)
  if (!result.success) {
    throw new Error(result.error.issues[0].message, { cause: result.error })
  }
  return result.data
}
