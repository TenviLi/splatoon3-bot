FROM ghcr.io/catthehacker/ubuntu:act-24.04@sha256:8bbfe9e0da9b403b099a185a6962b9e3fb8d8dd057be3abd2daef2945ffc489e

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
    fonts-liberation \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2t64 \
    libgbm1 \
    libgtk-3-0t64 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    xdg-utils \
  && rm -rf /var/lib/apt/lists/*

ARG PNPM_VERSION
ARG PUPPETEER_BROWSERS_VERSION
ARG CHROME_VERSION

RUN retry() { \
    attempts=0; \
    until "$@"; do \
      attempts=$((attempts + 1)); \
      if [ "${attempts}" -ge 5 ]; then return 1; fi; \
      sleep $((attempts * 5)); \
    done; \
  }; \
  test -n "${PNPM_VERSION}" \
  && test -n "${PUPPETEER_BROWSERS_VERSION}" \
  && test -n "${CHROME_VERSION}" \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 10000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && retry npm install --global "pnpm@${PNPM_VERSION}" \
  && retry npx --yes "@puppeteer/browsers@${PUPPETEER_BROWSERS_VERSION}" install "chrome@${CHROME_VERSION}" --path /root/.cache/puppeteer \
  && pnpm --version
