const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// POST /api/generate-organisation-summary
// Genereert een nieuwe organisatie samenvatting en adviezen
router.post('/', async (req, res) => {
  const { organisatie_id, theme_id } = req.body

  if (!organisatie_id || !theme_id) {
    return res.status(400).json({ error: 'Organisatie ID en Thema ID zijn verplicht' })
  }

  try {
    // 1. Controleer of er minimaal 4 medewerkers het thema hebben afgerond
    const { data: results, error: resultsError } = await supabase
      .from('gesprekresultaten')
      .select('score, werknemer_id')
      .eq('werkgever_id', organisatie_id)
      .eq('theme_id', theme_id)

    if (resultsError) throw resultsError

    if (!results || results.length < 4) {
      return res.status(400).json({ 
        error: 'Minimaal 4 medewerkers moeten het thema hebben afgerond voordat een samenvatting kan worden gegenereerd' 
      })
    }

    // 2. Haal alle complete gesprekken op voor dit thema en deze organisatie
    const { data: employees, error: employeesError } = await supabase
      .from('users')
      .select('id')
      .eq('employer_id', organisatie_id)
      .eq('role', 'employee')

    if (employeesError) throw employeesError

    const employeeIds = employees?.map(emp => emp.id) || []

    // Haal alle complete gesprekken op
    const { data: conversations, error: conversationsError } = await supabase
      .from('gesprekken_compleet')
      .select('gespreksgeschiedenis, metadata, werknemer_id')
      .eq('theme_id', theme_id)
      .in('werknemer_id', employeeIds)

    if (conversationsError) throw conversationsError

    if (!conversations || conversations.length === 0) {
      return res.status(404).json({ error: 'Geen gesprekken gevonden' })
    }

    // 3. Haal thema informatie op
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('*')
      .eq('id', theme_id)
      .single()

    if (themeError) throw themeError

    // 4. Bouw prompt met alle gesprekken
    const allConversations = conversations.map(conv => {
      const conversationText = conv.gespreksgeschiedenis
        .map(item => `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}`)
        .join('\n\n')
      return `=== Gesprek Medewerker ===\n${conversationText}\n`
    }).join('\n')

    const prompt = `Je bent een HR-expert die organisatie-brede inzichten analyseert.

Thema: ${theme.titel}
Beschrijving: ${theme.beschrijving_werknemer}

Hieronder vind je alle gesprekken van medewerkers over dit thema:

${allConversations}

Analyseer deze gesprekken en geef:

1. Een samenvatting van de belangrijkste bevindingen (maximaal 8 zinnen)
2. Concrete verbeteradviezen voor de organisatie (3-5 adviezen)
3. Signaalwoorden die opvallen in de gesprekken

Antwoord in JSON-formaat:
{
  "samenvatting": "...",
  "verbeteradvies": "...",
  "signaalwoorden": ["woord1", "woord2", "woord3"],
  "gpt_adviezen": {
    "prioriteit_1": "Eerste prioriteit advies",
    "prioriteit_2": "Tweede prioriteit advies", 
    "prioriteit_3": "Derde prioriteit advies"
  }
}`

    // 5. Stuur naar GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })

    const gptResponse = completion.choices[0].message.content
    const parsed = JSON.parse(gptResponse)

    // 6. Bereken gemiddelde score
    const scores = results.map(r => r.score).filter(score => score !== null)
    const averageScore = scores.length > 0 ? 
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null

    // 7. Sla op in database
    const insightData = {
      organisatie_id,
      theme_id,
      samenvatting: parsed.samenvatting,
      verbeteradvies: parsed.verbeteradvies,
      signaalwoorden: parsed.signaalwoorden,
      gpt_adviezen: parsed.gpt_adviezen,
      aantal_gesprekken: conversations.length,
      gemiddelde_score: averageScore,
      totaal_medewerkers: employees.length,
      voltooide_medewerkers: results.length,
      samenvatting_status: 'handmatig',
      laatst_bijgewerkt_op: new Date().toISOString()
    }

    // Update of insert
    const { data: existingInsight, error: existingError } = await supabase
      .from('organization_theme_insights')
      .select('id')
      .eq('organisatie_id', organisatie_id)
      .eq('theme_id', theme_id)
      .single()

    if (existingError && existingError.code !== 'PGRST116') {
      throw existingError
    }

    if (existingInsight) {
      // Update bestaande
      const { error: updateError } = await supabase
        .from('organization_theme_insights')
        .update(insightData)
        .eq('id', existingInsight.id)

      if (updateError) throw updateError
    } else {
      // Insert nieuwe
      const { error: insertError } = await supabase
        .from('organization_theme_insights')
        .insert(insightData)

      if (insertError) throw insertError
    }

    res.json({
      success: true,
      samenvatting: parsed.samenvatting,
      verbeteradvies: parsed.verbeteradvies,
      gpt_adviezen: parsed.gpt_adviezen,
      signaalwoorden: parsed.signaalwoorden,
      gemiddelde_score: averageScore,
      aantal_gesprekken: conversations.length
    })

  } catch (err) {
    console.error('Fout bij genereren organisatie samenvatting:', err)
    res.status(500).json({ error: 'Fout bij genereren organisatie samenvatting' })
  }
})

module.exports = router 