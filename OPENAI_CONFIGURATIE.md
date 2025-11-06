# OpenAI Configuratie Overzicht

Dit document bevat alle configuratie-informatie voor zowel Azure OpenAI als directe OpenAI API.

---

## 🔵 AZURE OPENAI CONFIGURATIE

### GPT-5-mini (Hoofddeployment)

**Environment Variables:**
```
AZURE_OPENAI_ENDPOINT=https://groeirichting-resource.cognitiveservices.azure.com/
AZURE_OPENAI_KEY=<key in .env>
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
AZURE_OPENAI_API_VERSION=2025-04-01-preview
```

**Parameters die worden meegegeven in `createCompletion()`:**
- `model`: `'gpt-5-mini'` (wordt gebruikt om deployment te selecteren, wordt vervangen door deployment naam)
- `messages`: Array van message objects met `role` ('system', 'user', 'assistant') en `content`
- `temperature`: 0-2 (standaard: 1) - Hoe creatief/random het antwoord is
- `max_completion_tokens`: Maximum aantal tokens voor completion
- `max_tokens`: Wordt geconverteerd naar `max_completion_tokens` (backward compatibility)
- `response_format`: Optioneel (bijv. `{ type: 'json_object' }` - niet ondersteund door alle Azure modellen)
- `top_p`: Optioneel (0-1) - Nucleus sampling parameter
- `frequency_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor frequent gebruikte tokens
- `presence_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor nieuwe tokens
- `stop`: Optioneel - Array van strings waar het model moet stoppen

**Huidig gebruik:**
- `generate-organisation-summary.js`: `model: 'gpt-5-mini'`, `temperature: 1`, `max_completion_tokens: 15000`

---

### GPT-4o (Secundaire deployment)

**Environment Variables:**
```
AZURE_OPENAI_ENDPOINT_GPT4O=https://groeirichting-openai.openai.azure.com/
AZURE_OPENAI_KEY_GPT4O=<key in .env>
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o
AZURE_OPENAI_API_VERSION_GPT4O=2024-05-01-preview
```

**Parameters die worden meegegeven in `createCompletion()`:**
- `model`: `'gpt-4o'` (wordt gebruikt om deployment te selecteren, wordt vervangen door deployment naam)
- `messages`: Array van message objects met `role` ('system', 'user', 'assistant') en `content`
- `temperature`: 0-2 (standaard: 1) - Hoe creatief/random het antwoord is
- `max_completion_tokens`: Maximum aantal tokens voor completion
- `max_tokens`: Wordt geconverteerd naar `max_completion_tokens` (backward compatibility)
- `response_format`: Optioneel (bijv. `{ type: 'json_object' }` - niet ondersteund door alle Azure modellen)
- `top_p`: Optioneel (0-1) - Nucleus sampling parameter
- `frequency_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor frequent gebruikte tokens
- `presence_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor nieuwe tokens
- `stop`: Optioneel - Array van strings waar het model moet stoppen

**Huidig gebruik (ORIGINEEL - voor wijzigingen naar gpt-5):**
- `genereer-samenvatting.js`: `model: 'gpt-4o'`, `temperature: 1`, `max_completion_tokens: 2000`
- `genereer-vervolgacties.js`: `model: 'gpt-4o'`, `temperature: 1`, `max_completion_tokens: 4000`
- `generate-top-actions.js`: `model: 'gpt-4o'`, `temperature: 0.3`, `max_completion_tokens: 4000`
- `get-gespreksresultaten-bulk.js`: `model: 'gpt-4o'`, `temperature: 1`, `max_completion_tokens: 4000`

---

### GPT-4.1 SWEDEN (Optie 3)

**Environment Variables:**
```
AZURE_OPENAI_ENDPOINT_GPT4O=https://openaiswedennn.openai.azure.com/
AZURE_OPENAI_KEY_GPT4O=<key in .env>
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4.1
AZURE_OPENAI_API_VERSION_GPT4O=2024-12-01-preview
```

