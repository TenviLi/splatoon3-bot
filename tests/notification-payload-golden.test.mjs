import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createNotificationPayloadGolden } from './support/NotificationPayloadGolden.mjs'

test('notification payloads match every platform and Notification golden', async () => {
  const goldenPath = path.join(process.cwd(), 'tests', 'golden', 'notifications', 'payloads.json')
  const expectedPayloads = JSON.parse(await fs.readFile(goldenPath, 'utf8'))
  const originalTimeZone = process.env.TZ
  let actualPayloads
  let alternateTimeZonePayloads
  try {
    process.env.TZ = 'UTC'
    actualPayloads = await createNotificationPayloadGolden()
    process.env.TZ = 'America/Los_Angeles'
    alternateTimeZonePayloads = await createNotificationPayloadGolden()
  } finally {
    if (originalTimeZone === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = originalTimeZone
    }
  }

  assert.deepEqual(actualPayloads, expectedPayloads)
  assert.deepEqual(alternateTimeZonePayloads, actualPayloads)
  assert.match(actualPayloads.telegram['escaping-contract'].caption, /&lt;&amp;&gt;/)
  assert.doesNotMatch(actualPayloads.telegram['escaping-contract'].caption, /<tag>/)
  assert.match(actualPayloads['qq-group']['escaping-contract'].markdown.content, /\\\*粗体\\\*/)
  assert.match(JSON.stringify(actualPayloads.feishu['escaping-contract']), /\\\\\*粗体\\\\\*/)
  assert.match(actualPayloads.dingtalk['escaping-contract'].actionCard.text, /\\\*粗体\\\*/)
  assert.match(actualPayloads.slack['escaping-contract'].blocks[1].elements[1].text, /&lt;&amp;&gt;/)
  assert.equal(JSON.stringify(actualPayloads.slack['escaping-contract']).includes('action_id'), false)
  assert.equal(actualPayloads.line.schedules.messages[0].contents.hero.aspectMode, 'fit')
  assert.match(
    actualPayloads.whatsapp.schedules.template.components[2].parameters[0].text,
    /^notification-images\/[a-f0-9]{64}\/schedules\.png$/
  )
  assert.equal(actualPayloads.wecom.schedules.template_card.card_image.url.endsWith('/schedules.png'), true)
  assert.equal(actualPayloads.line.schedules.messages[0].contents.hero.url.endsWith('/schedules.png'), true)
})
