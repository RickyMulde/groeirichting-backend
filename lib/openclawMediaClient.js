/**
 * OpenClaw Gateway media client: upload bestand naar /v1/media, retourneer mediaId.
 * Gebruikt voor bijlagen in GroeiCockpit (geen signed URLs naar de Gateway).
 */

const fetch = require('node-fetch')
const crypto = require('crypto')

const MEDIA_TIMEOUT_MS = 25000
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [0, 500, 1000]
const RETRY_STATUSES = new Set([429, 502, 503, 504])

function generateRequestId() {
  return `gr-media-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

/**
 * Bouw multipart/form-data body: file (binary) + metadata name, media_type, optioneel sha256.
 */
function buildMultipartBody(buffer, filename, mediaType, sha256) {
  const boundary = '----GroeiCockpit' + Date.now() + '-' + crypto.randomBytes(8).toString('hex')
  const safeName = String(filename).replace(/"/g, '%22').slice(0, 255)
  const parts = []

  parts.push(Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
    `Content-Type: ${mediaType}\r\n\r\n`,
    'utf8'
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${safeName}\r\n`, 'utf8'))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="media_type"\r\n\r\n${mediaType}\r\n`, 'utf8'))
  if (sha256) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="sha256"\r\n\r\n${sha256}\r\n`, 'utf8'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))

  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

/**
 * Upload één bestand naar de Gateway /v1/media.
 * @param {Object} opts
 * @param {Buffer} opts.buffer - bestandsinhoud
 * @param {string} opts.filename - weergavenaam
 * @param {string} opts.mediaType - MIME-type
 * @param {string} [opts.sha256] - optioneel hex hash
 * @returns {Promise<{ mediaId: string }>}
 */
async function uploadMedia({ buffer, filename, mediaType, sha256 }) {
  const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || '').replace(/\/$/, '')
  const token = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!gatewayUrl || !token) {
    throw new Error('OPENCLAW_GATEWAY_URL en OPENCLAW_GATEWAY_TOKEN zijn verplicht')
  }

  const url = `${gatewayUrl}/v1/media`
  const requestId = generateRequestId()
  const { body, contentType } = buildMultipartBody(buffer, filename, mediaType, sha256)
  const sizeBytes = buffer.length

  let lastError
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt] ?? 1000
      await new Promise((r) => setTimeout(r, delay))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS)
    const start = Date.now()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'X-Request-ID': requestId,
          Accept: 'application/json'
        },
        body,
        signal: controller.signal
      })

      const duration = Date.now() - start
      console.log('GroeiCockpit media upload', {
        requestId,
        status: response.status,
        sizeBytes,
        durationMs: duration,
        attempt: attempt + 1
      })

      if (!response.ok) {
        const text = await response.text()
        if (RETRY_STATUSES.has(response.status) && attempt < MAX_RETRIES - 1) {
          lastError = new Error(`Gateway ${response.status}: ${text.slice(0, 200)}`)
          continue
        }
        throw new Error(`Media upload mislukt: ${response.status} ${text.slice(0, 300)}`)
      }

      clearTimeout(timeoutId)
      const data = await response.json().catch(() => ({}))
      const mediaId = data?.id ?? data?.media_id ?? data?.mediaId
      if (!mediaId) {
        throw new Error('Gateway gaf geen media_id terug')
      }
      return { mediaId }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        lastError = new Error('Media upload timeout')
        if (attempt < MAX_RETRIES - 1) continue
      }
      throw err
    }
  }

  throw lastError || new Error('Media upload mislukt na retries')
}

module.exports = {
  uploadMedia,
  buildMultipartBody,
  MEDIA_TIMEOUT_MS,
  MAX_RETRIES
}
