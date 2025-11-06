const express = require('express')
const { createClient } = require('@supabase/supabase-js')
// 🔄 MIGRATIE: Azure → OpenAI Direct
// Terug naar Azure: vervang 'openaiClient' door 'azureClient' en gebruik model 'gpt-4o', temperature 0.3, max_completion_tokens 4000
const openaiClient = require('./utils/openaiClient')
const { authMiddleware } = require('./middleware/auth')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// Helper functie om de volgende maand te berekenen
function getNextMonth(periode) {
  const [year, month] = periode.split('-').map(Number)
  let nextMonth = month + 1
  let nextYear = year
  
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear = year + 1
  }
  
  return `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`
}

// POST endpoint om top 3 vervolgacties te genereren
router.post('/', async (req, res) => {
  const { werknemer_id, periode } = req.body
  const employerId = req.ctx.employerId
  
  if (!werknemer_id || !periode) {
    return res.status(400).json({ 
      error: 'werknemer_id en periode zijn verplicht'
    })
  }

  try {
    console.log(`🔄 Start generatie top 3 acties voor werknemer ${werknemer_id}, periode ${periode}`)

    // 1️⃣ Haal alle gesprekken op van alle thema's voor deze werknemer in deze periode
    const { data: gesprekken, error: gesprekError } = await supabase
      .from('gesprek')
      .select(`
        id,
        theme_id,
        gestart_op,
        themes!inner(
          id,
          titel,
          beschrijving_werknemer,
          score_instructies
        )
      `)
      .eq('werknemer_id', werknemer_id)
      .eq('status', 'Afgerond')
      .gte('gestart_op', `${periode}-01`)
      .lt('gestart_op', getNextMonth(periode)) // Volgende maand

    if (gesprekError) throw gesprekError
    if (!gesprekken || gesprekken.length === 0) {
      return res.status(404).json({ 
        error: 'Geen voltooide gesprekken gevonden voor deze periode' 
      })
    }

    console.log(`📊 ${gesprekken.length} voltooide gesprekken gevonden`)

    // 1.5️⃣ Extra validatie: controleer of alle thema's zijn afgerond
    const { data: alleThemas, error: themaError } = await supabase
      .from('themes')
      .select('id')
      .eq('werkgever_id', employerId)

    if (themaError) throw themaError

    const uniekeThemasInGesprekken = [...new Set(gesprekken.map(g => g.theme_id))]
    const alleThemasAfgerond = uniekeThemasInGesprekken.length === alleThemas.length

    if (!alleThemasAfgerond) {
      console.log(`⚠️ Niet alle thema's zijn afgerond: ${uniekeThemasInGesprekken.length}/${alleThemas.length}`)
      return res.status(400).json({ 
        error: 'Niet alle thema\'s zijn afgerond voor deze periode',
        details: `Afgerond: ${uniekeThemasInGesprekken.length}/${alleThemas.length} thema's`
      })
    }

    console.log(`✅ Alle ${alleThemas.length} thema's zijn afgerond, ga door met generatie`)

    // 2️⃣ Haal alle gespreksgeschiedenis op
    const gesprekIds = gesprekken.map(g => g.id)
    console.log('🔍 Zoek naar gespreksgeschiedenis voor IDs:', gesprekIds)
    
    const { data: gespreksgeschiedenis, error: geschiedenisError } = await supabase
      .from('gesprekken_compleet')
      .select('gespreksgeschiedenis, metadata, gesprek_id')
      .in('gesprek_id', gesprekIds)

    if (geschiedenisError) {
      console.error('❌ Fout bij ophalen gespreksgeschiedenis:', geschiedenisError)
      throw geschiedenisError
    }
    
    console.log('📚 Gespreksgeschiedenis gevonden:', gespreksgeschiedenis?.length || 0)
    
    if (!gespreksgeschiedenis || gespreksgeschiedenis.length === 0) {
      return res.status(404).json({ 
        error: 'Geen gespreksgeschiedenis gevonden',
        details: `Gezocht naar ${gesprekIds.length} gesprek IDs in gesprekken_compleet tabel`
      })
    }

    // 3️⃣ Haal werkgever en werknemer context op
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id, functie_omschrijving, gender')
      .eq('id', werknemer_id)
      .eq('employer_id', employerId)  // Voeg org-scope toe
      .single()

    if (werknemerError) {
      if (werknemerError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Werknemer niet gevonden' })
      }
      throw werknemerError
    }

    const { data: werkgeverConfig, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('organisatie_omschrijving')
      .eq('werkgever_id', werknemer.employer_id)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.warn('Kon werkgever configuratie niet ophalen:', configError)
    }

    // 4️⃣ Bouw complete context voor GPT
    let completeContext = ''
    let themaOverzicht = ''

    gesprekken.forEach((gesprek, index) => {
      const thema = gesprek.themes
      const geschiedenis = gespreksgeschiedenis.find(g => g.gesprek_id === gesprek.id)
      
      themaOverzicht += `\n\n📋 THEMA ${index + 1}: ${thema.titel}`
      if (thema.beschrijving_werknemer) {
        themaOverzicht += `\nBeschrijving: ${thema.beschrijving_werknemer}`
      }
      
      if (geschiedenis && geschiedenis.gespreksgeschiedenis) {
        completeContext += `\n\n=== THEMA: ${thema.titel} ===\n`
        geschiedenis.gespreksgeschiedenis.forEach(item => {
          completeContext += `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}\n\n`
        })
      }
    })

    // 5️⃣ Bouw GPT prompt
    const prompt = `Je bent een HR-coach die de top 3 meest belangrijke vervolgacties bepaalt voor een werknemer op basis van alle gevoerde gesprekken.

WERKNEMER CONTEXT:
- Functie: ${werknemer.functie_omschrijving || 'Niet opgegeven'}
- Geslacht: ${werknemer.gender || 'Niet opgegeven'}
- Organisatie: ${werkgeverConfig?.organisatie_omschrijving || 'Niet opgegeven'}

PERIODE OVERZICHT:
${themaOverzicht}

COMPLETE GESPREKSGESCHIEDENIS:
${completeContext}

OPDRACHT:
Analyseer alle gesprekken en bepaal de TOP 3 vervolgacties die:
- Hebben de hoogste impact op jouw groei en ontwikkeling
- Hebben de meeste urgentie (wat moet je eerst aanpakken?)
- Zijn haalbaar voor jou om zelf uit te voeren
- Leggen verbanden tussen verschillende thema's waar mogelijk
- Zijn specifiek en praktisch (geen algemene adviezen)
- Schrijf altijd in de tweede persoon ("jij/je/jouw")
- Als de gesprekken positief en in balans zijn: formuleer acties die helpen om dit te behouden of verder te versterken (bijv. "Blijf…" of "Blijf ontwikkelen door…")

PRIORITEER op basis van:
- Urgentie – wat moet jij als eerste oppakken?
- Impact – welke actie heeft het grootste effect op jou?
- Haalbaarheid – wat kun jij realistisch doen?
- Verbanden – welke actie helpt bij meerdere thema's tegelijk?

BELANGRIJK: Antwoord ALLEEN in geldig JSON-formaat. Geen markdown code blocks, geen extra tekst voor of na de JSON.

Gebruik exact dit format:
{
  "actie_1": {
    "tekst": "Concrete, specifieke actie",
    "prioriteit": "hoog",
    "toelichting": "Waarom deze actie voor jou de hoogste prioriteit heeft"
  },
  "actie_2": {
    "tekst": "Concrete, specifieke actie", 
    "prioriteit": "medium",
    "toelichting": "Waarom deze actie voor jou de tweede prioriteit heeft"
  },
  "actie_3": {
    "tekst": "Concrete, specifieke actie",
    "prioriteit": "laag", 
    "toelichting": "Waarom deze actie voor jou de derde prioriteit heeft"
  },
  "algemene_toelichting": "Korte samenvatting van waarom deze 3 acties de beste keuzes zijn voor jou. Gebruik 'jij', 'jou' en 'je' in plaats van 'de werknemer'."
}

Zorg dat:
- Alle velden zijn aanwezig (actie_1, actie_2, actie_3, algemene_toelichting)
- Elk actie object heeft tekst, prioriteit en toelichting
- Prioriteit is altijd "hoog", "medium" of "laag"
- Geen speciale karakters die JSON parsing kunnen verstoren
- Geen markdown formatting`

    // 6️⃣ Stuur naar OpenAI Direct
    console.log('🤖 Stuur prompt naar OpenAI Direct...')
    const completion = await openaiClient.createCompletion({
      model: 'gpt-5', // Gebruik GPT-5 (nieuwste model)
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5, // Betere balans dan 0.3 voor coachende adviezen
      top_p: 0.9,
      max_completion_tokens: 1050, // 900-1200 range, 3 acties + uitgebreide toelichting
      frequency_penalty: 0.25, // 0.2-0.3 range
      presence_penalty: 0.4, // 0.3-0.5 range, stimuleert dat elke actie echt iets anders raakt
      response_format: { type: 'json_object' }, // Garandeert geldige JSON
      stream: false
    })

    if (!completion.success) {
      throw new Error(`OpenAI Direct fout: ${completion.error}`)
    }

    const gptResponse = completion.data.choices[0].message.content
    console.log('🤖 Raw GPT response:', gptResponse)
    
    // Verbeterde response cleaning
    let cleanResponse = gptResponse.trim()
    
    // Verwijder verschillende markdown code block formaten
    if (cleanResponse.includes('```json')) {
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    } else if (cleanResponse.includes('```')) {
      cleanResponse = cleanResponse.replace(/```\n?/g, '').trim()
    }
    
    // Verwijder eventuele extra tekst voor/na JSON
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      cleanResponse = jsonMatch[0]
    }
    
    console.log('🧹 Cleaned response:', cleanResponse)
    
    let parsed
    try {
      parsed = JSON.parse(cleanResponse)
      
      // Valideer dat alle vereiste velden aanwezig zijn
      if (!parsed.actie_1 || !parsed.actie_2 || !parsed.actie_3) {
        throw new Error('Ontbrekende acties in response')
      }
      
      if (!parsed.actie_1.tekst || !parsed.actie_2.tekst || !parsed.actie_3.tekst) {
        throw new Error('Ontbrekende actie teksten in response')
      }
      
      console.log('✅ GPT response succesvol geparsed')
      
    } catch (parseError) {
      console.error('❌ Fout bij parsen van GPT-respons:', parseError)
      console.error('Raw response:', gptResponse)
      console.error('Cleaned response:', cleanResponse)
      
      // Fallback: genereer een basis response als parsing mislukt
      console.log('🔄 Gebruik fallback response...')
      parsed = {
        actie_1: {
          tekst: "Bespreek je ontwikkelpunten met je leidinggevende",
          prioriteit: "hoog",
          toelichting: "Op basis van je gesprekken is het belangrijk om regelmatig feedback te vragen"
        },
        actie_2: {
          tekst: "Stel concrete doelen op voor de komende periode",
          prioriteit: "medium", 
          toelichting: "Duidelijke doelen helpen je om gericht te werken aan je ontwikkeling"
        },
        actie_3: {
          tekst: "Zoek naar leermogelijkheden binnen je rol",
          prioriteit: "laag",
          toelichting: "Blijf jezelf ontwikkelen door nieuwe uitdagingen aan te gaan"
        },
        algemene_toelichting: "Deze acties zijn gebaseerd op je gesprekken en helpen je om je verder te ontwikkelen."
      }
    }

    // 7️⃣ Sla op in database
    const topActiesData = {
      werknemer_id,
      werkgever_id: werknemer.employer_id,
      periode,
      actie_1: parsed.actie_1.tekst,
      actie_2: parsed.actie_2.tekst,
      actie_3: parsed.actie_3.tekst,
      prioriteit_1: parsed.actie_1.prioriteit,
      prioriteit_2: parsed.actie_2.prioriteit,
      prioriteit_3: parsed.actie_3.prioriteit,
      toelichting_per_actie: [
        parsed.actie_1.toelichting,
        parsed.actie_2.toelichting,
        parsed.actie_3.toelichting
      ],
      algemene_toelichting: parsed.algemene_toelichting,
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
      // Geen bestaande rij, dus insert
      const { error: insertError } = await supabase
        .from('top_vervolgacties')
        .insert(topActiesData)
      
      if (insertError) {
        console.error('Fout bij invoegen top vervolgacties:', insertError)
        throw insertError
      }
    }

    console.log('✅ Top 3 vervolgacties succesvol gegenereerd en opgeslagen')

    // 8️⃣ Return resultaat
    return res.json({
      success: true,
      top_acties: {
        actie_1: {
          tekst: parsed.actie_1.tekst,
          prioriteit: parsed.actie_1.prioriteit,
          toelichting: parsed.actie_1.toelichting
        },
        actie_2: {
          tekst: parsed.actie_2.tekst,
          prioriteit: parsed.actie_2.prioriteit,
          toelichting: parsed.actie_2.toelichting
        },
        actie_3: {
          tekst: parsed.actie_3.tekst,
          prioriteit: parsed.actie_3.prioriteit,
          toelichting: parsed.actie_3.toelichting
        }
      },
      algemene_toelichting: parsed.algemene_toelichting,
      periode,
      gegenereerd_op: new Date().toISOString()
    })

  } catch (err) {
    console.error('❌ Fout bij genereren top 3 acties:', err)
    return res.status(500).json({ 
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

module.exports = router
