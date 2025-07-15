const express = require('express')
const { createClient } = require('@supabase/supabase-js')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// GET /api/organisation-themes/:orgId
// Haalt alle thema's op met voortgang, scores en samenvattingen voor een organisatie
router.get('/:orgId', async (req, res) => {
  const { orgId } = req.params

  if (!orgId) {
    return res.status(400).json({ error: 'Organisatie ID is verplicht' })
  }

  try {
    // 1. Haal alle actieve thema's op
    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving, geeft_score, geeft_samenvatting')
      .eq('klaar_voor_gebruik', true)
      .eq('standaard_zichtbaar', true)
      .order('volgorde_index', { ascending: true })

    if (themesError) throw themesError

    // 2. Haal alle werknemers van deze organisatie op
    const { data: employees, error: employeesError } = await supabase
      .from('users')
      .select('id')
      .eq('employer_id', orgId)
      .eq('role', 'employee')

    if (employeesError) throw employeesError

    const totalEmployees = employees?.length || 0

    // 3. Haal bestaande organisatie insights op
    const { data: existingInsights, error: insightsError } = await supabase
      .from('organization_theme_insights')
      .select('*')
      .eq('organisatie_id', orgId)

    if (insightsError) throw insightsError

    // 4. Voor elk thema, bereken voortgang en scores
    const themesWithProgress = await Promise.all(themes.map(async (theme) => {
      // Haal alle gesprekresultaten op voor dit thema en deze organisatie
      const { data: results, error: resultsError } = await supabase
        .from('gesprekresultaten')
        .select('score, werknemer_id')
        .eq('werkgever_id', orgId)
        .eq('theme_id', theme.id)

      if (resultsError) throw resultsError

      const completedEmployees = results?.length || 0
      const scores = results?.map(r => r.score).filter(score => score !== null) || []
      const averageScore = scores.length > 0 ? 
        Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null

      // Bepaal samenvatting status
      let samenvattingStatus = 'niet_beschikbaar'
      if (completedEmployees >= 4) {
        samenvattingStatus = 'beschikbaar'
      }
      if (completedEmployees === totalEmployees && totalEmployees > 0) {
        samenvattingStatus = 'volledig'
      }

      // Zoek bestaande insight
      const existingInsight = existingInsights?.find(insight => insight.theme_id === theme.id)

      // Bepaal uiteindelijke status: als er al een samenvatting bestaat, gebruik die status
      // anders gebruik de berekende status
      const finalStatus = existingInsight?.samenvatting_status || samenvattingStatus

      return {
        theme_id: theme.id,
        titel: theme.titel,
        beschrijving: theme.beschrijving,
        geeft_score: theme.geeft_score,
        geeft_samenvatting: theme.geeft_samenvatting,
        totaal_medewerkers: totalEmployees,
        voltooide_medewerkers: completedEmployees,
        gemiddelde_score: averageScore,
        samenvatting_status: finalStatus,
        heeft_samenvatting: !!existingInsight?.samenvatting,
        heeft_adviezen: !!existingInsight?.gpt_adviezen,
        laatst_bijgewerkt: existingInsight?.laatst_bijgewerkt_op,
        individuele_scores: completedEmployees >= 4 ? scores.sort((a, b) => b - a) : null
      }
    }))

    res.json({
      organisatie_id: orgId,
      totaal_medewerkers: totalEmployees,
      thema_s: themesWithProgress
    })

  } catch (err) {
    console.error('Fout bij ophalen organisatie thema\'s:', err)
    res.status(500).json({ error: 'Fout bij ophalen organisatie thema\'s' })
  }
})

module.exports = router 