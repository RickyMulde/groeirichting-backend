# Top 3 Vervolgacties Functionaliteit

## Overzicht
Deze functionaliteit genereert automatisch de top 3 meest belangrijke vervolgacties voor een werknemer op basis van alle gevoerde gesprekken van alle thema's samen.

## Hoe het werkt

### 1. Automatische Trigger
- **Wanneer**: Nadat het laatste thema is afgerond door een werknemer
- **Waar**: In `save-conversation.js` wanneer een gesprek wordt afgerond
- **Check**: Controleert of alle beschikbare thema's zijn afgerond

### 2. Generatie Proces
- **Service**: `generate-top-actions.js`
- **Input**: Alle gespreksgeschiedenis van alle thema's voor één werknemer in één periode
- **AI Model**: GPT-4 met specifieke prompt voor prioritering
- **Output**: Top 3 acties met prioriteitsniveau en toelichting

### 3. Prioritering Criteria
GPT analyseert en prioriteert op basis van:
- **URGENTIE**: Wat moet eerst gebeuren?
- **IMPACT**: Welke actie heeft het meeste effect?
- **HAALBAARHEID**: Wat kan de werknemer realistisch doen?
- **VERBANDEN**: Welke actie lost meerdere problemen op?

## Database Schema

### Nieuwe tabel: `top_vervolgacties`
```sql
CREATE TABLE top_vervolgacties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  werknemer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  werkgever_id UUID REFERENCES users(id) ON DELETE CASCADE,
  periode VARCHAR(7) NOT NULL, -- YYYY-MM formaat
  
  -- Top 3 acties
  actie_1 TEXT NOT NULL,
  actie_2 TEXT NOT NULL,
  actie_3 TEXT NOT NULL,
  
  -- Prioriteitsniveaus
  prioriteit_1 VARCHAR(10) NOT NULL CHECK (prioriteit_1 IN ('hoog', 'medium', 'laag')),
  prioriteit_2 VARCHAR(10) NOT NULL CHECK (prioriteit_2 IN ('hoog', 'medium', 'laag')),
  prioriteit_3 VARCHAR(10) NOT NULL CHECK (prioriteit_3 IN ('hoog', 'medium', 'laag')),
  
  -- Toelichtingen
  toelichting_per_actie TEXT[] NOT NULL, -- Array van 3 toelichtingen
  algemene_toelichting TEXT,
  
  -- Metadata
  gegenereerd_op TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  gesprek_ids UUID[] NOT NULL, -- Array van alle betrokken gesprek IDs
  
  -- Constraints
  UNIQUE(werknemer_id, periode)
);
```

## API Endpoints

### POST `/api/generate-top-actions`
**Doel**: Genereer top 3 vervolgacties voor een werknemer

**Request Body**:
```json
{
  "werknemer_id": "uuid",
  "periode": "2024-03"
}
```

**Response**:
```json
{
  "success": true,
  "top_acties": {
    "actie_1": {
      "tekst": "Concrete actie tekst",
      "prioriteit": "hoog",
      "toelichting": "Waarom deze actie prioriteit heeft"
    },
    "actie_2": { ... },
    "actie_3": { ... }
  },
  "algemene_toelichting": "Korte samenvatting",
  "periode": "2024-03",
  "gegenereerd_op": "2024-03-15T10:30:00Z"
}
```

### GET `/api/generate-top-actions/:werknemer_id/:periode`
**Doel**: Haal bestaande top 3 acties op

**Response**: Volledige rij uit `top_vervolgacties` tabel

## Frontend Integratie

### 1. Top3Actions Component
- **Locatie**: `Frontend/src/components/Top3Actions.jsx`
- **Functie**: Toont top 3 acties in opvallende kaart
- **Features**: 
  - Prioriteitskleuren (rood=hoog, geel=medium, groen=laag)
  - Uitklapbare toelichtingen
  - Responsive design

### 2. GesprekResultaten Integratie
- **Locatie**: Boven alle samenvattingen, onder periode selector
- **Timing**: Alleen zichtbaar als er top 3 acties beschikbaar zijn
- **Refresh**: Automatisch bij periode wijziging

### 3. Per-thema Vervolgacties
- **Status**: Uitklapbaar gemaakt (standaard ingeklapt)
- **Reden**: Minder overweldigend, focus op top 3
- **Toegang**: Via "Uitklappen" knop

## Technische Details

### Trigger Logica
```javascript
// In save-conversation.js
if (alleThemasAfgerond) {
  // Genereer top 3 acties
  const response = await fetch('/api/generate-top-actions', {
    method: 'POST',
    body: JSON.stringify({ werknemer_id, periode })
  });
}
```

### GPT Prompt Structuur
1. **Context**: Werknemer info + organisatie context
2. **Input**: Alle gespreksgeschiedenis van alle thema's
3. **Instructie**: Bepaal top 3 op basis van urgentie, impact, haalbaarheid
4. **Output**: JSON met 3 acties + prioriteiten + toelichtingen

### Error Handling
- **Fallback**: Als generatie mislukt, geen top 3 tonen
- **Logging**: Uitgebreide logging voor debugging
- **Graceful Degradation**: Frontend blijft functioneren

## Voordelen

### Voor Werknemers
- **Focus**: Slechts 3 acties in plaats van 12-20
- **Prioriteit**: Duidelijk wat eerst aangepakt moet worden
- **Overzicht**: Eén plek voor alle prioriteiten

### Voor GroeiRichting
- **Effectiviteit**: Hogere kans dat acties worden uitgevoerd
- **Kwaliteit**: AI-gegenereerde prioriteiten op basis van alle context
- **Gebruikerservaring**: Minder overweldigend, meer actiegericht

## Toekomstige Uitbreidingen

### 1. Automatische Herinneringen
- **Resend Integratie**: Stuur herinneringen voor top acties
- **Timing**: Wekelijks of maandelijks
- **Personalization**: Op basis van prioriteitsniveau

### 2. Voortgang Tracking
- **Actie Status**: Markeren als "gestart", "in uitvoering", "voltooid"
- **Feedback Loop**: Werknemer kan voortgang bijhouden

### 3. Werkgever Dashboard
- **Overzicht**: Top acties van alle werknemers
- **Trends**: Veelvoorkomende prioriteiten identificeren
- **Interventies**: Mogelijkheid om ondersteuning aan te bieden

## Monitoring & Onderhoud

### Logs
- **Generatie**: Wanneer top 3 worden gegenereerd
- **Errors**: Fouten bij generatie of opslag
- **Performance**: Tijd voor generatie en API calls

### Metrics
- **Gebruik**: Hoe vaak worden top 3 bekeken?
- **Effectiviteit**: Worden acties uitgevoerd?
- **Feedback**: Gebruikerstevredenheid met prioriteiten

### Onderhoud
- **GPT Prompt**: Regelmatig optimaliseren op basis van resultaten
- **Database**: Cleanup van oude top acties
- **Performance**: Optimaliseren van queries en API calls
