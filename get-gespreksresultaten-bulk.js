const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Functie om automatisch samenvatting en vervolgacties te genereren
const genereerSamenvattingEnVervolgacties = async (theme_id, werknemer_id, gesprek_id) => {
  try {
    // Haal het thema op
    const { data: thema, error: themaError } = await supabase
      .from('themes')
      .select('*')
      .eq('id', theme_id)
      .single()

    if (themaError) throw themaError
    if (!thema) {
      throw new Error('Thema niet gevonden')
    }

    // Controleer of samenvatting gewenst is
    if (thema.geeft_samenvatting === false) {
      return {
        samenvatting: null,
        score: null,
        vervolgacties: [],
        vervolgacties_toelichting: 'Voor dit thema hoeft geen samenvatting te worden gegenereerd.'
      }
    }

    // Haal de gespreksgeschiedenis op
    const { data: gesprekData, error: gesprekError } = await supabase
      .from('gesprekken_compleet')
      .select('gespreksgeschiedenis, metadata')
      .eq('werknemer_id', werknemer_id)
      .eq('theme_id', theme_id)
      .eq('gesprek_id', gesprek_id)
      .single()

    if (gesprekError) {
      if (gesprekError.code === 'PGRST116') {
        throw new Error('Gesprek niet gevonden')
      }
      throw gesprekError
    }

    if (!gesprekData || !gesprekData.gespreksgeschiedenis || gesprekData.gespreksgeschiedenis.length === 0) {
      throw new Error('Geen gespreksgeschiedenis gevonden')
    }

    const gespreksgeschiedenis = gesprekData.gespreksgeschiedenis

    // Vind hoofdvraag en doelvraag
    const vasteVragen = gespreksgeschiedenis.filter(item => item.type === 'vaste_vraag')
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

    const hoofdvraag = vasteVragenData.find(v => v.type === 'hoofd')?.tekst || ''
    const doelvraag = vasteVragenData.find(v => v.type === 'doel')?.tekst || ''
    const doelantwoord = gespreksgeschiedenis.find(item => 
      vasteVragenData.find(v => v.id === item.vraag_id)?.type === 'doel'
    )?.antwoord || ''

    // Bouw prompt
    const inputJSON = gespreksgeschiedenis.map(item => 
      `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}`
    ).join('\n\n')
    
    const scoreInstructiesTekst = thema.score_instructies ?
      `Gebruik onderstaande beoordelingscriteria voor het bepalen van de score:\nScore instructie: ${thema.score_instructies.score_instructie}\n${Object.entries(thema.score_instructies).filter(([k]) => k.startsWith('score_bepalen_')).map(([k, v]) => `${k.replace('score_bepalen_', 'Score ')}: ${v}`).join('\n')}`
      : '';

    const prompt = `Je bent een HR-assistent. Vat het volgende gesprek samen en stel concrete vervolgacties voor.

Thema: ${thema.titel}
${thema.beschrijving ? `Beschrijving: ${thema.beschrijving}` : ''}

Hoofdvraag: ${hoofdvraag}
Doel van het gesprek: ${doelantwoord}

Gespreksgeschiedenis:
${inputJSON}

${scoreInstructiesTekst}

Opdracht:
1. Vat het gesprek samen in maximaal 6 zinnen
2. Geef een score van 1-10 op basis van de score instructies
3. Stel 3-5 concrete, uitvoerbare vervolgacties voor die:
   - Passen bij het thema en de gespreksinhoud
   - Focus op acties die de werknemer zelf kan ondernemen
   - Specifiek en praktisch zijn
   - Vermijd algemene adviezen

Antwoord in JSON-formaat:
{
  "samenvatting": "Vat het gesprek samen in maximaal 6 zinnen",
  "score": 7,
  "vervolgacties": [
    "Concrete actie 1",
    "Concrete actie 2", 
    "Concrete actie 3"
  ],
  "vervolgacties_toelichting": "Korte uitleg waarom deze acties passend zijn"
}`

    // Stuur naar GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })

    const gptResponse = completion.choices[0].message.content
    let parsed
    try {
      parsed = JSON.parse(gptResponse)
    } catch (parseError) {
      console.error('Fout bij parsen van GPT-respons:', parseError)
      // Fallback
      parsed = {
        samenvatting: 'Er was een technisch probleem bij het genereren van de samenvatting.',
        score: 5,
        vervolgacties: [
          'Plan een vervolggesprek met je leidinggevende.',
          'Bekijk het interne aanbod van workshops en trainingen.',
          'Neem contact op met de HR-afdeling voor persoonlijk advies.'
        ],
        vervolgacties_toelichting: 'Er was een technisch probleem bij het genereren van vervolgacties.'
      }
    }

    // Haal werkgever op via werknemer
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemer_id)
      .single()

    if (werknemerError) throw werknemerError
    if (!werknemer) {
      throw new Error('Werknemer niet gevonden')
    }

    // Bepaal gespreksronde en periode
    let gespreksronde = 1
    let periode = null
    
    if (gesprek_id) {
      const { data: gesprek, error: gesprekError } = await supabase
        .from('gesprek')
        .select('gestart_op')
        .eq('id', gesprek_id)
        .single()
      
      if (!gesprekError && gesprek && gesprek.gestart_op) {
        const startDatum = new Date(gesprek.gestart_op)
        const jaar = startDatum.getFullYear()
        const maand = String(startDatum.getMonth() + 1).padStart(2, '0')
        periode = `${jaar}-${maand}`
      }
      
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

    // Update database
    const resultaatData = {
      werkgever_id: werknemer.employer_id,
      werknemer_id,
      theme_id,
      gesprek_id: gesprek_id,
      samenvatting: parsed.samenvatting,
      score: parsed.score,
      samenvatting_type: 'initieel',
      gespreksronde,
      periode: periode,
      gegenereerd_op: new Date().toISOString(),
      vervolgacties: parsed.vervolgacties || [],
      vervolgacties_toelichting: parsed.vervolgacties_toelichting || '',
      vervolgacties_generatie_datum: new Date().toISOString()
    }

    // Update of insert
    const { data: updateData, error: updateError } = await supabase
      .from('gesprekresultaten')
      .update(resultaatData)
      .eq('gesprek_id', gesprek_id)
      .select()
    
    if (updateError) {
      console.error('Fout bij updaten gesprekresultaat:', updateError)
      throw updateError
    }
    if (!updateData || updateData.length === 0) {
      const { error: insertError } = await supabase
        .from('gesprekresultaten')
        .insert(resultaatData)
      if (insertError) {
        console.error('Fout bij invoegen gesprekresultaat:', insertError)
        throw insertError
      }
    }

    return {
      samenvatting: parsed.samenvatting,
      score: parsed.score,
      vervolgacties: parsed.vervolgacties || [],
      vervolgacties_toelichting: parsed.vervolgacties_toelichting || ''
    }

  } catch (error) {
    console.error('Fout bij genereren samenvatting en vervolgacties:', error)
    return {
      samenvatting: 'Er was een fout bij het genereren van de samenvatting.',
      score: 5,
      vervolgacties: [
        'Plan een vervolggesprek met je leidinggevende.',
        'Bekijk het interne aanbod van workshops en trainingen.',
        'Neem contact op met de HR-afdeling voor persoonlijk advies.'
      ],
      vervolgacties_toelichting: 'Er was een fout bij het genereren van vervolgacties.'
    }
  }
}

