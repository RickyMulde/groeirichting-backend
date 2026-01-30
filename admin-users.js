const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const { authMiddleware } = require('./middleware/auth')
const { ensureEmployerThemeRecord } = require('./utils/themeAccessService')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

// Middleware om te controleren of gebruiker superuser is
const requireSuperuser = (req, res, next) => {
  if (req.ctx.role !== 'superuser') {
    console.error('🔒 [ADMIN] Toegang geweigerd - geen superuser:', {
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

// Alle admin routes vereisen superuser
router.use(requireSuperuser)

// GET /api/admin/get-all-users
// Haalt alle gebruikers op (met optionele filters)
router.get('/get-all-users', async (req, res) => {
  try {
    const { role, employer_id } = req.query

    let query = supabase
      .from('users')
      .select('id, email, first_name, middle_name, last_name, role, employer_id, created_at, functie_omschrijving')
      .order('created_at', { ascending: false })

    // Optionele filters
    if (role) {
      query = query.eq('role', role)
    }
    if (employer_id) {
      query = query.eq('employer_id', employer_id)
    }

    const { data: users, error } = await query

    if (error) {
      console.error('❌ [ADMIN] Fout bij ophalen users:', error)
      throw error
    }

    console.log(`✅ [ADMIN] ${users?.length || 0} gebruikers opgehaald door superuser ${req.ctx.userId}`)

    res.json({
      success: true,
      users: users || [],
      count: users?.length || 0
    })

  } catch (err) {
    console.error('❌ [ADMIN] Error in get-all-users:', err)
    res.status(500).json({ 
      error: 'Fout bij ophalen gebruikers',
      details: err.message 
    })
  }
})

// GET /api/admin/get-all-employers
// Haalt alle werkgevers op
router.get('/get-all-employers', async (req, res) => {
  try {
    const { data: employers, error } = await supabase
      .from('employers')
      .select('id, company_name, contact_email, contact_phone, kvk_number, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ [ADMIN] Fout bij ophalen employers:', error)
      throw error
    }

    console.log(`✅ [ADMIN] ${employers?.length || 0} werkgevers opgehaald door superuser ${req.ctx.userId}`)

    res.json({
      success: true,
      employers: employers || [],
      count: employers?.length || 0
    })

  } catch (err) {
    console.error('❌ [ADMIN] Error in get-all-employers:', err)
    res.status(500).json({ 
      error: 'Fout bij ophalen werkgevers',
      details: err.message 
    })
  }
})

// POST /api/admin/generate-magic-link
// Genereert een magic link voor een gebruiker (voor login als gebruiker functionaliteit)
router.post('/generate-magic-link', async (req, res) => {
  try {
    const { email, userId } = req.body

    if (!email && !userId) {
      return res.status(400).json({ 
        error: 'Email of userId is vereist' 
      })
    }

    // Haal gebruiker op via email of userId
    let userQuery = supabase
      .from('users')
      .select('id, email')
      .single()

    if (userId) {
      userQuery = userQuery.eq('id', userId)
    } else {
      userQuery = userQuery.eq('email', email.toLowerCase().trim())
    }

    const { data: user, error: userError } = await userQuery

    if (userError || !user) {
      return res.status(404).json({ 
        error: 'Gebruiker niet gevonden' 
      })
    }

    // Genereer magic link via Supabase Admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
      options: {
        redirectTo: `${process.env.FRONTEND_URL}/redirect`
      }
    })

    if (linkError) {
      console.error('❌ [ADMIN] Fout bij genereren magic link:', linkError)
      return res.status(500).json({ 
        error: 'Fout bij genereren magic link',
        details: linkError.message 
      })
    }

    console.log(`✅ [ADMIN] Magic link gegenereerd voor ${user.email} door superuser ${req.ctx.userId}`)

    res.json({
      success: true,
      magicLink: linkData.properties.action_link,
      email: user.email,
      userId: user.id
    })

  } catch (err) {
    console.error('❌ [ADMIN] Error in generate-magic-link:', err)
    res.status(500).json({ 
      error: 'Fout bij genereren magic link',
      details: err.message 
    })
  }
})

// GET /api/admin/werkgevers/:werkgeverId/instellingen
// Haalt voor een werkgever alle thema's op met standaard + override gpt_doelstelling (superuser)
router.get('/werkgevers/:werkgeverId/instellingen', async (req, res) => {
  try {
    const { werkgeverId } = req.params

    const { data: werkgever, error: empError } = await supabase
      .from('employers')
      .select('id, company_name, contact_email')
      .eq('id', werkgeverId)
      .single()

    if (empError || !werkgever) {
      return res.status(404).json({ error: 'Werkgever niet gevonden' })
    }

    const { data: themes, error: themesError } = await supabase
      .from('themes')
      .select('id, titel, gpt_doelstelling')
      .eq('klaar_voor_gebruik', true)
      .order('volgorde_index', { ascending: true })

    if (themesError) throw themesError

    const { data: overrides } = await supabase
      .from('employer_themes')
      .select('theme_id, gpt_doelstelling')
      .eq('employer_id', werkgeverId)
      .is('team_id', null)

    const overridesByTheme = (overrides || []).reduce((acc, row) => {
      acc[row.theme_id] = row.gpt_doelstelling
      return acc
    }, {})

    const themas = (themes || []).map(t => ({
      theme_id: t.id,
      titel: t.titel,
      gpt_doelstelling_standaard: t.gpt_doelstelling ?? '',
      gpt_doelstelling_override: overridesByTheme[t.id] ?? null,
      gpt_doelstelling_effectief: (overridesByTheme[t.id] != null && String(overridesByTheme[t.id]).trim() !== '')
        ? overridesByTheme[t.id]
        : (t.gpt_doelstelling ?? '')
    }))

    res.json({
      success: true,
      werkgever: { id: werkgever.id, company_name: werkgever.company_name, contact_email: werkgever.contact_email },
      themas
    })
  } catch (err) {
    console.error('❌ [ADMIN] Error in werkgevers/instellingen:', err)
    res.status(500).json({ error: 'Fout bij ophalen instellingen', details: err.message })
  }
})

// PUT /api/admin/werkgevers/:werkgeverId/instellingen/thema/:themeId
// Zet of wis override gpt_doelstelling voor werkgever + thema (superuser). Wijzigt alleen gpt_doelstelling, niet zichtbaar.
router.put('/werkgevers/:werkgeverId/instellingen/thema/:themeId', async (req, res) => {
  try {
    const { werkgeverId, themeId } = req.params
    const { gpt_doelstelling } = req.body

    const { data: theme } = await supabase
      .from('themes')
      .select('id')
      .eq('id', themeId)
      .single()

    if (!theme) {
      return res.status(404).json({ error: 'Thema niet gevonden' })
    }

    const { data: existing } = await supabase
      .from('employer_themes')
      .select('id, zichtbaar')
      .eq('employer_id', werkgeverId)
      .eq('theme_id', themeId)
      .is('team_id', null)
      .maybeSingle()

    const value = gpt_doelstelling != null && String(gpt_doelstelling).trim() !== '' ? String(gpt_doelstelling).trim() : null

    if (existing) {
      await supabase
        .from('employer_themes')
        .update({ gpt_doelstelling: value })
        .eq('id', existing.id)
    } else {
      await ensureEmployerThemeRecord(werkgeverId, themeId, true, null, value)
    }

    res.json({ success: true, gpt_doelstelling: value })
  } catch (err) {
    console.error('❌ [ADMIN] Error in werkgevers/instellingen/thema:', err)
    res.status(500).json({ error: 'Fout bij opslaan doelstelling', details: err.message })
  }
})

module.exports = router

