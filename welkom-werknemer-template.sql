-- "Welkom Werknemer" template voor werknemers
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
  'Welkom Werknemer',
  'werknemer',
  'werknemer_registratie',
  'Welkom bij GroeiRichting!',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a73e8;">Welkom bij GroeiRichting! 🎉</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>Gefeliciteerd! Je bent succesvol geregistreerd bij GroeiRichting. Je kunt nu deelnemen aan de gesprekken die je werkgever heeft georganiseerd.</p>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">🎯 Wat kun je nu doen?</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Bekijk je gesprekken</strong> - Zie welke thema''s je kunt bespreken</li>
        <li><strong>Plan je gesprekken in</strong> - Kies een tijdstip dat jou uitkomt</li>
        <li><strong>Bereid je voor</strong> - Lees de thema''s door voordat je start</li>
        <li><strong>Stel vragen</strong> - We helpen je graag op weg</li>
      </ul>
    </div>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1976d2; margin-top: 0;">💡 Waarom GroeiRichting?</h3>
      <p>GroeiRichting helpt je om jezelf beter te leren kennen en te groeien in je werk. Door regelmatig te reflecteren op verschillende thema''s, ontdek je nieuwe inzichten en ontwikkel je jezelf verder.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{login_url}}" style="background: #4caf50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        🚀 Start je eerste gesprek
      </a>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #666;">
      <p style="margin: 0;"><strong>Tip:</strong> Neem de tijd voor je gesprekken. Een rustige omgeving helpt je om beter na te denken.</p>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

Gefeliciteerd! Je bent succesvol geregistreerd bij GroeiRichting. Je kunt nu deelnemen aan de gesprekken die je werkgever heeft georganiseerd.

🎯 Wat kun je nu doen?
- Bekijk je gesprekken - Zie welke thema's je kunt bespreken
- Plan je gesprekken in - Kies een tijdstip dat jou uitkomt
- Bereid je voor - Lees de thema's door voordat je start
- Stel vragen - We helpen je graag op weg

💡 Waarom GroeiRichting?
GroeiRichting helpt je om jezelf beter te leren kennen en te groeien in je werk. Door regelmatig te reflecteren op verschillende thema's, ontdek je nieuwe inzichten en ontwikkel je jezelf verder.

🚀 {{login_url}}

Tip: Neem de tijd voor je gesprekken. Een rustige omgeving helpt je om beter na te denken.

Met vriendelijke groet,
Team GroeiRichting',
  'Welkomstmail voor werknemers na registratie via uitnodiging',
  true
);
