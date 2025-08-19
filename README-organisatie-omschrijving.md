# Organisatie Omschrijving Functionaliteit

## Overzicht
Deze functionaliteit stelt werkgevers in staat om een korte omschrijving van hun organisatie/team in te voeren. Deze omschrijving wordt gebruikt in AI-prompts om betere context te geven over de werkzaamheden van de medewerkers.

## Database Wijzigingen
- Nieuwe kolom `organisatie_omschrijving` toegevoegd aan de `werkgever_gesprek_instellingen` tabel
- SQL migratie: `add-organisatie-omschrijving.sql`

## Backend Wijzigingen

### 1. werkgever-gesprek-instellingen.js
- API ondersteunt nu `organisatie_omschrijving` in alle endpoints (POST, GET, PUT)
- Standaardwaarde: `null` (optioneel veld)

### 2. generate-organisation-summary.js
- Organisatie-omschrijving wordt toegevoegd aan de prompt als "Organisatie context"
- Helpt AI om betere organisatie-brede inzichten te genereren

### 3. genereer-samenvatting.js
- Organisatie-omschrijving wordt toegevoegd aan de prompt voor individuele gesprek-samenvattingen
- Geeft AI betere context over de werkzaamheden van de medewerker

### 4. get-gespreksresultaten-bulk.js
- Organisatie-omschrijving wordt toegevoegd aan de prompt voor bulk-samenvattingen
- Consistentie in alle samenvatting-generatie

### 5. decide-followup.js
- Organisatie-omschrijving wordt toegevoegd aan de prompt voor vervolgvragen
- AI kan betere, context-specifieke vragen stellen

## Frontend Wijzigingen

### 1. Instellingen.jsx
- Nieuwe sectie "Omschrijving organisatie/team" toegevoegd
- Tekstveld met voorbeelden en toelichting
- Integreert met bestaande configuratie-opslag

### 2. GesprekPagina.jsx
- Functie `haalOrganisatieOmschrijvingOp()` toegevoegd
- Organisatie-omschrijving wordt doorgegeven aan alle `decide-followup` API calls

## Gebruik in Prompts
De organisatie-omschrijving wordt toegevoegd aan alle relevante AI-prompts als:

```
Organisatie context: [omschrijving van de werkgever]
```

## Voordelen
1. **Betere Context**: AI heeft meer inzicht in de specifieke werkzaamheden
2. **Relevantere Vragen**: Vervolgvragen sluiten beter aan bij de praktijk
3. **Accuratere Samenvattingen**: Samenvattingen zijn specifiek voor de organisatie
4. **Verbeterde Adviezen**: Organisatie-brede inzichten zijn praktischer

## Implementatie Stappen
1. Voer SQL migratie uit: `add-organisatie-omschrijving.sql`
2. Deploy backend wijzigingen
3. Deploy frontend wijzigingen
4. Test functionaliteit in werkgeverportaal

## Toekomstige Uitbreidingen
- Mogelijkheid om meerdere team-omschrijvingen te beheren
- Integratie met thema-specifieke prompts
- Analytics over het effect van organisatie-context op gesprekskwaliteit
