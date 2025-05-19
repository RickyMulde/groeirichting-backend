const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post('/', async (req, res) => {
  const {
    token,
    first_name,
    middle_name,
    last_name,
    birthdate,
    gender,
    password
  } = req.body

  if (!token || !first_name || !last_name || !birthdate || !gender || !password) {
    return res.status(400).json({ error: 'Niet alle verplichte velden zijn ingevuld.' })
  }

  // Token controleren en gegevens ophalen
  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .select('email, bedrijf, status')
    .eq('token', token)
    .single()

  if (invitationError || !invitation || invitation.status !== 'pending') {
    return res.status(400).json({ error: 'Ongeldige of verlopen uitnodiging.' })
  }

  // Gebruiker aanmaken in Supabase Auth
  const { data: user, error: authError } = await supabase.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true
  })

  if (authError) {
    return res.status(400).json({ error: 'Account aanmaken mislukt: ' + authError.message })
  }

  // Gebruiker toevoegen aan users-tabel
  const { error: insertError } = await supabase.from('users').insert({
    id: user.user.id,
    email: invitation.email,
    first_name,
    middle_name,
    last_name,
    birthdate,
    gender,
    role: 'employee',
    employer_id: invitation.bedrijf
  })

  if (insertError) {
    return res.status(500).json({ error: 'Opslaan in gebruikersdatabase mislukt.' })
  }

  // Uitnodiging bijwerken
  await supabase
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('token', token)

  return res.status(200).json({ message: 'Medewerker succesvol geregistreerd.' })
})

module.exports = router
