# Attachment pipeline (GroeiCockpit → OpenClaw)

Bijlagen gaan via de **media-API**: backend haalt bestanden server-side uit Supabase op, uploadt ze naar de OpenClaw Gateway via `POST /v1/media`, en verwijst in `POST /v1/responses` met `media_id`. Geen signed URLs naar de Gateway of client.

## Flow

```
[Frontend] → referenced_artifact_ids in body
     ↓
[Backend]  → voor elk artifact:
     → lib/supabaseAttachmentProxy: fetchArtifactStream (valideer owner, size, mime; download uit Storage)
     → lib/openclawMediaClient: uploadMedia (POST /v1/media multipart) → mediaId
     ↓
     → lib/openclawResponsesClient: postResponses (input met attachments: id, media_id, name, content_type)
     ↓
[Gateway]  → /v1/responses met message.attachments[]
```

## Env-variabelen

| Variabele | Beschrijving |
|-----------|--------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (voor Storage + groei_cockpit_artifacts) |
| `OPENCLAW_GATEWAY_URL` | Bijv. `https://gateway.groeirichting.nl` |
| `OPENCLAW_GATEWAY_TOKEN` | Bearer token voor de Gateway |
| `OPENCLAW_AGENT_ID` | Optioneel; default komt uit conversatie-metadata |
| `OPENCLAW_TIMEOUT_MS` | Timeout voor /v1/responses (default 120000) |

## Limieten

- Max **2** bijlagen per bericht.
- Max **5 MB** per bestand.
- Toegestane MIME-types: o.a. `text/plain`, `text/markdown`, `application/pdf`, Office (docx, xlsx, pptx), ODF.

Zie `lib/supabaseAttachmentProxy.js` → `ALLOWED_MIMES` en `MAX_ATTACHMENT_BYTES`.

## Foutmeldingen naar de gebruiker

- "Je kunt maximaal 2 bijlagen per bericht meesturen."
- "Bijlage niet gevonden of geen toegang"
- "Bestandstype wordt niet ondersteund voor analyse"
- "Bestand te groot (maximaal 5 MB per bestand)"
- "Bestand kon niet worden geladen"
- "Media upload mislukt" / "Gateway-fout: …"

## Logging

- `requestId`, `mediaId`, `sha256` (eerste 16 tekens), `sizeBytes` bij upload en in proxy.
- Zie console-uitvoer: `GroeiCockpit attachment proxy`, `GroeiCockpit media upload`, `GroeiCockpit mediaRefs`, `GroeiCockpit OpenClaw response`.

## Ontvangen bijlagen (agent → backend)

Module `lib/openclawEvents.js` exporteert `fetchMediaBytes(mediaId)` om bytes van de Gateway op te halen. Een volledige SSE-listener op `/v1/events` (voor `media.created` en messages met `media_id`) is nog niet geïmplementeerd; zie TODO in dat bestand. Bij bekend `media_id` kan de backend `fetchMediaBytes` aanroepen en het resultaat (bijv. in Supabase bucket) opslaan.

## Toekomst (TODO)

- Streaming/download-caching: nu wordt het bestand in één buffer in memory gehouden; voor grote bestanden later eventueel streaming overweegen.
- SSE `/v1/events` volledig implementeren (bijv. met package `eventsource`) en ontvangen media persisteren.
