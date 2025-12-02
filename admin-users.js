const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const { authMiddleware } = require('./middleware/auth')

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

module.exports = router

