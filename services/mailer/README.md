# 📧 Mailer Service

Centrale email service voor GroeiRichting met Resend als provider. 
**Let op**: Verificatie emails worden verstuurd via Supabase Auth SMTP, niet via deze service.

## 🚀 Features

- **Centrale email functie** - Alle emails via één `sendEmail()` functie
- **Omgevingsbeheer** - Automatische whitelist/redirect in testomgeving
- **Tracking** - Open en click tracking via Resend
- **Metadata** - Tags en metadata voor analytics
- **Veiligheid** - Geen PII in logs, duidelijke error messages
- **Flexibiliteit** - Eenvoudig te switchen naar andere providers

## ⚙️ Environment Variables

Zet deze variabelen in je `.env.test` en `.env.production`:

```bash
# Basis configuratie
APP_ENV=test|production
RESEND_API_KEY=re_test_...|re_live_...
FROM_EMAIL="GroeiRichting <info@groeirichting.nl>"
REPLY_TO_DEFAULT="info@groeirichting.nl"

# Testomgeving beveiliging
EMAIL_WHITELIST_ENABLED=true|false
EMAIL_WHITELIST_DOMAINS=@groeirichting.nl,@example.com
EMAIL_WHITELIST_ADDRESSES=naam@domein.nl,anders@domein.com
EMAIL_REDIRECT_ALL_TO=rick@groeirichting.nl

# Provider (voor toekomstige uitbreiding)
EMAIL_PROVIDER=resend
```

## 📖 Gebruik

### Basis gebruik

```javascript
const { sendEmail } = require('./services/mailer/mailer');

// Eenvoudige email
await sendEmail({
  to: 'user@example.com',
  subject: 'Test email',
  html: '<p>Hallo wereld!</p>',
  text: 'Hallo wereld!'
});
```

### Geavanceerd gebruik

```javascript
await sendEmail({
  to: ['user1@example.com', 'user2@example.com'], // Meerdere ontvangers
  subject: 'Uitnodiging gespreksronde',
  html: '<h1>Je bent uitgenodigd!</h1>',
  text: 'Je bent uitgenodigd!',
  tag: 'INVITE_EMPLOYEE', // Voor analytics
  metadata: { 
    orgId: 123, 
    teamId: 456,
    roundId: 789 
  },
  from: 'Custom Sender <custom@example.com>', // Override default
  replyTo: 'support@example.com', // Override default
  trackOpens: true,  // Standaard true
  trackClicks: true, // Standaard true
  headers: {
    'X-Custom-Header': 'custom-value'
  }
});
```

## 🛡️ Testomgeving Beveiliging

### Whitelist

In testomgeving kun je emails beperken tot toegestane domeinen/adressen:

```bash
# Alleen emails naar @groeirichting.nl en specifieke adressen
EMAIL_WHITELIST_ENABLED=true
EMAIL_WHITELIST_DOMAINS=@groeirichting.nl
EMAIL_WHITELIST_ADDRESSES=rickmulderij@hotmail.com,rickymulde@gmail.nl
```

### Redirect All

Alle emails in testomgeving kunnen worden doorgestuurd naar één adres:

```bash
# Alle emails gaan naar dit adres in testomgeving
EMAIL_REDIRECT_ALL_TO=rick@groeirichting.nl
```

## 🧪 Testen

Run het testscript om de configuratie te verifiëren:

```bash
cd Backend
node test-mailer.js
```

Dit test:
- ✅ Whitelist functionaliteit
- ✅ Redirect functionaliteit  
- ✅ Email validatie
- ✅ Environment detectie

## 📊 Tracking & Analytics

### Headers

De mailer voegt automatisch headers toe:

- `X-Tag` - Jouw tag (bijv. 'INVITE_EMPLOYEE')
- `X-Metadata` - JSON metadata
- `X-Original-To` - Originele ontvanger (bij redirect)

### Resend Tracking

- `track_opens: true` - Track email opens
- `track_clicks: true` - Track link clicks

## 🔄 Migratie van bestaande code

### Voor: Direct Resend gebruik

```javascript
// OUD
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'GroeiRichting <noreply@groeirichting.nl>',
  to: email,
  subject: 'Test',
  html: '<p>Test</p>'
});
```

### Na: Via mailer service

```javascript
// NIEUW
const { sendEmail } = require('./services/mailer/mailer');

await sendEmail({
  to: email,
  subject: 'Test',
  html: '<p>Test</p>',
  tag: 'TEST_EMAIL'
});
```

## 🚨 Error Handling

De mailer gooit duidelijke errors zonder PII:

```javascript
try {
  await sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' });
} catch (error) {
  // Error message: "EmailSendError (to: test@example.com, tag: -, provider: resend): [Resend error]"
  console.error('Email failed:', error.message);
}
```

## 🔮 Toekomstige uitbreidingen

### Postmark Support

De mailer is voorbereid op Postmark:

```javascript
// In mailer.js - toekomstige uitbreiding
if (process.env.EMAIL_PROVIDER === 'postmark') {
  // Postmark implementatie
} else {
  // Resend implementatie (huidige)
}
```

### Meer providers

Eenvoudig uit te breiden met andere email providers zonder dat call-sites hoeven te wijzigen.

## 📁 Bestanden

- `mailer.js` - Hoofd implementatie
- `README.md` - Deze documentatie
- `../test-mailer.js` - Test script
- `../examples/mailer-usage.js` - Gebruik voorbeelden

## ✅ Checklist voor implementatie

- [ ] Environment variables ingesteld in `.env.test` en `.env.production`
- [ ] Resend API keys correct ingesteld
- [ ] Whitelist configuratie getest
- [ ] Bestaande Resend calls vervangen door `sendEmail()`
- [ ] Test script gerund om configuratie te verifiëren
- [ ] Error handling geïmplementeerd in endpoints
