const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const { authMiddleware, assertTeamInOrg } = require('./middleware/auth')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// GET /api/organisation-themes/:orgId/available-periods
// Haalt beschikbare jaar/maand combinaties op voor een organisatie
router.get('/:orgId/available-periods', async (req, res) => {
  const { orgId } = req.params
  const employerId = req.ctx.employerId

  if (!orgId) {
    return res.status(400).json({ error: 'Organisatie ID is verplicht' })
  }

  // Valideer dat orgId overeenkomt met employerId uit context
  if (orgId !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' })
  }

  try {
    console.log('🔍 Start ophalen beschikbare periodes voor:', { orgId })

    // Haal alle werknemers van deze organisatie op
    const { data: employees, error: employeesError } = await supabase
      .from('users')
      .select('id')
      .eq('employer_id', employerId)  // Gebruik employerId uit context
      .eq('role', 'employee')

    if (employeesError) throw employeesError

    // Extraheer unieke jaar/maand combinaties uit gesprekken
    const periods = new Set()
    
    if (employees && employees.length > 0) {
      const employeeIds = employees.map(emp => emp.id)
      
      // Haal gesprekken op van alle werknemers
      const { data: gesprekken, error: gesprekkenError } = await supabase
        .from('gesprek')
        .select('gestart_op')
        .in('werknemer_id', employeeIds)
        .eq('status', 'Afgerond')
        .not('gestart_op', 'is', null)

      if (gesprekkenError) throw gesprekkenError

      if (gesprekken && gesprekken.length > 0) {
        gesprekken.forEach(gesprek => {
          if (gesprek.gestart_op) {
            const date = new Date(gesprek.gestart_op)
            const year = date.getFullYear()
            const month = date.getMonth() + 1 // getMonth() is 0-based
            
            // Voeg toe als "YYYY-MM" string voor unieke identificatie
            periods.add(`${year}-${month.toString().padStart(2, '0')}`)
          }
        })
        
        console.log(`✅ ${periods.size} periodes gevonden uit gesprekken`)
      }
    }

    // Converteer naar array en sorteer op datum (nieuwste eerst)
    const availablePeriods = Array.from(periods)
      .sort((a, b) => b.localeCompare(a)) // Sorteer aflopend (nieuwste eerst)
      .map(period => {
        const [year, month] = period.split('-')
        const monthInt = parseInt(month)
        
        // Nederlandse maandnamen
        const monthNames = [
          'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
          'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
        ]
        
        return {
          jaar: parseInt(year),
          maand: monthInt,
          label: `${monthNames[monthInt - 1]} ${year}`,
          periode: period
        }
      })

    console.log('✅ Beschikbare periodes opgehaald:', availablePeriods.length)
    res.json({ beschikbare_periodes: availablePeriods })

  } catch (err) {
    console.error('Fout bij ophalen beschikbare periodes:', err)
    res.status(500).json({ error: 'Fout bij ophalen beschikbare periodes' })
  }
})