**Parameters die worden meegegeven in `createCompletion()`:**
- `model`: `'gpt-4.1'` (wordt gebruikt om deployment te selecteren, wordt vervangen door deployment naam)
- `messages`: Array van message objects met `role` ('system', 'user', 'assistant') en `content`
- `temperature`: 0-2 (standaard: 1) - Hoe creatief/random het antwoord is
- `max_completion_tokens`: Maximum aantal tokens voor completion
- `max_tokens`: Wordt geconverteerd naar `max_completion_tokens` (backward compatibility)
- `response_format`: Optioneel (bijv. `{ type: 'json_object' }` - niet ondersteund door alle Azure modellen)
- `top_p`: Optioneel (0-1) - Nucleus sampling parameter
- `frequency_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor frequent gebruikte tokens
- `presence_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor nieuwe tokens
- `stop`: Optioneel - Array van strings waar het model moet stoppen

**Huidig gebruik (alleen bij Azure):**
- `decide-followup.js`: `model: 'gpt-4.1'`, `temperature: 1`, `max_completion_tokens: 4000` (alleen bij migratie naar Azure)
- **Let op:** Momenteel gebruikt `decide-followup.js` OpenAI Direct met `gpt-5-mini` (zie preset hieronder)

**⚠️ BELANGRIJK:** 
- Bij Azure wordt de `model` parameter gebruikt om te bepalen welke deployment/client te gebruiken
- De `model` parameter wordt vervangen door de deployment naam voordat de API call wordt gemaakt
- Als je `'gpt-5'` gebruikt maar Azure heeft geen GPT-5 deployment, zal het falen

---

## 🟢 DIRECTE OPENAI API CONFIGURATIE

### Environment Variables

**Verplicht:**
```
OPENAI_API_KEY=<jouw OpenAI API key>
```

**Optioneel:**
```
OPENAI_BASE_URL=https://api.openai.com/v1  (standaard)
OPENAI_MODEL=gpt-5  (standaard)
```

### Algemene Aanbevolen Instellingen (OpenAI Direct)

**Standaard preset voor OpenAI Direct (GPT-5):**
- `model`: `"gpt-5"` - Nieuwste preview versie
- `temperature`: `1` - **Alleen 1 ondersteund** (geen andere waarden mogelijk)
- `max_completion_tokens`: `700–1000` - Ruim genoeg voor reflectie + JSON-output
- `response_format`: `{ "type": "json_object" }` - Nieuw aanbevolen (garandeert geldige JSON)
- `stream`: `false` - Tenzij je tokens real-time wilt tonen
- ❌ **Niet ondersteund door GPT-5:** `top_p`, `frequency_penalty`, `presence_penalty`, `temperature` andere waarden dan 1

**Standaard preset voor OpenAI Direct (GPT-4o - voor volledige controle):**
- `model`: `"gpt-4o"` - Volledige parameter ondersteuning
- `temperature`: `0.4–0.6` - Licht creatief, maar voorspelbaar; voorkomt overdrijving in empathie
- `top_p`: `0.9` - Standaard voor iets natuurlijke variatie
- `max_completion_tokens`: `700–1000` - Ruim genoeg voor reflectie + JSON-output
- `frequency_penalty`: `0.2–0.3` - Voorkomt herhaling van zinnen zoals "Dat klinkt als..."
- `presence_penalty`: `0.3–0.4` - Stimuleert nieuwe invalshoeken en nuance
- `response_format`: `{ "type": "json_object" }` - Nieuw aanbevolen (garandeert geldige JSON)
- `stream`: `false` - Tenzij je tokens real-time wilt tonen
- `seed`: (optioneel) vaste integer - Zorgt voor consistente resultaten bij testen/debuggen

### Parameters die worden meegegeven in `createCompletion()`:

- `model`: Model naam zoals `'gpt-5'`, `'gpt-5-mini'`, `'gpt-4o'`, `'gpt-4o-mini'`, `'gpt-3.5-turbo'`, etc.
  - Als niet opgegeven, wordt `OPENAI_MODEL` gebruikt (standaard: `'gpt-5'`)
  - Je kunt ook een specifieke versie gebruiken zoals `'gpt-5-2025-08-07'` (als beschikbaar)
