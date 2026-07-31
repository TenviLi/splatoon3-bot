import { z } from 'zod'

export const defaultBotTimeZone = 'Asia/Shanghai'

export const botTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((timeZone, context) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format(0)
    } catch {
      context.addIssue({ code: 'custom', message: `BOT_TIME_ZONE must be a valid IANA time zone: ${timeZone}` })
    }
  })

export function resolveBotTimeZone(value = process.env.BOT_TIME_ZONE) {
  const result = botTimeZoneSchema.safeParse(String(value || defaultBotTimeZone))
  if (!result.success) {
    throw new Error(result.error.issues[0].message, { cause: result.error })
  }
  return result.data
}
