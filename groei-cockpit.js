/**
 * GroeiCockpit – POST /process: verwerk nieuw user-bericht en roep OpenClaw Gateway aan.
 * Zie docs/FASE5_OPENCLAW_PLAN.md.
 */
const express = require('express')
const rateLimit = require('express-rate-limit')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')
const fetch = require('node-fetch')

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
const OPENCLAW_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS) || 45000
const FALLBACK_MESSAGE = 'Ik liep vast, probeer het later opnieuw.'

/** Agent-whitelist: alleen deze ids zijn toegestaan (handmatig bijhouden). */
const ALLOWED_AGENT_IDS = (process.env.OPENCLAW_ALLOWED_AGENTS || 'main,nieuwe-technieken,prive').split(',').map((s) => s.trim()).filter(Boolean)

function getSupabaseService() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

function getSupabaseAnon() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
}

router.post('/process', processLimiter, async (req, res) => {
  const startTime = Date.now()
  const { conversation_id: conversationId, message_id: messageId, referenced_artifact_ids: referencedArtifactIds = [] } = req.body || {}

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
      inputItems.push({ type: 'message', role: m.role, content: [{ type: 'text', text: m.content || '' }] })
    }
  }

  if (referencedArtifactIds && referencedArtifactIds.length > 0) {
    const { data: artifacts } = await supabase
      .from('groei_cockpit_artifacts')
      .select('id, storage_path, mime_type, title, owner_id')
      .in('id', referencedArtifactIds)
      .eq('owner_id', userId)
      .eq('type', 'file')
      .not('storage_path', 'is', null)

    if (artifacts) {
      for (const art of artifacts) {
        const { data: fileData, error: downloadErr } = await supabase.storage.from(BUCKET).download(art.storage_path)
        if (downloadErr || !fileData) continue
        const base64 = fileData.toString('base64')
        const mediaType = art.mime_type || 'text/plain'
        if (base64.length > 200 * 1024) continue
        inputItems.push({
          type: 'input_file',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64,
            filename: art.title || 'bestand'
          }
        })
      }
    }
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN
  if (!gatewayUrl || !gatewayToken) {
    await insertFallbackMessage(supabase, conversationId, userId, 'Gateway niet geconfigureerd.')
    return res.status(200).json({ ok: true })
  }

  const url = `${gatewayUrl.replace(/\/$/, '')}/v1/responses`
  const body = {
    model: `openclaw:${agentId}`,
    input: inputItems.length ? inputItems : [{ type: 'message', role: 'user', content: [{ type: 'text', text: lastUserContent || '(lege vraag)' }] }],
    stream: false
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OPENCLAW_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    const duration = Date.now() - startTime
    if (!response.ok) {
      const errText = await response.text()
      console.error('GroeiCockpit OpenClaw error', { conversation_id: conversationId, status: response.status, body: errText, duration })
      await insertFallbackMessage(supabase, conversationId, userId, FALLBACK_MESSAGE)
      return res.status(200).json({ ok: true })
    }

    const data = await response.json()
    const text = extractAssistantText(data)
    if (text) {
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

    if (process.env.NODE_ENV !== 'production') {
      console.log('GroeiCockpit process', { conversation_id: conversationId, agent_id: agentId, duration, usage: data?.usage })
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      await insertFallbackMessage(supabase, conversationId, userId, FALLBACK_MESSAGE)
    } else {
      console.error('GroeiCockpit process error', err)
      await insertFallbackMessage(supabase, conversationId, userId, FALLBACK_MESSAGE)
    }
    return res.status(200).json({ ok: true })
  }
  } finally {
    processingConversations.delete(conversationId)
  }
})

function extractAssistantText(data) {
  if (!data || !Array.isArray(data.output)) return ''
  for (const item of data.output) {
    if (item.type === 'output_text' && item.content) {
      const parts = Array.isArray(item.content) ? item.content : [item.content]
      return parts.map((c) => (c && c.text) || '').join('')
    }
  }
  return ''
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