- `messages`: Array van message objects met `role` ('system', 'user', 'assistant') en `content`
- `temperature`: 0-2 (standaard: 1) - Hoe creatief/random het antwoord is
- `max_completion_tokens`: Maximum aantal tokens voor completion (vereist voor GPT-5)
- `max_tokens`: Wordt geconverteerd naar `max_completion_tokens` (voor backward compatibility)
- `response_format`: Optioneel (bijv. `{ type: 'json_object' }` voor gestructureerde JSON output)
- `top_p`: Optioneel (0-1) - Nucleus sampling parameter
- `frequency_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor frequent gebruikte tokens
- `presence_penalty`: Optioneel (-2.0 tot 2.0) - Penalty voor nieuwe tokens
- `stop`: Optioneel - Array van strings waar het model moet stoppen
- `n`: Optioneel - Aantal completions om te genereren (standaard: 1)
- `stream`: Optioneel - Of responses gestreamd moeten worden (boolean)
- `seed`: Optioneel - Vaste integer voor consistente resultaten

### Beschikbare Modellen (OpenAI Direct):

- `gpt-5` - Nieuwste model (augustus 2025)
- `gpt-5-mini` - Goedkoper, sneller
- `gpt-5-nano` - Zeer goedkoop, zeer snel
- `gpt-4o` - Vorige generatie
- `gpt-4o-mini` - Goedkoper variant
- `gpt-4.1` - Specifieke versie
- `gpt-4.1-mini` - Goedkoper variant
- `gpt-4.1-nano` - Zeer goedkoop variant
- `gpt-3.5-turbo` - Oudere, goedkopere optie

**⚠️ BELANGRIJK:**
- Bij directe OpenAI API gebruik je de echte model naam
- Je kunt model versies specificeren met datum (bijv. `'gpt-5-2025-08-07'`)
- `max_completion_tokens` is de juiste parameter voor GPT-5 (niet `max_tokens`)

---

## 📊 TAAKTYPE-SPECIFIEKE PRESETS (OPENAI DIRECT)

### ⚠️ BELANGRIJK: GPT-5 BEperkingen

**GPT-5 is een preview model met beperkte parameter ondersteuning:**
- ✅ Ondersteunt: `temperature: 1` (alleen 1, geen andere waarden), `max_completion_tokens`, `response_format`, `stream`
- ❌ Ondersteunt NIET: `temperature: 0.5` of andere waarden, `top_p`, `frequency_penalty`, `presence_penalty`

**Voor volledige parameter controle, gebruik `gpt-4o` in plaats van `gpt-5`.**

---

### 1️⃣ Gesprekken voeren: decide-followup.js

**Doel:** Natuurlijke coachende reactie + 0 of 1 vervolgvraag, in strikt JSON.

**Aanbevolen preset (GPT-5 - huidig):**
```javascript
{
  model: "gpt-5",  // Of "gpt-5-2025-08-07" voor specifieke versie
  // temperature wordt automatisch geforceerd naar 1 door openaiClient
  // top_p, frequency_penalty, presence_penalty worden automatisch weggelaten
  max_completion_tokens: 500,  // 400-600 range, 500 is goede middenweg
  response_format: { type: "json_object" },
  stream: false
}
```

**Aanbevolen preset (GPT-5-mini - HUIDIG):**
```javascript
{
  model: "gpt-5-mini",  // Kostenbewust en snel
  max_completion_tokens: 2500,  // Verhoogd voor lange gespreksgeschiedenis
  service_tier: "default",
  response_format: { type: "json_object" },
  stream: false
}
```

**Aanbevolen preset (GPT-4o - voor volledige controle):**
```javascript
{
  model: "gpt-4o",  // Volledige parameter ondersteuning
  temperature: 0.45,  // Geoptimaliseerd voor stabiele JSON + consistente gesprekslogica
  top_p: 0.9,
  max_completion_tokens: 2500,  // Verhoogd voor lange gespreksgeschiedenis
  frequency_penalty: 0.2,
  presence_penalty: 0.3,
  service_tier: "priority",  // Voor snellere response tijden
  response_format: { type: "json_object" },
  stream: false
}
```

**Azure (behoud huidige instellingen):**
- `model: 'gpt-4.1'`
- `temperature: 1`
- `max_completion_tokens: 4000`

**Belangrijk:** GPT-5-mini ondersteunt alleen `temperature: 1` (automatisch geforceerd door openaiClient) en ondersteunt geen `top_p`, `frequency_penalty`, of `presence_penalty`. Huidige configuratie gebruikt `gpt-5-mini` met `service_tier: 'default'` voor kostenbewuste en snelle responses.

---

### 2️⃣ Gesprekssamenvatting + score

**Bestanden:**
- `genereer-samenvatting.js`
- `get-gespreksresultaten-bulk.js` (interne helper `genereerSamenvatting`)

**Doel:** Korte samenvatting in 2e persoon + score 1–10 → stabiel en voorspelbaar, weinig creatief.

**Aanbevolen preset (GPT-5 - huidig):**
```javascript
{
  model: "gpt-5",  // Of "gpt-5-2025-08-07" voor specifieke versie
  // temperature wordt automatisch geforceerd naar 1 door openaiClient
  // top_p, frequency_penalty, presence_penalty worden automatisch weggelaten
  max_completion_tokens: 500,  // 400-600 range, 6 zinnen + JSON is ruimschoots genoeg
  response_format: { type: "json_object" },
  stream: false
}
```

**Aanbevolen preset (GPT-4o - voor volledige controle):**
```javascript
{
  model: "gpt-4o",  // Volledige parameter ondersteuning
  temperature: 0.35,  // 0.3-0.4 range, lager dan bij gesprekken voor stabiele samenvatting
  top_p: 0.9,
  max_completion_tokens: 500,  // 400-600 range, 6 zinnen + JSON is ruimschoots genoeg
  frequency_penalty: 0.15,  // 0.1-0.2 range
  presence_penalty: 0.15,  // 0.1-0.2 range
  response_format: { type: "json_object" },
  stream: false
}
```

**Azure (behoud huidige instellingen):**
- `model: 'gpt-4o'`
- `temperature: 1`
- `max_completion_tokens: 2000`

**Belangrijk:** Gebruik exact dezelfde preset voor beide bestanden om verschillen te voorkomen.

---

### 3️⃣ Individuele vervolgacties per thema

**Bestand:** `genereer-vervolgacties.js`

**Doel:** 3 concrete acties + toelichting, gericht op de werknemer, nog steeds in JSON. Iets meer creativiteit dan bij samenvatting, maar nog steeds betrouwbare structuur.

**Aanbevolen preset (GPT-5 - huidig):**
```javascript
{
  model: "gpt-5",  // Of "gpt-5-2025-08-07" voor specifieke versie
  // temperature wordt automatisch geforceerd naar 1 door openaiClient
  // top_p, frequency_penalty, presence_penalty worden automatisch weggelaten
  max_completion_tokens: 700,  // 600-800 range, 3 acties + toelichting in JSON
  response_format: { type: "json_object" },
  stream: false
}
```

**Aanbevolen preset (GPT-4o - voor volledige controle):**
```javascript
{
  model: "gpt-4o",  // Volledige parameter ondersteuning
  temperature: 0.55,  // 0.5-0.6 range, iets warmer dan samenvatting voor creatieve acties
  top_p: 0.9,
  max_completion_tokens: 700,  // 600-800 range, 3 acties + toelichting in JSON
  frequency_penalty: 0.25,  // 0.2-0.3 range, voorkomt dat alle acties hetzelfde klinken
  presence_penalty: 0.35,  // 0.3-0.4 range, stimuleert nét andere invalshoeken
  response_format: { type: "json_object" },
  stream: false
}
```

**Azure (behoud huidige instellingen):**
- `model: 'gpt-4o'`
- `temperature: 1`
- `max_completion_tokens: 4000`

**Verschil:** Met GPT-4o: samenvatting is kouder (0.35), vervolgacties zijn warmer (0.55).

---

### 4️⃣ Top 3 acties over alle thema's

**Bestand:** `generate-top-actions.js`

**Doel:** Top 3 vervolgacties over alle thema's van één periode, met prioriteit en toelichting → strategische, samenhangende set acties.

**Aanbevolen preset (GPT-5 - huidig):**
```javascript
{
  model: "gpt-5",  // Of "gpt-5-2025-08-07" voor specifieke versie
  // temperature wordt automatisch geforceerd naar 1 door openaiClient
  // top_p, frequency_penalty, presence_penalty worden automatisch weggelaten
  max_completion_tokens: 1050,  // 900-1200 range, 3 acties + uitgebreide toelichting
  response_format: { type: "json_object" },
  stream: false
}
```

**Aanbevolen preset (GPT-4o - voor volledige controle):**
```javascript
{
  model: "gpt-4o",  // Volledige parameter ondersteuning
  temperature: 0.5,  // Betere balans dan 0.3 voor coachende adviezen
  top_p: 0.9,
  max_completion_tokens: 1050,  // 900-1200 range, 3 acties + uitgebreide toelichting
  frequency_penalty: 0.25,  // 0.2-0.3 range
  presence_penalty: 0.4,  // 0.3-0.5 range, stimuleert dat elke actie echt iets anders raakt
  response_format: { type: "json_object" },
  stream: false
}
```

**Azure (behoud huidige instellingen):**
- `model: 'gpt-4o'`
- `temperature: 0.3`
- `max_completion_tokens: 4000`

**Belangrijk:** Met GPT-4o: temperature 0.3 kan acties wat "vlak" maken. 0.5 is vaak een betere balans voor coachende adviezen.

---

### 5️⃣ Organisatie- / team-samenvatting

**Bestand:** `generate-organisation-summary.js`

**Doel:** Op basis van alle gesprekken binnen organisatie of team: samenvatting, verbeteradvies, signaalwoorden, gpt_adviezen (prioriteiten). Dit is zwaarder qua context, maar de output moet concreet én AVG-proof veralgemeniseerd zijn.

**Aanbevolen preset (GPT-5-mini - huidig):**
```javascript
{
  model: "gpt-5-mini",  // Kostenbewust: zware prompts (veel gesprekken)
  // Of "gpt-5-mini-2025-08-07" voor specifieke versie
  // temperature wordt automatisch geforceerd naar 1 door openaiClient
  // top_p, frequency_penalty, presence_penalty worden automatisch weggelaten
  max_completion_tokens: 1500,  // 1200-1800 range, genoeg voor lange samenvatting + adviezen
  response_format: { type: "json_object" },
  stream: false
}
```

**Aanbevolen preset (GPT-4o - voor volledige controle):**
```javascript
{
  model: "gpt-4o",  // Volledige parameter ondersteuning (of gpt-4o-mini voor kostenbesparing)
  temperature: 0.4,  // 0.35-0.45 range, rustige, consistente analyses
  top_p: 0.9,
  max_completion_tokens: 1500,  // 1200-1800 range, genoeg voor lange samenvatting + adviezen
  frequency_penalty: 0.15,  // 0.1-0.2 range
  presence_penalty: 0.15,  // 0.1-0.2 range
  response_format: { type: "json_object" },
  stream: false
}
```

**Azure (behoud huidige instellingen):**
- `model: 'gpt-5-mini'`
- `temperature: 1`
- `max_completion_tokens: 15000`

**Problemen met huidige Azure instellingen:**
- `temperature: 1` → te creatief = risico op "fantasieadviezen"
- `max_completion_tokens: 15000` → onnodig hoog, risico op kosten + langzame responses
- Geen `response_format` → parsing-fouten bij JSON

**Belangrijk:** Kostenbewustzijn is hier belangrijk: dit zijn zware prompts (veel gesprekken). Als je ergens een mini-model wilt gebruiken, dan is het hier.

---

## 📊 ORIGINEEL GEBRUIK PER BESTAND (VOOR WIJZIGINGEN NAAR GPT-5)

### decide-followup.js
- **Azure (origineel):** `model: 'gpt-4.1'`, `temperature: 1`, `max_completion_tokens: 4000`
- **OpenAI Direct (huidig):** `model: 'gpt-5-mini'`, `max_completion_tokens: 2500`, `service_tier: 'default'`, `response_format: { type: 'json_object' }`

### genereer-samenvatting.js
- **Azure (origineel):** `model: 'gpt-4o'`, `temperature: 1`, `max_completion_tokens: 2000`
- **OpenAI Direct (nieuw):** Zie preset hierboven (temperature: 0.35, max_completion_tokens: 500)

### genereer-vervolgacties.js
- **Azure (origineel):** `model: 'gpt-4o'`, `temperature: 1`, `max_completion_tokens: 4000`
- **OpenAI Direct (nieuw):** Zie preset hierboven (temperature: 0.55, max_completion_tokens: 700)

### generate-top-actions.js
- **Azure (origineel):** `model: 'gpt-4o'`, `temperature: 0.3`, `max_completion_tokens: 4000`
- **OpenAI Direct (nieuw):** Zie preset hierboven (temperature: 0.5, max_completion_tokens: 1050)

### generate-organisation-summary.js
- **Azure (origineel):** `model: 'gpt-5-mini'`, `temperature: 1`, `max_completion_tokens: 15000`
- **OpenAI Direct (nieuw):** Zie preset hierboven (temperature: 0.4, max_completion_tokens: 1500)

### get-gespreksresultaten-bulk.js
- **Azure (origineel):** `model: 'gpt-4o'`, `temperature: 1`, `max_completion_tokens: 4000`
- **OpenAI Direct (nieuw):** Zelfde preset als `genereer-samenvatting.js` (temperature: 0.35, max_completion_tokens: 500)

---

## 🚨 BELANGRIJK: AZURE VS OPENAI DIRECT

**Azure heeft alleen deze deployments:**
- `gpt-5-mini` (hoofddeployment)
- `gpt-4o` (secundaire deployment)  
- `gpt-4.1` (optie 3, Sweden)

**Als je `'gpt-5'` gebruikt met Azure, werkt het NIET** omdat Azure geen GPT-5 deployment heeft.

### ⚠️ AZURE BEHOUDT HUIDIGE INSTELLINGEN

**Bij Azure gebruiken we de huidige instellingen zoals ze nu zijn:**
- Huidige temperature waarden (1, 0.3, etc.)
- Huidige max_completion_tokens waarden (2000, 4000, 15000, etc.)
- Geen `response_format` (niet altijd ondersteund door Azure)
- Geen `frequency_penalty` / `presence_penalty` (tenzij al aanwezig)
- Geen `top_p` (tenzij al aanwezig)

**De nieuwe geoptimaliseerde presets zijn alleen voor OpenAI Direct!**

### Voor migratie naar OpenAI Direct:
- Vervang `azureClient` door `openaiClient` in imports
- Je kunt dan `'gpt-5'` gebruiken (of `'gpt-5-2025-08-07'` voor specifieke versie)
- Gebruik de taaktype-specifieke presets (zie hierboven)
- Alle parameters worden geoptimaliseerd per taaktype

---

## ⚠️ BELANGRIJKE VERSCHILLEN

### Azure OpenAI:
1. **Model parameter:** Wordt gebruikt om deployment te selecteren, niet als echte model naam
2. **Deployment naam:** Wordt gebruikt in de API call (niet de model parameter)
3. **Endpoint:** Verschillend per deployment
4. **API Version:** Verschillend per deployment
5. **max_completion_tokens:** Gebruikt deze parameter
6. **Beperkte modellen:** Alleen modellen die als deployment zijn geconfigureerd

### Directe OpenAI API:
1. **Model parameter:** Echte model naam zoals `'gpt-5'`, `'gpt-4o'`, etc.
2. **Base URL:** Standaard `https://api.openai.com/v1`
3. **max_completion_tokens:** Gebruikt deze parameter (vereist voor GPT-5, niet `max_tokens`)
4. **Alle modellen:** Toegang tot alle beschikbare OpenAI modellen

