-- "Gesprek herinnering" template voor werknemers
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
  'Gesprek herinnering',
  'werknemer',
  'gesprek_herinnering',
  'Herinnering: je gesprek is morgen!',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #ff9800;">Herinnering: je gesprek is morgen! ⏰</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>Dit is een vriendelijke herinnering dat je morgen een gesprek hebt gepland voor <strong>{{thema_titel}}</strong>.</p>
    
    <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
      <h3 style="color: #f57c00; margin-top: 0;">📅 Gesprek details</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Thema:</strong> {{thema_titel}}</li>
        <li><strong>Datum:</strong> {{gesprek_datum}}</li>
        <li><strong>Duur:</strong> Ongeveer 15-20 minuten</li>
        <li><strong>Locatie:</strong> Online via GroeiRichting</li>
      </ul>
    </div>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">✅ Laatste check</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Rustige omgeving</strong> - Zorg dat je niet gestoord wordt</li>
        <li><strong>Stabiele internetverbinding</strong> - Test je verbinding</li>
        <li><strong>Telefoon uit</strong> - Focus volledig op het gesprek</li>
        <li><strong>Vragen doorgelezen</strong> - Bekijk het thema nog even</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{gesprek_link}}" style="background: #ff9800; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        🎯 Start je gesprek
      </a>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #666;">
      <p style="margin: 0;"><strong>Tip:</strong> Je kunt je gesprek tot 2 uur van tevoren nog verzetten via je dashboard.</p>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

Dit is een vriendelijke herinnering dat je morgen een gesprek hebt gepland voor {{thema_titel}}.

📅 Gesprek details
- Thema: {{thema_titel}}
- Datum: {{gesprek_datum}}
- Duur: Ongeveer 15-20 minuten
- Locatie: Online via GroeiRichting

✅ Laatste check
- Rustige omgeving - Zorg dat je niet gestoord wordt
- Stabiele internetverbinding - Test je verbinding
- Telefoon uit - Focus volledig op het gesprek
- Vragen doorgelezen - Bekijk het thema nog even

🎯 {{gesprek_link}}

Tip: Je kunt je gesprek tot 2 uur van tevoren nog verzetten via je dashboard.

Met vriendelijke groet,
Team GroeiRichting',
  'Gesprek herinnering mail voor werknemers 1 dag voor het gesprek',
  true
);
