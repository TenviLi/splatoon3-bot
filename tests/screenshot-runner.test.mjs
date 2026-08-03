import assert from 'node:assert/strict'
import test from 'node:test'
import { createScreenshotReadinessTimeoutError } from '../bot/screenshot/ScreenshotRunner.mjs'

test('readiness timeouts preserve actionable browser diagnostics', () => {
  const cause = new Error('wait failed')
  const error = createScreenshotReadinessTimeoutError({
    screenshotName: 'challenges',
    timeoutMs: 20_000,
    pageErrors: ['render exploded'],
    failedRequests: ['https://example.com/image.png: net::ERR_FAILED'],
    readinessState: {
      marker: 'missing',
      fontStatus: 'loading',
      incompleteImages: ['https://example.com/image.png'],
    },
    cause,
  })

  assert.equal(error.cause, cause)
  assert.equal(
    error.message,
    'Screenshot challenges did not become ready within 20000ms:\n' +
      '- render exploded\n' +
      '- https://example.com/image.png: net::ERR_FAILED\n' +
      '- ready marker is missing\n' +
      '- fonts are loading\n' +
      '- image is incomplete: https://example.com/image.png'
  )
})
