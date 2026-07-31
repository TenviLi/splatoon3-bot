import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function writeManifestFile({ filename, value, validate }) {
  const manifest = validate(value)
  const absoluteFilename = path.resolve(filename)
  const temporaryFilename = `${absoluteFilename}.${process.pid}.${crypto.randomUUID()}.tmp`

  await fs.mkdir(path.dirname(absoluteFilename), { recursive: true })
  try {
    await fs.writeFile(temporaryFilename, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
    await fs.rename(temporaryFilename, absoluteFilename)
  } finally {
    await fs.rm(temporaryFilename, { force: true })
  }

  return manifest
}

export async function readManifestFile({ filename, validate }) {
  return validate(JSON.parse(await fs.readFile(path.resolve(filename), 'utf8')))
}
