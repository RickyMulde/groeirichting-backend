/**
 * GroeiCockpit – POST /process: verwerk nieuw user-bericht en roep OpenClaw Gateway aan.
 * Zie docs/FASE5_OPENCLAW_PLAN.md.
 */
const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const { fetchArtifactStream } = require('./lib/supabaseAttachmentProxy')
const { postResponses } = require('./lib/openclawResponsesClient')

const BUCKET = 'groei-cockpit-uploads'

/** Max 1 actieve OpenClaw-call per conversatie tegelijk. */
const processingConversations = new Set()

const processLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GROEI_COCKPIT_RATE_LIMIT_MAX) || 30,
  message: { error: 'Te veel verzoeken. Wacht even en probeer opnieuw.' },
  standardHeaders: true,
  legacyHeaders: false
})
const MAX_HISTORY_MESSAGES = 12
const MAX_MESSAGE_CONTENT_LENGTH = Number(process.env.GROEI_COCKPIT_MAX_MESSAGE_LENGTH) || 6000
/** Timeout OpenClaw-call wordt in openclawResponsesClient toegepast (env OPENCLAW_TIMEOUT_MS). */
const FALLBACK_MESSAGE = 'Ik liep vast, probeer het later opnieuw.'
const MAX_GATEWAY_ERROR_DISPLAY = 2000

/** Haal bruikbare fouttekst uit Gateway response-body; voor in chat en logs. */
function parseGatewayError(status, bodyText) {
  let message = ''
  try {
    const parsed = JSON.parse(bodyText)
    if (parsed?.error?.message) message = String(parsed.error.message)
  } catch (_) {}
  if (!message && bodyText) message = bodyText.trim()
  if (message.length > MAX_GATEWAY_ERROR_DISPLAY) message = message.slice(0, MAX_GATEWAY_ERROR_DISPLAY) + '…'
  return message || `HTTP ${status}`
}

/** Agent-whitelist: alleen deze ids zijn toegestaan (handmatig bijhouden). */
const ALLOWED_AGENT_IDS = (process.env.OPENCLAW_ALLOWED_AGENTS || 'main,nieuwe-technieken,prive').split(',').map((s) => s.trim()).filter(Boolean)

/** Max aantal tool-call rondes per request (voorkomt oneindige loops). */
const MAX_TOOL_ROUNDS = 3
/** Tools alleen meesturen als de Gateway ze ondersteunt; zet GROEI_COCKPIT_TOOLS_ENABLED=true in env. */
const TOOLS_ENABLED = process.env.GROEI_COCKPIT_TOOLS_ENABLED === 'true'
/** Max grootte bestandsinhoud (bytes) die we aan de agent teruggeven (get_artifact_content). */
const MAX_ARTIFACT_CONTENT_BYTES = 500 * 1024
/** Bijlagen gaan via /v1/media: backend haalt op uit Supabase, uploadt naar Gateway, verwijst met media_id in /v1/responses. Geen signed URLs naar Gateway/client. */

/** Tools voor de agent: alleen eigen artifacts (owner_id = userId). */
const GROEI_COCKPIT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_artifacts',
      description: 'Lijst van bestanden en grafieken die de gebruiker heeft geüpload in GroeiCockpit. Gebruik dit om te zien welke bestanden beschikbaar zijn. Alleen metadata (id, titel, type); geen inhoud.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_artifact_content',
      description: 'Inhoud van één specifiek bestand ophalen op basis van het artifact-id (uit get_user_artifacts). Alleen voor bestanden van type "file" met een storage_path. Gebruik alleen artifact-ids uit de lijst van deze gebruiker.',
      parameters: {
        type: 'object',
        properties: {
          artifact_id: { type: 'string', description: 'UUID van het artifact (uit get_user_artifacts)' }
        },
        required: ['artifact_id'],
        additionalProperties: false
      }
    }
  }
]

/**
 * Voer een tool uit. Alle toegang strikt beperkt tot owner_id = userId.
 * Gebruiker X ziet nooit data van gebruiker Y: elke query filtert op owner_id.
 * @returns {Promise<string>} JSON-string met resultaat of fout.
 */
