# Automatische Generatie van Samenvattingen

## Overzicht
Deze service genereert automatisch organisatie-samenvattingen op de achtergrond wanneer aan bepaalde voorwaarden wordt voldaan.

## Hoe het werkt

### Voorwaarden voor automatische generatie
Samenvattingen worden automatisch gegenereerd wanneer **ÉÉN VAN DE VOLGENDE** voorwaarden wordt vervuld:

1. **Laatste dag van actieve maand**: Het is de laatste dag van maart, juni, september of december
2. **100% voortgang**: Alle medewerkers hebben alle thema's afgerond

### Actieve maanden
- Maart (3)
- Juni (6) 
- September (9)
- December (12)

### Timing
- **Dagelijkse check**: Om 02:00 's nachts (Europe/Amsterdam tijdzone)
- **Laagste belasting**: Gekozen voor 02:00 om de website niet te belasten tijdens piekuren

## Technische implementatie

### Cron Job
```javascript
cron.schedule('0 2 * * *', () => {
  autoGenerateSummaries()
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
})
```

### Proces
1. Controleer of het een actieve maand is
2. Controleer of het de laatste dag van de maand is
3. Haal alle werkgevers op
4. Voor elke werkgever:
   - Haal organisatie thema's op
   - Controleer voortgang per thema
   - Genereer samenvatting als voorwaarden vervuld zijn
5. Wacht 1 seconde tussen thema's (rate limiting voorkomen)

### Veiligheid
- **Één voor één generatie**: Voorkomt API rate limiting
- **Error handling**: Fouten bij één thema stoppen niet de rest
- **Logging**: Uitgebreide logging voor debugging
- **Continue processing**: Als één werkgever faalt, gaat het door met de volgende

## API Endpoints

### POST /api/auto-generate-summaries/trigger
Handmatig starten van de automatische generatie (voor testing)

### GET /api/auto-generate-summaries/status
Status van de service opvragen

## Logging
De service logt alle acties met emoji's voor betere leesbaarheid:
- 🔄 Start van proces
- 📅 Datum checks
- 👥 Werkgever verwerking
- 📝 Thema verwerking
- 🚀 Start generatie
- ✅ Succesvol gegenereerd
- ❌ Fouten
- ⏰ Cron job start

## Dependencies
- `node-cron`: Voor het plannen van de dagelijkse taak
- `@supabase/supabase-js`: Database toegang
- `express`: HTTP server

## Environment Variables
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key voor database toegang
- `API_BASE_URL`: Basis URL voor interne API calls (optioneel, default: localhost:3000)

## Deployment
De service start automatisch wanneer de backend wordt opgestart. De cron job blijft actief zolang de server draait.

## Monitoring
- Check logs voor dagelijkse uitvoering
- Gebruik `/status` endpoint voor service status
- Monitor database voor nieuwe samenvattingen

## Troubleshooting
1. **Cron job start niet**: Controleer of `node-cron` is geïnstalleerd
2. **Database fouten**: Controleer Supabase credentials
3. **API fouten**: Controleer interne API endpoints
4. **Timezone problemen**: Controleer of server op Europe/Amsterdam tijdzone staat
