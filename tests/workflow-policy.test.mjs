import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { listChannelAdapters } from '../bot/notification/channels/index.mjs'

const workflowDirectory = path.join(process.cwd(), '.github', 'workflows')

async function readWorkflows() {
  const filenames = (await fs.readdir(workflowDirectory))
    .filter((filename) => filename.endsWith('.yml') || filename.endsWith('.yaml'))
    .sort()

  return Promise.all(
    filenames.map(async (filename) => ({
      filename,
      source: await fs.readFile(path.join(workflowDirectory, filename), 'utf8'),
    }))
  )
}

function workflowDispatchChoiceOptions(source, inputName) {
  const inputStart = source.search(new RegExp(`^      ${inputName}:[ \\t]*$`, 'm'))
  assert.notEqual(inputStart, -1, `Missing workflow_dispatch input ${inputName}`)
  const followingSource = source.slice(inputStart)
  const nextInput = followingSource.slice(1).search(/^      [a-z_]+:[ \t]*$/m)
  const inputBlock = nextInput === -1 ? followingSource : followingSource.slice(0, nextInput + 1)
  const options = inputBlock.match(/^          - ([a-z0-9-]+)[ \t]*$/gm) || []
  return options.map((line) => line.replace(/^\s*-\s*/, '').trim())
}

test('remote actions use immutable commit references', async () => {
  for (const { filename, source } of await readWorkflows()) {
    for (const match of source.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
      const reference = match[1]
      if (reference.startsWith('./')) {
        continue
      }

      assert.match(reference, /@[0-9a-f]{40}$/, `${filename}: ${reference}`)
    }
  }
})

test('workflows never compute secret names dynamically', async () => {
  for (const { filename, source } of await readWorkflows()) {
    assert.doesNotMatch(source, /secrets\s*\[/, filename)
  }
})

test('notification adapters share the publish job and are enabled by configured Secrets', async () => {
  const reusableWorkflow = await fs.readFile(path.join(workflowDirectory, 'bot-reusable.yml'), 'utf8')
  const readme = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8')
  const allWorkflows = (await readWorkflows()).map(({ source }) => source).join('\n')

  assert.doesNotMatch(allWorkflows, /BOT_NOTIFICATION_CHANNELS|notification_channels/)
  assert.doesNotMatch(reusableWorkflow, /^\s+notify-[^:]+:/gm)
  assert.doesNotMatch(reusableWorkflow, /bot-notify\.yml|strategy:\s*\n\s+matrix:/)
  assert.doesNotMatch(allWorkflows, /vars\.UPYUN_DOMAIN/)
  assert.match(reusableWorkflow, /UPYUN_DOMAIN: \$\{\{ secrets\.UPYUN_DOMAIN \}\}/)
  assert.equal(reusableWorkflow.match(/Install production dependencies/g)?.length, 1)
  assert.match(reusableWorkflow, /publish:\n[\s\S]*?timeout-minutes: 20/)

  const channels = listChannelAdapters()
  for (const channel of channels) {
    const secretName = channel.configurationEnvironmentVariable
    const secretReference = `${secretName}: ` + '${{ secrets.' + secretName + ' }}'
    assert.match(
      reusableWorkflow,
      new RegExp(`^      ${secretName}:\\n        required: false$`, 'm'),
      `${secretName} must be an optional workflow_call Secret`
    )
    assert.ok(reusableWorkflow.includes(secretReference), secretReference)
    assert.ok(readme.includes(`| \`${secretName}\` |`), `${secretName} must be documented in README.md`)
  }

  for (const filename of ['bot-schedules.yml', 'bot-salmon-run.yml', 'bot-manual.yml', 'notification-smoke.yml']) {
    const source = await fs.readFile(path.join(workflowDirectory, filename), 'utf8')
    for (const channel of channels) {
      const secretName = channel.configurationEnvironmentVariable
      const secretReference = `${secretName}: ` + '${{ secrets.' + secretName + ' }}'
      assert.ok(source.includes(secretReference), `${filename}: ${secretReference}`)
    }
  }

  const smokeWorkflow = await fs.readFile(path.join(workflowDirectory, 'notification-smoke.yml'), 'utf8')
  assert.deepEqual(
    workflowDispatchChoiceOptions(smokeWorkflow, 'channel'),
    channels.map(({ name }) => name),
    'Notification smoke choices must match the Channel adapter registry'
  )
})
