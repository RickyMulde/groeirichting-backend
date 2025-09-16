-- "Tussenstand: 10 dagen onderweg" template voor werkgevers
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
  'Tussenstand: 10 dagen onderweg',
  'werkgever',
  'actieve_periode_10_dagen_na',
  'Tussenstand: zo gaat jouw team vooruit',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a73e8;">Tussenstand: zo gaat jouw team vooruit 📊</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>Je bent nu 10 dagen onderweg in de actieve periode. Tijd voor een korte update!</p>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1976d2; margin-top: 0;">📈 Voortgang overzicht</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
        <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
          <div style="font-size: 24px; font-weight: bold; color: #1a73e8;">{{teams_aantal}}</div>
          <div style="font-size: 12px; color: #666;">Teams</div>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
          <div style="font-size: 24px; font-weight: bold; color: #1a73e8;">{{actieve_werknemers}}</div>
          <div style="font-size: 12px; color: #666;">Actieve werknemers</div>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
          <div style="font-size: 24px; font-weight: bold; color: #1a73e8;">{{afgeronde_gesprekken}}</div>
          <div style="font-size: 12px; color: #666;">Afgeronde gesprekken</div>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
          <div style="font-size: 24px; font-weight: bold; color: #ff9800;">{{dagen_te_gaan}}</div>
          <div style="font-size: 12px; color: #666;">Dagen te gaan</div>
        </div>
      </div>
    </div>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">💡 Tip</h3>
      <p>Hoe meer gesprekken worden afgerond, hoe waardevoller de inzichten straks zijn. Moedig je werknemers daarom aan om mee te doen.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{voortgang_url}}" style="background: #1a73e8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        👉 Bekijk de voortgang
      </a>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

Je bent nu 10 dagen onderweg in de actieve periode. Tijd voor een korte update!

📈 Voortgang overzicht
- Teams: {{teams_aantal}}
- Actieve werknemers: {{actieve_werknemers}}
- Afgeronde gesprekken: {{afgeronde_gesprekken}}
- Nog {{dagen_te_gaan}} dagen te gaan

💡 Tip
Hoe meer gesprekken worden afgerond, hoe waardevoller de inzichten straks zijn. Moedig je werknemers daarom aan om mee te doen.

👉 {{voortgang_url}}

Met vriendelijke groet,
Team GroeiRichting',
  'Tussenstand mail 10 dagen na start actieve periode voor werkgevers',
  true
);
