// 📁 routes/decide-followup.js
const express = require('express');
const router = express.Router();
// 🔄 MIGRATIE: Nu met Responses API voor GPT-5.2-instant
const openaiClient = require('./utils/openaiClient');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.test' });

router.post('/', async (req, res) => {
  // We ontvangen nu de volledige gespreksgeschiedenis
  const { thema, gespreksgeschiedenis = [], doel_vraag, gpt_doelstelling, prompt_style, ai_behavior, gpt_beperkingen, organisatie_omschrijving, functie_omschrijving, gender } = req.body;

  if (!thema || gespreksgeschiedenis.length === 0) {
    return res.status(400).json({ error: 'Thema en gespreksgeschiedenis zijn verplicht.' });
  }

  // Het laatste antwoord is het antwoord van het laatste item in de geschiedenis
  const laatsteAntwoord = gespreksgeschiedenis[gespreksgeschiedenis.length - 1]?.antwoord;

  if (!laatsteAntwoord) {
    return res.status(400).json({ error: 'Kon laatste antwoord niet vinden in gespreksgeschiedenis.' });
  }

  // 1. Tekstlengtecontrole (optioneel, maar nuttig)
  if (laatsteAntwoord.trim().length < 1) {
    return res.json({
      doorgaan: true,
      vervolgvraag: 'Zou je iets uitgebreider kunnen toelichten wat je precies bedoelt?'
    });
  }

  // Genereer de contextstring voor GPT
  const gespreksContext = gespreksgeschiedenis.map(item => 
    `Vraag: ${item.vraag}\nAntwoord: ${item.antwoord}`
  ).join('\n\n');

  // System instructions voor de HR-coach
  const systemInstructions = 
    `Je bent een HR-coach binnen een AI-tool. Je begeleidt medewerkers in reflectieve gesprekken over het thema: "${thema}".` +

    `\n\nDoel van het gesprek: ${gpt_doelstelling || 'Het doel is om de medewerker te ondersteunen in zijn/haar ontwikkeling en inzicht te krijgen in relevante werkgerelateerde thema\'s.'}` +

    `\n\nGespreksstijl en gedrag: Hanteer een rustige, duidelijke en reflectieve toon.` +

    `\n\nBeperkingen: ${gpt_beperkingen || 'Vermijd gevoelige onderwerpen zoals religie, afkomst, seksuele geaardheid, medische of politieke kwesties, tenzij de medewerker hier expliciet over begint.'}` +

    `\n\nContext: Deze gesprekken zijn bedoeld om medewerkers te ondersteunen, signalen op te halen en werkplezier te vergroten.${organisatie_omschrijving ? `\n\nOrganisatie context: ${organisatie_omschrijving}` : ''}${functie_omschrijving ? `\n\nFunctie context: ${functie_omschrijving}` : ''}${gender ? `\n\nGeslacht: ${gender}` : ''}` +

    `\n\nKRITIEKE RICHTLIJNEN VOOR GESPREKSVOERING:` +
    `\n1. Voer een natuurlijk gesprek, geen interview. Geef een korte, natuurlijke reactie als dat helpt om de medewerker te erkennen. Geef alleen een vervolgvraag als geen van de afrondcriteria uit de Opdracht is bereikt.` +
    `\n2. Beantwoord geen inhoudelijke vragen die de medewerker aan jou stelt. Als de medewerker aangeeft dat jouw vraag onduidelijk was, herformuleer dan dezelfde vraag kort en duidelijk, zonder nieuwe informatie toe te voegen. Open geen nieuwe onderwerpen.` +
    `\n3. Rond af volgens de drie afrondcriteria in de opdracht. Stel geen extra vragen meer zodra één van deze criteria is bereikt.` +
    `\n4. Kwaliteit gaat boven kwantiteit: liever één scherpe vraag dan meerdere oppervlakkige. Stel altijd slechts 1 enkelvoudige vraag per keer.` +
    `\n5. Let op het evenwicht tussen eigen invloed en externe factoren. Als de medewerker vooral wijst naar omstandigheden, collega's of werkgever, onderzoek dan wat de medewerker zelf kan beïnvloeden. Als de medewerker vooral eigen tekortkomingen of fouten benadrukt, onderzoek dan welke steun of randvoorwaarden vanuit de organisatie kunnen helpen. Vermijd schuldvragen; focus op invloed, haalbaarheid en realistische ondersteuning.` +
    `\n6. Als de respondent een oplossing heeft gegeven voor een probleem, vraag dan niet door naar super gedetailleerde invulling van die oplossing.` +
    `\n\nBepaal je reactie en eventuele vervolgvraag op basis van de volledige gespreksgeschiedenis, zodat deze aansluit op eerder gegeven antwoorden en het gespreksdoel.` +
    `\n\nAntwoord ALLEEN als geldig JSON-object met precies deze velden: "doorgaan" (true/false), "reactie" (string) en "vervolgvraag" (string of null).`;

  // User input met gesprekscontext
  const userInput = 
    `Thema: ${thema}` + `\n\n` +
    (doel_vraag ? `Doel van de laatste vraag: ${doel_vraag}\n\n` : '') +
    `Gespreksgeschiedenis tot nu toe:\n${gespreksContext}\n\n` +
    `Opdracht:\n\nRond een hoofdvraag af zodra één van de volgende drie situaties optreedt:\n` +
    `\n1. Het doel van de hoofdvraag is bereikt (voldoende concreet en bruikbaar antwoord).` +
    `\n2. De medewerker geeft aan dat het onderwerp goed zit, geen aandacht vraagt of in balans is.` +
    `\n3. Er zijn 3 relevante vervolgvragen gesteld.` +
    `\n\nBij afronding: erken kort wat de medewerker heeft aangegeven, stel geen verdiepende vragen meer en ga door naar de volgende hoofdvraag.` +
    `\n\nAls geen van de afrondcriteria uit de Opdracht is bereikt: geef eerst een korte reactie/bevestiging/nuance op het laatste antwoord, gevolgd door maximaal één relevante, enkelvoudige vervolgvraag. Zorg ervoor dat je vervolgvraag een OPEN vraag is die de medewerker uitnodigt tot uitgebreide reflectie. Stel dus geen gesloten vragen en geen samengestelde vragen.\n\n` +
    `BELANGRIJK: Geef je antwoord ALLEEN als geldig JSON-object met precies deze velden: "doorgaan" (true/false), "reactie" (string) en "vervolgvraag" (string of null). Als er al 3 vervolgvragen zijn gesteld, gebruik dan: "doorgaan": false, "vervolgvraag": null, "reactie": "korte erkenning".`;

  // 2. OpenAI Responses API call voor GPT-5.2-instant
  try {
    const response = await openaiClient.createResponse({
      model: 'gpt-5.2', // Snelste GPT-5.2 variant voor real-time gesprekken
      instructions: systemInstructions,
      input: [
        {
          role: 'user',
          content: userInput
        }
      ],
      max_output_tokens: 2500,
      service_tier: 'default',
      // Structured output via text format (JSON)
      text: {
        format: {
          type: 'json_schema',
          name: 'followup_decision',
          schema: {
            type: 'object',
            properties: {
              doorgaan: { type: 'boolean' },
              reactie: { type: 'string' },
              vervolgvraag: { type: ['string', 'null'] }
            },
            required: ['doorgaan', 'reactie', 'vervolgvraag'],
            additionalProperties: false
          },
          strict: true
        }
      }
    });

    if (!response.success) {
      console.error('[decide-followup] OpenAI Responses API failed:', response.error);
      console.error('[decide-followup] Response details:', JSON.stringify(response.details, null, 2));
      throw new Error(`OpenAI Responses API fout: ${response.error}`)
    }

    const raw = response.data.output_text?.trim() || '';
    
    // Check voor lege response
    if (!raw || raw.length === 0) {
        console.error('[decide-followup] Empty content received');
        console.error('[decide-followup] Full response:', JSON.stringify(response.data, null, 2));
        throw new Error('OpenAI Responses API gaf een lege response terug');
    }
    
    console.log('[decide-followup] ✅ Received response, length:', raw.length);
    console.log('[decide-followup] 📋 Raw response content (first 500 chars):', raw.substring(0, 500));
    
    // Parse JSON response
    let parsed;
    try {
        const clean = raw.startsWith('```') ? raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim() : raw;
        parsed = JSON.parse(clean);
        console.log('[decide-followup] ✅ JSON parsed successfully');
    } catch (parseError) {
        console.error('[decide-followup] ❌ JSON parsing failed:', parseError.message);
        console.error('[decide-followup] Raw response (first 500 chars):', raw.substring(0, 500));
        throw new Error(`JSON parsing failed: ${parseError.message}. Raw response: ${raw.substring(0, 200)}...`);
    }
    
    // Valideer verplichte velden
    if (!parsed.hasOwnProperty('doorgaan') || typeof parsed.doorgaan !== 'boolean') {
        console.error('[decide-followup] ❌ Invalid response format - missing or invalid doorgaan field');
        console.error('[decide-followup] Parsed response:', JSON.stringify(parsed, null, 2));
        throw new Error(`Invalid response format: missing or invalid 'doorgaan' field. Response: ${JSON.stringify(parsed)}`);
    }
    
    console.log('[decide-followup] ✅ Successfully processed, returning response');
    return res.json(parsed);

  } catch (err) {
    console.error('[decide-followup] ❌ Error:', err.message);
    console.error('[decide-followup] Stack:', err.stack);
    if (err.details) {
      console.error('[decide-followup] Details:', JSON.stringify(err.details, null, 2));
    }
    return res.status(500).json({ error: 'GPT-verwerking mislukt', details: err.message });
  }
});

module.exports = router;
