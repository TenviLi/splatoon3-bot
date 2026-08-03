import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { prepareNotificationChannelConfiguration } from '../bot/notification/NotificationConfiguration.mjs'
import { listChannelAdapters } from '../bot/notification/channels/index.mjs'
import {
  listScreenshotDefinitions,
  resolveRunPlan,
} from '../bot/run/RunPlan.mjs'
import { supportedBotLocales } from '../src/common/botLocale.mjs'

const workflowDirectory = path.join(process.cwd(), '.github', 'workflows')
const repositoryVariables = Object.freeze([
  'BOT_TIME_ZONE',
  'BOT_LOCALE',
  'BOT_SCREENSHOT_RESOLUTION',
  'BOT_SCREENSHOT_ATTRIBUTION',
  'BOT_RUNNER',
  'BOT_ARTIFACT_RETENTION_DAYS',
])
const s3ProviderDocumentationUrls = Object.freeze([
  'https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html#creating-bucket',
  'https://developers.cloudflare.com/r2/get-started/',
  'https://www.backblaze.com/docs/cloud-storage-s3-compatible-api',
  'https://docs.digitalocean.com/products/spaces/reference/s3-compatibility/',
  'https://docs.wasabi.com/docs/service-urls-for-wasabis-storage-regions',
  'https://www.scaleway.com/en/docs/object-storage/api-cli/object-storage-aws-cli/',
  'https://www.tigrisdata.com/docs/sdks/s3/',
  'https://docs.min.io/aistor/reference/cli/mc-mb/',
  'https://www.alibabacloud.com/help/en/oss/developer-reference/compatibility-with-amazon-s3',
  'https://www.tencentcloud.com/document/product/436/41284',
  'https://help.upyun.com/knowledge-base/aws-s3%E5%85%BC%E5%AE%B9/',
])

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

function workflowInputBlock(source, inputName) {
  const inputStart = source.search(new RegExp(`^      ${inputName}:[ \\t]*$`, 'm'))
  assert.notEqual(inputStart, -1, `Missing workflow input ${inputName}`)
  const followingSource = source.slice(inputStart)
  const nextInput = followingSource.slice(1).search(/^      [a-z_]+:[ \t]*$/m)
  return nextInput === -1 ? followingSource : followingSource.slice(0, nextInput + 1)
}

function workflowDispatchChoiceOptions(source, inputName) {
  const inputBlock = workflowInputBlock(source, inputName)
  const options = inputBlock.match(/^          - ([a-z0-9-]+)[ \t]*$/gm) || []
  return options.map((line) => line.replace(/^\s*-\s*/, '').trim())
}

function assertBooleanSelectionInput(source, inputName, expectedDefault) {
  const inputBlock = workflowInputBlock(source, inputName)
  assert.match(inputBlock, /^        description: '.+'$/m, `${inputName} description`)
  assert.doesNotMatch(
    inputBlock,
    /description: 'Screenshot ID /,
    `${inputName} description must not repeat the form field concept`
  )
  assert.match(inputBlock, /^        type: boolean$/m, `${inputName} must render as a checkbox`)
  assert.match(
    inputBlock,
    new RegExp(`^        default: ${expectedDefault}$`, 'm'),
    `${inputName} default`
  )
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
  const gitleaksConfiguration = await fs.readFile(path.join(process.cwd(), '.gitleaks.toml'), 'utf8')
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
  assert.match(source, /--config \/repo\/\.gitleaks\.toml/)
  assert.match(source, /--gitleaks-ignore-path \/repo\/\.gitleaksignore \/repo/)
  assert.match(gitleaksConfiguration, /^\[extend\]\nuseDefault = true$/m)
  for (const directory of ['node_modules', 'dist', '\\.cache', '\\.pnpm-store']) {
    assert.ok(gitleaksConfiguration.includes(directory), `.gitleaks.toml must exclude ${directory}`)
  }
  assert.match(dependabot, /directory: \/\.github\/gitleaks/)
  assert.match(localVerification, /const gitleaksImage = 'splatoon3-bot-gitleaks:local'/)
  assert.match(localVerification, /for \(const command of \['git', 'dir'\]\)/)
  assert.match(localVerification, /'--config',\n\s+'\/repo\/\.gitleaks\.toml'/)
  assert.match(readme, /scans the complete Git history with a digest-pinned Gitleaks image/)
})

