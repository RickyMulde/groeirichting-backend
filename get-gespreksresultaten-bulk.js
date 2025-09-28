const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const azureClient = require('./utils/azureOpenAI')
const { authMiddleware, assertTeamInOrg } = require('./middleware/auth')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// Functie om automatisch samenvatting te genereren (zonder vervolgacties)
const genereerSamenvatting = async (theme_id, werknemer_id, gesprek_id) => {
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
        score: null
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

    // Haal werkgever configuratie op voor organisatie-omschrijving
    const { data: werkgeverConfig, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('organisatie_omschrijving')
      .eq('werkgever_id', (await supabase.from('users').select('employer_id').eq('id', werknemer_id).single()).data?.employer_id)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.warn('Kon werkgever configuratie niet ophalen:', configError)
    }

    // Haal werknemer context op voor functie-omschrijving en gender
    const { data: werknemerContext, error: contextError } = await supabase
      .from('users')
      .select('functie_omschrijving, gender')
      .eq('id', werknemer_id)
      .single()

    if (contextError && contextError.code !== 'PGRST116') {
      console.warn('Kon werknemer context niet ophalen:', contextError)
    }

    // Bouw prompt
    const inputJSON = gespreksgeschiedenis.map(item => 
      `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}`
    ).join('\n\n')
    
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

Antwoord in JSON-formaat (zonder markdown code blocks):
{
  "samenvatting": "Vat het gesprek samen in maximaal 6 zinnen",
  "score": 7
}`

    // Stuur naar Azure OpenAI
    const completion = await azureClient.createCompletion({
      model: 'gpt-4o', // Gebruik GPT-4.1 via gpt-4o deployment
      messages: [{ role: 'user', content: prompt }],
      temperature: 1,
      max_completion_tokens: 4000
    })

    if (!completion.success) {
      throw new Error(`Azure OpenAI fout: ${completion.error}`)
    }

    const gptResponse = completion.data.choices[0].message.content
    
    // Verwijder markdown code blocks als die er zijn
    let cleanResponse = gptResponse
    if (cleanResponse.includes('```json')) {
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    }
    
    let parsed
    try {
      parsed = JSON.parse(cleanResponse)
    } catch (parseError) {
      console.error('Fout bij parsen van GPT-respons:', parseError)
      console.error('Raw response:', gptResponse)
      console.error('Cleaned response:', cleanResponse)
      // Fallback
      parsed = {
        samenvatting: 'Er was een technisch probleem bij het genereren van de samenvatting.',
        score: 5
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

    // Update database (alleen samenvatting, behoud bestaande vervolgacties)
    const updateData = {
      samenvatting: parsed.samenvatting,
      score: parsed.score,
      samenvatting_type: 'initieel',
      gespreksronde,
      periode: periode,
      gegenereerd_op: new Date().toISOString()
    }

    // Probeer eerst update op gesprek_id, anders een insert
    const { data: updateResult, error: updateError } = await supabase
      .from('gesprekresultaten')
      .update(updateData)
      .eq('gesprek_id', gesprek_id)
      .select()
    
    if (updateError) {
      console.error('Fout bij updaten gesprekresultaat:', updateError)
      throw updateError
    }
    if (!updateResult || updateResult.length === 0) {
      // Geen bestaande rij, dus insert met volledige data
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
        gegenereerd_op: new Date().toISOString()
      }
      
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
      score: parsed.score
    }

  } catch (error) {
    console.error('Fout bij genereren samenvatting:', error)
    return {
      samenvatting: 'Er was een fout bij het genereren van de samenvatting.',
      score: 5
    }
  }
}

