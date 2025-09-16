-- "Resultaten beschikbaar" template voor werkgevers
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
  'Resultaten beschikbaar',
  'werkgever',
  'resultaten_beschikbaar',
  'De resultaten staan voor je klaar',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a73e8;">De resultaten staan voor je klaar! 🎉</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>De actieve periode is afgerond – en de resultaten zijn beschikbaar!</p>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">📊 Wat kun je nu bekijken?</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Scores per thema</strong> - Ontdek waar je organisatie staat</li>
        <li><strong>Verbeteradviezen</strong> - Concrete acties voor verbetering</li>
        <li><strong>Team inzichten</strong> - Vergelijk prestaties tussen teams</li>
        <li><strong>Trends over tijd</strong> - Zie de ontwikkeling van je organisatie</li>
      </ul>
    </div>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1976d2; margin-top: 0;">💡 Dit is hét moment</h3>
      <p>Dit is hét moment om de inzichten om te zetten in actie. Zo haal je het maximale uit GroeiRichting en verbeter je daadwerkelijk je organisatie.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{resultaten_url}}" style="background: #4caf50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        👉 Bekijk jouw resultaten en verbeteradviezen
      </a>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #666;">
      <p style="margin: 0;"><strong>Tip:</strong> Plan een teamoverleg in om de resultaten te bespreken en concrete acties af te spreken.</p>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

De actieve periode is afgerond – en de resultaten zijn beschikbaar!

📊 Wat kun je nu bekijken?
- Scores per thema - Ontdek waar je organisatie staat
- Verbeteradviezen - Concrete acties voor verbetering
- Team inzichten - Vergelijk prestaties tussen teams
- Trends over tijd - Zie de ontwikkeling van je organisatie

💡 Dit is hét moment
Dit is hét moment om de inzichten om te zetten in actie. Zo haal je het maximale uit GroeiRichting en verbeter je daadwerkelijk je organisatie.

👉 {{resultaten_url}}

Tip: Plan een teamoverleg in om de resultaten te bespreken en concrete acties af te spreken.

Met vriendelijke groet,
Team GroeiRichting',
  'Resultaten beschikbaar mail 1 dag na einde actieve periode voor werkgevers',
  true
);
