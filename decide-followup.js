// 📁 routes/decide-followup.js
const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post('/', async (req, res) => {
  // We ontvangen nu de volledige gespreksgeschiedenis
  const { thema, gespreksgeschiedenis = [], doel_vraag } = req.body;

  if (!thema || gespreksgeschiedenis.length === 0) {
    return res.status(400).json({ error: 'Thema en gespreksgeschiedenis zijn verplicht.' });
  }

  // Het laatste antwoord is het antwoord van het laatste item in de geschiedenis
  const laatsteAntwoord = gespreksgeschiedenis[gespreksgeschiedenis.length - 1]?.antwoord;

  if (!laatsteAntwoord) {
    return res.status(400).json({ error: 'Kon laatste antwoord niet vinden in gespreksgeschiedenis.' });
  }

  // 1. Tekstlengtecontrole (optioneel, maar nuttig)
  if (laatsteAntwoord.trim().length < 40) {
    return res.json({
      doorgaan: true,
      vervolgvraag: 'Zou je iets uitgebreider kunnen toelichten wat je precies bedoelt?',
      toelichting: 'Antwoord was korter dan 40 tekens.'
    });
  }

  // Genereer de contextstring voor GPT
  const gespreksContext = gespreksgeschiedenis.map(item => 
    `Vraag: ${item.vraag}\nAntwoord: ${item.antwoord}`
  ).join('\n\n');

  // 2. GPT-call met de volledige prompt
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            `Je bent een coachende AI binnen een HR-tool. Je begeleidt werknemers in reflectieve gesprekken per thema, zoals werkdruk of samenwerking.`
        },
        {
          role: 'system',
          content:
            `Doel: bepaal of er voldoende inzicht is verkregen op basis van de gespreksgeschiedenis. Als dat niet zo is, stel 1 relevante vervolgvraag. Gebruik GEEN religie, afkomst, seksuele geaardheid of andere gevoelige thema's. Gebruik neutrale, werkgerelateerde formuleringen.`
        },
        {
          // Hier is de volledige en correcte prompt voor de gebruiker-rol
          role: 'user',
          content:
            `Thema: ${thema}\n\n` +
            (doel_vraag ? `Doel van de laatste vraag: ${doel_vraag}\n\n` : '') +
            `Gespreksgeschiedenis tot nu toe:\n${gespreksContext}\n\n` +
            `Beoordeel de volledige GESCHIEDENIS hierboven. Is er voldoende diepgang bereikt om het doel te behalen? Zo nee, stel een logische vervolgvraag die voortbouwt op het gesprek en helpt het doel te bereiken. Zo ja, stop.\n\n` +
            `Beantwoord als JSON met:\n{\n  "doorgaan": true/false,\n  "vervolgvraag": "tekst of null",\n  "toelichting": "leg aan de werknemer uit waarom je wel of niet doorgaat"\n}`
        }
      ]
    });

    const raw = completion.choices[0].message.content.trim();
    // Robuuster maken voor het geval de API geen JSON teruggeeft
    let parsed;
    try {
        const clean = raw.startsWith('```') ? raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim() : raw;
        parsed = JSON.parse(clean);
    } catch (parseError) {
        console.error('Fout bij parsen van GPT-respons:', parseError, 'Raw response:', raw);
        // Fallback: toch doorgaan met een algemene vraag om het gesprek niet te blokkeren
        parsed = {
            doorgaan: true,
            vervolgvraag: 'Kun je dat verder toelichten?',
            toelichting: 'Er was een klein technisch probleem, we gaan verder.'
        };
    }
    
    return res.json(parsed);

  } catch (err) {
    console.error('GPT-fout:', err);
    return res.status(500).json({ error: 'GPT-verwerking mislukt', details: err.message });
  }
});

module.exports = router;