// GET /api/get-gespreksresultaten-bulk
// Haalt alle gespreksresultaten op voor een werknemer in een specifieke periode
// Optioneel: team_id voor team-specifieke filtering
router.get('/', async (req, res) => {
  const { werknemer_id, periode, team_id } = req.query
  const employerId = req.ctx.employerId

  if (!werknemer_id || !periode) {
    return res.status(400).json({ error: 'werknemer_id en periode zijn verplicht' })
  }

  try {
    // Valideer team_id als opgegeven
    if (team_id) {
      await assertTeamInOrg(team_id, employerId)
    }

    // Haal werkgever op via werknemer en controleer dat het bij de juiste organisatie hoort
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemer_id)
      .eq('employer_id', employerId)  // Voeg org-scope toe
      .single()

    if (werknemerError) {
      if (werknemerError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Werknemer niet gevonden' })
      }
      throw werknemerError
    }
    if (!werknemer) {
      return res.status(404).json({ error: 'Werknemer niet gevonden' })
    }

    // Haal werkgever configuratie op voor actieve maanden
    const werkgeverResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/werkgever-gesprek-instellingen/${werknemer.employer_id}`)
    let actieveMaanden = [3, 6, 9] // Default fallback
    if (werkgeverResponse.ok) {
      const configData = await werkgeverResponse.json()
      actieveMaanden = configData.actieve_maanden || actieveMaanden
    }

    // Haal alle actieve thema's op
    const { data: themaData, error: themaError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving_werknemer')
      .eq('klaar_voor_gebruik', true)
      .eq('standaard_zichtbaar', true)
      .order('volgorde_index')

    if (themaError) throw themaError

    // Haal alle gespreksresultaten op voor deze periode
    let resultatenQuery = supabase
      .from('gesprekresultaten')
      .select('theme_id, samenvatting, score, gespreksronde, periode, gegenereerd_op, vervolgacties, vervolgacties_toelichting, team_id')
      .eq('werknemer_id', werknemer_id)
      .eq('periode', periode)

    // Voeg team filtering toe als team_id is opgegeven
    if (team_id) {
      resultatenQuery = resultatenQuery.eq('team_id', team_id)
    }

    const { data: resultaten, error: resultatenError } = await resultatenQuery

    if (resultatenError) throw resultatenError

    // Haal ook de daadwerkelijke gesprekken op voor deze periode om te controleren of er data is
    // Bepaal de volgende maand voor de lt filter
    const [jaar, maand] = periode.split('-').map(Number)
    const volgendeMaand = maand === 12 ? 1 : maand + 1
    const volgendJaar = maand === 12 ? jaar + 1 : jaar
    const volgendePeriode = `${volgendJaar}-${String(volgendeMaand).padStart(2, '0')}-01`
    
    let gesprekkenQuery = supabase
      .from('gesprek')
      .select('theme_id, gestart_op, status, team_id')
      .eq('werknemer_id', werknemer_id)
      .is('geanonimiseerd_op', null)
      .gte('gestart_op', `${periode}-01`)
      .lt('gestart_op', volgendePeriode)

    // Voeg team filtering toe als team_id is opgegeven
    if (team_id) {
      gesprekkenQuery = gesprekkenQuery.eq('team_id', team_id)
    }

    const { data: gesprekken, error: gesprekkenError } = await gesprekkenQuery

    if (gesprekkenError) throw gesprekkenError

    // Bepaal welke thema's daadwerkelijk gesprekken hebben in deze periode
    const themasMetGesprekken = new Set()
    if (gesprekken && gesprekken.length > 0) {
      gesprekken.forEach(gesprek => {
        themasMetGesprekken.add(gesprek.theme_id)
      })
    }

    // Combineer thema's met resultaten en genereer automatisch als nodig
    const resultatenMetThemas = await Promise.all(themaData.map(async (thema) => {
      // Alleen thema's tonen die daadwerkelijk gesprekken hebben in deze periode
      if (!themasMetGesprekken.has(thema.id)) {
        return null // Skip thema's zonder gesprekken
      }

      let resultaat = resultaten?.find(r => r.theme_id === thema.id)
      
      // Controleer of we automatisch moeten genereren
      let moetGenereren = false
      let afgerondGesprek = null
      
      if (!resultaat) {
        // Geen resultaat gevonden - probeer te genereren
        moetGenereren = true
      } else if (resultaat.samenvatting && (!resultaat.vervolgacties || resultaat.vervolgacties.length === 0)) {
        // Er is wel een samenvatting, maar geen vervolgacties - probeer te genereren
        moetGenereren = true
        console.log(`🔄 Vervolgacties ontbreken voor thema: ${thema.titel}, probeer te genereren...`)
      }
      
      if (moetGenereren) {
        // Zoek eerst of er een afgerond gesprek is voor dit thema in deze periode
        const { data: gesprekData, error: gesprekError } = await supabase
          .from('gesprek')
          .select('id')
          .eq('theme_id', thema.id)
          .eq('werknemer_id', werknemer_id)
          .eq('status', 'Afgerond')
          .single()

        if (!gesprekError && gesprekData) {
          afgerondGesprek = gesprekData
          console.log(`🔄 Automatisch genereren samenvatting voor thema: ${thema.titel}`)
          
          try {
            const gegenereerdeData = await genereerSamenvatting(
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
              gegenereerd_op: new Date().toISOString()
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
          beschrijving_werknemer: thema.beschrijving_werknemer
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

    // Filter null waarden uit (thema's zonder gesprekken)
    const gefilterdeResultaten = resultatenMetThemas.filter(resultaat => resultaat !== null)

    res.json({
      periode: periode,
      actieve_maanden: actieveMaanden,
      resultaten: gefilterdeResultaten,
      totaal_themas: themaData.length,
      themas_met_resultaat: gefilterdeResultaten.length,
      team_filter: team_id || null
    })

  } catch (err) {
    console.error('Fout bij ophalen gespreksresultaten bulk:', err)
    
    // Geef meer specifieke foutmeldingen
    if (err.message) {
      return res.status(500).json({ 
        error: 'Interne serverfout', 
        details: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      })
    }
    
    return res.status(500).json({ 
      error: 'Interne serverfout',
      details: 'Onbekende fout opgetreden'
    })
  }
})

module.exports = router 