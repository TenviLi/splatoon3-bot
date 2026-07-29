import { writeFile } from 'fs/promises'
import path from 'path'

const splatoonInkApi = 'https://splatoon3.ink/data'

async function requestJson(jsonName) {
  const jsonFilename = path.join(process.cwd(), `data/${jsonName}.json`)
  const remoteFilename = `${splatoonInkApi}/${jsonName}.json`

  // if (existsSync(json_filename)) unlinkSync(json_filename)

  console.log(`download "${remoteFilename}" start.`)
  const response = await fetch(remoteFilename, {
    headers: {
      // 'User-Agent': 'Splatoon3 Bot (https://github.com/tenvili)',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download ${remoteFilename}: ${response.status} ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  await writeFile(jsonFilename, Buffer.from(buffer))
  console.log(`download "${jsonFilename}" succeeded.`)
}

;(async () => {
  await Promise.all(
    ['schedules', 'gear', 'festivals', 'coop', 'locale/zh-CN', 'locale/en-US'].map((jsonName) =>
      requestJson(jsonName)
    )
  )
})()