---

## 🔄 MIGRATIE VAN AZURE NAAR OPENAI DIRECT

**Stappen:**
1. Vervang `azureClient` door `openaiClient` in imports
2. Pas model namen aan:
   - `'gpt-5-mini'` (Azure deployment) → `'gpt-5-mini'` (OpenAI model) ✅
   - `'gpt-4o'` (Azure deployment) → `'gpt-4o'` (OpenAI model) ✅
   - `'gpt-4.1'` (Azure deployment) → `'gpt-4.1'` (OpenAI model) ✅
   - `'gpt-5'` (Azure deployment) → `'gpt-5'` (OpenAI model) ✅ (maar Azure heeft dit niet!)
3. `max_completion_tokens` blijft hetzelfde (zowel Azure als OpenAI Direct gebruiken dit)
4. Zorg dat `OPENAI_API_KEY` is ingesteld

**⚠️ WAARSCHUWING:**
- Als je `'gpt-5'` gebruikt in code die nog Azure gebruikt, zal het falen omdat Azure geen GPT-5 deployment heeft
- Controleer altijd welke provider je gebruikt voordat je model namen aanpast
- Azure ondersteunt alleen modellen die als deployment zijn geconfigureerd (`gpt-5-mini`, `gpt-4o`, `gpt-4.1`)
- OpenAI Direct ondersteunt alle beschikbare modellen inclusief `gpt-5`

