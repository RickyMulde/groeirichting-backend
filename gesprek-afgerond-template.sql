-- "Gesprek afgerond" template voor werknemers
INSERT INTO email_templates (
  naam, 
  doelgroep, 
  trigger_event, 
  onderwerp, 
  html_content, 
  text_content, 
  omschrijving,
  is_active
) VALUES (
  'Gesprek afgerond',
  'werknemer',
  'gesprek_afgerond',
  'Bedankt voor je gesprek!',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #4caf50;">Bedankt voor je gesprek! 🎉</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>Geweldig! Je hebt je gesprek over <strong>{{thema_titel}}</strong> succesvol afgerond. Bedankt voor je tijd en openheid!</p>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">🎯 Wat gebeurt er nu?</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Je antwoorden worden verwerkt</strong> - We analyseren je input</li>
        <li><strong>Inzichten worden gegenereerd</strong> - Je krijgt persoonlijke feedback</li>
        <li><strong>Resultaten worden gedeeld</strong> - Met je werkgever (anoniem)</li>
        <li><strong>Volgende gesprekken</strong> - Plan je volgende thema in</li>
      </ul>
    </div>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1976d2; margin-top: 0;">💡 Reflectie tips</h3>
      <p>Neem de tijd om na te denken over wat je hebt geleerd. Wat viel je op? Welke inzichten waren nieuw voor je? Dit helpt je om je ontwikkeling voort te zetten.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{dashboard_url}}" style="background: #4caf50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        🚀 Bekijk je dashboard
      </a>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #666;">
      <p style="margin: 0;"><strong>Tip:</strong> Plan je volgende gesprek in om je ontwikkeling voort te zetten. Regelmatige reflectie helpt je groeien!</p>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

Geweldig! Je hebt je gesprek over {{thema_titel}} succesvol afgerond. Bedankt voor je tijd en openheid!

🎯 Wat gebeurt er nu?
- Je antwoorden worden verwerkt - We analyseren je input
- Inzichten worden gegenereerd - Je krijgt persoonlijke feedback
- Resultaten worden gedeeld - Met je werkgever (anoniem)
- Volgende gesprekken - Plan je volgende thema in

💡 Reflectie tips
Neem de tijd om na te denken over wat je hebt geleerd. Wat viel je op? Welke inzichten waren nieuw voor je? Dit helpt je om je ontwikkeling voort te zetten.

🚀 {{dashboard_url}}

Tip: Plan je volgende gesprek in om je ontwikkeling voort te zetten. Regelmatige reflectie helpt je groeien!

Met vriendelijke groet,
Team GroeiRichting',
  'Gesprek afgerond mail voor werknemers na het afronden van een gesprek',
  true
);
