function waitForAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

async function waitForImages() {
  await Promise.all(
    [...document.images].map((image) => {
      if (image.complete && image.naturalWidth > 0) {
        return Promise.resolve()
      }

      return new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', () => reject(new Error(`Failed to load image: ${image.currentSrc || image.src}`)), {
          once: true,
        })
      })
    })
  )
}

export async function markScreenshotReady() {
  delete document.documentElement.dataset.screenshotReady
  await document.fonts.ready
  await waitForImages()
  await waitForAnimationFrame()
  await waitForAnimationFrame()
  document.documentElement.dataset.screenshotReady = 'true'
}
