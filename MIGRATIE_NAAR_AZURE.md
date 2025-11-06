# Migratiehandleiding: Terug naar Azure OpenAI

Dit document beschrijft precies wat er per bestand aangepast moet worden om terug te switchen van OpenAI Direct naar Azure OpenAI.

---

## 📋 OVERZICHT: WAT MOET ER AANGEPAST WORDEN?

### Algemene wijzigingen:
1. **Client import:** Blijft `azureClient` (geen wijziging nodig, alle bestanden gebruiken dit al)
2. **Model parameter:** Aanpassen naar Azure-compatibele deployment namen
3. **Token parameter:** `max_tokens` → `max_completion_tokens` (of laat zoals het is, wordt automatisch geconverteerd)
4. **Environment variables:** Zorgen dat alle Azure environment variables zijn ingesteld

### ⚠️ BELANGRIJK: Azure behoudt huidige instellingen

**Bij Azure gebruiken we de huidige instellingen (temperature, max_tokens, etc.) zoals ze nu zijn.**

De nieuwe geoptimaliseerde presets (temperature 0.5, response_format, etc.) zijn alleen voor **OpenAI Direct**. 

Azure blijft werken met:
- Huidige temperature waarden (1, 0.3, etc.)
- Huidige max_completion_tokens waarden
- Geen response_format (niet altijd ondersteund door Azure)
- Geen frequency_penalty / presence_penalty (tenzij al aanwezig)

---

## 📝 PER BESTAND: WAT MOET ER AANGEPAST WORDEN?

### 1. decide-followup.js

**Huidige situatie:**
- Client: `azureClient` ✅ (al correct)
- Model: `'gpt-5'` ❌ (werkt niet met Azure)

**Aan te passen:**
```javascript
// VERVANG:
const completion = await azureClient.createCompletion({
  model: 'gpt-5', // ❌ Werkt niet met Azure
  temperature: 1,
  max_completion_tokens: 4000,
  messages: [...]
})

// DOOR:
const completion = await azureClient.createCompletion({
  model: 'gpt-4.1', // ✅ Azure deployment naam
  temperature: 1,
  max_completion_tokens: 4000,
  messages: [...]
})
```

**Azure configuratie die nodig is:**
- **Endpoint:** `AZURE_OPENAI_ENDPOINT_GPT4O=https://openaiswedennn.openai.azure.com/`
- **API Key:** `AZURE_OPENAI_KEY_GPT4O=<key in .env>`
- **Deployment:** `AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4.1`
- **API Version:** `AZURE_OPENAI_API_VERSION_GPT4O=2024-12-01-preview`

**Parameters:**
- Model: `'gpt-4.1'`
- Temperature: `1`
- Max tokens: `4000` (als `max_completion_tokens`)

---

### 2. genereer-samenvatting.js

**Huidige situatie:**
- Client: `azureClient` ✅ (al correct)
- Model: `'gpt-5'` ❌ (werkt niet met Azure)

**Aan te passen:**
```javascript
// VERVANG:
const completion = await azureClient.createCompletion({
  model: 'gpt-5', // ❌ Werkt niet met Azure
  messages: [{ role: 'user', content: prompt }],
  temperature: 1,
  max_completion_tokens: 2000
})

// DOOR:
const completion = await azureClient.createCompletion({
  model: 'gpt-4o', // ✅ Azure deployment naam
  messages: [{ role: 'user', content: prompt }],
  temperature: 1,
  max_completion_tokens: 2000
})
```

**Azure configuratie die nodig is:**
- **Endpoint:** `AZURE_OPENAI_ENDPOINT_GPT4O=https://groeirichting-openai.openai.azure.com/`
- **API Key:** `AZURE_OPENAI_KEY_GPT4O=<key in .env>`
- **Deployment:** `AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o`
- **API Version:** `AZURE_OPENAI_API_VERSION_GPT4O=2024-05-01-preview`