async function executeTool(name, args, userId, supabase) {
  if (name === 'get_user_artifacts') {
    const { data, error } = await supabase
      .from('groei_cockpit_artifacts')
      .select('id, title, type')
      .eq('owner_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return JSON.stringify({ error: 'Kon lijst niet ophalen' })
    return JSON.stringify({ artifacts: (data || []).map((a) => ({ id: a.id, title: a.title || '(geen titel)', type: a.type })) })
  }

  if (name === 'get_artifact_content') {
    const artifactId = args && typeof args.artifact_id === 'string' ? args.artifact_id.trim() : null
    if (!artifactId) return JSON.stringify({ error: 'artifact_id is verplicht' })

    const { data: art, error: artError } = await supabase
      .from('groei_cockpit_artifacts')
      .select('id, storage_path, mime_type, title, owner_id, type')
      .eq('id', artifactId)
      .eq('owner_id', userId)
      .is('deleted_at', null)
      .single()

    if (artError || !art) return JSON.stringify({ error: 'Niet gevonden' })
    if (art.owner_id !== userId) return JSON.stringify({ error: 'Niet gevonden' })
    if (art.type !== 'file' || !art.storage_path) return JSON.stringify({ error: 'Geen bestand of geen inhoud' })

    const { data: fileData, error: downloadErr } = await supabase.storage.from(BUCKET).download(art.storage_path)
    if (downloadErr || !fileData) return JSON.stringify({ error: 'Bestand kon niet worden geladen' })
    if (fileData.length > MAX_ARTIFACT_CONTENT_BYTES) return JSON.stringify({ error: 'Bestand te groot om te tonen (max 500 KB)' })

    const mime = (art.mime_type || '').toLowerCase()
    const textOnly = mime.startsWith('text/') || mime === 'application/json' || mime === 'application/csv' || mime === ''
    if (!textOnly) return JSON.stringify({ error: 'Alleen tekstbestanden (txt, md, json, csv) kunnen als inhoud worden opgehaald. Gebruik voor andere bestanden de "Koppel"-knop in de chat.' })

    const text = fileData.toString('utf8')
    return JSON.stringify({ title: art.title, mime_type: art.mime_type, content: text })
  }

  return JSON.stringify({ error: 'Onbekende tool' })
}

function getSupabaseService() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

function getSupabaseAnon() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
}

