-- "Gesprek gepland" template voor werknemers
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
  'Gesprek gepland',
  'werknemer',
  'gesprek_gepland',
  'Je gesprek is ingepland!',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a73e8;">Je gesprek is ingepland! 📅</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>Geweldig! Je hebt een gesprek ingepland voor <strong>{{thema_titel}}</strong> op <strong>{{gesprek_datum}}</strong>.</p>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">📋 Gesprek details</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Thema:</strong> {{thema_titel}}</li>
        <li><strong>Datum:</strong> {{gesprek_datum}}</li>
        <li><strong>Duur:</strong> Ongeveer 15-20 minuten</li>
        <li><strong>Locatie:</strong> Online via GroeiRichting</li>
      </ul>
    </div>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1976d2; margin-top: 0;">💡 Hoe bereid je je voor?</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Lees de vragen door</strong> - Bekijk het thema en de vragen</li>
        <li><strong>Denk na over je antwoorden</strong> - Neem de tijd om te reflecteren</li>
        <li><strong>Zorg voor een rustige omgeving</strong> - Zet je telefoon uit</li>
        <li><strong>Wees eerlijk</strong> - Er zijn geen goede of foute antwoorden</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{gesprek_link}}" style="background: #4caf50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
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

Geweldig! Je hebt een gesprek ingepland voor {{thema_titel}} op {{gesprek_datum}}.

📋 Gesprek details
- Thema: {{thema_titel}}
- Datum: {{gesprek_datum}}
- Duur: Ongeveer 15-20 minuten
- Locatie: Online via GroeiRichting

💡 Hoe bereid je je voor?
- Lees de vragen door - Bekijk het thema en de vragen
- Denk na over je antwoorden - Neem de tijd om te reflecteren
- Zorg voor een rustige omgeving - Zet je telefoon uit
- Wees eerlijk - Er zijn geen goede of foute antwoorden

🎯 {{gesprek_link}}

Tip: Je kunt je gesprek tot 2 uur van tevoren nog verzetten via je dashboard.

Met vriendelijke groet,
Team GroeiRichting',
  'Gesprek gepland mail voor werknemers na het inplannen van een gesprek',
  true
);
