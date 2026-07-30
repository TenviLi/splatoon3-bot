import { downloadDataSnapshot } from '../bot/data/DataSnapshot.mjs'

const manifest = await downloadDataSnapshot()

console.log(`Published data snapshot created at ${manifest.createdAt}`)
for (const [filename, metadata] of Object.entries(manifest.files)) {
  console.log(`${filename}: ${metadata.bytes} bytes (${metadata.sha256.slice(0, 12)})`)
}
