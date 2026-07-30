import { spawn } from 'node:child_process'
import { runActionlint } from './Actionlint.mjs'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
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
await run('pnpm', ['run', 'test:visual'])
await run('pnpm', ['run', 'build'])
await run('pnpm', ['audit', '--registry=https://registry.npmjs.org'])
