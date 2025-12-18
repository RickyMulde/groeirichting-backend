const express = require('express')
const { createClient } = require('@supabase/supabase-js')
// 🔄 MIGRATIE: Nu met Responses API voor GPT-5.2
const openaiClient = require('./utils/openaiClient')
const { authMiddleware, assertTeamInOrg } = require('./middleware/auth')
const { hasThemeAccess } = require('./utils/themeAccessService')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// POST /api/generate-organisation-summary
// Genereert een nieuwe organisatie samenvatting en adviezen (team-specifiek of organisatie-breed)
router.post('/', async (req, res) => {
  const { organisatie_id, theme_id, team_id } = req.body
  const { employerId, isTeamleider, teamleiderVanTeamId, role } = req.ctx

  // Valideer dat organisatie_id overeenkomt met employerId uit context
  if (organisatie_id !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' })
  }

  if (!organisatie_id || !theme_id) {
    return res.status(400).json({ error: 'Organisatie ID en Thema ID zijn verplicht' })
  }

  // Voor teamleiders: gebruik automatisch hun team
  let effectiveTeamId = team_id
  if (isTeamleider) {
    effectiveTeamId = teamleiderVanTeamId
    if (!effectiveTeamId) {
      return res.status(400).json({ error: 'Geen team gekoppeld aan deze teamleider' })
    }
    console.log('🔍 Teamleider toegang - automatisch team filter:', effectiveTeamId)
  } else if (role === 'employer') {
    // Werkgevers: valideer team_id als opgegeven
    if (team_id) {
      await assertTeamInOrg(team_id, employerId)
    }
    effectiveTeamId = team_id
  } else {
    return res.status(403).json({ error: 'Alleen werkgevers en teamleiders hebben toegang tot deze endpoint' })
  }

  // ✅ VALIDATIE: Check toegang tot thema
  const hasAccess = await hasThemeAccess(employerId, theme_id, effectiveTeamId || null)
  if (!hasAccess) {
    return res.status(403).json({ 
      error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
    })
  }

  try {
    // 1. Haal werknemers op (team-specifiek of organisatie-breed)
    let employeesQuery = supabase
      .from('users')
      .select('id')
      .eq('employer_id', employerId)  // Gebruik employerId uit context
      .eq('role', 'employee')

    // Filter op team_id als opgegeven
    if (effectiveTeamId) {
      employeesQuery = employeesQuery.eq('team_id', effectiveTeamId)
    }

    const { data: employees, error: employeesError } = await employeesQuery

    if (employeesError) throw employeesError

    if (!employees || employees.length < 4) {
      return res.status(400).json({ 
        error: 'Minimaal 4 medewerkers moeten het thema hebben afgerond voordat een samenvatting kan worden gegenereerd' 
      })
    }

    // 2. Haal gesprekresultaten op voor deze werknemers
    const employeeIds = employees.map(emp => emp.id)
    const { data: results, error: resultsError } = await supabase
      .from('gesprekresultaten')
      .select('score, werknemer_id')
      .eq('werkgever_id', employerId)  // Gebruik employerId uit context
      .eq('theme_id', theme_id)
      .in('werknemer_id', employeeIds)

    if (resultsError) throw resultsError

    if (!results || results.length < 4) {
      return res.status(400).json({ 
        error: 'Minimaal 4 medewerkers moeten het thema hebben afgerond voordat een samenvatting kan worden gegenereerd' 
      })
    }

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

    // 3b. Haal werkgever configuratie op voor organisatie-omschrijving
    const { data: werkgeverConfig, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('organisatie_omschrijving')
      .eq('werkgever_id', employerId)  // Gebruik employerId uit context
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.warn('Kon werkgever configuratie niet ophalen:', configError)
    }

    // 4. Haal team informatie op als team_id is opgegeven
    let teamInfo = null
    if (effectiveTeamId) {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('naam, teams_beschrijving')
        .eq('id', effectiveTeamId)
        .eq('werkgever_id', employerId)
        .single()
      
      if (!teamError && team) {
        teamInfo = team
      }
    }

    // 5. Bouw prompt met alle gesprekken
    const allConversations = conversations.map(conv => {
      const conversationText = conv.gespreksgeschiedenis
        .map(item => `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}`)
        .join('\n\n')
      return `=== Gesprek Medewerker ===\n${conversationText}\n`
    }).join('\n')

    const teamContext = teamInfo ? 
      `\n\nTeam context: ${teamInfo.naam}${teamInfo.teams_beschrijving ? ` - ${teamInfo.teams_beschrijving}` : ''}\nAantal teamleden: ${employees.length}` : 
      `\n\nOrganisatie context: ${employees.length} medewerkers`

    // System instructions
    const systemInstructions = `Je bent een HR-expert die ${teamInfo ? 'team-specifieke' : 'organisatie-brede'} inzichten analyseert. Antwoord ALLEEN in JSON-formaat.`

    // User input
    const userInput = `Thema: ${theme.titel}
Beschrijving: ${theme.beschrijving_werknemer}${werkgeverConfig?.organisatie_omschrijving ? `\n\nOrganisatie context: ${werkgeverConfig.organisatie_omschrijving}` : ''}${teamContext}

Hieronder vind je alle gesprekken van ${teamInfo ? 'teamleden' : 'medewerkers'} over dit thema:

${allConversations}

Analyseer deze gesprekken en geef:

1. Een samenvatting van de belangrijkste bevindingen (maximaal 8 zinnen)
2. Concrete verbeteradviezen voor de organisatie (3-5 adviezen)
3. Signaalwoorden die opvallen in de gesprekken

⚠️ BELANGRIJK - Veralgemeniseren in samenvatting:
- Maak de samenvatting concreet maar enigszins veralgemeend/anoniem
- Vermijd specifieke verwijzingen naar individuele medewerkers of functies
- Gebruik algemene termen in plaats van specifieke voorbeelden

Voorbeelden van veralgemeniseren:
❌ In plaats van: "Planner geeft aan dat er te weinig mensen zijn"
✅ Zeg: "Er zijn signalen dat personeelstekort invloed heeft op de planning."

❌ In plaats van: "Manager klaagt over gebrek aan communicatie"
✅ Zeg: "Communicatie tussen verschillende lagen in de organisatie kan verbeterd worden."

Antwoord in JSON-formaat met velden: "samenvatting" (string), "verbeteradvies" (string), "signaalwoorden" (array van strings), "gpt_adviezen" (object met prioriteit_1, prioriteit_2, prioriteit_3).`

    // 5. Stuur naar OpenAI Responses API (GPT-5.2)
    const response = await openaiClient.createResponse({
      model: 'gpt-5.2', // GPT-5.2 voor organisatie samenvatting
      instructions: systemInstructions,
      input: [{ role: 'user', content: userInput }],
      max_output_tokens: 4000,
      service_tier: 'default',
      text: {
        format: {
          type: 'json_schema',
          name: 'organisation_summary_output',
          schema: {
            type: 'object',
            properties: {
              samenvatting: { type: 'string' },
              verbeteradvies: { type: 'string' },
              signaalwoorden: {
                type: 'array',
                items: { type: 'string' }
              },
              gpt_adviezen: {
                type: 'object',
                properties: {
                  prioriteit_1: { type: 'string' },
                  prioriteit_2: { type: 'string' },
                  prioriteit_3: { type: 'string' }
                },
                required: ['prioriteit_1', 'prioriteit_2', 'prioriteit_3'],
                additionalProperties: false
              }
            },
            required: ['samenvatting', 'verbeteradvies', 'signaalwoorden', 'gpt_adviezen'],
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
    const parsed = JSON.parse(gptResponse)

    // 6. Bereken gemiddelde score
    const scores = results.map(r => r.score).filter(score => score !== null)
    const averageScore = scores.length > 0 ? 
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null

    // 7. Sla op in database
    const insightData = {
      organisatie_id,
      theme_id,
      team_id: effectiveTeamId || null, // team_id voor team-specifieke insights
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
    let existingQuery = supabase
      .from('organization_theme_insights')
      .select('id')
      .eq('organisatie_id', organisatie_id)
      .eq('theme_id', theme_id)

    // Filter op team_id als opgegeven, anders organisatie-breed (team_id IS NULL)
    if (effectiveTeamId) {
      existingQuery = existingQuery.eq('team_id', effectiveTeamId)
    } else {
      existingQuery = existingQuery.is('team_id', null)
    }

    const { data: existingInsight, error: existingError } = await existingQuery.single()

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
      team_context: teamInfo ? {
        team_id: effectiveTeamId,
        team_naam: teamInfo.naam,
        team_beschrijving: teamInfo.teams_beschrijving
      } : null,
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
