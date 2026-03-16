/**
 * Supabase attachment proxy: haal artifact op uit Storage, valideer owner/limieten, retourneer buffer + metadata.
 * Gebruikt door groei-cockpit om bijlagen server-side te downloaden en naar OpenClaw /v1/media te uploaden.
 * Geen signed URLs naar de Gateway of client.
 */

const crypto = require('crypto')

const BUCKET = 'groei-cockpit-uploads'
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB
// Gateway-allowed mimes voor input_file (zie Handleiding_openclaw.md):
// text/plain, text/markdown, text/html, text/csv, application/json, application/pdf
const ALLOWED_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
  'application/pdf'
])

/**
 * Sanitize filename: strip path components, beperk lengte.
 */
function sanitizeFilename(name) {
  if (typeof name !== 'string') return 'bestand'
  const base = name.replace(/^.*[/\\]/, '').trim()
  return base.slice(0, 255) || 'bestand'
}

/**
 * Haal één artifact op voor de gegeven gebruiker. Valideert owner, niet verwijderd, size en mime.
 * @param {Object} opts
 * @param {string} opts.artifactId - UUID uit groei_cockpit_artifacts
 * @param {string} opts.userId - owner_id moet matchen
 * @param {object} opts.supabase - Supabase client (service role)
 * @returns {Promise<{ artifactId: string, fileId: string, filename: string, mediaType: string, sizeBytes: number, buffer: Buffer, sha256: string }>}
 * @throws {Error} bij geen rechten, verwijderd, te groot, verkeerd mime of ontbrekend bestand
 */
async function fetchArtifactStream({ artifactId, userId, supabase }) {
  const { data: art, error: artError } = await supabase
    .from('groei_cockpit_artifacts')
    .select('id, storage_path, mime_type, title, owner_id, size_bytes, type')
    .eq('id', artifactId)
    .eq('owner_id', userId)
    .eq('type', 'file')
    .is('deleted_at', null)
    .single()

  if (artError || !art) {
    throw new Error('Bijlage niet gevonden of geen toegang')
  }
  if (art.owner_id !== userId) {
    throw new Error('Geen toegang tot deze bijlage')
  }
  if (!art.storage_path || typeof art.storage_path !== 'string') {
    throw new Error('Bestand ontbreekt of is geen bestand')
  }

  const mediaType = (art.mime_type || 'application/octet-stream').toLowerCase()
  if (!ALLOWED_MIMES.has(mediaType)) {
    throw new Error('Bestandstype wordt niet ondersteund voor analyse')
  }

  const { data: fileData, error: downloadErr } = await supabase.storage
    .from(BUCKET)
    .download(art.storage_path)

  if (downloadErr || !fileData) {
    throw new Error('Bestand kon niet worden geladen')
  }

  let buffer
  if (Buffer.isBuffer(fileData)) {
    buffer = fileData
  } else if (typeof fileData.arrayBuffer === 'function') {
    const ab = await fileData.arrayBuffer()
    buffer = Buffer.from(ab)
  } else {
    throw new Error('Onverwacht bestandsformaat')
  }

  const sizeBytes = buffer.length
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error('Bestand te groot (maximaal 5 MB per bestand)')
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  const filename = sanitizeFilename(art.title || 'bestand')

  console.log('GroeiCockpit attachment proxy', {
    artifactId: art.id,
    fileId: `artifact_${art.id}`,
    filename,
    mediaType,
    sizeBytes,
    sha256: sha256.slice(0, 16) + '…'
  })

  return {
    artifactId: art.id,
    fileId: `artifact_${art.id}`,
    filename,
    mediaType,
    sizeBytes,
    buffer,
    sha256
  }
}

module.exports = {
  fetchArtifactStream,
  sanitizeFilename,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_MIMES,
  BUCKET
}
