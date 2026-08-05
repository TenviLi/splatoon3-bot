import crypto from 'node:crypto'
import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'
import { compactText, escapeMarkdown } from '../format.mjs'

export const feishuTargetSchema = z.object({
  name: z.string().min(1),
  webhookUrl: z.url(),
  secret: z.string().min(1).optional(),
}).strict()

function createSignature(timestamp, secret) {
  return crypto.createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64')
}

function markdownElement(content) {
  return { tag: 'markdown', content }
}

function markdownText(value, maximumLength) {
  return escapeMarkdown(compactText(value, maximumLength))
}

function headerTemplate(notification) {
  const templates = {
    schedules: 'turquoise',
    'schedules-regular': 'green',
    'schedules-anarchy': 'orange',
    'schedules-x': 'turquoise',
    challenges: 'purple',
    'salmon-run': 'orange',
    'gear-dailydrop': 'yellow',
    'gear-regular': 'orange',
    'gear-salmon-run': 'orange',
    'splatfest-na': 'purple',
    'splatfest-eu': 'purple',
    'splatfest-jp': 'purple',
    'splatfest-ap': 'purple',
  }
  return templates[notification.sourceScreenshotId || notification.id] || 'blue'
}

function sectionContent(section) {
  return [
    `**${markdownText(section.title, 120)}**`,
    section.text ? markdownText(section.text, 600) : null,
    ...section.listItems.slice(0, 8).map((item) => `• ${markdownText(item, 120)}`),
  ]
    .filter(Boolean)
    .join('\n')
}

function factColumnSet(facts) {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    columns: facts.map((fact) => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [
        markdownElement(`**${markdownText(fact.label, 80)}**\n${markdownText(fact.value, 240)}`),
      ],
    })),
  }
}

export async function deliverFeishu(notification, target, options = {}) {
  const maximumCardBytes = options.capabilities?.messageBudget.cardBytes || 20_000
  const timestamp = Math.floor(Date.now() / 1000)
  const summaryElement = markdownElement(
    [
      notification.subtitle ? `**${markdownText(notification.subtitle, 300)}**` : null,
      `*🦑 ${markdownText(notification.source.name, 160)}*`,
    ]
      .filter(Boolean)
      .join('\n')
  )
  const optionalElementGroups = notification.sections
    .slice(0, 8)
    .map((section) => [markdownElement(sectionContent(section))])

  if (notification.facts.length > 0) {
    const factRows = []
    for (let index = 0; index < Math.min(notification.facts.length, 12); index += 2) {
      factRows.push(factColumnSet(notification.facts.slice(index, index + 2)))
    }
    optionalElementGroups.push([
      ...(optionalElementGroups.length > 0 ? [{ tag: 'hr' }] : []),
      ...factRows,
    ])
  }

  const trailingElements = [
    { tag: 'hr' },
    markdownElement(`[🖼️ ${markdownText(notification.image.alt, 180)}](${notification.image.url})`),
    {
      tag: 'button',
      type: 'primary',
      width: 'fill',
      text: { tag: 'plain_text', content: compactText(notification.action.label, 80) },
      behaviors: [{ type: 'open_url', default_url: notification.action.url }],
    },
  ]
  const cardElements = () => [
    summaryElement,
    ...(optionalElementGroups.length > 0 ? [{ tag: 'hr' }] : []),
    ...optionalElementGroups.flat(),
    ...trailingElements,
  ]

  const payload = {
    ...(target.secret ? { timestamp: String(timestamp), sign: createSignature(timestamp, target.secret) } : {}),
    msg_type: 'interactive',
    card: {
      schema: '2.0',
      config: { wide_screen_mode: true, enable_forward: true },
      header: {
        template: headerTemplate(notification),
        title: { tag: 'plain_text', content: compactText(notification.title, 200) },
      },
      body: {
        direction: 'vertical',
        elements: cardElements(),
      },
    },
  }
  while (Buffer.byteLength(JSON.stringify(payload)) > maximumCardBytes && optionalElementGroups.length > 0) {
    optionalElementGroups.pop()
    payload.card.body.elements = cardElements()
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > maximumCardBytes) {
    throw new Error(`Feishu target ${target.name} card exceeds the ${maximumCardBytes / 1000} KB custom-bot limit`)
  }
  const result = await jsonRequest(
    {
      url: target.webhookUrl,
      fetchImpl: options.fetchImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `Feishu target ${target.name}`,
    },
    payload
  )

  return requireJsonSuccess(
    result,
    (body) => body.code === 0 || body.StatusCode === 0,
    `Feishu target ${target.name}`
  )
}
