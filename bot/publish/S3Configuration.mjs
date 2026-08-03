import { z } from 'zod'
import { absoluteUrlSchema } from '../config/AbsoluteUrl.mjs'
import { parseYamlEnvironment } from '../config/YamlEnvironment.mjs'

const keyPrefixSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^\/+|\/+$/g, ''))
  .refine((value) => !value || !value.split('/').some((segment) => segment.length === 0), {
    message: 'keyPrefix must not contain empty path segments',
  })
  .refine((value) => !value.split('/').some((segment) => segment === '.' || segment === '..'), {
    message: 'keyPrefix must not contain dot segments',
  })
  .refine((value) => !/[\\?#\u0000-\u001f]/u.test(value), {
    message: 'keyPrefix contains unsupported URL or control characters',
  })

const s3ConfigurationSchema = z
  .object({
    bucket: z.string().trim().min(1),
    region: z.string().trim().min(1).default('us-east-1'),
    endpoint: absoluteUrlSchema({
      label: 'endpoint',
      protocols: ['http:', 'https:'],
      allowLocalHttp: true,
    }).optional(),
    forcePathStyle: z.boolean().optional(),
    keyPrefix: keyPrefixSchema.optional(),
    publicBaseUrl: absoluteUrlSchema({ label: 'publicBaseUrl' }),
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
    sessionToken: z.string().min(1).optional(),
  })
  .strict()

export function parseS3Configuration(rawValue = process.env.S3_CONFIG) {
  return Object.freeze(
    parseYamlEnvironment(rawValue, {
      variableName: 'S3_CONFIG',
      schema: s3ConfigurationSchema,
    })
  )
}

export function objectKey(configuration, relativeKey) {
  return [configuration.keyPrefix, relativeKey].filter(Boolean).join('/')
}

export function publicAssetBaseUrl(configuration) {
  return configuration.keyPrefix
    ? publicObjectUrl(configuration, configuration.keyPrefix)
    : new URL(configuration.publicBaseUrl).toString().replace(/\/$/, '')
}

export function publicObjectUrl(configuration, key) {
  const url = new URL(configuration.publicBaseUrl)
  const basePath = url.pathname.replace(/\/+$/, '')
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  url.pathname = `${basePath}/${encodedKey}`
  return url.toString()
}
