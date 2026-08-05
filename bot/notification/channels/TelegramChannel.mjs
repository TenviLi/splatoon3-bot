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

const maximumCaptionLength = 1024

function htmlText(value, maximumLength) {
  return escapeHtml(compactText(value, maximumLength))
}

function sectionBlock(section) {
  const details = [
    section.text,
    ...section.listItems.slice(0, 8).map((item) => `• ${item}`),
  ].filter(Boolean).join('\n')
  return [
    `<b>${htmlText(section.title, 120)}</b>`,
    details ? htmlText(details, 320) : null,
  ].filter(Boolean).join('\n')
}

function fitCaptionBlocks(blocks, actionLabel, maximumLength = maximumCaptionLength) {
  const includedBlocks = []
  const overflowNotice = `<i>… ${htmlText(actionLabel, 120)} ↗</i>`

  for (const block of blocks) {
    const candidate = [...includedBlocks, block].join('\n\n')
    if (candidate.length <= maximumLength) {
      includedBlocks.push(block)
      continue
    }

    const withOverflowNotice = [...includedBlocks, overflowNotice].join('\n\n')
    if (withOverflowNotice.length <= maximumLength) {
      includedBlocks.push(overflowNotice)
    }
    break
  }

  return includedBlocks.join('\n\n')
}

function createCaption(notification, maximumLength) {
  const blocks = [
    `<b>${htmlText(notification.title, 180)}</b>`,
    notification.subtitle ? `<blockquote>${htmlText(notification.subtitle, 240)}</blockquote>` : null,
    ...notification.sections.map(sectionBlock),
    ...notification.facts.map(
      (fact) => `• <b>${htmlText(fact.label, 80)}</b>\n${htmlText(fact.value, 240)}`
    ),
    `<i>🦑 ${htmlText(notification.source.name, 160)}</i>`,
  ].filter(Boolean)

  return fitCaptionBlocks(blocks, notification.action.label, maximumLength)
}

export async function deliverTelegram(notification, target, options = {}) {
  const payload = {
    chat_id: target.chatId,
    photo: notification.image.url,
    caption: createCaption(notification, options.capabilities?.messageBudget.captionCharacters),
    parse_mode: 'HTML',
    show_caption_above_media: true,
    disable_notification: target.disableNotification ?? false,
    ...(target.messageThreadId ? { message_thread_id: target.messageThreadId } : {}),
    reply_markup: {
      inline_keyboard: [
        [{ text: compactText(`🖼️ ${notification.action.label}`, 64), url: notification.action.url }],
      ],
    },
  }
  const result = await jsonRequest(
    {
      url: `https://api.telegram.org/bot${target.botToken}/sendPhoto`,
      fetchImpl: options.fetchImpl,
      attempts: options.attempts,
      retryableStatuses: options.retryableStatuses,
      onAttempt: options.onAttempt,
      label: `Telegram target ${target.name}`,
    },
    payload
  )

  return requireJsonSuccess(result, (body) => body.ok === true, `Telegram target ${target.name}`)
}
