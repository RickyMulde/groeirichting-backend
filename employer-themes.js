const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const { authMiddleware, assertTeamInOrg } = require('./middleware/auth')
const { ensureEmployerThemeRecord } = require('./utils/themeAccessService')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 🔐 Alle routes vereisen een geldig JWT
router.use(authMiddleware)

// Middleware: alleen superusers
const requireSuperuser = (req, res, next) => {
  if (req.ctx.role !== 'superuser') {
    console.error('🔒 [EMPLOYER_THEMES] Toegang geweigerd - geen superuser:', {
      userId: req.ctx.userId,
      role: req.ctx.role,
      path: req.path
    })
    return res.status(403).json({
      error: 'Toegang geweigerd. Alleen superusers kunnen deze endpoint gebruiken.'
    })
  }
  next()
}

// 👉 Basis helper om thema op te halen
async function getThemeById(themeId) {
  const { data, error } = await supabase
    .from('themes')
    .select('id, titel, standaard_zichtbaar, klaar_voor_gebruik')
    .eq('id', themeId)
    .single()

  if (error) {
    console.error('❌ [EMPLOYER_THEMES] Fout bij ophalen thema:', error)
    throw error
  }

  return data
}

// POST /api/employer-themes/admin/link
// Koppel (of update) een thema aan een werkgever en optioneel team
// Alleen voor superusers – bedoeld voor exclusieve thema's / plus-pakketten
router.post('/admin/link', requireSuperuser, async (req, res) => {
  try {
    const { employer_id, theme_id, team_id = null, zichtbaar = true } = req.body

    if (!employer_id || !theme_id) {
      return res.status(400).json({ error: 'employer_id en theme_id zijn verplicht' })
    }

    // Valideer thema
    const theme = await getThemeById(theme_id)
    if (!theme) {
      return res.status(404).json({ error: 'Thema niet gevonden' })
    }

    // Valideer team als opgegeven
    if (team_id) {
      await assertTeamInOrg(team_id, employer_id)
    }

    const record = await ensureEmployerThemeRecord(employer_id, theme_id, zichtbaar, team_id || null)

    console.log('✅ [EMPLOYER_THEMES] Link aangemaakt/bijgewerkt door superuser:', {
      employer_id,
      theme_id,
      team_id,
      zichtbaar
    })

    res.json({ success: true, koppeling: record })
  } catch (error) {
    console.error('❌ [EMPLOYER_THEMES] Fout in /admin/link:', error)
    res.status(500).json({ error: 'Interne serverfout bij koppelen thema', detail: error.message })
  }
})

// PUT /api/employer-themes/toggle
// Werkgever zet een thema aan/uit voor organisatie of specifiek team
// - Generieke thema's (standaard_zichtbaar = true): werkgever mag zelf aan/uitzetten
// - Exclusieve thema's (standaard_zichtbaar = false): werkgever mag alleen UIT zetten,
//   activatie gaat via superadmin (/admin/link)
router.put('/toggle', async (req, res) => {
  try {
    const employerId = req.ctx.employerId
    if (!employerId) {
      return res.status(403).json({ error: 'Geen werkgever gekoppeld aan gebruiker' })
    }

    const { theme_id, zichtbaar, team_id = null } = req.body

    if (!theme_id || typeof zichtbaar !== 'boolean') {
      return res.status(400).json({ error: 'theme_id en zichtbaar (boolean) zijn verplicht' })
    }

    // Valideer thema
    const theme = await getThemeById(theme_id)
    if (!theme) {
      return res.status(404).json({ error: 'Thema niet gevonden' })
    }

    if (!theme.klaar_voor_gebruik) {
      return res.status(400).json({ error: 'Thema is niet klaar voor gebruik' })
    }

    // Valideer team als opgegeven (en check dat team bij deze werkgever hoort)
    if (team_id) {
      await assertTeamInOrg(team_id, employerId)
    }

    // Exclusieve thema's mogen niet door werkgever zelf geactiveerd worden
    if (!theme.standaard_zichtbaar && zichtbaar === true) {
      return res.status(403).json({
        error: 'Dit is een exclusief thema. Activatie kan alleen door een superadmin worden gedaan.'
      })
    }

    // Voor generieke thema's of het UIT zetten van exclusieve thema's:
    const record = await ensureEmployerThemeRecord(
      employerId,
      theme_id,
      zichtbaar,
      team_id || null
    )

    console.log('✅ [EMPLOYER_THEMES] Toggle uitgevoerd door werkgever:', {
      employerId,
      theme_id,
      team_id,
      zichtbaar
    })

    res.json({ success: true, instelling: record })
  } catch (error) {
    console.error('❌ [EMPLOYER_THEMES] Fout in /toggle:', error)
    res.status(500).json({ error: 'Interne serverfout bij wijzigen thema-instelling', detail: error.message })
  }
})

// GET /api/employer-themes/employer/:employerId
// Haal alle employer_themes-instellingen op voor een werkgever
// - Superuser: mag voor elke werkgever opvragen
// - Werkgever: mag alleen eigen instellingen opvragen
router.get('/employer/:employerId', async (req, res) => {
  try {
    const { employerId } = req.params
    const ctxEmployerId = req.ctx.employerId
    const role = req.ctx.role

    if (!employerId) {
      return res.status(400).json({ error: 'employerId is verplicht' })
    }

    if (role !== 'superuser' && employerId !== ctxEmployerId) {
      return res.status(403).json({ error: 'Geen toegang tot deze organisatie' })
    }

    const { data, error } = await supabase
      .from('employer_themes')
      .select('*')
      .eq('employer_id', employerId)

    if (error) {
      console.error('❌ [EMPLOYER_THEMES] Fout bij ophalen employer_themes:', error)
      throw error
    }

    res.json({
      employer_id: employerId,
      instellingen: data || []
    })
  } catch (error) {
    console.error('❌ [EMPLOYER_THEMES] Fout in GET /employer/:employerId:', error)
    res.status(500).json({ error: 'Interne serverfout bij ophalen thema-instellingen', detail: error.message })
  }
})

// GET /api/employer-themes/theme/:themeId
// Haal alle koppelingen voor één thema op (alleen superuser)
router.get('/theme/:themeId', requireSuperuser, async (req, res) => {
  try {
    const { themeId } = req.params

    if (!themeId) {
      return res.status(400).json({ error: 'themeId is verplicht' })
    }

    const { data, error } = await supabase
      .from('employer_themes')
      .select('*')
      .eq('theme_id', themeId)

    if (error) {
      console.error('❌ [EMPLOYER_THEMES] Fout bij ophalen employer_themes voor thema:', error)
      throw error
    }

    res.json({
      theme_id: themeId,
      koppelingen: data || []
    })
  } catch (error) {
    console.error('❌ [EMPLOYER_THEMES] Fout in GET /theme/:themeId:', error)
    res.status(500).json({ error: 'Interne serverfout bij ophalen thema-koppelingen', detail: error.message })
  }
})

module.exports = router


