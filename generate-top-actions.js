const express = require('express')
const { createClient } = require('@supabase/supabase-js')
// 🔄 MIGRATIE: Nu met Responses API voor GPT-5.2
const openaiClient = require('./utils/openaiClient')
const { authMiddleware } = require('./middleware/auth')
const { getAllowedThemeIds } = require('./utils/themeAccessService')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// Helper functie om de volgende maand te berekenen
function getNextMonth(periode) {
  // Valideer periode formaat (YYYY-MM)
  if (!periode || typeof periode !== 'string' || !/^\d{4}-\d{2}$/.test(periode)) {
    throw new Error(`Ongeldig periode formaat: ${periode}. Verwacht formaat: YYYY-MM`)
  }
  
  const [year, month] = periode.split('-').map(Number)
  
  // Valideer dat jaar en maand geldig zijn
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new Error(`Ongeldige periode waarden: jaar=${year}, maand=${month}`)
  }
  
  let nextMonth = month + 1
  let nextYear = year
  
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear = year + 1
  }
  
  return `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`
}

// Functie om top 3 acties te genereren (kan direct worden aangeroepen of via HTTP)
async function generateTopActions(werknemer_id, periode, employerId) {
  if (!werknemer_id || !periode) {
    throw new Error('werknemer_id en periode zijn verplicht')
  }
  
  if (!employerId) {
    throw new Error('employerId is verplicht')
  }

  console.log(`🔄 [GENERATE] Start generatie top 3 acties voor werknemer ${werknemer_id}, periode ${periode}, employer ${employerId}`)

  // 1️⃣ Haal gesprekresultaten op voor deze periode
  const { data: resultaten, error: resultatenError } = await supabase
    .from('gesprekresultaten')
    .select(`
      id,
      theme_id,
      score,
      vervolgacties,
      gesprek_id
    `)
    .eq('werknemer_id', werknemer_id)
    .eq('periode', periode)

  if (resultatenError) throw resultatenError
  if (!resultaten || resultaten.length === 0) {
    throw new Error('Geen gesprekresultaten gevonden voor deze periode')
  }

  console.log(`📊 ${resultaten.length} gesprekresultaten gevonden`)

  // 1b️⃣ Haal thema info op voor alle unieke theme_ids
  const uniekeThemeIds = [...new Set(resultaten.map(r => r.theme_id))]
  const { data: themes, error: themesError } = await supabase
    .from('themes')
    .select('id, titel')
    .in('id', uniekeThemeIds)

  if (themesError) throw themesError
  if (!themes || themes.length === 0) {
    throw new Error('Geen thema\'s gevonden voor de gesprekresultaten')
  }

  // Maak een map voor snelle lookup
  const themesMap = new Map(themes.map(t => [t.id, t]))

  // 2️⃣ Haal team_id op uit een van de gesprekken
  const gesprekIds = resultaten.map(r => r.gesprek_id).filter(Boolean)
  let teamId = null
  
  if (gesprekIds.length > 0) {
    const { data: gesprekData } = await supabase
      .from('gesprek')
      .select('team_id')
      .in('id', gesprekIds)
      .not('team_id', 'is', null)
      .limit(1)
    
    teamId = gesprekData?.[0]?.team_id || null
  }

  // 3️⃣ Validatie: controleer of alle thema's zijn afgerond
  const toegestaneThemeIds = await getAllowedThemeIds(employerId, teamId)
  
  if (!toegestaneThemeIds || toegestaneThemeIds.length === 0) {
    throw new Error('Geen toegestane thema\'s gevonden voor deze werkgever')
  }

  const uniekeThemasInResultaten = [...new Set(resultaten.map(r => r.theme_id))]
  
  if (uniekeThemasInResultaten.length < toegestaneThemeIds.length) {
    console.log(`⚠️ Niet alle thema's zijn afgerond: ${uniekeThemasInResultaten.length}/${toegestaneThemeIds.length}`)
    throw new Error(`Niet alle thema's zijn afgerond voor deze periode. Afgerond: ${uniekeThemasInResultaten.length}/${toegestaneThemeIds.length} thema's`)
  }

  console.log(`✅ Alle ${toegestaneThemeIds.length} thema's zijn afgerond, ga door met selectie`)

  // 4️⃣ Haal werknemer op voor employer_id
  const { data: werknemer, error: werknemerError } = await supabase
    .from('users')
    .select('employer_id')
    .eq('id', werknemer_id)
    .eq('employer_id', employerId)
    .single()

  if (werknemerError) {
    if (werknemerError.code === 'PGRST116') {
      throw new Error('Werknemer niet gevonden')
    }
    throw werknemerError
  }

  // 5️⃣ Bouw input data voor AI
  const themasData = resultaten.map(r => {
    const theme = themesMap.get(r.theme_id)
    if (!theme) {
      console.warn(`⚠️ Thema niet gevonden voor theme_id: ${r.theme_id}`)
      return null
    }
    return {
      thema: theme.titel,
      score: r.score,
      adviezen: r.vervolgacties || []
    }
  }).filter(Boolean) // Verwijder null entries

  console.log('📋 Thema data voor AI:', JSON.stringify(themasData, null, 2))

  // 6️⃣ Bouw GPT prompt
  const systemInstructions = `TAAK: Selecteer exact 3 adviezen uit de dataset.

INPUT: Thema's met scores (1-10) en adviezen (gelabeld met categorie: 'Oplossing', 'Persoon', 'Verbinding').

ANALYSE STAPPEN:
1. Sorteer thema's van LAAGSTE score naar HOOGSTE score.
2. Tel het aantal 'Onvoldoendes' (thema's met score < 6.0).
   - Noem dit getal: AANTAL_ONVOLDOENDES.

SELECTIE ALGORITME (Kies het scenario dat past bij AANTAL_ONVOLDOENDES):

SCENARIO A: CRISIS (AANTAL_ONVOLDOENDES is 3 of 4)
"Er zijn te veel problemen om diep op één ding in te gaan. We moeten breed blussen."
1. Kies uit Slechtste Thema -> Categorie 'Oplossing'.
2. Kies uit 2e Slechtste Thema -> Categorie 'Oplossing'.
3. Kies uit 3e Slechtste Thema -> Categorie 'Oplossing'.

SCENARIO B: FOCUS (AANTAL_ONVOLDOENDES is 2)
"Er zijn twee duidelijke problemen. We pakken ze allebei aan, maar de zwaarste krijgt extra aandacht."
1. Kies uit Slechtste Thema -> Categorie 'Oplossing'.
2. Kies uit 2e Slechtste Thema -> Categorie 'Oplossing'.
3. Kies uit Slechtste Thema -> Categorie 'Persoon' OF 'Verbinding' (Kies wat beste past voor extra steun).

SCENARIO C: KNELPUNT (AANTAL_ONVOLDOENDES is 1)
"Er is één duidelijk lek. Dat dichten we goed. Daarnaast een positieve impuls."
1. Kies uit Slechtste Thema -> Categorie 'Oplossing'.
2. Kies uit Slechtste Thema -> Categorie 'Persoon' OF 'Verbinding'.
3. Kies uit Beste Thema (Hoogste Score) -> Categorie 'Verbinding' (Mentorschap/Succes delen).

SCENARIO D: GROEI (AANTAL_ONVOLDOENDES is 0)
"Alles gaat goed. Focus op ambitie en anderen helpen."
1. Kies uit Beste Thema -> Categorie 'Verbinding' (Mentorschap).
2. Kies uit 2e Beste Thema -> Categorie 'Oplossing' (Ambitieus project/Verdieping).
3. Kies uit 3e Beste Thema -> Categorie 'Persoon' (Reflectie/Grip behouden).

OUTPUT:
JSON object met 'geselecteerde_adviezen' (array van precies 3 items) en 'toelichting' (korte uitleg welk scenario is toegepast).
Neem de advies-teksten EXACT en ONGEWIJZIGD over uit de input.

MICRO-ADVIEZEN:
Voor elk geselecteerd advies, genereer precies 3 eenvoudige, direct uitvoerbare micro-adviezen die helpen om het doel van dit advies te behalen.
Elke micro-advies bestaat uit:
- Een korte, actiegerichte titel (max 8 woorden) die direct duidelijk maakt wat te doen
- Een korte toelichting in kleine letters die uitlegt waarom of hoe (max 15 woorden)
Voorbeelden:
* "Maak een weekplanning" (toelichting: "Dit geeft overzicht en voorkomt dat taken vergeten worden")
* "Plan wekelijkse 1-op-1 gesprekken" (toelichting: "Geeft ruimte voor persoonlijke aandacht en feedback")
* "Organiseer maandelijkse teamuitjes" (toelichting: "Versterkt de onderlinge banden en verbetert de sfeer")
❌ NIET: Vage adviezen zoals "Verbeter de communicatie" of "Wees proactief"
✅ WEL: Concrete, uitvoerbare acties die direct opgepakt kunnen worden`

  const userInput = `THEMA DATA:
${JSON.stringify(themasData, null, 2)}

Selecteer de 3 belangrijkste adviezen volgens het algoritme.`

  // 7️⃣ Stuur naar OpenAI Responses API
  console.log('🤖 Stuur prompt naar OpenAI Responses API...')
  const response = await openaiClient.createResponse({
    model: 'gpt-5.2',
    instructions: systemInstructions,
    input: [{ role: 'user', content: userInput }],
    max_output_tokens: 2000,
    service_tier: 'default',
    text: {
      format: {
        type: 'json_schema',
        name: 'top_actions_selection',
        schema: {
          type: 'object',
          properties: {
            geselecteerde_adviezen: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  titel: { type: 'string' },
                  reden: { type: 'string' },
                  resultaat: { type: 'string' },
                  categorie: { type: 'string' },
                  micro_adviezen: {
                    type: 'array',
                    description: 'TIJDELIJKE OPLOSSING: Array van precies 3 eenvoudige, direct uitvoerbare micro-adviezen. Elke micro-advies heeft een korte actiegerichte titel (max 8 woorden) en een korte toelichting (max 15 woorden) die uitlegt waarom of hoe. Opslag in tekst formaat in actie_1/2/3 JSON strings.',
                    items: {
                      type: 'object',
                      properties: {
                        titel: {
                          type: 'string',
                          description: 'Korte, actiegerichte titel (max 8 woorden) die direct duidelijk maakt wat te doen. Bijvoorbeeld: "Maak een weekplanning" of "Plan wekelijkse 1-op-1 gesprekken"'
                        },
                        toelichting: {
                          type: 'string',
                          description: 'Korte toelichting in kleine letters (max 15 woorden) die uitlegt waarom of hoe. Bijvoorbeeld: "Dit geeft overzicht en voorkomt dat taken vergeten worden"'
                        }
                      },
                      required: ['titel', 'toelichting'],
                      additionalProperties: false
                    },
                    minItems: 3,
                    maxItems: 3
                  }
                },
                required: ['titel', 'reden', 'resultaat', 'categorie', 'micro_adviezen'],
                additionalProperties: false
              },
              minItems: 3,
              maxItems: 3
            },
            toelichting: { type: 'string' }
          },
          required: ['geselecteerde_adviezen', 'toelichting'],
          additionalProperties: false
        },
        strict: true
      }
    }
  })

  if (!response.success) {
    throw new Error(`OpenAI Responses API fout: ${response.error}`)
  }

  const gptResponse = response.data.output_text
  console.log('🤖 Raw GPT response:', gptResponse)
  
  let cleanResponse = gptResponse.trim()
  if (cleanResponse.includes('```json')) {
    cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  } else if (cleanResponse.includes('```')) {
    cleanResponse = cleanResponse.replace(/```\n?/g, '').trim()
  }
  
  const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    cleanResponse = jsonMatch[0]
  }
  
  let parsed
  try {
    parsed = JSON.parse(cleanResponse)
    
    if (!parsed.geselecteerde_adviezen || parsed.geselecteerde_adviezen.length !== 3) {
      throw new Error('Geen 3 adviezen in response')
    }
    
    console.log('✅ GPT response succesvol geparsed')
    
  } catch (parseError) {
    console.error('❌ Fout bij parsen van GPT-respons:', parseError)
    throw new Error('Fout bij verwerken van AI response')
  }

  // 8️⃣ Sla op in database
  // TIJDELIJKE OPLOSSING: micro_adviezen worden opgeslagen in actie_1/2/3 JSON strings als tekst.
  // Inhoud: Array van objecten met {titel: string, toelichting: string} per actie.
  // Dit is een tijdelijke oplossing totdat een definitieve structuur is bepaald.
  const adviezen = parsed.geselecteerde_adviezen
  const topActiesData = {
    werknemer_id,
    werkgever_id: werknemer.employer_id,
    team_id: teamId,
    periode,
    actie_1: JSON.stringify(adviezen[0]), // Bevat nu ook micro_adviezen array
    actie_2: JSON.stringify(adviezen[1]), // Bevat nu ook micro_adviezen array
    actie_3: JSON.stringify(adviezen[2]), // Bevat nu ook micro_adviezen array
    prioriteit_1: 'hoog',
    prioriteit_2: 'medium',
    prioriteit_3: 'laag',
    toelichting_per_actie: [adviezen[0].reden, adviezen[1].reden, adviezen[2].reden],
    algemene_toelichting: parsed.toelichting,
    gegenereerd_op: new Date().toISOString(),
    gesprek_ids: gesprekIds
  }

  // Probeer eerst update, anders insert
  const { data: updateData, error: updateError } = await supabase
    .from('top_vervolgacties')
    .update(topActiesData)
    .eq('werknemer_id', werknemer_id)
    .eq('periode', periode)
    .select()

  if (updateError) {
    console.error('Fout bij updaten top vervolgacties:', updateError)
    throw updateError
  }

  if (!updateData || updateData.length === 0) {
    const { error: insertError } = await supabase
      .from('top_vervolgacties')
      .insert(topActiesData)
    
    if (insertError) {
      console.error('Fout bij invoegen top vervolgacties:', insertError)
      throw insertError
    }
  }

  console.log('✅ Top 3 vervolgacties succesvol geselecteerd en opgeslagen')

  // 9️⃣ Return resultaat
  return {
    success: true,
    top_acties: {
      actie_1: adviezen[0],
      actie_2: adviezen[1],
      actie_3: adviezen[2]
    },
    algemene_toelichting: parsed.toelichting,
    periode,
    gegenereerd_op: new Date().toISOString()
  }
}

// POST endpoint om top 3 vervolgacties te genereren (via HTTP)
router.post('/', async (req, res) => {
  console.log(`🎯 [GENERATE] POST /api/generate-top-actions ontvangen`)
  console.log(`🎯 [GENERATE] Request body:`, req.body)
  console.log(`🎯 [GENERATE] Auth context:`, req.ctx ? { userId: req.ctx.userId, employerId: req.ctx.employerId } : 'GEEN CONTEXT (auth gefaald!)')
  
  const { werknemer_id, periode } = req.body
  const employerId = req.ctx?.employerId
  
  if (!werknemer_id || !periode) {
    console.error('❌ [GENERATE] Ontbrekende parameters:', { werknemer_id: !!werknemer_id, periode: !!periode })
    return res.status(400).json({ 
      error: 'werknemer_id en periode zijn verplicht'
    })
  }
  
  if (!req.ctx || !employerId) {
    console.error('❌ [GENERATE] Geen auth context - authenticatie is gefaald!')
    return res.status(401).json({ 
      error: 'Authenticatie vereist',
      details: 'Request heeft geen geldige authenticatie context'
    })
  }

  try {
    const result = await generateTopActions(werknemer_id, periode, employerId)
    return res.json(result)
  } catch (err) {
    console.error('❌ Fout bij genereren top 3 acties:', err)
    
    // Bepaal juiste status code op basis van error type
    let statusCode = 500
    if (err.message.includes('niet gevonden')) {
      statusCode = 404
    } else if (err.message.includes('niet alle thema')) {
      statusCode = 400
    }
    
    return res.status(statusCode).json({ 
      error: 'Fout bij genereren top 3 acties',
      details: err.message 
    })
  }
})

// GET endpoint om bestaande top 3 acties op te halen
router.get('/:werknemer_id/:periode', async (req, res) => {
  const { werknemer_id, periode } = req.params

  try {
    const { data: topActies, error } = await supabase
      .from('top_vervolgacties')
      .select('*')
      .eq('werknemer_id', werknemer_id)
      .eq('periode', periode)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Geen top 3 acties gevonden' })
      }
      throw error
    }

    return res.json(topActies)

  } catch (err) {
    console.error('Fout bij ophalen top 3 acties:', err)
    return res.status(500).json({ error: 'Fout bij ophalen top 3 acties' })
  }
})

module.exports = {
  router,
  generateTopActions // Exporteer functie voor direct gebruik
}