**Parameters:**
- Model: `'gpt-4o'`
- Temperature: `1`
- Max tokens: `2000` (als `max_completion_tokens`)

---

### 3. genereer-vervolgacties.js

**Huidige situatie:**
- Client: `azureClient` ✅ (al correct)
- Model: `'gpt-5'` ❌ (werkt niet met Azure)

**Aan te passen:**
```javascript
// VERVANG:
const completion = await azureClient.createCompletion({
  model: 'gpt-5', // ❌ Werkt niet met Azure
  messages: [{ role: 'user', content: prompt }],
  temperature: 1,
  max_completion_tokens: 4000
})

// DOOR:
const completion = await azureClient.createCompletion({
  model: 'gpt-4o', // ✅ Azure deployment naam
  messages: [{ role: 'user', content: prompt }],
  temperature: 1,
  max_completion_tokens: 4000
})
```

**Azure configuratie die nodig is:**
- **Endpoint:** `AZURE_OPENAI_ENDPOINT_GPT4O=https://groeirichting-openai.openai.azure.com/`
- **API Key:** `AZURE_OPENAI_KEY_GPT4O=<key in .env>`
- **Deployment:** `AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o`
- **API Version:** `AZURE_OPENAI_API_VERSION_GPT4O=2024-05-01-preview`

**Parameters:**
- Model: `'gpt-4o'`
- Temperature: `1`
- Max tokens: `4000` (als `max_completion_tokens`)

---

### 4. generate-top-actions.js

**Huidige situatie:**
- Client: `azureClient` ✅ (al correct)
- Model: `'gpt-5'` ❌ (werkt niet met Azure)

**Aan te passen:**
```javascript
// VERVANG:
const completion = await azureClient.createCompletion({
  model: 'gpt-5', // ❌ Werkt niet met Azure
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_completion_tokens: 4000
})

// DOOR:
const completion = await azureClient.createCompletion({
  model: 'gpt-4o', // ✅ Azure deployment naam
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_completion_tokens: 4000
})
```

**Azure configuratie die nodig is:**
- **Endpoint:** `AZURE_OPENAI_ENDPOINT_GPT4O=https://groeirichting-openai.openai.azure.com/`
- **API Key:** `AZURE_OPENAI_KEY_GPT4O=<key in .env>`
- **Deployment:** `AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o`
- **API Version:** `AZURE_OPENAI_API_VERSION_GPT4O=2024-05-01-preview`

**Parameters:**
- Model: `'gpt-4o'`
- Temperature: `0.3`
- Max tokens: `4000` (als `max_completion_tokens`)

---

### 5. generate-organisation-summary.js

**Huidige situatie:**
- Client: `azureClient` ✅ (al correct)
- Model: `'gpt-5-mini'` ✅ (al correct!)

**Aan te passen:**
- **GEEN WIJZIGINGEN NODIG** - Dit bestand gebruikt al de juiste Azure configuratie!

**Azure configuratie die nodig is:**
- **Endpoint:** `AZURE_OPENAI_ENDPOINT=https://groeirichting-resource.cognitiveservices.azure.com/`
- **API Key:** `AZURE_OPENAI_KEY=<key in .env>`
- **Deployment:** `AZURE_OPENAI_DEPLOYMENT=gpt-5-mini`
- **API Version:** `AZURE_OPENAI_API_VERSION=2025-04-01-preview`

**Parameters:**
- Model: `'gpt-5-mini'` ✅
- Temperature: `1`
- Max tokens: `15000` (als `max_completion_tokens`)

---

### 6. get-gespreksresultaten-bulk.js

**Huidige situatie:**
- Client: `azureClient` ✅ (al correct)
- Model: `'gpt-5'` ❌ (werkt niet met Azure)

