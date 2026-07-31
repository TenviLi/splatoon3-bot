import { z } from 'zod'
import { absoluteUrlSchema } from './AbsoluteUrl.mjs'
import { parseYamlEnvironment } from './YamlEnvironment.mjs'

export const brandingConfigurationSchema = z
  .object({
    icons: z
      .object({
        schedules: absoluteUrlSchema({ label: 'icons.schedules' }),
        salmonRun: absoluteUrlSchema({ label: 'icons.salmonRun' }),
        gear: absoluteUrlSchema({ label: 'icons.gear' }),
      })
      .strict(),
  })
  .strict()

export function parseBrandingConfiguration(rawValue = process.env.BOT_BRANDING_CONFIG) {
  return Object.freeze(
    parseYamlEnvironment(rawValue, {
      variableName: 'BOT_BRANDING_CONFIG',
      schema: brandingConfigurationSchema,
    })
  )
}
