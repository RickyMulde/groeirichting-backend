/**
 * OpenClaw Gateway events: luisteren naar /v1/events (SSE) en bijlagen ophalen via GET /v1/media/<mediaId>.
 * Gebruik fetchMediaBytes() om ontvangen media server-side op te halen voor opslag (bijv. Supabase bucket).
 *
 * TODO: Volledige SSE-client voor /v1/events (bijv. met package 'eventsource') voor media.created + message
 * met media_id; dan fetchMediaBytes aanroepen en bytes opslaan.
 */

const fetch = require('node-fetch')

/**
 * Haal media-bytes op van de Gateway (bij ontvangen bijlagen van de agent).
 * @param {string} mediaId
 * @returns {Promise<Buffer|null>}
 */
async function fetchMediaBytes(mediaId) {
  const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || '').replace(/\/$/, '')
  const token = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!gatewayUrl || !token || !mediaId) return null
  const url = `${gatewayUrl}/v1/media/${encodeURIComponent(mediaId)}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream' }
    })
    if (!res.ok) return null
    const buf = await res.buffer()
    return buf
  } catch (_) {
    return null
  }
}

/**
 * Placeholder: start SSE-listener op /v1/events.
 * Bij implementatie: bij media.created of message met media_id fetchMediaBytes aanroepen
 * en resultaat opslaan (Supabase bucket of DB).
 * @param {Object} [opts]
 * @param {function(Buffer, string): Promise<void>} [opts.onMedia] - callback(buffer, mediaId)
 */
function startEventsListener(opts = {}) {
  if (!process.env.OPENCLAW_GATEWAY_URL || !process.env.OPENCLAW_GATEWAY_TOKEN) {
    console.warn('openclawEvents: OPENCLAW_GATEWAY_URL/TOKEN niet gezet')
    return
  }
  console.log('openclawEvents: startEventsListener niet geïmplementeerd (SSE /v1/events); gebruik fetchMediaBytes bij bekend media_id')
}

module.exports = {
  fetchMediaBytes,
  startEventsListener
}
