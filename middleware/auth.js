const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Middleware om employerId uit JWT te halen en in req.ctx te zetten
const authMiddleware = async (req, res, next) => {
  try {
    // Haal Authorization header op
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Geen geldige autorisatie header' })
    }

    const token = authHeader.substring(7) // Verwijder 'Bearer '

    // Verifieer JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Ongeldig token' })
    }

    // Haal user data op uit database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, role, employer_id')
      .eq('id', user.id)
      .single()

    if (userError || !userData) {
      return res.status(401).json({ error: 'Gebruiker niet gevonden' })
    }

    // Zet context in req.ctx
    req.ctx = {
      userId: userData.id,
      role: userData.role,
      employerId: userData.employer_id
    }

    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({ error: 'Interne serverfout bij authenticatie' })
  }
}

// Guard functie om te controleren of team bij werkgever hoort
const assertTeamInOrg = async (teamId, employerId) => {
  if (!teamId) return true // Geen team_id = OK

  const { data: team, error } = await supabase
    .from('teams')
    .select('id, werkgever_id, archived_at')
    .eq('id', teamId)
    .eq('werkgever_id', employerId)
    .single()

  if (error || !team) {
    throw new Error('Team niet gevonden of behoort niet tot deze organisatie')
  }

  if (team.archived_at) {
    throw new Error('Team is gearchiveerd')
  }

  return true
}

module.exports = {
  authMiddleware,
  assertTeamInOrg
}