// GET /api/organisation-themes/:orgId
// Haalt alle thema's op met voortgang, scores en samenvattingen voor een organisatie
router.get('/:orgId', async (req, res) => {
  const { orgId } = req.params
  const { maand, jaar, team_id } = req.query // Nieuwe query parameters voor maand, jaar en team filtering

  if (!orgId) {
    return res.status(400).json({ error: 'Organisatie ID is verplicht' })
  }

  // Periode (maand en jaar) is verplicht - geen gegevens zonder periode selectie
  if (!maand || !jaar) {
    return res.status(400).json({ error: 'Maand en jaar zijn verplicht. Selecteer een periode om de resultaten te bekijken.' })
  }

  try {
    console.log('🔍 Start ophalen organisatie thema\'s voor:', { orgId, maand, jaar, team_id })

    // Valideer team_id als opgegeven
    if (team_id) {
      await assertTeamInOrg(team_id, orgId)
    }

    // 1. Haal alle actieve thema's op
    const { data: themeData, error: themeError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving_werknemer, beschrijving_werkgever, geeft_score, geeft_samenvatting')
      .eq('klaar_voor_gebruik', true)
      .eq('standaard_zichtbaar', true)
      .order('volgorde_index', { ascending: true })

    if (themeError) throw themeError
    console.log('✅ Thema\'s opgehaald:', themeData?.length || 0)

    // 2. Haal werknemers van deze organisatie op (met team filtering)
    let employeeQuery = supabase
      .from('users')
      .select('id, team_id')
      .eq('employer_id', orgId)
      .eq('role', 'employee')

    // Voeg team filtering toe als team_id is opgegeven
    if (team_id) {
      employeeQuery = employeeQuery.eq('team_id', team_id)
    }

    const { data: employees, error: employeesError } = await employeeQuery

    if (employeesError) throw employeesError
    console.log('✅ Werknemers opgehaald:', employees?.length || 0)

    // 3. Haal bestaande organisatie insights op (team-specifiek of organisatie-breed)
    let insightsQuery = supabase
      .from('organization_theme_insights')
      .select('*')
      .eq('organisatie_id', orgId)

    // Filter op team_id als opgegeven, anders organisatie-breed (team_id IS NULL)
    if (team_id) {
      insightsQuery = insightsQuery.eq('team_id', team_id)
    } else {
      insightsQuery = insightsQuery.is('team_id', null)
    }

    const { data: existingInsights, error: insightsError } = await insightsQuery

    if (insightsError) throw insightsError
    console.log('✅ Insights opgehaald:', existingInsights?.length || 0)

    // 4. Voor elk thema, bereken voortgang en scores
    const themesWithProgress = await Promise.all(themeData.map(async (theme) => {
      // Zoek bestaande insight voor dit thema
      const existingInsight = existingInsights?.find(insight => insight.theme_id === theme.id)

      const totalEmployees = employees?.length || 0
      let completedEmployees = 0
      const averageScore = existingInsight?.gemiddelde_score || null

      // Bereken completedEmployees altijd op basis van gefilterde werknemers
      const employeeIds = employees?.map(emp => emp.id) || []
      if (employeeIds.length > 0) {
        const { data: gesprekken, error: gesprekkenError } = await supabase
          .from('gesprek')
          .select('werknemer_id')
          .in('werknemer_id', employeeIds)
          .eq('theme_id', theme.id)
          .eq('status', 'Afgerond')

        if (!gesprekkenError && gesprekken) {
          // Tel unieke werknemers die dit thema hebben afgerond
          const uniekeWerknemers = new Set(gesprekken.map(g => g.werknemer_id))
          completedEmployees = uniekeWerknemers.size
        }
      }

      // Haal individuele scores op uit gesprekresultaten
      let individualScores = []
      let scoreStandardDeviation = null
      let filteredCompletedEmployees = 0
      
      if (completedEmployees > 0) {
        // Basis query voor scores (team-specifiek)
        let scoreQuery = supabase
          .from('gesprekresultaten')
          .select('score, periode, gegenereerd_op, werknemer_id')
          .eq('werkgever_id', orgId)
          .eq('theme_id', theme.id)
          .in('werknemer_id', employeeIds) // Filter op team werknemers
          .not('score', 'is', null)

        // Filter op basis van geselecteerde maand en jaar
        if (maand && jaar) {
          const monthInt = parseInt(maand)
          const yearInt = parseInt(jaar)
          const monthStart = new Date(yearInt, monthInt - 1, 1)
          const monthEnd = new Date(yearInt, monthInt, 0, 23, 59, 59)
          
          // Filter op gegenereerd_op binnen de geselecteerde periode
          scoreQuery = scoreQuery
            .gte('gegenereerd_op', monthStart.toISOString())
            .lte('gegenereerd_op', monthEnd.toISOString())
        } else if (maand) {
          // Fallback: alleen maand (voor backward compatibility)
          const monthInt = parseInt(maand)
          const year = new Date().getFullYear()
          const monthStart = new Date(year, monthInt - 1, 1)
          const monthEnd = new Date(year, monthInt, 0, 23, 59, 59)
          
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

      // Als alle werknemers het thema hebben afgerond en er is nog geen samenvatting, genereer er een
      if (filteredCompletedEmployees === totalEmployees && totalEmployees > 0 && !existingInsight) {
        console.log(`🚀 Alle werknemers hebben thema ${theme.titel} afgerond, genereer automatisch samenvatting...`)
        
        try {
          // Genereer samenvatting via bestaande endpoint
          // Gebruik de werkgever's JWT token uit de originele request
          const authHeader = req.headers.authorization
          const generateResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/generate-organisation-summary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authHeader // Gebruik de werkgever's JWT token
            },
            body: JSON.stringify({
              organisatie_id: orgId,
              theme_id: theme.id,
              team_id: team_id || null // team_id voor team-specifieke insights
            })
          })
          
          if (generateResponse.ok) {
            console.log(`✅ Samenvatting gegenereerd voor thema ${theme.titel}`)
            samenvattingStatus = 'volledig'
          } else {
            console.error(`❌ Fout bij genereren samenvatting voor thema ${theme.titel}:`, generateResponse.status)
          }
        } catch (error) {
          console.error(`❌ Fout bij genereren samenvatting voor thema ${theme.titel}:`, error)
        }
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
        gefilterde_maand: maand ? parseInt(maand) : null,
        gefilterde_jaar: jaar ? parseInt(jaar) : null,
        geselecteerde_periode: maand && jaar ? `${jaar}-${maand.toString().padStart(2, '0')}` : null
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