**Aan te passen:**
```javascript
// VERVANG:
const completion = await azureClient.createCompletion({
  model: 'gpt-5', // ❌ Werkt niet met Azure
  messages: [{ role: 'user', content: prompt }],
  temperature: 1,
  max_completion_tokens: 4000
})

// DOOR:
const completion = await azureClient.createCompletion({
  model: 'gpt-4o', // ✅ Azure deployment naam
  messages: [{ role: 'user', content: prompt }],
  temperature: 1,
  max_completion_tokens: 4000
})
```

**Azure configuratie die nodig is:**
- **Endpoint:** `AZURE_OPENAI_ENDPOINT_GPT4O=https://groeirichting-openai.openai.azure.com/`
- **API Key:** `AZURE_OPENAI_KEY_GPT4O=<key in .env>`
- **Deployment:** `AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o`
- **API Version:** `AZURE_OPENAI_API_VERSION_GPT4O=2024-05-01-preview`

**Parameters:**
- Model: `'gpt-4o'`
- Temperature: `1`
- Max tokens: `4000` (als `max_completion_tokens`)

---

## 🔧 ENVIRONMENT VARIABLES CHECKLIST

Zorg dat alle volgende environment variables zijn ingesteld in je `.env` bestand:

### Voor GPT-5-mini (hoofddeployment):
```
AZURE_OPENAI_ENDPOINT=https://groeirichting-resource.cognitiveservices.azure.com/
AZURE_OPENAI_KEY=<jouw key>
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
AZURE_OPENAI_API_VERSION=2025-04-01-preview
```

### Voor GPT-4o (secundaire deployment):
```
AZURE_OPENAI_ENDPOINT_GPT4O=https://groeirichting-openai.openai.azure.com/
AZURE_OPENAI_KEY_GPT4O=<jouw key>
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o
AZURE_OPENAI_API_VERSION_GPT4O=2024-05-01-preview
```

### Voor GPT-4.1 SWEDEN (optie 3):
```
AZURE_OPENAI_ENDPOINT_GPT4O=https://openaiswedennn.openai.azure.com/
AZURE_OPENAI_KEY_GPT4O=<jouw key>
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4.1
AZURE_OPENAI_API_VERSION_GPT4O=2024-12-01-preview
```

**⚠️ BELANGRIJK:** 
- De GPT-4.1 configuratie gebruikt dezelfde environment variable namen als GPT-4o (`_GPT4O` suffix)
- Dit betekent dat je moet kiezen: of GPT-4o OF GPT-4.1, niet beide tegelijk
- Als je beide wilt gebruiken, moet je de `azureOpenAI.js` aanpassen om een aparte set environment variables te gebruiken voor GPT-4.1

---

## 📊 SAMENVATTING: MODEL TOEWIJZING

| Bestand | Huidig Model | Azure Model | Deployment | Endpoint Config |
|---------|--------------|-------------|------------|-----------------|
| `decide-followup.js` | `'gpt-5'` ❌ | `'gpt-4.1'` ✅ | `gpt-4.1` | `AZURE_OPENAI_ENDPOINT_GPT4O` (Sweden) |
| `genereer-samenvatting.js` | `'gpt-5'` ❌ | `'gpt-4o'` ✅ | `gpt-4o` | `AZURE_OPENAI_ENDPOINT_GPT4O` |
| `genereer-vervolgacties.js` | `'gpt-5'` ❌ | `'gpt-4o'` ✅ | `gpt-4o` | `AZURE_OPENAI_ENDPOINT_GPT4O` |
| `generate-top-actions.js` | `'gpt-5'` ❌ | `'gpt-4o'` ✅ | `gpt-4o` | `AZURE_OPENAI_ENDPOINT_GPT4O` |
| `generate-organisation-summary.js` | `'gpt-5-mini'` ✅ | `'gpt-5-mini'` ✅ | `gpt-5-mini` | `AZURE_OPENAI_ENDPOINT` |
| `get-gespreksresultaten-bulk.js` | `'gpt-5'` ❌ | `'gpt-4o'` ✅ | `gpt-4o` | `AZURE_OPENAI_ENDPOINT_GPT4O` |

