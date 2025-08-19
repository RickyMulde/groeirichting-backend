# Functie Omschrijving Functionaliteit

## Overzicht
Deze functionaliteit stelt werkgevers in staat om een korte omschrijving van de functie van elke werknemer in te voeren. Deze omschrijving wordt gebruikt in AI-prompts om betere context te geven over de specifieke rol van de medewerker, naast de organisatie-brede context.

## Database Wijzigingen
- Nieuwe kolom `functie_omschrijving` toegevoegd aan de `users` tabel
- Nieuwe kolom `functie_omschrijving` toegevoegd aan de `invitations` tabel
- SQL migratie: `add-functie-omschrijving.sql`

## Backend Wijzigingen

### 1. index.js (send-invite)
- API ondersteunt nu `functieOmschrijving` in de request body
- Slaat functie-omschrijving op in de `invitations` tabel

### 2. register-employee.js
- Neemt `functie_omschrijving` over van invitation naar user record
- Zorgt voor doorlopende opslag van functie-informatie

### 3. decide-followup.js
- Functie-omschrijving en gender worden toegevoegd aan de prompt als "Functie context" en "Geslacht"
- Helpt AI om betere, rol-specifieke vragen te stellen

### 4. genereer-samenvatting.js
- Functie-omschrijving en gender worden toegevoegd aan de prompt voor individuele gesprek-samenvattingen
- Geeft AI betere context over de specifieke rol van de werknemer

### 5. get-gespreksresultaten-bulk.js
- Functie-omschrijving en gender worden toegevoegd aan de prompt voor bulk-samenvattingen
- Consistentie in alle samenvatting-generatie

## Frontend Wijzigingen

### 1. Werknemerbeheren.jsx
- Nieuwe sectie "Voeg een korte omschrijving van de functie van deze werknemer toe"
- Tekstveld met voorbeelden en toelichting (maximaal 8 woorden)
- Functie-omschrijving wordt opgeslagen bij uitnodiging
- Functie-omschrijving wordt getoond in werknemerslijst

### 2. GesprekPagina.jsx
- Functie `haalWerknemerContextOp()` toegevoegd
- Functie-omschrijving en gender worden doorgegeven aan alle `decide-followup` API calls

## Gebruik in Prompts
De functie-omschrijving en gender worden toegevoegd aan alle relevante AI-prompts als:

```
Functie context: [omschrijving van de werknemer]
Geslacht: [geslacht van de werknemer]
```

## Voordelen
1. **Betere Context**: AI heeft meer inzicht in de specifieke rol van de medewerker
2. **Relevantere Vragen**: Vervolgvragen sluiten beter aan bij de functie
3. **Accuratere Samenvattingen**: Samenvattingen zijn specifiek voor de rol van de werknemer
4. **Persoonlijke Afstemming**: AI kan rekening houden met geslacht-specifieke aspecten
5. **Consistente Ervaring**: Alle AI-interacties gebruiken dezelfde context-informatie

## Implementatie Stappen
1. Voer SQL migratie uit: `add-functie-omschrijving.sql`
2. Deploy backend wijzigingen
3. Deploy frontend wijzigingen
4. Test functionaliteit in werkgeverportaal

## Voorbeelden van Functie-omschrijvingen
- "Planner thuiszorgroutes en ondersteuning zorgverleners"
- "Schadebehandelaar met telefonisch klantcontact"
- "Logistiek medewerker orderverwerking en verzending"

## Toekomstige Uitbreidingen
- Mogelijkheid om functie-omschrijvingen te bewerken na registratie
- Integratie met thema-specifieke prompts
- Analytics over het effect van functie-context op gesprekskwaliteit
- Team-specifieke functie-templates
