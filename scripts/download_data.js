import { writeFileSync, existsSync, unlinkSync } from 'fs'

const splatoon_ink_api = 'https://splatoon3.ink/data'

async function request_json(json_name) {
  const json_filename = path.join(process.cwd(), `data/${json_name}.json`)

  if (existsSync(json_filename)) unlinkSync(json_filename)

  console.log(`download "${splatoon_ink_api}/${json_name}.json start.`)
  const request = await fetch(splatoon_ink_api, {
    headers: {
      'User-Agent': 'Splatoon3 Bot (https://github.com/tenvili)',
    },
  })
  if (request.ok) {
    const buffer = request.arrayBuffer()
    writeFileSync(buffer, path.join(process.cwd(), `data/${json_name}.json`))
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