test('GitHub Actions is the only supported hosted automation surface', async () => {
  const readme = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8')

  await assert.rejects(fs.access(path.join(process.cwd(), '.gitlab-ci.yml')), { code: 'ENOENT' })
  assert.match(readme, /GitHub Actions is the only supported hosted automation surface/)
})

test('public template ships community health and third-party attribution', async () => {
  const packageMetadata = JSON.parse(await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8'))
  const contributing = await fs.readFile(path.join(process.cwd(), 'CONTRIBUTING.md'), 'utf8')
  const security = await fs.readFile(path.join(process.cwd(), 'SECURITY.md'), 'utf8')
  const notices = await fs.readFile(path.join(process.cwd(), 'THIRD_PARTY_NOTICES.md'), 'utf8')
  const context = await fs.readFile(path.join(process.cwd(), 'CONTEXT.md'), 'utf8')
  const editorConfig = await fs.readFile(path.join(process.cwd(), '.editorconfig'), 'utf8')

  assert.equal(packageMetadata.private, true)
  assert.equal(packageMetadata.repository.url, 'git+https://github.com/TenviLi/splatoon3-bot.git')
  assert.equal(packageMetadata.bugs.url, 'https://github.com/TenviLi/splatoon3-bot/issues')
  assert.match(contributing, /pnpm run verify/)
  assert.match(contributing, /SECURITY\.md/)
  assert.match(security, /private vulnerability reporting/)
  assert.match(security, /Repository Secrets/)
  assert.match(notices, /Copyright \(c\) 2022 Matt Isenhower/)
  assert.match(notices, /The above copyright notice and this permission notice shall be included/)
  assert.match(context, /\*\*Screenshot ID\*\*/)
  assert.match(context, /\*\*Run Selection\*\*/)
  assert.match(context, /\*\*Run Plan\*\*/)
  assert.doesNotMatch(context, /Content Group/)
  assert.doesNotMatch(context, /^\*\*Run Profile\*\*:/m)
  assert.match(editorConfig, /^root = true$/m)
  assert.match(editorConfig, /^end_of_line = lf$/m)

  for (const filename of ['README.md', 'README.zh-CN.md', 'README.ja.md']) {
    const source = await fs.readFile(path.join(process.cwd(), filename), 'utf8')
    assert.match(source, /THIRD_PARTY_NOTICES\.md/, `${filename}: third-party notices`)
    assert.match(source, /misenhower\/splatoon3\.ink/, `${filename}: upstream attribution`)
    assert.match(source, /CONTRIBUTING\.md/, `${filename}: contributing guide`)
    assert.match(source, /SECURITY\.md/, `${filename}: security policy`)
  }

  for (const filename of [
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/ISSUE_TEMPLATE/bug-report.yml',
    '.github/ISSUE_TEMPLATE/feature-request.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
  ]) {
    await fs.access(path.join(process.cwd(), filename))
  }
})

test('README provides direct screenshots and three operator-first languages', async () => {
  const english = await fs.readFile(path.join(process.cwd(), 'README.md'), 'utf8')
  const simplifiedChinese = await fs.readFile(path.join(process.cwd(), 'README.zh-CN.md'), 'utf8')
  const japanese = await fs.readFile(path.join(process.cwd(), 'README.ja.md'), 'utf8')
  const operatorGuide = await fs.readFile(path.join(process.cwd(), 'docs/operator-setup-links.md'), 'utf8')
  const screenshotNames = listScreenshotDefinitions().map(({ name }) => name)

  const onboardingGuide = english.slice(english.indexOf('## Quick Start'), english.indexOf('## Preview'))
  const preview = english.slice(english.indexOf('## Preview'), english.indexOf('## Automation'))
  assert.ok(english.indexOf('## Quick Start') < english.indexOf('## Preview'))
  assert.match(onboardingGuide, /Step 1 — Create your Private installation/)
  assert.match(onboardingGuide, /Step 5 — Check configuration without uploading or sending/)
  assert.match(onboardingGuide, /Step 6 — Send one real smoke test/)
  assert.match(onboardingGuide, /Step 7 — Confirm scheduled delivery/)
  assert.match(onboardingGuide, /Configuration is ready/)
  assert.match(onboardingGuide, /default `schedules` Screenshot ID/)
  assert.match(preview, /All thirteen Screenshot IDs/)
  assert.match(preview, /Screenshot ID/)
  assert.doesNotMatch(preview, /Content Group/)
  assert.doesNotMatch(preview, /<details>|@锂碘|wxwork-icon|WeCom icon/)

  for (const [filename, source, locale, primaryChannelSecret] of [
    ['README.md', english, 'en-US', 'BOT_DISCORD_CONFIG'],
    ['README.zh-CN.md', simplifiedChinese, 'zh-CN', 'BOT_WECOM_CONFIG'],
    ['README.ja.md', japanese, 'ja-JP', 'BOT_LINE_CONFIG'],
  ]) {
    assert.match(
      source,
      /https:\/\/github\.com\/TenviLi\/splatoon3-bot\/generate/,
      `${filename}: template repository entry`
    )
    assert.match(source, /Use this template/, `${filename}: GitHub template action`)
    assert.match(source, /Create a new repository/, `${filename}: GitHub template creation flow`)
    assert.doesNotMatch(
      source,
      /splatoon3-bot\/fork|GitHub Importer|private mirror|公开仓库的 Fork|Public repository の Fork/,
      `${filename}: obsolete Fork installation flow`
    )
    assert.doesNotMatch(
      source,
      /keep all thirteen|保持全部十三个.*勾选|13 個すべて.*選択/,
      `${filename}: configuration check must not describe removed Screenshot ID inputs`
    )
    assert.doesNotMatch(source, /@锂碘|wxwork-icon/, filename)
    for (const screenshotName of screenshotNames) {
      const screenshotPath = `tests/golden/screenshots/linux-x64/${locale}/${screenshotName}.png`
      assert.ok(source.includes(screenshotPath), `${filename}: ${screenshotPath}`)
      assert.ok(source.includes(`<code>${screenshotName}</code>`), `${filename}: Screenshot ID ${screenshotName}`)
    }
    assert.doesNotMatch(source, /\.(?:ja|zh-CN)\.png/, `${filename}: locale suffix in screenshot filename`)
    for (const configurationName of ['S3_CONFIG', primaryChannelSecret]) {
      assert.ok(source.includes(configurationName), `${filename}: ${configurationName}`)
    }
    assert.doesNotMatch(source, /BOT_BRANDING_CONFIG|SPLATOON_(?:SCHEDULES|SALMON_RUN|GEAR)_BOT_URL/)
  }

  for (const [filename, source, pathHeading, contributingHeading, providerSummary] of [
    ['README.md', english, '### Where to go next', '## Contributing', 'Choose a provider: official setup links'],
    [
      'README.zh-CN.md',
      simplifiedChinese,
      '### 接下来可以做什么',
      '## 参与贡献',
      '选择服务商：官方配置入口',
    ],
    ['README.ja.md', japanese, '### 次にできること', '## コントリビューション', 'サービスを選ぶ：公式設定リンク'],
  ]) {
    assert.ok(source.includes(pathHeading), `${filename}: audience path guide`)
    assert.ok(source.includes(contributingHeading), `${filename}: contributor path`)
    assert.ok(source.includes(`<summary><strong>${providerSummary}</strong></summary>`), `${filename}: progressive S3 links`)
    assert.ok(
      source.indexOf('accessKeyId: your-s3-access-key') < source.indexOf(providerSummary),
      `${filename}: copy-ready S3 configuration precedes provider directory`
    )
    assert.ok(
      source.includes('git clone https://github.com/YOUR_GITHUB_USERNAME/splatoon3-bot.git'),
      `${filename}: contributor-friendly HTTPS clone`
    )
    assert.doesNotMatch(source, /side-effecting|副作用|Hosted 運用/, `${filename}: avoid operator-facing jargon`)
  }

  for (const [filename, source, headings, completionMarker] of [
    [
      'README.md',
      english,
      ['## Quick Start', '### Step 1', '### Step 2', '### Step 3', '### Step 4', '### Step 5', '### Step 6', '### Step 7', '## Preview'],
      '**Done when:**',
    ],
    [
      'README.zh-CN.md',
      simplifiedChinese,
      ['## 快速开始', '### Step 1', '### Step 2', '### Step 3', '### Step 4', '### Step 5', '### Step 6', '### Step 7', '## 截图预览'],
      '**完成标志：**',
    ],
    [
      'README.ja.md',
      japanese,
      ['## クイックスタート', '### Step 1', '### Step 2', '### Step 3', '### Step 4', '### Step 5', '### Step 6', '### Step 7', '## スクリーンショット'],
      '**完了条件：**',
    ],
  ]) {
    let previousIndex = -1
    for (const heading of headings) {
      const headingIndex = source.indexOf(heading, previousIndex + 1)
      assert.ok(headingIndex > previousIndex, `${filename}: ${heading} must follow the previous onboarding step`)
      previousIndex = headingIndex
    }
    assert.equal(
      source.match(new RegExp(completionMarker.replaceAll('*', '\\*'), 'g'))?.length,
      7,
      `${filename}: every Quick Start step needs one completion marker`
    )
  }

  assert.match(english, /README\.zh-CN\.md/)
  assert.match(english, /README\.ja\.md/)
  assert.match(simplifiedChinese, /README\.md/)
  assert.match(simplifiedChinese, /README\.ja\.md/)
  assert.match(japanese, /README\.md/)
  assert.match(japanese, /README\.zh-CN\.md/)
  const operatorReadmes = [
    ['README.md', english, 'No'],
    ['README.zh-CN.md', simplifiedChinese, '否'],
    ['README.ja.md', japanese, 'いいえ'],
  ]
  for (const [filename, source] of operatorReadmes) {
    assert.doesNotMatch(source, /\bpipeline\b|流水线|パイプライン/iu, `${filename}: use Bot Run terminology`)
  }
  for (const locale of supportedBotLocales) {
    for (const [filename, source] of operatorReadmes) {
      assert.ok(source.includes(`| \`${locale}\` |`), `${filename}: missing BOT_LOCALE value ${locale}`)
    }
  }
  for (const { name } of listScreenshotDefinitions()) {
    for (const [filename, source] of operatorReadmes) {
      assert.ok(source.includes(`| \`${name}\` |`), `${filename}: missing selectable Screenshot ID ${name}`)
    }
  }
  for (const { name } of listScreenshotDefinitions()) {
    for (const [filename, source] of operatorReadmes) {
      assert.ok(source.includes(`<code>${name}</code>`), `${filename}: missing Screenshot ID ${name}`)
    }
  }
  for (const variableName of repositoryVariables) {
    for (const [filename, source, optionalMarker] of operatorReadmes) {
      assert.match(
        source,
        new RegExp('^\\| `' + variableName + '` \\| ' + optionalMarker + ' \\|', 'm'),
        `${filename}: ${variableName} must be documented as optional`
      )
    }
  }
  for (const [filename, source] of operatorReadmes) {
    assert.equal(
      source.match(/^```mermaid$/gm)?.length,
      2,
      `${filename}: automation and S3 publication diagrams`
    )
    assert.equal(
      source.match(/^flowchart LR$/gm)?.length,
      2,
      `${filename}: left-to-right Mermaid workflows`
    )
    assert.match(source, /^#### `BOT_LOCALE`$/m, `${filename}: dedicated BOT_LOCALE table`)
    assert.match(source, /^#### `BOT_SCREENSHOT_RESOLUTION`$/m, `${filename}: dedicated resolution table`)
    assert.match(source, /GitHub Artifact/, `${filename}: why public object storage is required`)
    assert.match(source, /`notification-images\/<sha256>\/`/, `${filename}: primary image objects`)
    assert.match(source, /`line-images\/<sha256>\/`/, `${filename}: LINE image objects`)
    assert.match(source, /`whatsapp-images\/<sha256>\/`/, `${filename}: WhatsApp image objects`)
    assert.match(source, /`originals\/<sha256>\/`/, `${filename}: original image objects`)
    assert.match(source, /`branding-icons\/<sha256>\/`/, `${filename}: branding icon objects`)
    assert.match(source, /`1024×576`/, `${filename}: platform image dimensions`)
    assert.match(source, /`1024×1024`/, `${filename}: LINE hard image dimensions`)
    assert.match(source, /`1 MB`/, `${filename}: LINE recommended image size`)
    for (const documentationUrl of s3ProviderDocumentationUrls) {
      assert.ok(source.includes(documentationUrl), `${filename}: missing S3 provider ${documentationUrl}`)
    }
  }
  const documentedTargetFields = Object.freeze({
    BOT_WECOM_CONFIG: ['name', 'webhookUrl'],
    BOT_DISCORD_CONFIG: ['name', 'webhookUrl', 'username', 'avatarUrl'],
    BOT_TELEGRAM_CONFIG: ['name', 'botToken', 'chatId', 'messageThreadId', 'disableNotification'],
    BOT_QQ_CONFIG: ['name', 'appId', 'clientSecret', 'targetType', 'group', 'user', 'targetId'],
    BOT_FEISHU_CONFIG: ['name', 'webhookUrl', 'secret'],
    BOT_DINGTALK_CONFIG: ['name', 'webhookUrl', 'secret'],
    BOT_WHATSAPP_CONFIG: [
      'name',
      'accessToken',
      'phoneNumberId',
      'recipientPhoneNumber',
      'templateName',
      'languageCode',
    ],
    BOT_LINE_CONFIG: [
      'name',
      'channelAccessToken',
      'targetType',
      'user',
      'group',
      'room',
      'targetId',
      'notificationDisabled',
    ],
    BOT_SLACK_CONFIG: ['name', 'webhookUrl'],
  })
  for (const [filename, source, sectionStart, sectionEnd] of [
    ['README.md', english, '## Notification Channels', '## Reliability'],
    ['README.zh-CN.md', simplifiedChinese, '## 通知平台', '## 可靠性'],
    ['README.ja.md', japanese, '## 通知プラットフォーム', '## 信頼性'],
  ]) {
    const notificationSection = source.slice(source.indexOf(sectionStart), source.indexOf(sectionEnd))
    assert.match(notificationSection, /`screenshotIds`/, `${filename}: common Screenshot ID routing field`)
    assert.equal(notificationSection.match(/^<details>$/gm)?.length, 9, `${filename}: one example per adapter`)
    for (const [secretName, fields] of Object.entries(documentedTargetFields)) {
      const row = notificationSection
        .split('\n')
        .find((line) => line.startsWith(`| \`${secretName}\` |`))
      assert.ok(row, `${filename}: missing ${secretName} field reference`)
      assert.ok(row.includes('`screenshotIds`'), `${filename}: ${secretName} missing common routing field`)
      for (const field of fields) {
        assert.ok(row.includes(`\`${field}\``), `${filename}: ${secretName} missing ${field}`)
      }

      const summaryIndex = notificationSection.indexOf(secretName, notificationSection.indexOf('<details>'))
      const detailStart = notificationSection.lastIndexOf('<details>', summaryIndex)
      const detailEnd = notificationSection.indexOf('</details>', summaryIndex)
      assert.ok(summaryIndex >= 0 && detailStart >= 0 && detailEnd > summaryIndex, `${filename}: ${secretName} example`)
      const detail = notificationSection.slice(detailStart, detailEnd)
      const yaml = detail.match(/```yaml\n([\s\S]+?)\n```/)?.[1]
      assert.ok(yaml, `${filename}: ${secretName} copy-ready YAML`)

      const channel = listChannelAdapters().find(
        (candidate) => candidate.configurationEnvironmentVariable === secretName
      )
      const routedTargets = parseYaml(yaml)
      for (const target of routedTargets) {
        assert.ok(
          Array.isArray(target.screenshotIds),
          `${filename}: every ${secretName} example Target must show screenshotIds`
        )
      }
      assert.ok(
        routedTargets.some(({ screenshotIds }) => screenshotIds.includes('schedules')),
        `${filename}: ${secretName} example must work with the default schedules smoke test`
      )
      const prepared = prepareNotificationChannelConfiguration({
        selection: listScreenshotDefinitions().map(({ name }) => name),
        channelName: channel.name,
        rawConfig: yaml,
      })
      assert.equal(prepared.status, 'ready', `${filename}: ${secretName} example is usable`)
      assert.equal(
        prepared.deliveries.length,
        routedTargets.length,
        `${filename}: ${secretName} supports shared screenshotIds routing`
      )

      const describedFields = [
        'name',
        'screenshotIds',
        ...fields.filter((field) => !['name', 'group', 'user', 'room'].includes(field)),
      ]
      for (const field of describedFields) {
        assert.match(
          detail,
          new RegExp('^\\| `' + field + '` \\| [^|]+ \\| [^|]+ \\|$', 'm'),
          `${filename}: ${secretName} missing description for ${field}`
        )
      }
    }
  }
  for (const [filename, source, concepts] of [
    [
      'README.md',
      english,
      ['Data Snapshot', 'Configuration Preflight', 'S3 Publication', 'Platform Adapters'],
    ],
    [
      'README.zh-CN.md',
      simplifiedChinese,
      ['数据快照', '配置预检', 'S3 发布', '平台适配器'],
    ],
    [
      'README.ja.md',
      japanese,
      ['データスナップショット', '構成の事前検証', 'S3 への公開', 'プラットフォームアダプター'],
    ],
  ]) {
    for (const concept of concepts) {
      assert.ok(source.includes(`["${concept}"]`), `${filename}: Mermaid concept ${concept}`)
    }
  }
  for (const [filename, automation] of [
    ['README.md', english.slice(english.indexOf('## Automation'), english.indexOf('## Configuration'))],
    [
      'README.zh-CN.md',
      simplifiedChinese.slice(simplifiedChinese.indexOf('## 自动化'), simplifiedChinese.indexOf('## 配置')),
    ],
    ['README.ja.md', japanese.slice(japanese.indexOf('## 自動化'), japanese.indexOf('## 設定'))],
  ]) {
    assert.ok(
      automation.includes('`.github/workflows/bot-schedules.yml`'),
      `${filename}: schedules customization entry point`
    )
    assert.ok(
      automation.includes('`.github/workflows/bot-salmon-run.yml`'),
      `${filename}: daily selection customization entry point`
    )
    assert.ok(automation.includes('`BOT_TIME_ZONE`'), `${filename}: trigger time-zone distinction`)
    assert.ok(automation.includes('`on.schedule.cron`'), `${filename}: static cron limitation`)
    assert.ok(
      automation.includes(
        'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule'
      ),
      `${filename}: official schedule documentation`
    )
  }
  for (const [filename, source, requiredLabel, optionalLabel] of [
    ['README.md', english, 'Required', 'Optional'],
    ['README.zh-CN.md', simplifiedChinese, '必选', '可选'],
    ['README.ja.md', japanese, '必須', '任意'],
  ]) {
    assert.doesNotMatch(
      source,
      /\*\*(?:Required fields|Optional fields|必选字段|可选字段|必須フィールド|任意フィールド)\*\*/,
      `${filename}: split S3 field tables`
    )
    for (const field of ['bucket', 'publicBaseUrl', 'accessKeyId', 'secretAccessKey']) {
      assert.match(
        source,
        new RegExp('^\\| `' + field + '` \\| ' + requiredLabel + ' \\| — \\|', 'm'),
        `${filename}: required S3 field ${field}`
      )
    }
    for (const field of ['region', 'endpoint', 'forcePathStyle', 'keyPrefix', 'sessionToken']) {
      assert.match(
        source,
        new RegExp('^\\| `' + field + '` \\| ' + optionalLabel + ' \\|', 'm'),
        `${filename}: optional S3 field ${field}`
      )
    }
  }
  for (const documentationUrl of s3ProviderDocumentationUrls) {
    assert.ok(operatorGuide.includes(documentationUrl), `operator guide: missing S3 provider ${documentationUrl}`)
  }
  const notificationIdGuide = operatorGuide.slice(
    operatorGuide.indexOf('Channel Secrets are strict YAML sequences.'),
    operatorGuide.indexOf('## S3-compatible publication')
  )
  for (const { name } of listScreenshotDefinitions()) {
    assert.ok(
      notificationIdGuide.includes(`\`${name}\``),
      `operator guide: missing Notification ID ${name}`
    )
  }
  assert.match(english, /Every Repository Variable is optional/)
  assert.match(simplifiedChinese, /Repository Variable.*全部可选/)
  assert.match(japanese, /Repository Variable.*すべて任意/)
  assert.match(english, /previews use the default `1200×675`/)
  assert.match(simplifiedChinese, /预览使用默认分辨率 `1200×675`/)
  assert.match(japanese, /プレビューは既定解像度 `1200×675`/)
  assert.doesNotMatch(english, /English quick start uses/)
  assert.doesNotMatch(simplifiedChinese, /中文快速开始|默认使用企业微信/)
  assert.doesNotMatch(japanese, /日本語版のクイックスタート/)

  const quickStart = english.slice(english.indexOf('## Quick Start'), english.indexOf('## Preview'))
  const japaneseQuickStart = japanese.slice(japanese.indexOf('## クイックスタート'), japanese.indexOf('## スクリーンショット'))
  assert.match(quickStart, /You do not need to install Node\.js, pnpm, Chrome, Docker, or a server/)
  assert.match(quickStart, /`BOT_LOCALE=en-US`/)
  assert.match(japaneseQuickStart, /`BOT_LOCALE=ja-JP`/)
  assert.match(japaneseQuickStart, /`BOT_TIME_ZONE=Asia\/Tokyo`/)
  assert.doesNotMatch(quickStart, /^### Local Development|Node\.js 24 LTS|pnpm 11\.18/m)
  assert.doesNotMatch(english.slice(0, english.indexOf('## What It Does')), /Node\.js-24|pnpm-11/)
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
    /BOT_SCREENSHOT_RESOLUTION: \$\{\{ vars\.BOT_SCREENSHOT_RESOLUTION \|\| '1200x675' \}\}/
  )
  assert.match(
    reusableWorkflow,
    /BOT_SCREENSHOT_ATTRIBUTION: \$\{\{ vars\.BOT_SCREENSHOT_ATTRIBUTION \|\| 'splatoon3\.ink' \}\}/
  )
  assert.equal(reusableWorkflow.match(/BOT_SCREENSHOT_ATTRIBUTION:/g)?.length, 2)
  assert.equal(reusableWorkflow.match(/BOT_LOCALE:/g)?.length, 2)
  assert.equal(reusableWorkflow.match(/BOT_SCREENSHOT_RESOLUTION:/g)?.length, 2)
  assert.match(reusableWorkflow, /runs-on: \$\{\{ vars\.BOT_RUNNER \|\| 'ubuntu-24\.04' \}\}/)
  assert.match(reusableWorkflow, /^  group: splatoon3-bot-production$/m)
  assert.match(reusableWorkflow, /^    environment: production$/m)
  assert.doesNotMatch(reusableWorkflow, /BOT_ENVIRONMENT|BOT_CONCURRENCY_GROUP/)
  assert.match(
    reusableWorkflow,
    /retention-days: \$\{\{ vars\.BOT_ARTIFACT_RETENTION_DAYS \|\| '7' \}\}/
  )
  assert.doesNotMatch(reusableWorkflow, /Install Upyun CLI|curl[\s\S]*upyun/i)
  assert.match(readme, /Each platform Secret is a YAML list/)
  assert.match(readme, /Step 1 — Create your Private installation/)
  assert.match(readme, /repository is the deployment and trust boundary/)
  assert.match(readme, /repository created from the template has independent Git history/)
  assert.match(readme, /Repository Secrets and Variables are intentionally installation-local/)
  assert.doesNotMatch(readme, /github\.com\/TenviLi\/splatoon3-bot\/settings\//)
  assert.deepEqual(
    [...new Set([...allWorkflows.matchAll(/\bvars\.([A-Z0-9_]+)/g)].map((match) => match[1]))].sort(),
    [...repositoryVariables].sort()
  )
  for (const variableName of repositoryVariables) {
    assert.ok(readme.includes(`| \`${variableName}\` |`), `${variableName} must be documented in README.md`)
    assert.match(
      readme,
      new RegExp('^\\| `' + variableName + '` \\| No \\|', 'm'),
      `${variableName} must be documented as optional`
    )
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
    /Stage Bot Run for local Actions verification\n\s+if: \$\{\{ env\.ACT == 'true' && steps\.prepare\.outputs\.has_content == 'true' \}\}/
  )
  assert.match(
    reusableWorkflow,
    /Archive Bot Run\n\s+if: \$\{\{ env\.ACT != 'true' && steps\.prepare\.outputs\.has_content == 'true' \}\}\n\s+uses: actions\/upload-artifact@/
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
  assert.match(reusableWorkflow, /ACT_FIXTURE_RENDER_TIME/)

  const localActionsVerifier = await fs.readFile(
    path.join(process.cwd(), 'scripts', 'verify_actions.mjs'),
    'utf8'
  )
  assert.match(localActionsVerifier, /notification-smoke\.yml/)
  assert.match(localActionsVerifier, /screenshot_id: 'schedules'/)
  assert.match(localActionsVerifier, /screenshot_id: 'splatfest-jp'/)
  assert.match(localActionsVerifier, /expectedUploadCount/)
  assert.match(localActionsVerifier, /splatfest-jp\.png/)
  assert.match(localActionsVerifier, /primary notification image instead of BOT_SCREENSHOT_RESOLUTION 1200x675/)
  assert.match(localActionsVerifier, /LINE image instead of 1024x576/)
  assert.match(localActionsVerifier, /LINE image above 1 MB/)
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
    /BOT_SCREENSHOT_RESOLUTION: \$\{\{ vars\.BOT_SCREENSHOT_RESOLUTION \|\| '1200x675' \}\}/
  )

  const smokeWorkflow = await fs.readFile(path.join(workflowDirectory, 'notification-smoke.yml'), 'utf8')
  assert.deepEqual(
    workflowDispatchChoiceOptions(smokeWorkflow, 'channel'),
    channels.map(({ name }) => name),
    'Notification smoke choices must match the Channel adapter registry'
  )
  assert.deepEqual(
    workflowDispatchChoiceOptions(smokeWorkflow, 'screenshot_id'),
    listScreenshotDefinitions().map(({ name }) => name),
    'Notification smoke choices must match the Screenshot Definition registry'
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

  await assert.rejects(
    fs.access(path.join(workflowDirectory, 'bot-manual.yml')),
    (error) => error?.code === 'ENOENT',
    'the public template must not expose a second multi-select Manual Bot Run'
  )
  for (const { name } of listScreenshotDefinitions()) {
    const inputName = name.replaceAll('-', '_')
    assert.doesNotMatch(
      smokeWorkflow,
      new RegExp(`^      ${inputName}:$`, 'm'),
      `notification-smoke.yml must not repeat the multi-select checkbox ${name}`
    )
    assert.ok(
      smokeWorkflow.includes(`      ${inputName}: \${{ inputs.screenshot_id == '${name}' }}`),
      `notification-smoke.yml must map ${name} from its single Screenshot ID choice`
    )
  }

  const allScreenshotIds = listScreenshotDefinitions().map(({ name }) => name).join(',')
  assert.doesNotMatch(configurationCheckWorkflow, /^    inputs:$/m)
  assert.doesNotMatch(configurationCheckWorkflow, /\binputs\./)
  assert.ok(
    configurationCheckWorkflow.includes(`          RUN_SELECTION: ${allScreenshotIds}`),
    'configuration-check.yml must validate every canonical Screenshot ID'
  )

  for (const { name } of listScreenshotDefinitions()) {
    const inputName = name.replaceAll('-', '_')
    const environmentVariable = `RUN_${inputName.toUpperCase()}`
    assertBooleanSelectionInput(reusableWorkflow, inputName, false)
    assert.ok(
      reusableWorkflow.includes(`          ${environmentVariable}: \${{ inputs.${inputName} }}`),
      `bot-reusable.yml must project ${name} into ${environmentVariable}`
    )
  }

  assert.match(reusableWorkflow, /artifact_name: \$\{\{ steps\.prepare\.outputs\.artifact_name \}\}/)
  assert.match(reusableWorkflow, /selection: \$\{\{ steps\.prepare\.outputs\.selection \}\}/)
  assert.match(reusableWorkflow, /has_content: \$\{\{ steps\.prepare\.outputs\.has_content \}\}/)
  assert.match(reusableWorkflow, /Prepare Data Snapshot and screenshot artifacts\n        id: prepare/)
  assert.match(
    reusableWorkflow,
    /Archive Bot Run\n        if: \$\{\{ env\.ACT != 'true' && steps\.prepare\.outputs\.has_content == 'true' \}\}/
  )
  assert.match(
    reusableWorkflow,
    /publish:\n    name: Publish and notify\n    needs: prepare\n    if: \$\{\{ needs\.prepare\.outputs\.has_content == 'true' \}\}/
  )
  assert.doesNotMatch(reusableWorkflow, /screenshots-\$\{\{ steps\.plan\.outputs\.artifact_name \}\}/)
})

test('daily twice workflow delivers every Notification', async () => {
  const dailyWorkflow = await fs.readFile(path.join(workflowDirectory, 'bot-salmon-run.yml'), 'utf8')
  const schedulesWorkflow = await fs.readFile(path.join(workflowDirectory, 'bot-schedules.yml'), 'utf8')

  for (const [filename, source] of [
    ['bot-schedules.yml', schedulesWorkflow],
    ['bot-salmon-run.yml', dailyWorkflow],
  ]) {
    assert.match(source, /^  workflow_dispatch:\s*$/m, `${filename} must support an on-demand rerun`)
    assert.doesNotMatch(source, /^    inputs:/m, `${filename} manual rerun must not redefine Run Selection`)
  }

  const selectedScreenshotIds = listScreenshotDefinitions()
    .filter(({ name }) => dailyWorkflow.includes(`      ${name.replaceAll('-', '_')}: true`))
    .map(({ name }) => name)

  assert.deepEqual(resolveRunPlan(selectedScreenshotIds).notifications, [
    'schedules',
    'salmon-run',
    'gear-dailydrop',
    'gear-regular',
    'gear-salmon-run',
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
