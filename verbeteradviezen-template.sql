-- "Ga aan de slag met de verbeteradviezen" template voor werkgevers
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
  'Ga aan de slag met de verbeteradviezen',
  'werkgever',
  'verbeteradviezen_14_dagen',
  'Tijd om aan de slag te gaan met je verbeteradviezen',
  '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1a73e8;">Tijd om aan de slag te gaan! 🚀</h2>
    
    <p>Beste {{voornaam}},</p>
    
    <p>Je hebt de resultaten al 2 weken in handen. Nu is het tijd om de verbeteradviezen om te zetten in concrete acties!</p>
    
    <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
      <h3 style="color: #f57c00; margin-top: 0;">⚠️ Waarom nu actie ondernemen?</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li><strong>Momentum behouden</strong> - De energie van de actieve periode is nog voelbaar</li>
        <li><strong>Snelle winst</strong> - Kleine aanpassingen kunnen grote impact hebben</li>
        <li><strong>Team betrokkenheid</strong> - Werknemers verwachten actie na hun inzet</li>
        <li><strong>Voorsprong behouden</strong> - Voorkom dat oude patronen terugkomen</li>
      </ul>
    </div>
    
    <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #2e7d32; margin-top: 0;">🎯 Concrete stappen om te starten</h3>
      <ol style="margin: 0; padding-left: 20px;">
        <li><strong>Plan een teamoverleg</strong> - Bespreek de belangrijkste inzichten</li>
        <li><strong>Kies 2-3 prioriteiten</strong> - Focus op wat het meeste impact heeft</li>
        <li><strong>Stel een actieplan op</strong> - Wie doet wat en wanneer?</li>
        <li><strong>Plan follow-up momenten</strong> - Houd de voortgang bij</li>
      </ol>
    </div>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="color: #1976d2; margin-top: 0;">💡 Extra hulp nodig?</h3>
      <p>We helpen je graag bij het implementeren van de verbeteradviezen. Neem contact op voor een gesprek over hoe je de resultaten het beste kunt gebruiken.</p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{verbeteradviezen_url}}" style="background: #ff9800; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        🎯 Bekijk je verbeteradviezen en start vandaag
      </a>
    </div>
    
    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #666;">
      <p style="margin: 0;"><strong>Tip:</strong> Start klein en bouw langzaam op. Consistentie is belangrijker dan perfectie.</p>
    </div>
    
    <p>Met vriendelijke groet,<br>
    <strong>Team GroeiRichting</strong></p>
  </div>',
  'Beste {{voornaam}},

Je hebt de resultaten al 2 weken in handen. Nu is het tijd om de verbeteradviezen om te zetten in concrete acties!

⚠️ Waarom nu actie ondernemen?
- Momentum behouden - De energie van de actieve periode is nog voelbaar
- Snelle winst - Kleine aanpassingen kunnen grote impact hebben
- Team betrokkenheid - Werknemers verwachten actie na hun inzet
- Voorsprong behouden - Voorkom dat oude patronen terugkomen

🎯 Concrete stappen om te starten
1. Plan een teamoverleg - Bespreek de belangrijkste inzichten
2. Kies 2-3 prioriteiten - Focus op wat het meeste impact heeft
3. Stel een actieplan op - Wie doet wat en wanneer?
4. Plan follow-up momenten - Houd de voortgang bij

💡 Extra hulp nodig?
We helpen je graag bij het implementeren van de verbeteradviezen. Neem contact op voor een gesprek over hoe je de resultaten het beste kunt gebruiken.

🎯 {{verbeteradviezen_url}}

Tip: Start klein en bouw langzaam op. Consistentie is belangrijker dan perfectie.

Met vriendelijke groet,
Team GroeiRichting',
  'Verbeteradviezen mail 14 dagen na resultaten voor werkgevers',
  true
);
