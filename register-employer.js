const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/', async (req, res) => {
  const {
    company_name,
    contact_phone,
    email,
    password,
    first_name,
    middle_name,
    last_name
  } = req.body;

  if (!email || !password || !company_name || !first_name || !last_name) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken.' });
  }

  // 1. Maak Supabase Auth gebruiker aan
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // E-mailverificatie vereist
    redirect_to: 'https://groeirichting-frontend.onrender.com/verify-email'
  });

  if (authError || !authUser?.user?.id) {
    return res.status(400).json({ error: authError?.message || 'Aanmaken gebruiker mislukt.' });
  }

  const userId = authUser.user.id;

  // 2. Voeg bedrijf toe
  const { data: employer, error: employerError } = await supabase
    .from('employers')
    .insert({
      company_name,
      contact_email: email,
      contact_phone,
      kvk_number: null // Expliciet null instellen voor KVK nummer
    })
    .select()
    .single();

  if (employerError) {
    return res.status(500).json({ error: employerError.message });
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
  });

  if (userError) {
    return res.status(500).json({ error: userError.message });
  }

  // 4. Stuur bevestigingsmail via Resend
  try {
    await resend.emails.send({
      from: 'GroeiRichting <noreply@groeirichting.nl>',
      to: email,
      subject: 'Welkom bij GroeiRichting',
      html: `
        <p>Beste ${first_name},</p>
        <p>Bedankt voor je registratie bij GroeiRichting. Je account is succesvol aangemaakt.</p>
        <p>Je kunt nu inloggen via <a href="https://groeirichting-frontend.onrender.com/werkgever-portaal">je portaal</a>.</p>
        <p>Met vriendelijke groet,<br>Het GroeiRichting team</p>
      `
    });
  } catch (mailError) {
    console.error('Fout bij verzenden mail:', mailError);
    // Geen harde fout, want registratie is verder geslaagd
  }

  return res.status(200).json({ success: true });
});

module.exports = router;  