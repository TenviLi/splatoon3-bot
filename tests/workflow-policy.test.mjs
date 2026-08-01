import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { listChannelAdapters } from '../bot/notification/channels/index.mjs'
import { getRunPlan, listRunProfiles } from '../bot/run/RunPlan.mjs'

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

function scheduledUtcHours(source) {
  const hours = source.match(/^\s+- cron: '0 ([0-9,]+) \* \* \*'$/m)?.[1]
  assert.ok(hours, 'Scheduled workflow must declare static UTC hours')
  return hours.split(',').map(Number)
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

test('CI scans complete Git history with a digest-pinned Gitleaks image', async () => {
  const source = await fs.readFile(path.join(workflowDirectory, 'ci.yml'), 'utf8')
  const readme = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8')
  const imageDefinition = await fs.readFile(
    path.join(process.cwd(), '.github', 'gitleaks', 'Dockerfile'),
    'utf8'
  )
  const dependabot = await fs.readFile(path.join(process.cwd(), '.github', 'dependabot.yml'), 'utf8')
  const localVerification = await fs.readFile(
    path.join(process.cwd(), 'scripts', 'verify_actions.mjs'),
    'utf8'
  )

  assert.match(source, /^  secret-scan:\n/m)
  assert.match(source, /fetch-depth: 0/)
  assert.match(
    imageDefinition,
    /^FROM ghcr\.io\/gitleaks\/gitleaks:v8\.30\.1@sha256:[0-9a-f]{64}\n$/
  )
  assert.match(source, /docker build --tag splatoon3-bot-gitleaks:ci \.github\/gitleaks/)
  assert.match(source, /--gitleaks-ignore-path \/repo\/\.gitleaksignore \/repo/)
  assert.match(dependabot, /directory: \/\.github\/gitleaks/)
  assert.match(localVerification, /const gitleaksImage = 'splatoon3-bot-gitleaks:local'/)
  assert.match(localVerification, /for \(const command of \['git', 'dir'\]\)/)
  assert.match(readme, /scans the complete Git history with a digest-pinned Gitleaks image/)
})

test('GitHub Actions is the only supported hosted automation surface', async () => {
  const readme = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8')

  await assert.rejects(fs.access(path.join(process.cwd(), '.gitlab-ci.yml')), { code: 'ENOENT' })
  assert.match(readme, /GitHub Actions is the only supported hosted automation surface/)
})

test('README provides direct screenshots and three operator-first languages', async () => {
  const english = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8')
  const simplifiedChinese = await fs.readFile(path.join(process.cwd(), 'README.zh-CN.md'), 'utf8')
  const japanese = await fs.readFile(path.join(process.cwd(), 'README.ja.md'), 'utf8')
  const screenshotNames = ['schedules', 'salmon-run', 'gear-dailydrop', 'gear-regular']

  const preview = english.slice(english.indexOf('## Preview'), english.indexOf('## Quick Start'))
  assert.match(preview, /View all four deterministic Screenshot Artifacts/)
  assert.doesNotMatch(preview, /<details>|@锂碘|wxwork-icon|WeCom icon/)

  for (const [filename, source, suffix, primaryChannelSecret] of [
    ['README.md', english, '', 'BOT_DISCORD_CONFIG'],
    ['README.zh-CN.md', simplifiedChinese, '.zh-CN', 'BOT_WECOM_CONFIG'],
    ['README.ja.md', japanese, '.ja', 'BOT_LINE_CONFIG'],
  ]) {
    assert.match(source, /https:\/\/github\.com\/TenviLi\/splatoon3-bot\/fork/, `${filename}: private Fork entry`)
    assert.doesNotMatch(source, /@锂碘|wxwork-icon/, filename)
    for (const screenshotName of screenshotNames) {
      const screenshotPath = `tests/golden/screenshots/linux-x64/${screenshotName}${suffix}.png`
      assert.ok(source.includes(screenshotPath), `${filename}: ${screenshotPath}`)
    }
    for (const configurationName of ['S3_CONFIG', primaryChannelSecret]) {
      assert.ok(source.includes(configurationName), `${filename}: ${configurationName}`)
    }
    assert.doesNotMatch(source, /BOT_BRANDING_CONFIG|SPLATOON_(?:SCHEDULES|SALMON_RUN|GEAR)_BOT_URL/)
  }

  assert.match(english, /README\.zh-CN\.md/)
  assert.match(english, /README\.ja\.md/)
  assert.match(simplifiedChinese, /README\.md/)
  assert.match(simplifiedChinese, /README\.ja\.md/)
  assert.match(japanese, /README\.md/)
  assert.match(japanese, /README\.zh-CN\.md/)

  const quickStart = english.slice(english.indexOf('## Quick Start'), english.indexOf('## Automation'))
  const japaneseQuickStart = japanese.slice(japanese.indexOf('## クイックスタート'), japanese.indexOf('## 自動化'))
  assert.match(quickStart, /You do not need to install Node\.js, pnpm, Chrome, Docker, or a server/)
  assert.match(quickStart, /`BOT_LOCALE` with value `en-US`/)
  assert.match(japaneseQuickStart, /`BOT_LOCALE` を `ja-JP`/)
  assert.match(japaneseQuickStart, /`BOT_TIME_ZONE` を `Asia\/Tokyo`/)
  assert.doesNotMatch(quickStart, /^### Local Development|Node\.js 24 LTS|pnpm 11\.18/m)
  assert.doesNotMatch(english.slice(0, english.indexOf('## Overview')), /Node\.js-24|pnpm-11/)
})

test('workflows never compute secret names dynamically', async () => {
  for (const { filename, source } of await readWorkflows()) {
    assert.doesNotMatch(source, /secrets\s*\[/, filename)
  }
})

test('notification adapters share the publication stage and are enabled by configured Secrets', async () => {
  const reusableWorkflow = await fs.readFile(path.join(workflowDirectory, 'bot-reusable.yml'), 'utf8')
  const readme = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8')
  const allWorkflows = (await readWorkflows()).map(({ source }) => source).join('\n')

  assert.doesNotMatch(allWorkflows, /BOT_NOTIFICATION_CHANNELS|notification_channels/)
  assert.doesNotMatch(reusableWorkflow, /^\s+notify-[^:]+:/gm)
  assert.doesNotMatch(reusableWorkflow, /bot-notify\.yml|strategy:\s*\n\s+matrix:/)
  assert.doesNotMatch(allWorkflows, /UPYUN_|UPX_|upx(?:\s|\.)/i)
  assert.doesNotMatch(allWorkflows, /BOT_BRANDING_CONFIG/)
  assert.match(reusableWorkflow, /^      S3_CONFIG:\n        required: true$/m)
  assert.match(reusableWorkflow, /S3_CONFIG: \$\{\{ secrets\.S3_CONFIG \}\}/)
  assert.match(reusableWorkflow, /BOT_TIME_ZONE: \$\{\{ vars\.BOT_TIME_ZONE \|\| 'Asia\/Shanghai' \}\}/)
  assert.match(reusableWorkflow, /BOT_LOCALE: \$\{\{ vars\.BOT_LOCALE \|\| 'zh-CN' \}\}/)
  assert.match(
    reusableWorkflow,
    /BOT_SCREENSHOT_RESOLUTION: \$\{\{ vars\.BOT_SCREENSHOT_RESOLUTION \|\| '2400x1350' \}\}/
  )
  assert.match(
    reusableWorkflow,
    /BOT_SCREENSHOT_ATTRIBUTION: \$\{\{ vars\.BOT_SCREENSHOT_ATTRIBUTION \|\| 'splatoon3\.ink' \}\}/
  )
  assert.equal(reusableWorkflow.match(/BOT_SCREENSHOT_ATTRIBUTION:/g)?.length, 2)
  assert.equal(reusableWorkflow.match(/BOT_LOCALE:/g)?.length, 2)
  assert.equal(reusableWorkflow.match(/BOT_SCREENSHOT_RESOLUTION:/g)?.length, 2)
  assert.match(reusableWorkflow, /runs-on: \$\{\{ vars\.BOT_RUNNER \|\| 'ubuntu-24\.04' \}\}/)
  assert.match(reusableWorkflow, /environment: \$\{\{ vars\.BOT_ENVIRONMENT \|\| 'production' \}\}/)
  assert.match(
    reusableWorkflow,
    /group: \$\{\{ vars\.BOT_CONCURRENCY_GROUP \|\| 'splatoon3-bot-production' \}\}/
  )
  assert.match(
    reusableWorkflow,
    /retention-days: \$\{\{ vars\.BOT_ARTIFACT_RETENTION_DAYS \|\| '7' \}\}/
  )
  assert.doesNotMatch(reusableWorkflow, /Install Upyun CLI|curl[\s\S]*upyun/i)
  assert.match(readme, /Every Channel Secret must contain a direct, non-empty YAML sequence/)
  assert.match(readme, /Run in Your Own Private Repository/)
  assert.match(readme, /repository is the deployment and trust boundary/)
  assert.match(readme, /public repository forks are always public/)
  assert.match(readme, /Repository Secrets and Variables are intentionally installation-local/)
  assert.doesNotMatch(readme, /github\.com\/TenviLi\/splatoon3-bot\/settings\//)
  for (const variableName of [
    'BOT_TIME_ZONE',
    'BOT_LOCALE',
    'BOT_SCREENSHOT_RESOLUTION',
    'BOT_SCREENSHOT_ATTRIBUTION',
    'BOT_RUNNER',
    'BOT_ENVIRONMENT',
    'BOT_CONCURRENCY_GROUP',
    'BOT_ARTIFACT_RETENTION_DAYS',
  ]) {
    assert.ok(readme.includes(`| \`${variableName}\` |`), `${variableName} must be documented in README.md`)
  }
  assert.doesNotMatch(readme, /```json/)
  assert.equal(reusableWorkflow.match(/Install production dependencies/g)?.length, 1)
  assert.match(reusableWorkflow, /publish:\n[\s\S]*?timeout-minutes: 20/)
  assert.match(reusableWorkflow, /BOT_USE_EXISTING_DATA_SNAPSHOT:/)
  assert.match(reusableWorkflow, /SPLATOON_PUBLIC_DIRECTORY:/)
  assert.match(reusableWorkflow, /Validate Bot configuration/)
  assert.ok(
    reusableWorkflow.indexOf('Validate Bot configuration') < reusableWorkflow.indexOf('Publish through S3'),
    'Bot configuration must be validated before publication side effects'
  )
  assert.match(
    reusableWorkflow,
    /Stage Bot Run for local Actions verification\n\s+if: \$\{\{ env\.ACT == 'true' \}\}/
  )
  assert.match(
    reusableWorkflow,
    /Archive Bot Run\n\s+if: \$\{\{ env\.ACT != 'true' \}\}\n\s+uses: actions\/upload-artifact@/
  )
  assert.match(
    reusableWorkflow,
    /Download Bot Run\n\s+if: \$\{\{ env\.ACT != 'true' \}\}\n\s+uses: actions\/download-artifact@/
  )
  assert.match(
    reusableWorkflow,
    /Restore Bot Run for local Actions verification\n\s+if: \$\{\{ env\.ACT == 'true' \}\}/
  )
  assert.equal(reusableWorkflow.match(/ACT_BOT_RUN_DIRECTORY/g)?.length, 5)

  const localActionsVerifier = await fs.readFile(
    path.join(process.cwd(), 'scripts', 'verify_actions.mjs'),
    'utf8'
  )
  assert.match(localActionsVerifier, /notification-smoke\.yml/)
  assert.match(localActionsVerifier, /Expected five S3 uploads, three branding inspections, and one WeCom delivery/)
  assert.match(localActionsVerifier, /--container-options/)
  assert.match(localActionsVerifier, /ACT_BOT_RUN_DIRECTORY=/)
  assert.match(localActionsVerifier, /shouldRetry: isTransientActFailure/)
  assert.doesNotMatch(localActionsVerifier, /--artifact-server-path/)

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

  for (const filename of [
    'bot-schedules.yml',
    'bot-salmon-run.yml',
    'bot-manual.yml',
    'notification-smoke.yml',
    'configuration-check.yml',
  ]) {
    const source = await fs.readFile(path.join(workflowDirectory, filename), 'utf8')
    assert.ok(source.includes('S3_CONFIG: ${{ secrets.S3_CONFIG }}'), `${filename}: S3_CONFIG Secret`)
    for (const channel of channels) {
      const secretName = channel.configurationEnvironmentVariable
      const secretReference = `${secretName}: ` + '${{ secrets.' + secretName + ' }}'
      assert.ok(source.includes(secretReference), `${filename}: ${secretReference}`)
    }
  }

  const configurationCheckWorkflow = await fs.readFile(
    path.join(workflowDirectory, 'configuration-check.yml'),
    'utf8'
  )
  assert.match(
    configurationCheckWorkflow,
    /BOT_SCREENSHOT_ATTRIBUTION: \$\{\{ vars\.BOT_SCREENSHOT_ATTRIBUTION \|\| 'splatoon3\.ink' \}\}/
  )
  assert.match(
    configurationCheckWorkflow,
    /BOT_LOCALE: \$\{\{ vars\.BOT_LOCALE \|\| 'zh-CN' \}\}/
  )
  assert.match(
    configurationCheckWorkflow,
    /BOT_SCREENSHOT_RESOLUTION: \$\{\{ vars\.BOT_SCREENSHOT_RESOLUTION \|\| '2400x1350' \}\}/
  )

  const smokeWorkflow = await fs.readFile(path.join(workflowDirectory, 'notification-smoke.yml'), 'utf8')
  assert.deepEqual(
    workflowDispatchChoiceOptions(smokeWorkflow, 'channel'),
    channels.map(({ name }) => name),
    'Notification smoke choices must match the Channel adapter registry'
  )

  const capabilities = await fs.readFile(
    path.join(process.cwd(), 'docs', 'notification-platform-capabilities.md'),
    'utf8'
  )
  for (const channel of channels) {
    assert.match(
      capabilities,
      new RegExp(`^## .*\\b${channel.name}\\b`, 'im'),
      `${channel.name} must have a platform-capability section`
    )
  }

  const profileNames = listRunProfiles().map(({ name }) => name)
  for (const filename of ['bot-manual.yml', 'notification-smoke.yml', 'configuration-check.yml']) {
    const source = await fs.readFile(path.join(workflowDirectory, filename), 'utf8')
    assert.deepEqual(
      workflowDispatchChoiceOptions(source, 'profile'),
      profileNames,
      `${filename} Profile choices must match the Run Profile registry`
    )
  }
})

test('daily twice workflow delivers every Notification', async () => {
  const dailyWorkflow = await fs.readFile(path.join(workflowDirectory, 'bot-salmon-run.yml'), 'utf8')
  const schedulesWorkflow = await fs.readFile(path.join(workflowDirectory, 'bot-schedules.yml'), 'utf8')
  const profileName = dailyWorkflow.match(/^      profile: ([a-z0-9-]+)$/m)?.[1]
  assert.ok(profileName, 'bot-salmon-run.yml must select a static Run Profile')

  assert.deepEqual(getRunPlan(profileName).notifications, [
    'schedules',
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
  ])

  const dailyHours = scheduledUtcHours(dailyWorkflow)
  const schedulesHours = scheduledUtcHours(schedulesWorkflow)
  assert.deepEqual(dailyHours, [2, 10])
  assert.deepEqual(
    [...dailyHours, ...schedulesHours].sort((left, right) => left - right),
    Array.from({ length: 12 }, (_, index) => index * 2),
    'Scheduled entry workflows must deliver schedules exactly once every two hours'
  )
})
