-- "Nog 5 dagen tot het einde" template voor werkgevers
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
  'Nog 5 dagen tot het einde',
  'werkgever',
  'actieve_periode_5_dagen_einde',
  'Laatste kans: nog 5 dagen te gaan',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #d32f2f;">Laatste kans: nog 5 dagen te gaan ⚠️</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>De actieve periode loopt bijna af. Hier staat jouw organisatie nu:</p>
    
    <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d32f2f;">
      <h3 style="color: #d32f2f; margin-top: 0;">📊 Huidige status</h3>
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
          <div style="font-size: 24px; font-weight: bold; color: #4caf50;">{{afgeronde_gesprekken}}</div>
          <div style="font-size: 12px; color: #666;">Afgeronde gesprekken</div>
        </div>
        <div style="text-align: center; padding: 10px; background: white; border-radius: 5px;">
          <div style="font-size: 24px; font-weight: bold; color: #ff9800;">{{nog_te_doen}}</div>
          <div style="font-size: 12px; color: #666;">Nog te doen</div>
        </div>
      </div>
    </div>
    
    <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <h3 style="color: #856404; margin-top: 0;">⚠️ Belangrijk</h3>
      <p>Vandaag ontvangen alle werknemers een herinnering dat zij nog 5 dagen hebben om hun gesprekken af te ronden.</p>
      <p><strong>Na de einddatum tellen nieuwe gesprekken niet meer mee in de gespreksresultaten en Verbeteradviezen.</strong></p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{voortgang_url}}" style="background: #d32f2f; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        👉 Controleer de voortgang
      </a>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

De actieve periode loopt bijna af. Hier staat jouw organisatie nu:

📊 Huidige status
- Teams: {{teams_aantal}}
- Actieve werknemers: {{actieve_werknemers}}
- Afgeronde gesprekken: {{afgeronde_gesprekken}}
- Nog te doen: {{nog_te_doen}}

⚠️ Belangrijk
Vandaag ontvangen alle werknemers een herinnering dat zij nog 5 dagen hebben om hun gesprekken af te ronden.

Na de einddatum tellen nieuwe gesprekken niet meer mee in de gespreksresultaten en Verbeteradviezen.

👉 {{voortgang_url}}

Met vriendelijke groet,
Team GroeiRichting',
  'Deadline herinnering 5 dagen voor einde actieve periode voor werkgevers',
  true
);
