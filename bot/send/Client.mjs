export default class WxWorkClient {
  /** @var {TwitterApi} */
  #webhook

  constructor() {
    this.#webhook = process.env.BOT_WEBHOOK_URL
  }

  async send(message) {
    const res = await fetch(this.#webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    if (res.ok) {
      const data = await res.json()
      console.log(data)
    }
  }
}