router.post('/process', processLimiter, async (req, res) => {
  const startTime = Date.now()
  const body = req.body || {}
  // Ondersteun zowel snake_case (frontend) als camelCase (sommige proxies)
  const referencedArtifactIds = Array.isArray(body.referenced_artifact_ids)
    ? body.referenced_artifact_ids
    : Array.isArray(body.referencedArtifactIds)
      ? body.referencedArtifactIds
      : []
  const conversationId = body.conversation_id || body.conversationId
  const messageId = body.message_id || body.messageId

  console.log('GroeiCockpit process ontvangen', {
    conversation_id: conversationId,
    refIds: referencedArtifactIds,
    refIdsLength: referencedArtifactIds.length,
    bodyKeys: Object.keys(body)
  })

  if (!conversationId) {
    return res.status(400).json({ error: 'conversation_id is verplicht' })
  }

  const authz = req.headers.authorization || ''
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authorization Bearer token is verplicht' })
  }

  const supabaseAnon = getSupabaseAnon()
  const { data: authData, error: authError } = await supabaseAnon.auth.getUser(token)
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: 'Ongeldige of verlopen token' })
  }
  const userId = authData.user.id

  const supabase = getSupabaseService()

  const { data: conversation, error: convError } = await supabase
    .from('groei_cockpit_conversations')
    .select('id, user_id, metadata')
    .eq('id', conversationId)
    .is('deleted_at', null)
    .single()

  if (convError || !conversation) {
    return res.status(404).json({ error: 'Conversatie niet gevonden' })
  }
  if (conversation.user_id !== userId) {
    return res.status(403).json({ error: 'Geen toegang tot deze conversatie' })
  }

  const agentId = conversation.metadata?.openclaw_agent_id || conversation.metadata?.agent_id
  if (!agentId) {
    return res.status(400).json({ error: 'Geen OpenClaw-agent gekoppeld aan deze conversatie' })
  }
  if (!ALLOWED_AGENT_IDS.includes(agentId)) {
    return res.status(400).json({ error: 'Agent niet toegestaan' })
  }

  if (processingConversations.has(conversationId)) {
    return res.status(429).json({ error: 'Er wordt al een bericht voor dit gesprek verwerkt. Wacht op het antwoord.' })
  }
  processingConversations.add(conversationId)

  try {
  const { data: messages, error: msgError } = await supabase
    .from('groei_cockpit_messages')
    .select('id, seq, role, content, content_type')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('seq', { ascending: true })

  if (msgError) {
    return res.status(500).json({ error: 'Kon berichten niet ophalen' })
  }

  const recentMessages = (messages || []).slice(-MAX_HISTORY_MESSAGES)
  const lastUserContent = recentMessages.filter((m) => m.role === 'user').pop()?.content || ''

  const inputItems = []
  for (const m of recentMessages) {
    if (['system', 'developer', 'user', 'assistant'].includes(m.role)) {
      let text = m.content || ''
      if (text.length > MAX_MESSAGE_CONTENT_LENGTH) {
        text = text.slice(0, MAX_MESSAGE_CONTENT_LENGTH) + '\n[... afgekapt]'
      }
      inputItems.push({
        type: 'message',
        role: m.role,
        content: [{ type: 'input_text', text }]
      })
    }
  }

  // Bijlagen: via input_file base64 in /v1/responses. Backend haalt bestanden op uit Supabase en stuurt de bytes inline
  // (geen signed URLs of /v1/media-endpoint nodig).
  const refIds = Array.isArray(referencedArtifactIds) ? referencedArtifactIds : []
  if (refIds.length > 2) {
    console.warn('GroeiCockpit: te veel bijlagen in één bericht', { refIdsCount: refIds.length })
    await insertFallbackMessage(
      supabase,
      conversationId,
      userId,
      'Je kunt maximaal 2 bijlagen per bericht meesturen. Verwijder een deel en probeer het opnieuw.'
    )
    return res.status(200).json({ ok: true })
  }

  // Eerst alle artifacts ophalen en valideren; daarna base64 input_file-parts bouwen.
  let filePartsBase64 = []
  if (refIds.length > 0) {
    console.log('GroeiCockpit referenced_artifact_ids', { refIds })
    const payloads = []
    for (const artifactId of refIds) {
      try {
        const payload = await fetchArtifactStream({ artifactId, userId, supabase })
        payloads.push(payload)
      } catch (err) {
        console.warn('GroeiCockpit attachment fetch failed', { artifactId, message: err.message })
        await insertFallbackMessage(
          supabase,
          conversationId,
          userId,
          err.message || 'Bijlage kon niet worden meegestuurd. Controleer grootte (max 5 MB) en bestandstype.'
        )
        return res.status(200).json({ ok: true })
      }
    }
    if (payloads.length > 0) {
      filePartsBase64 = payloads.map((p) => ({
        type: 'input_file',
        source: {
          type: 'base64',
          media_type: p.mediaType,
          data: p.buffer.toString('base64'),
          filename: p.filename
        }
      }))
    }
    if (filePartsBase64.length > 0) {
      console.log('GroeiCockpit input_file base64 parts', { count: filePartsBase64.length })
    }
  }

  const attachmentInstruction = filePartsBase64.length > 0
    ? `[Instructie: geef een samenvatting van de bijlage, tenzij de gebruiker specifiek om iets anders vraagt.]\n\n`
    : ''
  let lastUserIndex = -1
  for (let i = inputItems.length - 1; i >= 0; i--) {
    if (inputItems[i].type === 'message' && inputItems[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }

  if (filePartsBase64.length > 0) {
    if (lastUserIndex === -1) {
      inputItems.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: attachmentInstruction + (lastUserContent || '(lege vraag)') }]
      })
    } else {
      const msg = inputItems[lastUserIndex]
      const textPart = Array.isArray(msg.content) ? msg.content.find((c) => c.type === 'input_text') : null
      if (textPart && textPart.text != null) {
        textPart.text = attachmentInstruction + textPart.text
      }
    }
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!gatewayUrl || !gatewayToken) {
    await insertFallbackMessage(supabase, conversationId, userId, 'Gateway niet geconfigureerd.')
    return res.status(200).json({ ok: true })
  }

  let currentInput = inputItems.length > 0 ? inputItems : [{
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: lastUserContent || 'hoi' }]
  }]
  if (filePartsBase64.length > 0) {
    currentInput = [...currentInput, ...filePartsBase64]
  }

  const totalAttachments = filePartsBase64.length
  console.log('GroeiCockpit OpenClaw calling', { agentId, conversation_id: conversationId, attachmentsCount: totalAttachments })
  let lastRequestId
  try {
    let data = null
    let round = 0
    while (round < MAX_TOOL_ROUNDS) {
      round++
      const { data: responseData, requestId } = await postResponses({
        conversationId,
        input: currentInput,
        agentId,
        tools: TOOLS_ENABLED ? GROEI_COCKPIT_TOOLS : undefined
      })
      data = responseData
      lastRequestId = requestId

      const duration = Date.now() - startTime
      console.log('GroeiCockpit OpenClaw response', {
        requestId,
        conversation_id: conversationId,
        outputLength: data?.output?.length,
        durationMs: duration
      })
      if (round === 1) {
        console.log('GroeiCockpit OpenClaw response body', {
          conversation_id: conversationId,
          topLevelKeys: data ? Object.keys(data) : [],
          outputLength: data?.output?.length,
          firstOutputType: data?.output?.[0]?.type,
          sample: JSON.stringify(data?.output?.slice(0, 2)).slice(0, 600)
        })
      }

      const functionCalls = (data?.output || []).filter((item) => item.type === 'function_call')
      if (functionCalls.length === 0) break

      const functionCallOutputs = []
      for (const fc of functionCalls) {
        let args = {}
        try {
          if (fc.arguments && typeof fc.arguments === 'string') args = JSON.parse(fc.arguments)
        } catch (_) {}
        const result = await executeTool(fc.name, args, userId, supabase)
        functionCallOutputs.push({
          type: 'function_call_output',
          call_id: fc.call_id || fc.id || `call_${round}_${functionCalls.indexOf(fc)}`,
          output: result
        })
      }
      currentInput = [...(currentInput || []), ...(data.output || []), ...functionCallOutputs]
    }

    const text = extractAssistantText(data)
    if (!text) {
      console.log('GroeiCockpit: geen tekst uit response gehaald – controleer sample hierboven')
    }
    if (text) {
      const nextSeq = await getNextSeq(supabase, conversationId)
      const { error: insertErr } = await supabase.from('groei_cockpit_messages').insert({
        conversation_id: conversationId,
        seq: nextSeq,
        role: 'assistant',
        content: text,
        content_type: 'plain',
        created_by: null
      })
      if (insertErr) {
        console.error('GroeiCockpit insert assistant message failed', { conversation_id: conversationId, error: insertErr.message })
      } else {
        console.log('GroeiCockpit assistant message written', { conversation_id: conversationId, contentLength: text.length })
      }
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    if (err.name === 'AbortError' || (err.message && err.message.includes('timeout'))) {
      console.error('GroeiCockpit OpenClaw timeout', { conversation_id: conversationId, agentId })
      await insertFallbackMessage(
        supabase,
        conversationId,
        userId,
        'De AI reageerde niet op tijd. Probeer het later opnieuw of met een kortere vraag.'
      )
    } else {
      const requestId = typeof lastRequestId !== 'undefined' ? lastRequestId : 'n/a'
      console.error('GroeiCockpit OpenClaw request failed', { conversation_id: conversationId, message: err.message, code: err.code, requestId })
      const gatewayMsg = err.body ? parseGatewayError(err.status || 500, err.body) : ''
      const detail = gatewayMsg || err.message ? ` (${err.message})` : ''
      await insertFallbackMessage(supabase, conversationId, userId, gatewayMsg ? `Gateway-fout: ${gatewayMsg}` : `${FALLBACK_MESSAGE}${detail}`)
    }
    return res.status(200).json({ ok: true })
  }
  } finally {
    processingConversations.delete(conversationId)
  }
})

function extractAssistantText(data) {
  if (!data || !Array.isArray(data.output)) return ''
  let result = ''
  for (const item of data.output) {
    if (item.type === 'output_text' && item.content) {
      const parts = Array.isArray(item.content) ? item.content : [item.content]
      result += parts.map((c) => (c && c.text) || '').join('')
    }
    if (item.type === 'message' && item.role === 'assistant' && Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part && (part.type === 'output_text' || part.type === 'text') && part.text) {
          result += part.text
        }
      }
    }
  }
  return result.trim()
}

async function getNextSeq(supabase, conversationId) {
  const { data } = await supabase
    .from('groei_cockpit_messages')
    .select('seq')
    .eq('conversation_id', conversationId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.seq ?? 0) + 1
}

async function insertFallbackMessage(supabase, conversationId, userId, text) {
  const nextSeq = await getNextSeq(supabase, conversationId)
  await supabase.from('groei_cockpit_messages').insert({
    conversation_id: conversationId,
    seq: nextSeq,
    role: 'assistant',
    content: text,
    content_type: 'plain',
    created_by: null
  })
}

module.exports = router
