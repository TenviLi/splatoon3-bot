import http from 'node:http'
import sirv from 'sirv'

export default class HttpServer {
  /** @var {http.Server} */
  #server = null

  get port() {
    return this.#server.address().port
  }

  open() {
    return new Promise((resolve, reject) => {
      if (this.#server) {
        return resolve()
      }

      const handler = sirv('dist', { dev: false })
      this.#server = http.createServer(handler)
      this.#server.once('error', reject)
      this.#server.once('listening', resolve)
      this.#server.listen(0, '127.0.0.1')
    })
  }

  async close() {
    if (this.#server) {
      await new Promise((resolve, reject) => {
        this.#server.close((error) => (error ? reject(error) : resolve()))
      })
      this.#server = null
    }
  }
}
