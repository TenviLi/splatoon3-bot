import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export function localizeJsonSource(source, replacements) {
  let localizedSource = source
  for (const [url, replacement] of replacements) {
    localizedSource = localizedSource.replaceAll(JSON.stringify(url), JSON.stringify(replacement))
  }
  JSON.parse(localizedSource)
  return localizedSource
}

export async function localizeFixtureDataFiles(dataDirectory, relativeFilenames, replacements) {
  const changedFiles = []
  for (const relativeFilename of relativeFilenames) {
    const filename = path.join(dataDirectory, relativeFilename)
    const source = await fs.readFile(filename, 'utf8')
    const localizedSource = localizeJsonSource(source, replacements)
    if (localizedSource !== source) {
      await fs.writeFile(filename, localizedSource)
      changedFiles.push(relativeFilename)
    }
  }
  return changedFiles
}

export async function refreshSnapshotManifest(dataDirectory) {
  const snapshotFilename = path.join(dataDirectory, '.snapshot.json')
  const snapshot = JSON.parse(await fs.readFile(snapshotFilename, 'utf8'))
  for (const relativeFilename of Object.keys(snapshot.files)) {
    const buffer = await fs.readFile(path.join(dataDirectory, relativeFilename))
    snapshot.files[relativeFilename] = {
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      bytes: buffer.byteLength,
    }
  }
  await fs.writeFile(snapshotFilename, `${JSON.stringify(snapshot, null, 2)}\n`)
  return snapshot
}
