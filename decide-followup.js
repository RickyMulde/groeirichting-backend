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
            `Je bent een AI-coach binnen een HR-tool. Je begeleidt medewerkers in reflectieve gesprekken over het thema: "${thema.titel || thema}".`
        },
        {
          role: 'system',
          content:
            `Doel van het gesprek: ${thema.gpt_doelstelling || 'Het doel is om de medewerker te ondersteunen in zijn/haar ontwikkeling en inzicht te krijgen in relevante werkgerelateerde thema\'s.'}\n\n` +
            `Gedrag en stijl: Hanteer de volgende stijl: ${thema.prompt_style || 'coachend en empathisch'}. Jouw gedrag als AI: ${thema.ai_behavior || 'Luisterend, doorvragend, ondersteunend'}.\n\n` +
            `Beperkingen: ${thema.gpt_beperkingen || 'Vermijd gevoelige onderwerpen zoals religie, afkomst, seksuele geaardheid, medische of politieke kwesties.'}\n\n` +
            `Organisatiecontext: Deze gesprekken zijn bedoeld om medewerkers te ondersteunen, signalen op te halen en werkplezier te verhogen.`
        },
        {
          role: 'system',
          content:
            `BELANGRIJKE RICHTLIJNEN VOOR NATUURLIJKE GESPREKKEN:\n\n` +
            `1. GESPREKSSTIJL: Maak dit een echt gesprek, geen interview. Je mag altijd eerst reageren op wat de medewerker zegt voordat je een vervolgvraag stelt.\n\n` +
            `2. REACTIES TOEGESTAAN: Je kunt bevestigen, nuanceren, empathiseren of kort reageren op het antwoord. Bijvoorbeeld:\n` +
            `   - "Dat klinkt als een uitdagende situatie..."\n` +
            `   - "Ik hoor dat je hier goed over hebt nagedacht..."\n` +
            `   - "Dat is interessant, want..."\n\n` +
            `3. VERVOLGVRAAG BESLISSING: Stel maximaal 1-2 vervolgvragen per hoofdvraag. Alleen bij 3-4 als het echt nodig is voor het doel.\n\n` +
            `4. SNEL AFROUNDEN: Als je voldoende relevante informatie hebt voor het doel van de vraag, rond dan af en ga door naar de volgende vraag.\n\n` +
            `5. KWALITEIT OVER KWANTITEIT: Liever 1-2 goede, gerichte vervolgvragen dan 4 oppervlakkige vragen.`
        },
        {
          role: 'user',
          content:
            `Thema: ${thema.titel || thema}` + (thema.beschrijving ? `\nBeschrijving: ${thema.beschrijving}` : '') + `\n\n` +
            (doel_vraag ? `Doel van de laatste vraag: ${doel_vraag}\n\n` : '') +
            `Gespreksgeschiedenis tot nu toe:\n${gespreksContext}\n\n` +
            `Opdracht:\n- Analyseer het volledige gesprek tot nu toe.\n- Beoordeel of het doel van de huidige vraag is bereikt.\n- Als het doel nog niet is bereikt, geef dan eerst een korte reactie/bevestiging/nuance op het laatste antwoord, gevolgd door maximaal één relevante vervolgvraag.\n- Als het doel wel is bereikt, geef dat aan en sluit het gesprek af.\n\n` +
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
    
    return res.json(parsed);

  } catch (err) {
    console.error('GPT-fout:', err);
    return res.status(500).json({ error: 'GPT-verwerking mislukt', details: err.message });
  }
});

module.exports = router;
