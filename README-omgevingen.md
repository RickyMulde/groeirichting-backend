# Omgevingsbeheer - Test & Productie

Deze backend ondersteunt nu zowel een testomgeving als een productieomgeving.

## Bestanden

- `.env.test` - Configuratie voor testomgeving (oude Supabase omgeving)
- `.env.production` - Configuratie voor productieomgeving (nieuwe Supabase omgeving)
- `.env` - Actieve configuratie (wordt automatisch gegenereerd)

## Gebruik

### Handmatig schakelen tussen omgevingen

```bash
# Schakel naar testomgeving
npm run env:test

# Schakel naar productieomgeving
npm run env:production
```

### Direct starten met specifieke omgeving

```bash
# Start backend met testomgeving
npm run start:test

# Start backend met productieomgeving
npm run start:production
```

### Script gebruiken

```bash
# Schakel naar testomgeving
node switch-env.js test

# Schakel naar productieomgeving
node switch-env.js production
```

## Wat gebeurt er?

1. Het script kopieert het gekozen omgevingsbestand naar `.env`
2. De backend laadt automatisch de configuratie uit `.env`
3. Alle omgevingsvariabelen zijn beschikbaar via `process.env`

## Belangrijke omgevingsvariabelen

Zorg ervoor dat je in beide `.env` bestanden de juiste waarden hebt:

```bash
# Supabase configuratie
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# OpenAI configuratie
OPENAI_API_KEY=your_openai_api_key

# Resend configuratie (voor e-mails) - alleen voor uitnodigingen
RESEND_API_KEY=your_resend_api_key

# Frontend URL (voor CORS en e-mail links)
FRONTEND_URL=https://groeirichting.nl

# Backend URL (voor interne API calls)
BACKEND_URL=https://your-backend-url.com

# App omgeving
APP_ENV=test
NODE_ENV=development

# Productie bevestiging (VERPLICHT voor productieomgeving)
CONFIRM_PRODUCTION=YES
```

## 🏥 Healthcheck Endpoint

De backend heeft nu een `/health` endpoint voor Render monitoring:

```bash
GET /health
```

Retourneert:
- Status van de service
- Timestamp
- Omgeving (test/production)
- Uptime
- Versie

## Veiligheid

- Alle `.env*` bestanden staan in `.gitignore`
- De actieve `.env` wordt automatisch gegenereerd
- Geen gevoelige gegevens worden gecommit

## 🛡️ Productie Beveiliging

De backend heeft een ingebouwde beveiliging tegen onbedoeld gebruik van de productieomgeving:

- **Verplichte bevestiging**: Je moet `CONFIRM_PRODUCTION=YES` toevoegen aan `.env.production`
- **Duidelijke waarschuwingen**: De server toont grote waarschuwingen als je in productie start
- **Wachttijd**: 3 seconden wachttijd voordat de server start in productie
- **Validatie**: Het script controleert automatisch of deze bevestiging aanwezig is

Dit voorkomt dat je per ongeluk in de verkeerde omgeving werkt!

## Troubleshooting

Als je een foutmelding krijgt over ontbrekende omgevingsvariabelen:

1. Controleer of het omgevingsbestand bestaat
2. Controleer of alle vereiste variabelen zijn ingevuld
3. Schakel opnieuw naar de gewenste omgeving met `npm run env:test` of `npm run env:production`
