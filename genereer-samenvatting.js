const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const azureClient = require('./utils/azureOpenAI')
const { authMiddleware } = require('./middleware/auth')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

router.post('/', async (req, res) => {
  const { theme_id, werknemer_id, gesprek_id } = req.body
  const employerId = req.ctx.employerId
  
  if (!theme_id || !werknemer_id) {
    return res.status(400).json({ error: 'theme_id en werknemer_id zijn verplicht' })
  }

  try {
    // 0️⃣ Haal het thema op uit de themes-tabel
    const { data: thema, error: themaError } = await supabase
      .from('themes')
      .select('*')
      .eq('id', theme_id)
      .single()

    if (themaError) throw themaError
    if (!thema) {
      return res.status(404).json({ error: 'Thema niet gevonden' })
    }

    // Controleer of samenvatting gewenst is
    if (thema.geeft_samenvatting === false) {
      return res.status(200).json({
        samenvatting: null,
        score: null,
        melding: 'Voor dit thema hoeft geen samenvatting te worden gegenereerd.'
      })
    }
    // ✅ 1. Haal de complete gespreksgeschiedenis op uit de nieuwe tabel
    const { data: gesprekData, error: gesprekError } = await supabase
      .from('gesprekken_compleet')
      .select('gespreksgeschiedenis, metadata')
      .eq('werknemer_id', werknemer_id)
      .eq('theme_id', theme_id)
      .eq('gesprek_id', gesprek_id)
      .single()

    if (gesprekError) {
      if (gesprekError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Gesprek niet gevonden' })
      }
      throw gesprekError
    }

    if (!gesprekData || !gesprekData.gespreksgeschiedenis || gesprekData.gespreksgeschiedenis.length === 0) {
      return res.status(404).json({ error: 'Geen gespreksgeschiedenis gevonden' })
    }

    const gespreksgeschiedenis = gesprekData.gespreksgeschiedenis

    // ✅ 2. Vind hoofdvraag en doelvraag (alleen van vaste vragen)
    const vasteVragen = gespreksgeschiedenis.filter(item => item.type === 'vaste_vraag')
    
    // Haal de vaste vragen op uit theme_questions om type en doel_vraag te krijgen
    const vasteVraagIds = vasteVragen.map(item => item.vraag_id).filter(Boolean)
    
    let vasteVragenData = []
    if (vasteVraagIds.length > 0) {
      const { data: themeQuestions, error: themeError } = await supabase
        .from('theme_questions')
        .select('id, tekst, type, doel_vraag')
        .in('id', vasteVraagIds)
      
      if (!themeError && themeQuestions) {
        vasteVragenData = themeQuestions
      }
    }

    // 2b. Haal werkgever configuratie op voor organisatie-omschrijving
    const { data: werkgeverConfig, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('organisatie_omschrijving')
      .eq('werkgever_id', (await supabase.from('users').select('employer_id').eq('id', werknemer_id).single()).data?.employer_id)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.warn('Kon werkgever configuratie niet ophalen:', configError)
    }

    // 2c. Haal werknemer context op voor functie-omschrijving en gender
    const { data: werknemerContext, error: contextError } = await supabase
      .from('users')
      .select('functie_omschrijving, gender, employer_id')
      .eq('id', werknemer_id)
      .eq('employer_id', employerId)  // Voeg org-scope toe
      .single()

    if (contextError) {
      if (contextError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Werknemer niet gevonden' })
      }
      console.warn('Kon werknemer context niet ophalen:', contextError)
    }

    const hoofdvraag = vasteVragenData.find(v => v.type === 'hoofd')?.tekst || ''
    const doelvraag = vasteVragenData.find(v => v.type === 'doel')?.tekst || ''
    const doelantwoord = gespreksgeschiedenis.find(item => 
      vasteVragenData.find(v => v.id === item.vraag_id)?.type === 'doel'
    )?.antwoord || ''

    // ✅ 3. Bouw prompt met alle vragen (vaste + vervolg)
    const inputJSON = gespreksgeschiedenis.map(item => 
      `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}`
    ).join('\n\n')
    
    // Voeg score_instructies toe aan de prompt
    const scoreInstructiesTekst = thema.score_instructies ?
      `Gebruik onderstaande beoordelingscriteria voor het bepalen van de score:\nScore instructie: ${thema.score_instructies.score_instructie}\n${Object.entries(thema.score_instructies).filter(([k]) => k.startsWith('score_bepalen_')).map(([k, v]) => `${k.replace('score_bepalen_', 'Score ')}: ${v}`).join('\n')}`
      : '';

    const prompt = `Je bent een HR-assistent die een gesprek samenvat en vervolgacties voorstelt voor een WERKNEMER.

Thema: ${thema.titel}
${thema.beschrijving_werknemer ? `Beschrijving: ${thema.beschrijving_werknemer}` : ''}${werkgeverConfig?.organisatie_omschrijving ? `\n\nOrganisatie context: ${werkgeverConfig.organisatie_omschrijving}` : ''}${werknemerContext?.functie_omschrijving ? `\n\nFunctie context: ${werknemerContext.functie_omschrijving}` : ''}${werknemerContext?.gender ? `\n\nGeslacht: ${werknemerContext.gender}` : ''}

Hoofdvraag: ${hoofdvraag}
Doel van het gesprek: ${doelantwoord}

Gespreksgeschiedenis:
${inputJSON}

${scoreInstructiesTekst}

Opdracht:
1. Vat het gesprek samen in maximaal 6 zinnen
   - Schrijf de samenvatting in de TWEEDE PERSOON (jij, je, jouw) in plaats van de derde persoon (de werknemer, hij/zij)
   - Bijvoorbeeld: "Jij bent pas begonnen..." in plaats van "De werknemer is pas begonnen..."
   - Maak het persoonlijk en direct gericht aan de werknemer
2. Geef een score van 1-10 op basis van de score instructies
3. Stel 3-5 concrete, uitvoerbare vervolgacties voor die:
   - Specifiek voor de WERKNEMER zijn (niet voor de werkgever)
   - Acties zijn die de werknemer ZELF kan ondernemen
   - Passen bij het thema en de gespreksinhoud
   - Specifiek en praktisch zijn
   - Vermijd algemene adviezen
   - NIET gericht op wat de werkgever moet doen

Voorbeelden van goede vervolgacties voor werknemers:
- "Plan een gesprek met je leidinggevende over..."
- "Zoek een workshop over..."
- "Maak een actieplan voor..."
- "Stel jezelf een doel om..."

Antwoord in JSON-formaat:
{
  "samenvatting": "Vat het gesprek samen in maximaal 6 zinnen in de tweede persoon (jij, je, jouw)",
  "score": 7,
  "vervolgacties": [
    "Concrete actie 1",
    "Concrete actie 2", 
    "Concrete actie 3"
  ],
  "vervolgacties_toelichting": "Korte uitleg waarom deze acties passend zijn voor de werknemer"
}`

    // ✅ 4. Stuur prompt naar Azure OpenAI
    const completion = await azureClient.createCompletion({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_completion_tokens: 1000
    })

    if (!completion.success) {
      throw new Error(`Azure OpenAI fout: ${completion.error}`)
    }

    const gptResponse = completion.data.choices[0].message.content
    const parsed = JSON.parse(gptResponse)

    // ✅ 5. Haal werkgever op via werknemer
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemer_id)
      .single()

    if (werknemerError) throw werknemerError
    if (!werknemer) {
      return res.status(404).json({ error: 'Werknemer niet gevonden' })
    }

    // ✅ 6. Bepaal gespreksronde en periode
    let gespreksronde = 1
    let periode = null
    
    if (gesprek_id) {
      // Haal gesprek op om startdatum te krijgen
      const { data: gesprek, error: gesprekError } = await supabase
        .from('gesprek')
        .select('gestart_op')
        .eq('id', gesprek_id)
        .single()
      
      if (!gesprekError && gesprek && gesprek.gestart_op) {
        // Bepaal periode op basis van startdatum (YYYY-MM formaat)
        const startDatum = new Date(gesprek.gestart_op)
        const jaar = startDatum.getFullYear()
        const maand = String(startDatum.getMonth() + 1).padStart(2, '0')
        periode = `${jaar}-${maand}`
      }
      
      // Tel hoeveel gesprekken er al zijn voor dit thema en deze werknemer
      const { data: bestaandeGesprekken, error: rondeError } = await supabase
        .from('gesprek')
        .select('id')
        .eq('theme_id', theme_id)
        .eq('werknemer_id', werknemer_id)
        .order('gestart_op', { ascending: true })

      if (!rondeError && bestaandeGesprekken) {
        const huidigeIndex = bestaandeGesprekken.findIndex(g => g.id === gesprek_id)
        gespreksronde = huidigeIndex !== -1 ? huidigeIndex + 1 : bestaandeGesprekken.length
      }
    }

    // ✅ 7. Opslaan in gesprekresultaten
    const resultaatData = {
      werkgever_id: werknemer.employer_id,
      werknemer_id,
      theme_id,
      gesprek_id: gesprek_id, // Voeg gesprek_id toe
      samenvatting: parsed.samenvatting,
      score: parsed.score,
      samenvatting_type: 'initieel',
      gespreksronde,
      periode: periode, // Voeg periode toe
      gegenereerd_op: new Date().toISOString(),
      vervolgacties: parsed.vervolgacties || [],
      vervolgacties_toelichting: parsed.vervolgacties_toelichting || '',
      vervolgacties_generatie_datum: new Date().toISOString()
    }

    // Probeer eerst een update op gesprek_id, anders een insert
    const { data: updateData, error: updateError } = await supabase
      .from('gesprekresultaten')
      .update(resultaatData)
      .eq('gesprek_id', gesprek_id)
      .select(); // zodat je weet of er iets is aangepast
    
    if (updateError) {
      console.error('Fout bij updaten gesprekresultaat:', updateError);
      throw updateError;
    }
    if (!updateData || updateData.length === 0) {
      // Geen bestaande rij, dus insert
      const { error: insertError } = await supabase
        .from('gesprekresultaten')
        .insert(resultaatData);
      if (insertError) {
        console.error('Fout bij invoegen gesprekresultaat:', insertError);
        throw insertError;
      }
    }

    return res.json(parsed)
  } catch (err) {
    console.error('Fout bij genereren samenvatting:', err)
    return res.status(500).json({ error: 'Fout bij genereren samenvatting' })
  }
})

module.exports = router
