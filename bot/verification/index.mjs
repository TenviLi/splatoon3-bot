import { spawn } from 'node:child_process'
import { runActionlint } from './Actionlint.mjs'

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} failed with ${signal || `exit code ${code}`}`))
      }
    })
  })
}

await runActionlint()
await run('pnpm', ['run', 'check:syntax'])
await run('pnpm', ['run', 'test:unit'])
await run('pnpm', ['run', 'test:browser-ci'])
await run('pnpm', ['run', 'test:visual'])
await run('pnpm', ['run', 'build'], {
  ...process.env,
  SPLATOON_DATA_DIRECTORY: 'tests/fixtures/data',
  SPLATOON_PUBLIC_DIRECTORY: 'tests/fixtures/public',
})
await run('pnpm', ['audit', '--registry=https://registry.npmjs.org'])
