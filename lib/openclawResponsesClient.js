/**
 * OpenClaw Gateway responses client: POST naar /v1/responses met input (inclusief attachments via media_id).
 * Zelfde timeout- en retrybeleid als media-uploads.
 */

const fetch = require('node-fetch')
const crypto = require('crypto')

const RESPONSES_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS) || 120000
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [0, 500, 1000]
const RETRY_STATUSES = new Set([429, 502, 503, 504])

function generateRequestId() {
  return `gr-resp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
}

/**
 * Stuur één request naar POST /v1/responses. Retries bij 429/502/503/504.
 * @param {Object} opts
 * @param {string} opts.conversationId - voor header/user
 * @param {Array} opts.input - OpenResponses input-array (messages + eventueel function_call_output)
 * @param {string} opts.agentId - bv. "main"
 * @param {Array} [opts.tools] - optionele tools-array
 * @returns {Promise<{ data: object, requestId: string }>}
 */
async function postResponses({ conversationId, input, agentId, tools }) {
  const gatewayUrl = (process.env.OPENCLAW_GATEWAY_URL || '').replace(/\/$/, '')
  const token = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!gatewayUrl || !token) {
    throw new Error('OPENCLAW_GATEWAY_URL en OPENCLAW_GATEWAY_TOKEN zijn verplicht')
  }

  const url = `${gatewayUrl}/v1/responses`
  const requestId = generateRequestId()
  const body = {
    // Volgens OpenResponses / OpenClaw HTTP-spec: model \"openclaw\" + x-openclaw-agent-id header.
    model: 'openclaw',
    input,
    user: conversationId,
    stream: false
  }
  if (tools && tools.length > 0) body.tools = tools

  let lastError
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt] ?? 1000
      await new Promise((r) => setTimeout(r, delay))
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RESPONSES_TIMEOUT_MS)
    const start = Date.now()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'x-openclaw-agent-id': agentId,
          Accept: 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      const duration = Date.now() - start
      console.log('GroeiCockpit responses', {
        requestId,
        conversationId,
        status: response.status,
        durationMs: duration,
        attempt: attempt + 1
      })

      if (!response.ok) {
        const text = await response.text()
        if (RETRY_STATUSES.has(response.status) && attempt < MAX_RETRIES - 1) {
          lastError = new Error(`Gateway ${response.status}: ${text.slice(0, 200)}`)
          continue
        }
        const err = new Error(`Responses request mislukt: ${response.status} ${text.slice(0, 300)}`)
        err.status = response.status
        err.body = text
        throw err
      }

      clearTimeout(timeoutId)
      const data = await response.json().catch(() => ({}))
      return { data, requestId }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        lastError = new Error('Responses request timeout')
        if (attempt < MAX_RETRIES - 1) continue
      }
      throw err
    }
  }

  throw lastError || new Error('Responses request mislukt na retries')
}

module.exports = {
  postResponses,
  RESPONSES_TIMEOUT_MS,
  MAX_RETRIES
}
