import crypto from 'node:crypto'
import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'

export const feishuTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
  secret: z.string().min(1).optional(),
}).strict()

function createSignature(timestamp, secret) {
  return crypto.createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64')
}

function textElement(content) {
  return { tag: 'div', text: { tag: 'lark_md', content } }
}

export async function deliverFeishu(notification, target, options = {}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const elements = [
    textElement(
      [notification.subtitle, `*${notification.source.name}*`].filter(Boolean).join('\n')
    ),
    { tag: 'hr' },
    ...notification.sections.map((section) =>
      textElement(`**${section.title}**${section.text ? `\n${section.text}` : ''}`)
    ),
  ]

  if (notification.facts.length > 0) {
    elements.push({
      tag: 'div',
      fields: notification.facts.map((fact) => ({
        is_short: true,
        text: { tag: 'lark_md', content: `**${fact.label}**\n${fact.value}` },
      })),
    })
  }

  elements.push(
    { tag: 'note', elements: [{ tag: 'plain_text', content: `🖼 ${notification.image.alt}` }] },
    {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          type: 'primary',
          text: { tag: 'plain_text', content: notification.action.label },
          url: notification.action.url,
        },
      ],
    }
  )

  const payload = {
    ...(target.secret ? { timestamp: String(timestamp), sign: createSignature(timestamp, target.secret) } : {}),
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true, enable_forward: true },
      header: {
        template: 'orange',
        title: { tag: 'plain_text', content: notification.title },
      },
      elements,
    },
  }
  const result = await jsonRequest(
    { url: target.webhookUrl, fetchImpl: options.fetchImpl, label: `Feishu target ${target.name}` },
    payload
  )

  return requireJsonSuccess(
    result,
    (body) => body.code === 0 || body.StatusCode === 0,
    `Feishu target ${target.name}`
  )
}
