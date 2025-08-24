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
  const { maand } = req.query // Nieuwe query parameter voor maand filtering

  if (!orgId) {
    return res.status(400).json({ error: 'Organisatie ID is verplicht' })
  }

  try {
    console.log('🔍 Start ophalen organisatie thema\'s voor:', { orgId, maand })

    // 1. Haal alle actieve thema's op
    const { data: themeData, error: themeError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving_werknemer, beschrijving_werkgever, geeft_score, geeft_samenvatting')
      .eq('klaar_voor_gebruik', true)
      .eq('standaard_zichtbaar', true)
      .order('volgorde_index', { ascending: true })

    if (themeError) throw themeError
    console.log('✅ Thema\'s opgehaald:', themeData?.length || 0)

    // 2. Haal alle werknemers van deze organisatie op
    const { data: employees, error: employeesError } = await supabase
      .from('users')
      .select('id')
      .eq('employer_id', orgId)
      .eq('role', 'employee')

    if (employeesError) throw employeesError
    console.log('✅ Werknemers opgehaald:', employees?.length || 0)

    // 3. Haal bestaande organisatie insights op
    const { data: existingInsights, error: insightsError } = await supabase
      .from('organization_theme_insights')
      .select('*')
      .eq('organisatie_id', orgId)

    if (insightsError) throw insightsError
    console.log('✅ Insights opgehaald:', existingInsights?.length || 0)

    // 4. Voor elk thema, bereken voortgang en scores
    const themesWithProgress = await Promise.all(themeData.map(async (theme) => {
      // Zoek bestaande insight voor dit thema
      const existingInsight = existingInsights?.find(insight => insight.theme_id === theme.id)

      const totalEmployees = employees?.length || 0
      const completedEmployees = existingInsight?.voltooide_medewerkers || 0
      const averageScore = existingInsight?.gemiddelde_score || null

      // Haal individuele scores op uit gesprekresultaten
      let individualScores = []
      let scoreStandardDeviation = null
      let filteredCompletedEmployees = 0
      
      if (completedEmployees > 0) {
        // Basis query voor scores
        let scoreQuery = supabase
          .from('gesprekresultaten')
          .select('score, periode, gegenereerd_op')
          .eq('werkgever_id', orgId)
          .eq('theme_id', theme.id)
          .not('score', 'is', null)

        // Filter op basis van geselecteerde maand
        if (maand) {
          const monthInt = parseInt(maand)
          const year = new Date().getFullYear()
          const monthStart = new Date(year, monthInt - 1, 1)
          const monthEnd = new Date(year, monthInt, 0, 23, 59, 59)
          
          // Filter op gegenereerd_op binnen de geselecteerde maand
          scoreQuery = scoreQuery
            .gte('gegenereerd_op', monthStart.toISOString())
            .lte('gegenereerd_op', monthEnd.toISOString())
        }

        const { data: scoreData, error: scoreError } = await scoreQuery

        if (!scoreError && scoreData && scoreData.length > 0) {
          individualScores = scoreData.map(item => item.score).sort((a, b) => b - a) // Sorteer van hoog naar laag
          filteredCompletedEmployees = scoreData.length
          
          // Bereken standaarddeviatie voor alert indicator
          if (individualScores.length > 1) {
            const mean = individualScores.reduce((sum, score) => sum + score, 0) / individualScores.length
            const variance = individualScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / individualScores.length
            scoreStandardDeviation = Math.sqrt(variance)
          }
        }
      }

      // Bepaal samenvatting status
      let samenvattingStatus = 'niet_beschikbaar'
      if (filteredCompletedEmployees >= 4) {
        samenvattingStatus = 'beschikbaar'
      }
      if (filteredCompletedEmployees === totalEmployees && totalEmployees > 0) {
        samenvattingStatus = 'volledig'
      }

      // Bepaal uiteindelijke status: als er al een samenvatting bestaat, gebruik die status
      // anders gebruik de berekende status
      const finalStatus = existingInsight?.samenvatting_status || samenvattingStatus

      return {
        theme_id: theme.id,
        titel: theme.titel,
        beschrijving_werknemer: theme.beschrijving_werknemer,
        beschrijving_werkgever: theme.beschrijving_werkgever,
        geeft_score: theme.geeft_score,
        geeft_samenvatting: theme.geeft_samenvatting,
        totaal_medewerkers: totalEmployees,
        voltooide_medewerkers: maand ? filteredCompletedEmployees : completedEmployees, // Gebruik gefilterde telling bij maand selectie
        totaal_mogelijke_gesprekken: themeData.length * totalEmployees, // Consistent met totale berekening
        gemiddelde_score: averageScore,
        samenvatting_status: finalStatus,
        heeft_samenvatting: !!existingInsight?.samenvatting,
        heeft_adviezen: !!existingInsight?.gpt_adviezen,
        laatst_bijgewerkt: existingInsight?.laatst_bijgewerkt_op,
        individuele_scores: individualScores,
        score_standaarddeviatie: scoreStandardDeviation,
        heeft_grote_score_verschillen: scoreStandardDeviation && scoreStandardDeviation > 2.0,
        gefilterde_maand: maand ? parseInt(maand) : null
      }
    }))

    // Bereken totale voortgang van de organisatie
    const totalEmployees = employees?.length || 0
    const totaalMogelijkeGesprekken = themeData.length * totalEmployees
    const totaalVoltooideGesprekken = themesWithProgress.reduce((sum, theme) => sum + theme.voltooide_medewerkers, 0)
    const totaleVoortgangPercentage = totaalMogelijkeGesprekken > 0 ? 
      Math.round((totaalVoltooideGesprekken / totaalMogelijkeGesprekken) * 100) : 0

    res.json({
      organisatie_id: orgId,
      totaal_medewerkers: totalEmployees,
      totale_voortgang_percentage: totaleVoortgangPercentage,
      voltooide_gesprekken: totaalVoltooideGesprekken,
      totaal_mogelijke_gesprekken: totaalMogelijkeGesprekken,
      thema_s: themesWithProgress
    })

  } catch (err) {
    console.error('Fout bij ophalen organisatie thema\'s:', err)
    res.status(500).json({ error: 'Fout bij ophalen organisatie thema\'s' })
  }
})

module.exports = router 