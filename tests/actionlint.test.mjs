import assert from 'node:assert/strict'
import test from 'node:test'
import { downloadActionlintArchive } from '../bot/verification/Actionlint.mjs'
import { isTransientActFailure } from '../bot/verification/ActFailure.mjs'

test('retries transient actionlint download timeouts without delaying the verifier', async () => {
  const waits = []
  let attempts = 0
  const archive = await downloadActionlintArchive('https://example.com/actionlint.tar.gz', {
    fetchImpl: async () => {
      attempts += 1
      if (attempts === 1) {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
      return new Response('verified archive bytes')
    },
    waitImpl: async (delayMs) => waits.push(delayMs),
  })

  assert.equal(archive.toString(), 'verified archive bytes')
  assert.equal(attempts, 2)
  assert.deepEqual(waits, [1_000])
})

test('fails actionlint download immediately on a permanent HTTP response', async () => {
  let attempts = 0
  await assert.rejects(
    downloadActionlintArchive('https://example.com/missing.tar.gz', {
      fetchImpl: async () => {
        attempts += 1
        return new Response('missing', { status: 404 })
      },
      waitImpl: async () => assert.fail('permanent responses must not wait for a retry'),
    }),
    /after 1 attempt.*HTTP 404/
  )
  assert.equal(attempts, 1)
})

test('classifies network and OrbStack layer failures as transient act infrastructure errors', () => {
  for (const output of [
    'request failed with ETIMEDOUT',
    'TimeoutError: The operation was aborted due to timeout',
    'RWLayer of container abc123 is unexpectedly nil',
  ]) {
    assert.equal(isTransientActFailure({ output }), true)
  }
  assert.equal(isTransientActFailure({ output: 'AssertionError: expected two deliveries' }), false)
})
