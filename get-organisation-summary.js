const express = require('express')
const { createClient } = require('@supabase/supabase-js')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// GET /api/organisation-summary/:orgId/:themeId
// Haalt samenvatting en adviezen op voor een specifiek thema van een organisatie
router.get('/:orgId/:themeId', async (req, res) => {
  const { orgId, themeId } = req.params

  if (!orgId || !themeId) {
    return res.status(400).json({ error: 'Organisatie ID en Thema ID zijn verplicht' })
  }

  try {
    // Haal de organisatie insight op
    const { data: insight, error: insightError } = await supabase
      .from('organization_theme_insights')
      .select('*')
      .eq('organisatie_id', orgId)
      .eq('theme_id', themeId)
      .single()

    if (insightError) {
      if (insightError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Samenvatting niet gevonden' })
      }
      throw insightError
    }

    // Haal thema informatie op
    const { data: themeData, error: themeError } = await supabase
      .from('themes')
      .select('titel, beschrijving_werknemer')
      .eq('id', themeId)
      .single()

    if (themeError) throw themeError

    res.json({
      organisatie_id: orgId,
      theme_id: themeId,
      titel: themeData.titel,
      beschrijving_werknemer: themeData.beschrijving_werknemer,
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