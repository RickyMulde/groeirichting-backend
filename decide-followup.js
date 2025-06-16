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
  const { thema, eerdereAntwoorden = [], laatsteAntwoord } = req.body;

  if (!thema || !laatsteAntwoord) {
    return res.status(400).json({ error: 'Thema en laatsteAntwoord zijn verplicht.' });
  }

  // 1. Tekstlengtecontrole
  if (laatsteAntwoord.trim().length < 40) {
    return res.json({
      doorgaan: true,
      vervolgvraag: 'Zou je iets uitgebreider kunnen toelichten wat je precies bedoelt?',
      toelichting: 'Antwoord was korter dan 40 tekens.'
    });
  }

  const alleAntwoorden = [...eerdereAntwoorden, laatsteAntwoord];

  // 2. Aantal controle
  if (alleAntwoorden.length >= 5) {
    return res.json({
      doorgaan: false,
      vervolgvraag: null,
      toelichting: 'Maximum aantal vragen (5) is bereikt.'
    });
  }

  // 3. GPT-call
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
            `Doel: bepaal of er voldoende inzicht is verkregen. Als dat niet zo is, stel 1 vervolgvraag. Gebruik GEEN religie, afkomst, seksuele geaardheid of andere gevoelige thema's. Gebruik neutrale, werkgerelateerde formuleringen.`
        },
        {
            role: 'user',
            content:
              `Thema: ${thema}\n\nAlle antwoorden tot nu toe:\n` +
              alleAntwoorden.map((a, i) => `Antwoord ${i + 1}: ${a}`).join('\n') +
              `\n\nBeantwoord als JSON met:\n{\n  "doorgaan": true/false,\n  "vervolgvraag": "tekst of null",\n  "toelichting": "leg aan de werknemer uit waarom je wel of niet doorgaat"\n}\n\nVoorbeelden:\n- "Ik stel een vervolgvraag omdat het antwoord nog algemeen is."\n- "Je antwoord was concreet en inzichtgevend, daarom ga ik niet verder doorvragen."`
          }          
      ]
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return res.json(parsed);

  } catch (err) {
    console.error('GPT-fout:', err);
    return res.status(500).json({ error: 'GPT-verwerking mislukt', details: err.message });
  }
});

module.exports = router;
