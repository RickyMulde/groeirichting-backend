-- "Nog 5 dagen tot de actieve periode" template voor werkgevers
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
  'Nog 5 dagen tot actieve periode',
  'werkgever',
  'actieve_periode_5_dagen_voor',
  'Nog 5 dagen tot jouw eerste actieve periode!',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a73e8;">Nog 5 dagen tot jouw eerste actieve periode! ⏰</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>Over 5 dagen start jouw eerste actieve periode in GroeiRichting. Een belangrijk moment voor jouw organisatie!</p>
    
    <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <h3 style="color: #856404; margin-top: 0;">📊 Huidige status</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Teams aangemaakt:</strong> {{teams_aantal}}</li>
        <li><strong>Werknemers uitgenodigd:</strong> {{uitgenodigd_aantal}}</li>
        <li><strong>Werknemers geregistreerd:</strong> {{geregistreerd_aantal}}</li>
      </ul>
    </div>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">💡 Tip</h3>
      <p>Zorg dat iedereen zich aanmeldt, zodat je straks volledige inzichten krijgt. Hoe meer werknemers deelnemen, hoe waardevoller de resultaten worden.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{login_url}}" style="background: #1a73e8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        👉 Log in en nodig laatste werknemers uit
      </a>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

Over 5 dagen start jouw eerste actieve periode in GroeiRichting. Een belangrijk moment voor jouw organisatie!

📊 Huidige status
- Teams aangemaakt: {{teams_aantal}}
- Werknemers uitgenodigd: {{uitgenodigd_aantal}}
- Werknemers geregistreerd: {{geregistreerd_aantal}}

💡 Tip
Zorg dat iedereen zich aanmeldt, zodat je straks volledige inzichten krijgt. Hoe meer werknemers deelnemen, hoe waardevoller de resultaten worden.

👉 {{login_url}}

Met vriendelijke groet,
Team GroeiRichting',
  'Herinnering 5 dagen voor start actieve periode voor werkgevers',
  true
);
