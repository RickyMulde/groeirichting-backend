// 📁 routes/decide-followup.js
const express = require('express');
const router = express.Router();
const azureClient = require('./utils/azureOpenAI');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.test' });

router.post('/', async (req, res) => {
  // We ontvangen nu de volledige gespreksgeschiedenis
  const { thema, gespreksgeschiedenis = [], doel_vraag, laatste_samenvatting, gpt_doelstelling, prompt_style, ai_behavior, gpt_beperkingen, organisatie_omschrijving, functie_omschrijving, gender } = req.body;

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
      vervolgvraag: 'Zou je iets uitgebreider kunnen toelichten wat je precies bedoelt?',
      toelichting: 'Antwoord was leeg.'
    });
  }

  // Genereer de contextstring voor GPT
  const gespreksContext = gespreksgeschiedenis.map(item => 
    `Vraag: ${item.vraag}\nAntwoord: ${item.antwoord}`
  ).join('\n\n');

  console.log('Thema:', thema);
  console.log('Aantal gespreksitems:', gespreksgeschiedenis.length);
  console.log('Laatste antwoord lengte:', laatsteAntwoord.length);

  // 2. Azure OpenAI call met de volledige prompt
  try {
        const completion = await azureClient.createCompletion({
          model: 'gpt-4o', // Gebruik GPT-4o voor snellere responses
          temperature: 1,
          max_completion_tokens: 4000,
      messages: [
        {
          role: 'system',
          content:
            `Je bent een AI-coach binnen een HR-tool. Je begeleidt medewerkers in reflectieve gesprekken over het thema: "${thema}".` +

            `\n\nDoel van het gesprek: ${gpt_doelstelling || 'Het doel is om de medewerker te ondersteunen in zijn/haar ontwikkeling en inzicht te krijgen in relevante werkgerelateerde thema\'s.'}` +

            `\n\nGespreksstijl en gedrag: Hanteer een ${prompt_style || 'coachende en empathische'} stijl. Gedraag je als een ${ai_behavior || 'luisterende, doorvragende en ondersteunende'} coach.` +

            `\n\nBeperkingen: ${gpt_beperkingen || 'Vermijd gevoelige onderwerpen zoals religie, afkomst, seksuele geaardheid, medische of politieke kwesties, tenzij de medewerker hier expliciet over begint.'}` +

            `\n\nContext: Deze gesprekken zijn bedoeld om medewerkers te ondersteunen, signalen op te halen en werkplezier te vergroten.${organisatie_omschrijving ? `\n\nOrganisatie context: ${organisatie_omschrijving}` : ''}${functie_omschrijving ? `\n\nFunctie context: ${functie_omschrijving}` : ''}${gender ? `\n\nGeslacht: ${gender}` : ''}` +
            `${laatste_samenvatting ? '\n\nBelangrijk: Dit is een vervolg gesprek. Je hebt toegang tot een samenvatting van eerdere gesprekken. Gebruik deze informatie om gerichte vragen te stellen die aansluiten op wat er eerder is besproken. Vergelijk de huidige antwoorden met eerdere inzichten waar mogelijk.' : ''}` +

            `\n\n📌 KRITIEKE RICHTLIJNEN VOOR GESPREKSVOERING:` +
            `\n1. Voer een natuurlijk gesprek, geen interview. Reageer eerst kort op het antwoord van de medewerker voordat je een vervolgvraag stelt.` +
            `\n2. Je mag empathisch reageren, nuanceren of kort bevestigen. Voorbeelden:` +
            `\n   - "Dat klinkt als een uitdagende situatie..."` +
            `\n   - "Ik hoor dat je hier goed over hebt nagedacht..."` +
            `\n   - "Dat is interessant, want..."` +
            `\n3. Stel maximaal 1-2 relevante vervolgvragen per hoofdvraag. Alleen meer als dat echt nodig is voor het gespreksdoel. Een medewerker mag zelf geen vragen aan jou stellen.` +
            `\n4. Rond een vraag snel af zodra voldoende informatie beschikbaar is. Rond een onderwerp af zodra de medewerker duidelijk aangeeft dat het goed zit of dat het in balans is. Stel dan geen vragen meer die impliceren dat er een probleem is dat opgelost moet worden. Rond een onderwerp ook af zodra de medewerker aangeeft dat het geen aandacht meer nodig heeft of dat hij/zij tevreden, gemotiveerd of ontspannen is. In dat geval is doorvragen meestal niet zinvol. Focus in dat geval op afronden, erkenning of een nieuw relevant onderwerp — niet op het zoeken naar extra verdieping.` +
            `\n5. Kwaliteit gaat boven kwantiteit: liever één scherpe vraag dan meerdere oppervlakkige.` +
            `\n6. Stel geen vraag die waarschijnlijk hetzelfde antwoord oplevert als eerder. Kies in dat geval een vraag over achterliggende oorzaken, gevolgen of haalbaarheid. Let daarbij op: als de werknemer vooral anderen de schuld geeft, vraag dan wat hij/zij zelf kan doen. Als de werknemer vooral eigen tekortkomingen benoemt, vraag dan hoe de werkgever kan helpen.` +
            `\n7. Als de werknemer vaak iemand anders de schuld geeft (werkgever, collega's, omstandigheden), vraag dan wat hij/zij zelf kan doen om de situatie te verbeteren. Als de werknemer vooral eigen tekortkomingen benoemt, vraag dan hoe de werkgever of organisatie kan helpen of ondersteunen.` +
            `\n8. Als de respondent een oplossing heeft gegeven voor een probleem, vraag dan niet door naar super gedetailleerde invulling van die oplossing.` +
            `\n\nBepaal je reactie en eventuele vervolgvraag op basis van de volledige gespreksgeschiedenis, zodat deze aansluit op eerder gegeven antwoorden en het gespreksdoel.`
        },
        {
          role: 'user',
          content:
            `Thema: ${thema}` + `\n\n` +
            (doel_vraag ? `Doel van de laatste vraag: ${doel_vraag}\n\n` : '') +
            (laatste_samenvatting ? `Eerdere gesprekken samenvatting (gesprek ${laatste_samenvatting.gespreksronde}):\n${laatste_samenvatting.samenvatting}\n\n` : '') +
            `Gespreksgeschiedenis tot nu toe:\n${gespreksContext}\n\n` +
            `Opdracht:\n- Analyseer het volledige gesprek tot nu toe.\n- ${laatste_samenvatting ? 'Houd rekening met wat er eerder is besproken in de samenvatting hierboven.\n- ' : ''}Beoordeel of het doel van de huidige vraag is bereikt.\n- Als het doel nog niet is bereikt, geef dan eerst een korte reactie/bevestiging/nuance op het laatste antwoord, gevolgd door maximaal één relevante vervolgvraag.\n- Als het doel wel is bereikt, geef dat aan en sluit het gesprek af.\n- Zorg ervoor dat je vervolgvraag een OPEN vraag is die de medewerker uitnodigt tot uitgebreide reflectie. Stel dus geen gesloten vragen'\n- ${laatste_samenvatting ? 'Stel gerichte vragen die aansluiten op wat er eerder is besproken.\n- ' : ''}Vergelijk de huidige antwoorden met eerdere inzichten waar mogelijk.\n\n` +
            `BELANGRIJK: Geef je antwoord ALLEEN in het volgende JSON-formaat. Geen andere tekst, geen uitleg, alleen de JSON:\n{\n  "doorgaan": true,\n  "reactie": "korte reactie op het laatste antwoord (kan leeg zijn als niet nodig)",\n  "vervolgvraag": "tekst of null",\n  "toelichting": "leg aan de medewerker uit waarom je wel of niet doorgaat"\n}\n\nZorg ervoor dat de JSON geldig is en alle velden aanwezig zijn.`
        }
      ]
    });

    if (!completion.success) {
      throw new Error(`Azure OpenAI fout: ${completion.error}`)
    }

    // Uitgebreide logging van Azure response
    console.log('=== AZURE RESPONSE DEBUG ===');
    console.log('Completion success:', completion.success);
    console.log('Completion data keys:', Object.keys(completion.data || {}));
    console.log('Choices length:', completion.data?.choices?.length || 0);
    console.log('First choice:', completion.data?.choices?.[0] || 'No choices');
    console.log('Message content:', completion.data?.choices?.[0]?.message?.content || 'No content');
    console.log('Message role:', completion.data?.choices?.[0]?.message?.role || 'No role');
    console.log('Full completion data:', JSON.stringify(completion.data, null, 2));
    console.log('=== END AZURE DEBUG ===');

    const raw = completion.data.choices[0].message.content?.trim() || '';
    
    // Check voor lege response
    if (!raw || raw.length === 0) {
        console.error('Lege response van Azure OpenAI');
        console.error('Completion data:', JSON.stringify(completion.data, null, 2));
        throw new Error('Azure OpenAI gaf een lege response terug');
    }
    
    // Robuuster maken voor het geval de API geen JSON teruggeeft
    let parsed;
    try {
        const clean = raw.startsWith('```') ? raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim() : raw;
        parsed = JSON.parse(clean);
    } catch (parseError) {
        console.error('Fout bij parsen van GPT-respons:', parseError);
        console.error('Raw response:', raw);
        console.error('Raw response length:', raw.length);
        console.error('Raw response type:', typeof raw);
        
        // Geen fallback - laat de echte error door
        throw new Error(`JSON parsing failed: ${parseError.message}. Raw response: ${raw.substring(0, 200)}...`);
    }
    
    // Na JSON parsing, valideer verplichte velden
    if (!parsed.hasOwnProperty('doorgaan') || typeof parsed.doorgaan !== 'boolean') {
        console.error('Ongeldige response: doorgaan veld ontbreekt');
        console.error('Parsed object:', parsed);
        throw new Error(`Invalid response format: missing or invalid 'doorgaan' field. Response: ${JSON.stringify(parsed)}`);
    }
    
    return res.json(parsed);

  } catch (err) {
    console.error('GPT-fout:', err);
    return res.status(500).json({ error: 'GPT-verwerking mislukt', details: err.message });
  }
});

module.exports = router;
