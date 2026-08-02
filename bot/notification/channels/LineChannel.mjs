import crypto from 'node:crypto'
import { z } from 'zod'
import { jsonRequest } from '../HttpTransport.mjs'
import { inspectRemoteImage } from '../RemoteImageInspector.mjs'
import { compactText } from '../format.mjs'

export const lineTargetSchema = z.object({
  name: z.string().min(1),
  channelAccessToken: z.string().min(1),
  targetType: z.enum(['user', 'group', 'room']),
  targetId: z.string().min(2),
  notificationDisabled: z.boolean().optional(),
}).strict().superRefine((target, context) => {
  const expectedPrefix = { user: 'U', group: 'C', room: 'R' }[target.targetType]
  if (!target.targetId.startsWith(expectedPrefix)) {
    context.addIssue({
      code: 'custom',
      path: ['targetId'],
      message: `LINE ${target.targetType} targetId must start with ${expectedPrefix}`,
    })
  }
})

const maximumBubbleBytes = 30_000
const maximumImageBytes = 10 * 1024 * 1024

function accentColor(notification) {
  return `#${notification.accentColor.toString(16).padStart(6, '0').toUpperCase()}`
}

function sectionContents(section, color) {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      { type: 'text', text: compactText(section.title, 120), weight: 'bold', size: 'sm', color, wrap: true },
      ...(section.text
        ? [{ type: 'text', text: compactText(section.text, 500), size: 'sm', color: '#333333', wrap: true }]
        : []),
      ...section.listItems.slice(0, 8).map((item) => ({
        type: 'text',
        text: `• ${compactText(item, 160)}`,
        size: 'sm',
        color: '#333333',
        wrap: true,
      })),
    ],
  }
}

function factContents(fact) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    contents: [
      { type: 'text', text: compactText(fact.label, 80), size: 'sm', color: '#888888', flex: 2, wrap: true },
      {
        type: 'text',
        text: compactText(fact.value, 240),
        size: 'sm',
        color: '#222222',
        flex: 5,
        align: 'end',
        wrap: true,
      },
    ],
  }
}

function requireHttpsUrl(value, maximumLength, label) {
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    throw new Error(`LINE ${label} must use HTTPS`)
  }
  if (url.toString().length > maximumLength) {
    throw new Error(`LINE ${label} exceeds ${maximumLength} characters`)
  }
  return url.toString()
}

function validateImageMetadata(metadata) {
  if (!['png', 'jpeg'].includes(metadata.format)) {
    throw new Error('LINE image must be PNG or JPEG')
  }
  if (metadata.width > 1_024 || metadata.height > 1_024) {
    throw new Error(`LINE image is ${metadata.width}x${metadata.height}, exceeding the 1024x1024 limit`)
  }
  if (metadata.bytes > maximumImageBytes) {
    throw new Error(`LINE image is ${metadata.bytes} bytes, exceeding the 10 MB limit`)
  }
}

function createFlexMessage(notification, imageUrl) {
  const color = accentColor(notification)
  const actionUrl = requireHttpsUrl(notification.action.url, 1_000, 'action URL')
  const detailContents = [
    ...notification.sections.slice(0, 8).map((section) => sectionContents(section, color)),
    ...notification.facts.slice(0, 12).map(factContents),
  ]
  const createBubble = () => ({
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '18px',
      backgroundColor: color,
      contents: [
        {
          type: 'text',
          text: compactText(`🦑 ${notification.source.name}`, 120),
          size: 'xs',
          color: '#FFFFFF',
          wrap: true,
        },
        {
          type: 'text',
          text: compactText(notification.title, 160),
          weight: 'bold',
          size: 'xl',
          color: '#FFFFFF',
          wrap: true,
        },
      ],
    },
    hero: {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectRatio: '16:9',
      aspectMode: 'fit',
      backgroundColor: '#111111',
      action: { type: 'uri', label: compactText(notification.action.label, 40), uri: actionUrl },
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        ...(notification.subtitle
          ? [
              {
                type: 'text',
                text: compactText(notification.subtitle, 240),
                size: 'sm',
                color: '#777777',
                wrap: true,
              },
            ]
          : []),
        ...(detailContents.length > 0
          ? [
              ...(notification.subtitle ? [{ type: 'separator', margin: 'lg' }] : []),
              ...detailContents,
            ]
          : []),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color,
          height: 'sm',
          action: { type: 'uri', label: compactText(notification.action.label, 40), uri: actionUrl },
        },
      ],
    },
  })
  let bubble = createBubble()
  while (Buffer.byteLength(JSON.stringify(bubble)) > maximumBubbleBytes && detailContents.length > 0) {
    detailContents.pop()
    bubble = createBubble()
  }
  if (Buffer.byteLength(JSON.stringify(bubble)) > maximumBubbleBytes) {
    throw new Error(`LINE Flex bubble exceeds the ${maximumBubbleBytes / 1000} KB limit`)
  }

  return {
    type: 'flex',
    altText: compactText(
      [notification.title, notification.subtitle || notification.source.name, notification.action.label].join(' · '),
      400
    ),
    contents: bubble,
  }
}

export async function deliverLine(notification, target, options = {}) {
  const imageUrl = requireHttpsUrl(notification.image.variants.line.url, 2_000, 'image URL')
  const imageMetadata = await (options.inspectImage || inspectRemoteImage)(imageUrl, {
    fetchImpl: options.fetchImpl,
    maximumBytes: maximumImageBytes,
  })
  validateImageMetadata(imageMetadata)
  const payload = {
    to: target.targetId,
    messages: [createFlexMessage(notification, imageUrl)],
    notificationDisabled: target.notificationDisabled ?? false,
  }

  try {
    return await jsonRequest(
      {
        url: 'https://api.line.me/v2/bot/message/push',
        headers: {
          Authorization: `Bearer ${target.channelAccessToken}`,
          'X-Line-Retry-Key': options.retryKey || crypto.randomUUID(),
        },
        fetchImpl: options.fetchImpl,
        label: `LINE target ${target.name}`,
      },
      payload
    )
  } catch (error) {
    const acceptedRequestId = error.responseHeaders?.get('x-line-accepted-request-id')
    if (error.status === 409 && acceptedRequestId) {
      return Object.freeze({ status: 409, duplicate: true, acceptedRequestId })
    }
    const requestId = error.responseHeaders?.get('x-line-request-id')
    throw new Error(`${error.message}${requestId ? ` (LINE request ${requestId})` : ''}`, { cause: error })
  }
}
