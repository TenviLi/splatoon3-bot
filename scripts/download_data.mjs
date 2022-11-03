import { writeFile } from 'fs/promises'
import path from 'path'

const splatoon_ink_api = 'https://splatoon3.ink/data'

async function request_json(json_name) {
  const json_filename = path.join(process.cwd(), `data/${json_name}.json`)

  // if (existsSync(json_filename)) unlinkSync(json_filename)

  console.log(`download "${splatoon_ink_api}/${json_name}.json start.`)
  const request = await fetch(splatoon_ink_api, {
    headers: {
      'User-Agent': 'Splatoon3 Bot (https://github.com/tenvili)',
    },
  })
    const buffer = await request.arrayBuffer()
    await writeFile(json_filename, Buffer.from(buffer))
    console.log(`download "${json_filename}" succeeded.`)
}

;(async () => {
  await Promise.all(
    ['schedules', 'gear', 'festivals', 'coop', 'locale/zh-CN', 'locale/en-US'].map((json_name) =>
      request_json(json_name)
    )
  )
})()
