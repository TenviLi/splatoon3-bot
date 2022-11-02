import { writeFile } from 'fs/promises'

const splatoon_ink_api = 'https://splatoon3.ink/data'

async function request_json(json_name) {
  console.log(`download "${splatoon_ink_api}/${json_name}.json start.`)
  const request = await fetch(splatoon_ink_api, {
    headers: {
      'User-Agent': 'Splatoon3 Bot (https://github.com/tenvili)',
    },
  })
  if (request.ok) {
    const buffer = request.arrayBuffer()
    await writeFile(buffer, path.join(process.cwd(), `data/${json_name}.json`))
  }
  console.log(`download "${splatoon_ink_api}/${json_name}.json succeeded.`)
}

;(async () => {
  await Promise.all(
    ['schedules', 'gear', 'festivals', 'coop', 'locale/zh-CN', 'locale/en-US'].map((json_name) =>
      request_json(json_name)
    )
  )
})()
