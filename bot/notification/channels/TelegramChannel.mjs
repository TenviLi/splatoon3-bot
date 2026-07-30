import { z } from 'zod'
import { jsonRequest, requireJsonSuccess } from '../HttpTransport.mjs'
import { compactText, escapeHtml } from '../format.mjs'

export const telegramTargetSchema = z.object({
  name: z.string().min(1),
  botToken: z.string().min(1),
  chatId: z.union([z.string().min(1), z.number().int()]),
  messageThreadId: z.number().int().positive().optional(),
  disableNotification: z.boolean().optional(),
}).strict()

function createCaption(notification) {
  const blocks = [
    `<b>${escapeHtml(notification.title)}</b>`,
    notification.subtitle ? escapeHtml(notification.subtitle) : null,
    `<i>${escapeHtml(notification.source.name)}</i>`,
    ...notification.sections.map(
      (section) => `<b>${escapeHtml(section.title)}</b>${section.text ? `\n${escapeHtml(section.text)}` : ''}`
    ),
    ...notification.facts.map((fact) => `<b>${escapeHtml(fact.label)}</b> ${escapeHtml(fact.value)}`),
  ].filter(Boolean)

  return compactText(blocks.join('\n\n'), 1024)
}

export async function deliverTelegram(notification, target, options = {}) {
  const payload = {
    chat_id: target.chatId,
    photo: notification.image.url,
    caption: createCaption(notification),
    parse_mode: 'HTML',
    show_caption_above_media: true,
    disable_notification: target.disableNotification ?? false,
    ...(target.messageThreadId ? { message_thread_id: target.messageThreadId } : {}),
    reply_markup: {
      inline_keyboard: [[{ text: notification.action.label, url: notification.action.url }]],
    },
  }
  const result = await jsonRequest(
    {
      url: `https://api.telegram.org/bot${target.botToken}/sendPhoto`,
      fetchImpl: options.fetchImpl,
      label: `Telegram target ${target.name}`,
    },
    payload
  )

  return requireJsonSuccess(result, (body) => body.ok === true, `Telegram target ${target.name}`)
}
