import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

export const brandingIconDimensions = Object.freeze({ width: 256, height: 256 })

const brandingIconDefinitions = Object.freeze({
  schedules: Object.freeze({
    name: 'schedules',
    sourceFilename: fileURLToPath(new URL('../../src/assets/img/favicon.svg', import.meta.url)),
    outputFilename: 'schedules.png',
  }),
  salmonRun: Object.freeze({
    name: 'salmonRun',
    sourceFilename: fileURLToPath(new URL('../../src/assets/img/modes/coop.svg', import.meta.url)),
    outputFilename: 'salmon-run.png',
  }),
  gear: Object.freeze({
    name: 'gear',
    sourceFilename: fileURLToPath(new URL('../../src/assets/img/gesotown-coin.svg', import.meta.url)),
    outputFilename: 'gear.png',
  }),
})

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function brandingIconRelativeKey(sha256Digest, outputFilename) {
  if (!/^[a-f0-9]{64}$/.test(sha256Digest)) {
    throw new Error(`Invalid branding icon SHA-256: ${sha256Digest}`)
  }
  return `branding-icons/${sha256Digest}/${outputFilename}`
}

export function listBrandingIconDefinitions() {
  return Object.values(brandingIconDefinitions)
}

export async function prepareBrandingIcons() {
  return Promise.all(
    listBrandingIconDefinitions().map(async (definition) => {
      const source = await fs.readFile(definition.sourceFilename)
      const buffer = await sharp(source, { density: 256 })
        .resize({
          ...brandingIconDimensions,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ adaptiveFiltering: true, compressionLevel: 9, effort: 10 })
        .toBuffer()
      const digest = sha256(buffer)
      return Object.freeze({
        ...definition,
        buffer,
        bytes: buffer.byteLength,
        sha256: digest,
        ...brandingIconDimensions,
      })
    })
  )
}
