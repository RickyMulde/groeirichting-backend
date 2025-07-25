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

  console.log('Thema:', thema.titel);
  console.log('Aantal gespreksitems:', gespreksgeschiedenis.length);
  console.log('Laatste antwoord lengte:', laatsteAntwoord.length);

  // 2. GPT-call met de volledige prompt
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            `Je bent een AI-coach binnen een HR-tool. Je begeleidt medewerkers in reflectieve gesprekken over het thema: "${thema.titel || thema}".` +

            `\n\nDoel van het gesprek: ${thema.gpt_doelstelling || 'Het doel is om de medewerker te ondersteunen in zijn/haar ontwikkeling en inzicht te krijgen in relevante werkgerelateerde thema\'s.'}` +

            `\n\nGespreksstijl en gedrag: Hanteer een ${thema.prompt_style || 'coachende en empathische'} stijl. Gedraag je als een ${thema.ai_behavior || 'luisterende, doorvragende en ondersteunende'} coach.` +

            `\n\nBeperkingen: ${thema.gpt_beperkingen || 'Vermijd gevoelige onderwerpen zoals religie, afkomst, seksuele geaardheid, medische of politieke kwesties, tenzij de medewerker hier expliciet over begint.'}` +

            `\n\nContext: Deze gesprekken zijn bedoeld om medewerkers te ondersteunen, signalen op te halen en werkplezier te vergroten.` +

            `\n\n📌 KRITIEKE RICHTLIJNEN VOOR GESPREKSVOERING:` +
            `\n1. Voer een natuurlijk gesprek, geen interview. Reageer eerst kort op het antwoord van de medewerker voordat je een vervolgvraag stelt.` +
            `\n2. Je mag empathisch reageren, nuanceren of kort bevestigen. Voorbeelden:` +
            `\n   - "Dat klinkt als een uitdagende situatie..."` +
            `\n   - "Ik hoor dat je hier goed over hebt nagedacht..."` +
            `\n   - "Dat is interessant, want..."` +
            `\n3. Stel maximaal 1-2 relevante vervolgvragen per hoofdvraag. Alleen meer als dat echt nodig is voor het gespreksdoel.` +
            `\n4. Rond een vraag snel af zodra voldoende informatie beschikbaar is.` +
            `\n5. Kwaliteit gaat boven kwantiteit: liever één scherpe vraag dan meerdere oppervlakkige.` +
            `\n\nBeantwoord de opdracht op basis van de volledige gespreksgeschiedenis.`
        },
        {
          role: 'user',
          content:
            `Thema: ${thema.titel || thema}` + (thema.beschrijving ? `\nBeschrijving: ${thema.beschrijving}` : '') + `\n\n` +
            (doel_vraag ? `Doel van de laatste vraag: ${doel_vraag}\n\n` : '') +
            `Gespreksgeschiedenis tot nu toe:\n${gespreksContext}\n\n` +
            `Opdracht:\n- Analyseer het volledige gesprek tot nu toe.\n- Beoordeel of het doel van de huidige vraag is bereikt.\n- Als het doel nog niet is bereikt, geef dan eerst een korte reactie/bevestiging/nuance op het laatste antwoord, gevolgd door maximaal één relevante vervolgvraag.\n- Als het doel wel is bereikt, geef dat aan en sluit het gesprek af.\n- Zorg ervoor dat je vervolgvraag een OPEN vraag is die de medewerker uitnodigt tot uitgebreide reflectie.\n\n` +
            `Geef je antwoord in het volgende JSON-formaat:\n{\n  "doorgaan": true/false,\n  "reactie": "korte reactie op het laatste antwoord (kan leeg zijn als niet nodig)",\n  "vervolgvraag": "tekst of null",\n  "toelichting": "leg aan de medewerker uit waarom je wel of niet doorgaat"\n}`
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
            reactie: '',
            vervolgvraag: 'Kun je dat verder toelichten?',
            toelichting: 'Er was een klein technisch probleem, we gaan verder.'
        };
    }
    
    // Na JSON parsing, valideer verplichte velden
    if (!parsed.hasOwnProperty('doorgaan') || typeof parsed.doorgaan !== 'boolean') {
        console.error('Ongeldige response: doorgaan veld ontbreekt');
        parsed = { doorgaan: true, reactie: '', vervolgvraag: 'Kun je dat verder toelichten?', toelichting: 'Technische fout, we gaan verder.' };
    }
    
    return res.json(parsed);

  } catch (err) {
    console.error('GPT-fout:', err);
    return res.status(500).json({ error: 'GPT-verwerking mislukt', details: err.message });
  }
});

module.exports = router;
