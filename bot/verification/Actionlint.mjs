import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const version = '1.7.12'
const releases = Object.freeze({
  darwin_arm64: 'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f',
  darwin_amd64: '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644',
  linux_arm64: '325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6',
  linux_amd64: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
})

function releasePlatform() {
  const architecture = process.arch === 'x64' ? 'amd64' : process.arch
  return `${process.platform}_${architecture}`
}

async function exists(filename) {
  try {
    await fs.access(filename, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function installActionlint(cacheDirectory) {
  const platform = releasePlatform()
  const expectedSha256 = releases[platform]
  if (!expectedSha256) {
    throw new Error(`Unsupported actionlint platform: ${platform}`)
  }

  const installDirectory = path.join(cacheDirectory, version, platform)
  const executable = path.join(installDirectory, 'actionlint')
  if (await exists(executable)) {
    return executable
  }

  await fs.mkdir(installDirectory, { recursive: true })
  const archiveName = `actionlint_${version}_${platform}.tar.gz`
  const archive = path.join(installDirectory, archiveName)
  const response = await fetch(`https://github.com/rhysd/actionlint/releases/download/v${version}/${archiveName}`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`Failed to download actionlint: HTTP ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const actualSha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Invalid actionlint checksum: expected ${expectedSha256}, received ${actualSha256}`)
  }

  await fs.writeFile(archive, buffer)
  await execFileAsync('tar', ['-xzf', archive, '-C', installDirectory, 'actionlint'])
  await fs.chmod(executable, 0o755)
  return executable
}

export async function runActionlint({ cwd = process.cwd() } = {}) {
  const executable =
    process.env.ACTIONLINT_PATH ||
    (await installActionlint(path.join(cwd, '.cache', 'actionlint')))
  const result = await execFileAsync(executable, [], { cwd, maxBuffer: 10 * 1024 * 1024 })
  if (result.stdout) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
}
