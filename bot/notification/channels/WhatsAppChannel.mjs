import { z } from 'zod'
import { jsonRequest, requireJsonSuccess, wrapRequestError } from '../HttpTransport.mjs'
import { inspectRemoteImage } from '../RemoteImageInspector.mjs'
import { compactText } from '../format.mjs'

export const whatsAppGraphApiVersion = 'v25.0'
const retryableMetaErrorCodes = new Set([4, 80007, 130429, 131056, 131057])
const maximumImageBytes = 5 * 1024 * 1024

export const whatsAppTargetSchema = z.object({
  name: z.string().min(1),
  accessToken: z.string().min(1),
  phoneNumberId: z.string().regex(/^\d+$/),
  recipientPhoneNumber: z.string().regex(/^[1-9]\d{5,14}$/),
  templateName: z.string().regex(/^[a-z0-9_]+$/),
  languageCode: z.string().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/),
}).strict()

function templateText(value, maximumLength) {
  return compactText(String(value || '-').replace(/\s+/gu, ' ').trim() || '-', maximumLength)
}

function detailsText(notification, maximumLength = 560) {
  const lines = [
    ...notification.sections.flatMap((section) => [
      [section.title, section.text].filter(Boolean).map((value) => templateText(value, 600)).join('｜'),
      ...section.listItems.map((item) => `• ${templateText(item, 300)}`),
    ]),
    ...notification.facts.map(
      (fact) => `${templateText(fact.label, 200)}｜${templateText(fact.value, 400)}`
    ),
  ].filter(Boolean)

  return compactText(lines.join('\n') || templateText(notification.source.name, maximumLength), maximumLength)
}

function requireHttpsImageUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error('WhatsApp template image must use HTTPS')
  }
  if (!/\.(?:png|jpe?g)(?:!|$)/i.test(url.pathname)) {
    throw new Error('WhatsApp template image must be a JPEG or PNG URL')
  }
  if (url.toString().length > 2_000) {
    throw new Error('WhatsApp template image URL exceeds 2000 characters')
  }
  return url.toString()
}

function templateActionPath(notification, assetBaseUrl) {
  if (!assetBaseUrl) {
    throw new Error('WhatsApp delivery requires the normalized asset base URL')
  }

  const baseUrl = new URL(assetBaseUrl)
  if (baseUrl.protocol !== 'https:') {
    throw new Error('WhatsApp template action base must use HTTPS')
  }

  const prefix = `${baseUrl.toString().replace(/\/$/, '')}/`
  if (!notification.action.url.startsWith(prefix)) {
    throw new Error(`WhatsApp action URL must start with the approved template prefix ${prefix}`)
  }

  const suffix = notification.action.url.slice(prefix.length)
  if (!suffix) {
    throw new Error('WhatsApp action URL must include a path after the approved template prefix')
  }

  const encodedSuffix = suffix
    .split('/')
    .map((segment) =>
      encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/g, (character) =>
        `%${character.codePointAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/')
  if (`${prefix}${encodedSuffix}`.length > 2_000) {
    throw new Error('WhatsApp template action URL exceeds 2000 characters')
  }
  return encodedSuffix
}

function createTemplatePayload(notification, target, assetBaseUrl, imageUrl, messageBudget = {}) {
  const context = notification.subtitle || notification.source.name
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: target.recipientPhoneNumber,
    type: 'template',
    template: {
      name: target.templateName,
      language: { code: target.languageCode },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: imageUrl } }],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'title', text: templateText(notification.title, 120) },
            { type: 'text', parameter_name: 'context', text: templateText(context, 160) },
            {
              type: 'text',
              parameter_name: 'details',
              text: detailsText(notification, messageBudget.templateBodyCharacters),
            },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            {
              type: 'text',
              parameter_name: 'action_path',
              text: templateActionPath(notification, assetBaseUrl),
            },
          ],
        },
      ],
    },
  }
}

export async function deliverWhatsApp(notification, target, options = {}) {
  const imageUrl = requireHttpsImageUrl(notification.image.variants.whatsapp.url)
  const imageMetadata = await (options.inspectImage || inspectRemoteImage)(imageUrl, {
    fetchImpl: options.fetchImpl,
    maximumBytes: maximumImageBytes,
  })
  if (!['png', 'jpeg'].includes(imageMetadata.format)) {
    throw new Error('WhatsApp template image must be PNG or JPEG')
  }
  if (imageMetadata.bytes > maximumImageBytes) {
    throw new Error(`WhatsApp template image is ${imageMetadata.bytes} bytes, exceeding the 5 MB limit`)
  }

  let result
  try {
    result = await jsonRequest(
      {
        url: `https://graph.facebook.com/${whatsAppGraphApiVersion}/${encodeURIComponent(target.phoneNumberId)}/messages`,
        headers: { Authorization: `Bearer ${target.accessToken}` },
        fetchImpl: options.fetchImpl,
        attempts: options.attempts,
        retryableStatuses: options.retryableStatuses,
        onAttempt: options.onAttempt,
        waitImpl: options.waitImpl,
        isRetryableResponse: (_response, responseBody) => {
          const metaError = responseBody.json?.error
          return metaError?.is_transient === true || retryableMetaErrorCodes.has(metaError?.code)
        },
        label: `WhatsApp target ${target.name}`,
      },
      createTemplatePayload(
        notification,
        target,
        options.assetBaseUrl,
        imageUrl,
        options.capabilities?.messageBudget
      )
    )
  } catch (error) {
    const metaError = error.responseBody?.json?.error
    if (!metaError) {
      throw error
    }
    const details = metaError.error_data?.details || metaError.message || 'No details returned'
    throw wrapRequestError(
      error,
      `WhatsApp target ${target.name} failed with Meta code ${metaError.code}: ${details}`
    )
  }

  return requireJsonSuccess(
    result,
    (body) => typeof body.messages?.[0]?.id === 'string' && body.messages[0].id.length > 0,
    `WhatsApp target ${target.name}`
  )
}
