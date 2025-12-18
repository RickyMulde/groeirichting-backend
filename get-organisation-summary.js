const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const { authMiddleware, assertTeamInOrg } = require('./middleware/auth')
const { hasThemeAccess } = require('./utils/themeAccessService')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// GET /api/organisation-summary/:orgId/:themeId
// Haalt samenvatting en adviezen op voor een specifiek thema van een organisatie
// Optioneel: team_id voor team-specifieke filtering
router.get('/:orgId/:themeId', async (req, res) => {
  const { orgId, themeId } = req.params
  const { team_id } = req.query
  const { employerId, isTeamleider, teamleiderVanTeamId, role } = req.ctx

  if (!orgId || !themeId) {
    return res.status(400).json({ error: 'Organisatie ID en Thema ID zijn verplicht' })
  }

  // Valideer dat orgId overeenkomt met employerId uit context
  if (orgId !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' })
  }

  try {
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
    const hasAccess = await hasThemeAccess(employerId, themeId, effectiveTeamId || null)
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
      })
    }

    // Haal de organisatie insight op (team-specifiek of organisatie-breed)
    let insightQuery = supabase
      .from('organization_theme_insights')
      .select('*')
      .eq('organisatie_id', employerId)  // Gebruik employerId uit context
      .eq('theme_id', themeId)

    // Filter op team_id als opgegeven, anders organisatie-breed (team_id IS NULL)
    if (effectiveTeamId) {
      insightQuery = insightQuery.eq('team_id', effectiveTeamId)
    } else {
      insightQuery = insightQuery.is('team_id', null)
    }

    const { data: insight, error: insightError } = await insightQuery.single()

    if (insightError) {
      if (insightError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Samenvatting niet gevonden' })
      }
      throw insightError
    }

    // Haal thema informatie op
    const { data: themeData, error: themeError } = await supabase
      .from('themes')
      .select('titel, beschrijving_werknemer, beschrijving_werkgever')
      .eq('id', themeId)
      .single()

    if (themeError) throw themeError

    res.json({
      organisatie_id: orgId,
      theme_id: themeId,
      team_id: effectiveTeamId || null,
      titel: themeData.titel,
      beschrijving_werknemer: themeData.beschrijving_werknemer,
      beschrijving_werkgever: themeData.beschrijving_werkgever,
      samenvatting: insight.samenvatting,
      verbeteradvies: insight.verbeteradvies,
      gpt_adviezen: insight.gpt_adviezen,
      signaalwoorden: insight.signaalwoorden,
      aantal_gesprekken: insight.aantal_gesprekken,
      gemiddelde_score: insight.gemiddelde_score,
      totaal_medewerkers: insight.totaal_medewerkers,
      voltooide_medewerkers: insight.voltooide_medewerkers,
      samenvatting_status: insight.samenvatting_status,
      laatst_bijgewerkt: insight.laatst_bijgewerkt_op
    })

  } catch (err) {
    console.error('Fout bij ophalen organisatie samenvatting:', err)
    res.status(500).json({ error: 'Fout bij ophalen organisatie samenvatting' })
  }
})

module.exports = router 