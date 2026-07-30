import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createNotificationPayloadGolden } from './support/NotificationPayloadGolden.mjs'

test('notification payloads match every platform and Notification golden', async () => {
  const goldenPath = path.join(process.cwd(), 'tests', 'golden', 'notifications', 'payloads.json')
  const expectedPayloads = JSON.parse(await fs.readFile(goldenPath, 'utf8'))
  const actualPayloads = await createNotificationPayloadGolden()

  assert.deepEqual(actualPayloads, expectedPayloads)
  assert.match(actualPayloads.telegram['escaping-contract'].caption, /&lt;&amp;&gt;/)
  assert.doesNotMatch(actualPayloads.telegram['escaping-contract'].caption, /<tag>/)
  assert.match(actualPayloads['qq-group']['escaping-contract'].markdown.content, /\\\*粗体\\\*/)
  assert.match(JSON.stringify(actualPayloads.feishu['escaping-contract']), /\\\\\*粗体\\\\\*/)
  assert.match(actualPayloads.dingtalk['escaping-contract'].actionCard.text, /\\\*粗体\\\*/)
})
