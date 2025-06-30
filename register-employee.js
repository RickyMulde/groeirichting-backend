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

  // 1. Token controleren en gegevens ophalen
  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .select('email, employer_id, status')
    .eq('token', token)
    .single()

  if (invitationError || !invitation || invitation.status !== 'pending') {
    return res.status(400).json({ error: 'Ongeldige of verlopen uitnodiging.' })
  }

  // 2. Gebruiker aanmaken in Supabase Auth
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true
  })

  if (authError || !authUser?.user?.id) {
    return res.status(400).json({ error: 'Account aanmaken mislukt: ' + (authError?.message || 'Onbekende fout') })
  }

  // 3. Toevoegen aan users-tabel
  const { error: insertError } = await supabase.from('users').insert({
    id: authUser.user.id,            // ✅ correct id
    email: invitation.email,         // ✅ email meegeven
    first_name,
    middle_name,
    last_name,
    birthdate,
    gender,
    role: 'employee',
    employer_id: invitation.employer_id
  })

  if (insertError) {
    console.error('❌ Insert error:', insertError)
    return res.status(500).json({ error: insertError.message || 'Opslaan in gebruikersdatabase mislukt.' })
  }

  // 4. Uitnodiging bijwerken
  await supabase
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('token', token)

  return res.status(200).json({ success: true })
})

module.exports = router
