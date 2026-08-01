import { z } from 'zod'
import {
  defaultBotLocale,
  normalizeBotLocale,
  supportedBotLocales,
} from '../../src/common/botLocale.mjs'

export { defaultBotLocale, supportedBotLocales }

export const botLocaleSchema = z.string().transform((value, context) => {
  try {
    return normalizeBotLocale(value)
  } catch (error) {
    context.addIssue({ code: 'custom', message: error.message })
    return z.NEVER
  }
})

export function resolveBotLocale(value = process.env.BOT_LOCALE) {
  const result = botLocaleSchema.safeParse(value || defaultBotLocale)
  if (!result.success) {
    throw new Error(result.error.issues[0].message, { cause: result.error })
  }
  return result.data
}