---

## ✅ STAPPENPLAN VOOR MIGRATIE

1. **Controleer environment variables:**
   - Zorg dat alle Azure environment variables zijn ingesteld
   - Let op: GPT-4o en GPT-4.1 delen dezelfde variable namen (`_GPT4O`)

2. **Pas bestanden aan:**
   - `decide-followup.js`: `'gpt-5'` → `'gpt-4.1'`
   - `genereer-samenvatting.js`: `'gpt-5'` → `'gpt-4o'`
   - `genereer-vervolgacties.js`: `'gpt-5'` → `'gpt-4o'`
   - `generate-top-actions.js`: `'gpt-5'` → `'gpt-4o'`
   - `get-gespreksresultaten-bulk.js`: `'gpt-5'` → `'gpt-4o'`
   - `generate-organisation-summary.js`: Geen wijziging nodig ✅

3. **Controleer token parameters:**
   - `max_tokens` wordt automatisch geconverteerd naar `max_completion_tokens` door `azureClient`
   - Je kunt `max_completion_tokens` gebruiken of `max_tokens` (beide werken)

4. **Test de migratie:**
   - Test elk bestand individueel
   - Controleer of de juiste deployment wordt gebruikt
   - Controleer of de juiste endpoint wordt aangeroepen

---

## ⚠️ BELANGRIJKE OPMERKINGEN

1. **GPT-4.1 vs GPT-4o conflict:**
   - Beide gebruiken `AZURE_OPENAI_ENDPOINT_GPT4O` en `AZURE_OPENAI_DEPLOYMENT_GPT4O`
   - Je kunt niet beide tegelijk gebruiken zonder code aanpassingen
   - Als je beide nodig hebt, moet je `azureOpenAI.js` aanpassen om een aparte set variables te gebruiken

2. **Model parameter:**
   - Bij Azure wordt de `model` parameter gebruikt om te bepalen welke deployment/client te gebruiken
   - De `model` parameter wordt vervangen door de deployment naam voordat de API call wordt gemaakt
   - Gebruik alleen: `'gpt-5-mini'`, `'gpt-4o'`, of `'gpt-4.1'`

3. **API Versies:**
   - Elke deployment heeft zijn eigen API versie
   - Deze worden automatisch gebruikt via de environment variables
   - Zorg dat de juiste versie is ingesteld voor elke deployment

4. **Parameters bij Azure:**
   - **Behoud huidige instellingen** - Azure gebruikt de huidige temperature, max_completion_tokens, etc.
   - De nieuwe geoptimaliseerde presets (temperature 0.5, response_format, frequency_penalty, etc.) zijn alleen voor OpenAI Direct
   - Azure ondersteunt niet altijd `response_format` - controleer per deployment
   - Azure gebruikt `max_completion_tokens` in plaats van `max_tokens`

---

## 📊 VERSCHIL: AZURE VS OPENAI DIRECT INSTELLINGEN

### Azure (behoud huidige instellingen):
- Temperature: Huidige waarden (1, 0.3, etc.)
- Max tokens: Huidige waarden (2000, 4000, 15000, etc.)
- Response format: Meestal niet gebruikt (niet altijd ondersteund)
- Frequency/presence penalty: Meestal niet gebruikt
- Top_p: Meestal niet gebruikt

### OpenAI Direct (nieuwe geoptimaliseerde presets):
- Temperature: Geoptimaliseerd per taaktype (0.35-0.55)
- Max tokens: Geoptimaliseerd per taaktype (500-1500)
- Response format: `{ type: "json_object" }` (aanbevolen)
- Frequency/presence penalty: Geoptimaliseerd per taaktype
- Top_p: 0.9 (standaard)

**Zie `OPENAI_CONFIGURATIE.md` voor volledige preset details per taaktype.**

