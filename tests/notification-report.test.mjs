import assert from 'node:assert/strict'
import test from 'node:test'
import { formatNotificationStepSummary } from '../bot/notification/NotificationReport.mjs'

test('summarizes skipped, shared, and per-Channel notification failures', () => {
  assert.match(
    formatNotificationStepSummary({
      report: { channelResults: [], deliveryResults: [] },
    }),
    /delivery skipped/
  )

  assert.match(
    formatNotificationStepSummary({ failed: true }),
    /failed before Channel delivery; inspect the step log/
  )

  const summary = formatNotificationStepSummary({
    report: {
      channelResults: [
        {
          channelName: 'wecom',
          status: 'rejected',
          results: [],
          error: new Error('Invalid YAML\nconfiguration'),
        },
        {
          channelName: 'discord',
          status: 'blocked',
          results: [],
        },
        {
          channelName: 'telegram',
          status: 'skipped',
          results: [],
        },
      ],
      deliveryResults: [],
      sharedError: new Error('Asset base URL is required'),
    },
  })

  assert.doesNotMatch(summary, /Asset base URL|Invalid YAML/)
  assert.match(summary, /shared preparation failed; inspect the step log/)
  assert.match(summary, /wecom: rejected before delivery; inspect the step log/)
  assert.match(summary, /discord: blocked before delivery/)
  assert.match(summary, /telegram: skipped; no Target selects the chosen Screenshot IDs/)
})
