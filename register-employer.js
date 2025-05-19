
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post('/', async (req, res) => {
  const {
    company_name,
    kvk_number,
    contact_phone,
    email,
    password,
    first_name,
    middle_name,
    last_name
  } = req.body

  if (!email || !password || !company_name || !kvk_number || !first_name || !last_name) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken.' })
  }

  // 1. Maak Supabase Auth gebruiker aan
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    redirect_to: 'https://groeirichting-frontend.onrender.com/werkgever-portaal'
  })

  if (authError || !authUser?.user?.id) {
    return res.status(400).json({ error: authError?.message || 'Aanmaken gebruiker mislukt.' })
  }

  const userId = authUser.user.id

  // 2. Voeg bedrijf toe
  const { data: employer, error: employerError } = await supabase
    .from('employers')
    .insert({
      company_name,
      kvk_number,
      contact_email: email,
      contact_phone
    })
    .select()
    .single()

  if (employerError) {
    return res.status(500).json({ error: employerError.message })
  }

  // 3. Voeg gebruiker toe aan users-tabel
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    email,
    role: 'employer',
    employer_id: employer.id,
    first_name,
    middle_name,
    last_name
  })

  if (userError) {
    return res.status(500).json({ error: userError.message })
  }

  return res.status(200).json({ success: true })
})

module.exports = router
