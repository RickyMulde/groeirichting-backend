/**
 * GroeiCockpit – POST /process: verwerk nieuw user-bericht en roep OpenClaw Gateway aan.
 * Zie docs/FASE5_OPENCLAW_PLAN.md.
 */
const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const fetch = require('node-fetch')
const crypto = require('crypto')

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
/** Timeout OpenClaw-call (zonder en met bijlage). Agent kan configuratie e.d. doen, dus ruim 120 s. */
const OPENCLAW_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS) || 120000
const OPENCLAW_TIMEOUT_ATTACHMENT_MS = Number(process.env.OPENCLAW_TIMEOUT_ATTACHMENT_MS) || 120000
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
/** Bestanden als signed URL meesturen (Gateway haalt zelf op). Zet GROEI_COCKPIT_FILE_VIA_URL=false voor base64 (inline). */
const FILE_VIA_URL = process.env.GROEI_COCKPIT_FILE_VIA_URL !== 'false'
const SIGNED_URL_EXPIRES_SEC = 600
/** Max grootte bestand voor inline versturen naar OpenClaw (5 MB). */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
/** Toegestane mime-types voor bijlagen richting OpenClaw (moet matchen met gateway.files.allowedMimes). */
const ALLOWED_ATTACHMENT_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation'
])
/** Max grootte bestandsinhoud (bytes) die we aan de agent teruggeven. */
const MAX_ARTIFACT_CONTENT_BYTES = 500 * 1024
/** Geschatte wachttijd (seconden) voor agent bij bijlagen: signed-URL-generatie + marge. createSignedUrl ~100–400 ms per bestand. */
const ATTACHMENT_WAIT_SEC = Number(process.env.GROEI_COCKPIT_ATTACHMENT_WAIT_SEC) || 5

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

  // Bestanden: standaard als signed URL (Gateway haalt zelf op); optioneel base64 via env.
  // Volgens OpenClaw-spec horen input_file parts binnen de content-array van het user-bericht.
  const fileParts = []
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
  let totalAttachmentBytes = 0
  if (refIds.length > 0) {
    console.log('GroeiCockpit referenced_artifact_ids', { refIds, fileViaUrl: FILE_VIA_URL })
    const { data: artifacts } = await supabase
      .from('groei_cockpit_artifacts')
      .select('id, storage_path, mime_type, title, owner_id')
      .in('id', refIds)
      .eq('owner_id', userId)
      .eq('type', 'file')
      .not('storage_path', 'is', null)

    if (!artifacts || artifacts.length === 0) {
      console.warn('GroeiCockpit geen artifacts gevonden voor refIds – hasFileParts blijft false', { refIds, userId, hint: 'Controleer: owner_id, type=file, storage_path niet null' })
    }
    if (artifacts) {
      for (const art of artifacts) {
        const mediaType = (art.mime_type || 'application/octet-stream').toLowerCase()
        if (!ALLOWED_ATTACHMENT_MIMES.has(mediaType)) {
          console.warn('GroeiCockpit file skip (mime niet toegestaan)', { artifactId: art.id, mime_type: mediaType })
          await insertFallbackMessage(
            supabase,
            conversationId,
            userId,
            'Dit bestandstype wordt nog niet ondersteund voor analyse. Kies een van de toegestane typen (pdf, Word, Excel, PowerPoint, txt, md).'
          )
          return res.status(200).json({ ok: true })
        }
        const filename = art.title || 'bestand'

        if (FILE_VIA_URL) {
          const path = (art.storage_path || '').trim()
          if (!path) {
            console.warn('GroeiCockpit file skip (URL): geen storage_path', { artifactId: art.id })
            continue
          }
          const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRES_SEC)
          if (signErr) {
            console.warn('GroeiCockpit file skip (signed URL)', { artifactId: art.id, error: signErr.message })
            continue
          }
          const signedUrl = signed?.signedUrl || signed?.signed_url
          if (!signedUrl || typeof signedUrl !== 'string') {
            console.warn('GroeiCockpit file skip (signed URL): geen url in response', { artifactId: art.id })
            continue
          }
          console.log('GroeiCockpit [DEBUG] signed URL aangemaakt', {
            artifactId: art.id,
            filename,
            media_type: mediaType,
            urlPrefix: signedUrl.slice(0, 80) + (signedUrl.length > 80 ? '…' : ''),
            urlLength: signedUrl.length,
            geldigSeconden: SIGNED_URL_EXPIRES_SEC
          })
          fileParts.push({
            type: 'input_file',
            source: {
              type: 'url',
              url: signedUrl,
              filename,
              media_type: mediaType
            }
          })
          continue
        }

        const { data: fileData, error: downloadErr } = await supabase.storage.from(BUCKET).download(art.storage_path)
        if (downloadErr || !fileData) {
          console.warn('GroeiCockpit file skip', { artifactId: art.id, error: downloadErr?.message, hasData: !!fileData })
          continue
        }
        let buf
        if (Buffer.isBuffer(fileData)) {
          buf = fileData
        } else if (typeof fileData.arrayBuffer === 'function') {
          const ab = await fileData.arrayBuffer()
          buf = Buffer.from(ab)
        } else {
          console.warn('GroeiCockpit file skip (onbekend type)', { filename: art.title, type: typeof fileData })
          continue
        }
        const sizeBytes = buf.length
        if (sizeBytes > MAX_ATTACHMENT_BYTES) {
          console.warn('GroeiCockpit file skip (te groot voor inline versturen)', {
            filename: art.title,
            sizeBytes,
            maxBytes: MAX_ATTACHMENT_BYTES
          })
          await insertFallbackMessage(
            supabase,
            conversationId,
            userId,
            'Een bijlage is te groot om mee te sturen (maximaal 5 MB per bestand). Verklein het bestand en probeer het opnieuw.'
          )
          return res.status(200).json({ ok: true })
        }
        const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
        totalAttachmentBytes += sizeBytes
        const base64 = buf.toString('base64')
        console.log('GroeiCockpit attaching file (inline base64)', {
          artifactId: art.id,
          filename: art.title,
          bytes: sizeBytes,
          base64Length: base64.length,
          media_type: mediaType,
          sha256
        })
        fileParts.push({
          type: 'input_file',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64,
            filename
          }
        })
      }
    }
    if (refIds.length > 0 && fileParts.length === 0) {
      console.warn('GroeiCockpit refIds aanwezig maar geen fileParts – alle bestanden overgeslagen (mime, signed URL of download)', { refIds, artifactsCount: artifacts?.length })
    }
  }

  if (fileParts.length > 0) {
    console.log('GroeiCockpit fileParts toegevoegd aan request', {
      count: fileParts.length,
      viaUrl: FILE_VIA_URL,
      totalAttachmentBytes
    })
  }

  // Debug: controleer of input_file in message.content zit
  function debugInputFileParts(items) {
    if (!items || !Array.isArray(items)) return
    items.forEach((item, i) => {
      if (item.type === 'message' && Array.isArray(item.content)) {
        item.content.forEach((c, j) => {
          if (c.type === 'input_file' && c.source) {
            console.log('GroeiCockpit [DEBUG] input_file in message.content', {
              messageIndex: i,
              role: item.role,
              contentIndex: j,
              sourceType: c.source.type,
              hasUrl: Boolean(c.source.url),
              filename: c.source.filename
            })
          }
        })
      }
    })
  }

  // Gateway-schema: input_file mag ALLEEN binnen de content-array van een message (geen top-level).
  // We zetten instructie + usertekst in input_text en voegen fileParts toe aan de content van het laatste user-bericht.
  const attachmentWaitInstruction = fileParts.length > 0
    ? `[Instructie: geef een samenvatting van de bijlage, tenzij de gebruiker specifiek om iets anders vraagt.]\n\n`
    : ''
  if (fileParts.length > 0) {
    let lastUserIndex = -1
    for (let i = inputItems.length - 1; i >= 0; i--) {
      const item = inputItems[i]
      if (item.type === 'message' && item.role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) {
      const text = attachmentWaitInstruction + (lastUserContent || '(lege vraag)')
      inputItems.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }, ...fileParts]
      })
    } else {
      const msg = inputItems[lastUserIndex]
      if (!Array.isArray(msg.content)) msg.content = []
      const textPart = msg.content.find((c) => c.type === 'input_text')
      if (textPart && textPart.text != null) {
        textPart.text = attachmentWaitInstruction + textPart.text
      } else if (textPart) {
        textPart.text = attachmentWaitInstruction
      }
      msg.content = [...msg.content, ...fileParts]
    }
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!gatewayUrl || !gatewayToken) {
    await insertFallbackMessage(supabase, conversationId, userId, 'Gateway niet geconfigureerd.')
    return res.status(200).json({ ok: true })
  }

  const url = `${gatewayUrl.replace(/\/$/, '')}/v1/responses`
  const hasFileParts = fileParts.length > 0
  console.log('GroeiCockpit [DEBUG] endpoint', { url, hasFileParts, filePartsCount: fileParts.length, refIdsOntvangen: refIds.length })

  let currentInput = inputItems.length > 0 ? inputItems : [{
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: lastUserContent || 'hoi' }]
  }]
  if (fileParts.length > 0) {
    debugInputFileParts(currentInput)
  }

  const timeoutMs = fileParts.length > 0 ? OPENCLAW_TIMEOUT_ATTACHMENT_MS : OPENCLAW_TIMEOUT_MS
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const openclawRequestId = `gr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  /** Maak een kopie van body geschikt voor logging: base64 e.d. afkappen. */
  function bodyForLog(body) {
    const out = { model: body.model, stream: body.stream }
    if (body.tools) out.tools = body.tools
    if (Array.isArray(body.input)) {
      out.input = body.input.map((item) => {
        if (item.type === 'message') {
          return {
            type: item.type,
            role: item.role,
            content: (item.content || []).map((c) => {
              if (c.type === 'input_file' && c.source?.data) {
                return { type: c.type, source: { ...c.source, data: `<base64, ${c.source.data.length} chars>` } }
              }
              return c
            })
          }
        }
        if (item.type === 'input_file' && item.source) {
          const s = item.source
          if (s.data) return { type: item.type, source: { ...s, data: `<base64, ${s.data.length} chars>` } }
          if (s.url) return { type: item.type, source: { ...s, url: '<signed url>' } }
        }
        return item
      })
    } else {
      out.input = body.input
    }
    return out
  }

  console.log('GroeiCockpit OpenClaw calling', { url, agentId, conversation_id: conversationId })
  try {
    let data = null
    let round = 0
    while (round < MAX_TOOL_ROUNDS) {
      round++
      const body = {
        model: `openclaw:${agentId}`,
        input: currentInput,
        stream: false
      }
      if (TOOLS_ENABLED) body.tools = GROEI_COCKPIT_TOOLS
      if (round === 1) {
        const maskedBody = bodyForLog(body)
        const payloadJson = JSON.stringify(maskedBody)
        const bodyBytes = Buffer.byteLength(JSON.stringify(body), 'utf8')
        console.log('GroeiCockpit [OPENCLAW_REQUEST_ID] %s', openclawRequestId)
        console.log('GroeiCockpit [OPENCLAW_TIMESTAMP] %s', new Date().toISOString())
        console.log('GroeiCockpit [OPENCLAW_PAYLOAD_JSON] %s', payloadJson)
        console.log('GroeiCockpit [OPENCLAW] url=%s bodySizeBytes=%s', url, bodyBytes)
        if (fileParts.length > 0) {
          debugInputFileParts(body.input)
        }
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gatewayToken}`,
          'Content-Type': 'application/json',
          'X-Request-ID': openclawRequestId
        },
        body: JSON.stringify(body),
        signal: controller.signal
      })

      const duration = Date.now() - startTime
      console.log('GroeiCockpit OpenClaw response ontvangen', {
        requestId: openclawRequestId,
        status: response.status,
        statusText: response.statusText,
        url,
        durationMs: duration
      })
      if (!response.ok) {
        const errText = await response.text()
        const gatewayMessage = parseGatewayError(response.status, errText)
        console.error('GroeiCockpit OpenClaw error', { conversation_id: conversationId, status: response.status, statusText: response.statusText, body: errText, duration })
        const messageForUser = gatewayMessage ? `Gateway-fout: ${gatewayMessage}` : FALLBACK_MESSAGE
        await insertFallbackMessage(supabase, conversationId, userId, messageForUser)
        return res.status(200).json({ ok: true })
      }

      data = await response.json()
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

    clearTimeout(timeoutId)

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
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      console.error('GroeiCockpit OpenClaw timeout', { conversation_id: conversationId, agentId, timeoutMs, requestId: openclawRequestId })
      await insertFallbackMessage(
        supabase,
        conversationId,
        userId,
        'De AI reageerde niet op tijd. Probeer het later opnieuw of met een kortere vraag.'
      )
    } else {
      console.error('GroeiCockpit OpenClaw request failed', { conversation_id: conversationId, message: err.message, code: err.code, requestId: openclawRequestId })
      const detail = err.message ? ` (${err.message})` : ''
      await insertFallbackMessage(supabase, conversationId, userId, `${FALLBACK_MESSAGE}${detail}`)
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
