import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getRunPlan, getScreenshotDefinition } from '../run/RunPlan.mjs'
import { readRunManifest } from '../run/RunManifest.mjs'

const execFileAsync = promisify(execFile)

async function verifyArtifactFile(artifact, screenshotDirectory) {
  const definition = getScreenshotDefinition(artifact.name)
  const filename = path.join(screenshotDirectory, definition.outputFilename)
  let buffer

  try {
    buffer = await fs.readFile(filename)
  } catch (error) {
    throw new Error(`Required screenshot artifact is missing: ${filename}`, { cause: error })
  }

  if (buffer.byteLength !== artifact.bytes) {
    throw new Error(
      `Screenshot artifact ${artifact.name} has ${buffer.byteLength} bytes, expected ${artifact.bytes}`
    )
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  if (sha256 !== artifact.sha256) {
    throw new Error(`Screenshot artifact ${artifact.name} failed SHA-256 verification`)
  }

  return { buffer, outputFilename: definition.outputFilename }
}

export async function publishToUpyun({
  profileName,
  serviceName = process.env.UPX_SERVICENAME,
  operator = process.env.UPX_OPERATOR,
  password = process.env.UPX_PASSWORD,
  executable = process.env.UPX_EXECUTABLE || 'upx',
  screenshotDirectory = path.join(process.cwd(), 'screenshots'),
  runCommand = execFileAsync,
} = {}) {
  if (!serviceName || !operator || !password) {
    throw new Error('UPX_SERVICENAME, UPX_OPERATOR, and UPX_PASSWORD are required')
  }

  const plan = getRunPlan(profileName)
  const manifest = await readRunManifest(path.join(screenshotDirectory, 'run-manifest.json'))
  if (manifest.profile !== plan.name) {
    throw new Error(`Run manifest profile ${manifest.profile} does not match ${plan.name}`)
  }

  const verifiedArtifacts = await Promise.all(
    manifest.artifacts.map((artifact) => verifyArtifactFile(artifact, screenshotDirectory))
  )
  const stagingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'splatoon3-bot-publish-'))
  let loggedIn = false

  try {
    await Promise.all(
      verifiedArtifacts.map(({ buffer, outputFilename }) =>
        fs.writeFile(path.join(stagingDirectory, outputFilename), buffer)
      )
    )

    await runCommand(executable, ['login', serviceName, operator, password])
    loggedIn = true
    await runCommand(executable, ['-q', 'sync', '-w', '10', `${stagingDirectory}/`, '/'])
  } finally {
    if (loggedIn) {
      await runCommand(executable, ['logout']).catch(() => {})
    }
    await fs.rm(stagingDirectory, { recursive: true, force: true })
  }

  return manifest.artifacts
}
