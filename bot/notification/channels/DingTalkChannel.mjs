import crypto from 'node:crypto'
import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'

export const dingTalkTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
  secret: z.string().min(1).optional(),
}).strict()

function signedWebhookUrl(target) {
  const url = new URL(target.webhookUrl)
  if (!target.secret) {
    return url
  }

  const timestamp = Date.now()
  const stringToSign = `${timestamp}\n${target.secret}`
  const sign = crypto.createHmac('sha256', target.secret).update(stringToSign).digest('base64')
  url.searchParams.set('timestamp', String(timestamp))
  url.searchParams.set('sign', sign)
  return url
}

function createMarkdown(notification) {
  return [
    `### ${notification.title}`,
    notification.subtitle,
    `> ${notification.source.name}`,
    `![${notification.image.alt}](${notification.image.url})`,
    ...notification.sections.map((section) => `#### ${section.title}\n${section.text || ''}`),
    ...notification.facts.map((fact) => `- **${fact.label}** ${fact.value}`),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export async function deliverDingTalk(notification, target, options = {}) {
  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      title: notification.title,
      text: createMarkdown(notification),
      btnOrientation: '0',
      singleTitle: notification.action.label,
      singleURL: notification.action.url,
    },
  }
  const result = await jsonRequest(
    { url: signedWebhookUrl(target), fetchImpl: options.fetchImpl, label: `DingTalk target ${target.name}` },
    payload
  )

  return requireJsonSuccess(result, (body) => body.errcode === 0, `DingTalk target ${target.name}`)
}