// GET /api/get-gespreksresultaten-bulk
// Haalt alle gespreksresultaten op voor een werknemer in een specifieke periode
router.get('/', async (req, res) => {
  const { werknemer_id, periode } = req.query

  if (!werknemer_id || !periode) {
    return res.status(400).json({ error: 'werknemer_id en periode zijn verplicht' })
  }

  try {
    // Haal werkgever op via werknemer
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemer_id)
      .single()

    if (werknemerError) throw werknemerError
    if (!werknemer) {
      return res.status(404).json({ error: 'Werknemer niet gevonden' })
    }

    // Haal werkgever configuratie op voor actieve maanden
    const werkgeverResponse = await fetch(`https://groeirichting-backend.onrender.com/api/werkgever-gesprek-instellingen/${werknemer.employer_id}`)
    let actieveMaanden = [3, 6, 9] // Default fallback
    if (werkgeverResponse.ok) {
      const configData = await werkgeverResponse.json()
      actieveMaanden = configData.actieve_maanden || actieveMaanden
    }

    // Haal alle actieve thema's op
    const { data: themaData, error: themaError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving')
      .eq('klaar_voor_gebruik', true)
      .eq('standaard_zichtbaar', true)
      .order('volgorde_index')

    if (themaError) throw themaError

    // Haal alle gespreksresultaten op voor deze periode
    const { data: resultaten, error: resultatenError } = await supabase
      .from('gesprekresultaten')
      .select('theme_id, samenvatting, score, gespreksronde, periode, gegenereerd_op, vervolgacties, vervolgacties_toelichting')
      .eq('werknemer_id', werknemer_id)
      .eq('periode', periode)

    if (resultatenError) throw resultatenError

    // Combineer thema's met resultaten en genereer automatisch als nodig
    const resultatenMetThemas = await Promise.all(themaData.map(async (thema) => {
      let resultaat = resultaten?.find(r => r.theme_id === thema.id)
      
      // Als er geen resultaat is, probeer automatisch te genereren
      if (!resultaat) {
        // Zoek eerst of er een afgerond gesprek is voor dit thema in deze periode
        const { data: afgerondGesprek, error: gesprekError } = await supabase
          .from('gesprek')
          .select('id')
          .eq('theme_id', thema.id)
          .eq('werknemer_id', werknemer_id)
          .eq('status', 'Afgerond')
          .single()

        if (!gesprekError && afgerondGesprek) {
          console.log(`🔄 Automatisch genereren samenvatting en vervolgacties voor thema: ${thema.titel}`)
          
          try {
            const gegenereerdeData = await genereerSamenvattingEnVervolgacties(
              thema.id, 
              werknemer_id, 
              afgerondGesprek.id
            )
            
            resultaat = {
              theme_id: thema.id,
              samenvatting: gegenereerdeData.samenvatting,
              score: gegenereerdeData.score,
              gespreksronde: 1,
              periode: periode,
              gegenereerd_op: new Date().toISOString(),
              vervolgacties: gegenereerdeData.vervolgacties,
              vervolgacties_toelichting: gegenereerdeData.vervolgacties_toelichting
            }
            
            console.log(`✅ Automatisch gegenereerd voor thema: ${thema.titel}`)
          } catch (error) {
            console.error(`❌ Fout bij automatisch genereren voor thema ${thema.titel}:`, error)
          }
        }
      }

      return {
        id: `${thema.id}-${periode}`,
        themes: {
          titel: thema.titel,
          beschrijving: thema.beschrijving
        },
        samenvatting: resultaat?.samenvatting || null,
        score: resultaat?.score || null,
        gespreksronde: resultaat?.gespreksronde || null,
        periode: periode,
        gegenereerd_op: resultaat?.gegenereerd_op || null,
        vervolgacties: resultaat?.vervolgacties || null,
        vervolgacties_toelichting: resultaat?.vervolgacties_toelichting || null,
        heeft_resultaat: !!resultaat
      }
    }))

    res.json({
      periode: periode,
      actieve_maanden: actieveMaanden,
      resultaten: resultatenMetThemas,
      totaal_themas: themaData.length,
      themas_met_resultaat: resultaten?.length || 0
    })

  } catch (err) {
    console.error('Fout bij ophalen gespreksresultaten bulk:', err)
    return res.status(500).json({ error: 'Interne serverfout' })
  }
})

module.exports = router 