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

// GET /api/teams
// Haalt alle teams op voor een werkgever (uit context)
router.get('/', async (req, res) => {
  const { include_archived } = req.query
  const employerId = req.ctx.employerId

  try {
    // Haal teams op voor deze werkgever
    let teamsQuery = supabase
      .from('teams')
      .select(`
        id,
        naam,
        teams_beschrijving,
        aangemaakt_op,
        bijgewerkt_op,
        werkgever_id,
        archived_at
      `)
      .eq('werkgever_id', employerId)

    // Filter gearchiveerde teams tenzij expliciet gevraagd
    if (include_archived !== 'true') {
      teamsQuery = teamsQuery.is('archived_at', null)
    }

    const { data: teams, error: teamsError } = await teamsQuery
      .order('aangemaakt_op', { ascending: true })

    if (teamsError) throw teamsError

    // Haal teamleden op voor elk team
    const teamsMetLeden = await Promise.all(teams.map(async (team) => {
      const { data: leden, error: ledenError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          first_name,
          middle_name,
          last_name,
          birthdate,
          gender,
          functie_omschrijving,
          team_id,
          created_at
        `)
        .eq('team_id', team.id)
        .eq('role', 'employee')
        .order('created_at', { ascending: true })

      if (ledenError) {
        console.error('Fout bij ophalen teamleden:', ledenError)
        return { ...team, leden: [], aantal_leden: 0 }
      }

      return {
        ...team,
        leden: leden || [],
        aantal_leden: leden ? leden.length : 0
      }
    }))

    res.json({
      teams: teamsMetLeden,
      totaal_teams: teams.length
    })

  } catch (err) {
    console.error('Fout bij ophalen teams:', err)
    res.status(500).json({ 
      error: 'Fout bij ophalen teams',
      details: err.message 
    })
  }
})

// POST /api/teams
// Maakt een nieuw team aan
router.post('/', async (req, res) => {
  const { naam, teams_beschrijving } = req.body
  const employerId = req.ctx.employerId

  if (!naam) {
    return res.status(400).json({ error: 'naam is verplicht' })
  }

  try {
    // Controleer max 50 teams per werkgever
    const { count: teamCount, error: countError } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('werkgever_id', employerId)
      .is('archived_at', null)

    if (countError) throw countError

    if (teamCount >= 50) {
      return res.status(422).json({ error: 'Maximum 50 teams per organisatie bereikt' })
    }

    // Controleer of teamnaam al bestaat (case-insensitive)
    const { data: bestaandTeam, error: checkError } = await supabase
      .from('teams')
      .select('id')
      .eq('werkgever_id', employerId)
      .ilike('naam', naam.trim())
      .is('archived_at', null)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError
    }

    if (bestaandTeam) {
      return res.status(409).json({ error: 'Een team met deze naam bestaat al' })
    }

    // Maak nieuw team aan
    const { data: nieuwTeam, error: insertError } = await supabase
      .from('teams')
      .insert({
        werkgever_id: employerId,
        naam: naam.trim(),
        teams_beschrijving: teams_beschrijving ? teams_beschrijving.trim() : null,
        aangemaakt_op: new Date().toISOString(),
        bijgewerkt_op: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) throw insertError

    res.status(201).json({
      success: true,
      team: {
        ...nieuwTeam,
        leden: [],
        aantal_leden: 0
      }
    })

  } catch (err) {
    console.error('Fout bij aanmaken team:', err)
    res.status(500).json({ 
      error: 'Fout bij aanmaken team',
      details: err.message 
    })
  }
})

// PUT /api/teams/:id
// Werkt een team bij
router.put('/:id', async (req, res) => {
  const { id } = req.params
  const { naam, teams_beschrijving } = req.body
  const employerId = req.ctx.employerId

  if (!naam) {
    return res.status(400).json({ error: 'naam is verplicht' })
  }

  try {
    // Haal huidig team op en controleer dat het bij deze werkgever hoort
    const { data: huidigTeam, error: huidigError } = await supabase
      .from('teams')
      .select('werkgever_id, naam, archived_at')
      .eq('id', id)
      .eq('werkgever_id', employerId)
      .single()

    if (huidigError) {
      if (huidigError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Team niet gevonden' })
      }
      throw huidigError
    }

    if (huidigTeam.archived_at) {
      return res.status(404).json({ error: 'Team is gearchiveerd' })
    }

    // Controleer of nieuwe naam al bestaat voor deze werkgever (case-insensitive)
    if (naam.toLowerCase() !== huidigTeam.naam.toLowerCase()) {
      const { data: bestaandTeam, error: checkError } = await supabase
        .from('teams')
        .select('id')
        .eq('werkgever_id', employerId)
        .ilike('naam', naam.trim())
        .is('archived_at', null)
        .single()

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError
      }

      if (bestaandTeam) {
        return res.status(409).json({ error: 'Een team met deze naam bestaat al' })
      }
    }

    // Update team
    const { data: bijgewerktTeam, error: updateError } = await supabase
      .from('teams')
      .update({
        naam: naam.trim(),
        teams_beschrijving: teams_beschrijving ? teams_beschrijving.trim() : null,
        bijgewerkt_op: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    res.json({
      success: true,
      team: bijgewerktTeam
    })

  } catch (err) {
    console.error('Fout bij bijwerken team:', err)
    res.status(500).json({ 
      error: 'Fout bij bijwerken team',
      details: err.message 
    })
  }
})

// DELETE /api/teams/:id
// Archiveert een team (soft delete)
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  const employerId = req.ctx.employerId

  try {
    // Controleer of team bestaat en bij deze werkgever hoort
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('id, naam, archived_at')
      .eq('id', id)
      .eq('werkgever_id', employerId)
      .single()

    if (teamError) {
      if (teamError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Team niet gevonden' })
      }
      throw teamError
    }

    if (team.archived_at) {
      return res.status(404).json({ error: 'Team is al gearchiveerd' })
    }

    // Controleer of team leden heeft
    const { data: leden, error: ledenError } = await supabase
      .from('users')
      .select('id')
      .eq('team_id', id)
      .eq('role', 'employee')
      .limit(1)

    if (ledenError) throw ledenError

    if (leden && leden.length > 0) {
      return res.status(422).json({ 
        error: 'Team kan niet worden gearchiveerd omdat het nog leden heeft',
        details: 'Verwijder eerst alle teamleden voordat je het team archiveert'
      })
    }

    // Archiveer team (soft delete)
    const { error: deleteError } = await supabase
      .from('teams')
      .update({
        archived_at: new Date().toISOString(),
        bijgewerkt_op: new Date().toISOString()
      })
      .eq('id', id)

    if (deleteError) throw deleteError

    res.json({
      success: true,
      message: 'Team succesvol gearchiveerd',
      archived: true
    })

  } catch (err) {
    console.error('Fout bij archiveren team:', err)
    res.status(500).json({ 
      error: 'Fout bij archiveren team',
      details: err.message 
    })
  }
})

module.exports = router
