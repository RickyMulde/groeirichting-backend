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

  // 1. Controleer eerst of gebruiker al bestaat in Auth
  console.log('Controleren of gebruiker al bestaat in Auth...');
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('Fout bij ophalen bestaande gebruikers:', listError);
    return res.status(500).json({ error: 'Fout bij controleren bestaande gebruikers.' });
  }
  
  const existingUser = existingUsers.users.find(user => user.email === email);
  
  if (existingUser) {
    console.log('Gebruiker bestaat al in Auth, proberen te verwijderen...');
    
    // Verwijder bestaande gebruiker uit Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
    
    if (deleteError) {
      console.error('Fout bij verwijderen bestaande gebruiker:', deleteError);
      return res.status(400).json({ 
        error: 'Gebruiker bestaat al. Probeer het over een paar minuten opnieuw, of neem contact op met support.' 
      });
    }
    
    console.log('Bestaande gebruiker succesvol verwijderd uit Auth');
  }

  // 2. Maak nieuwe Supabase Auth gebruiker aan
  console.log('Nieuwe gebruiker aanmaken in Auth...');
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // E-mailverificatie vereist
    email_confirm_redirect_to: 'https://groeirichting-frontend.onrender.com/verify-email'
  });

  if (authError || !authUser?.user?.id) {
    console.error('Supabase Auth fout:', authError);
    console.error('Auth response:', authUser);
    return res.status(400).json({ 
      error: authError?.message || 'Aanmaken gebruiker mislukt.',
      details: authError || 'Geen gebruiker ID ontvangen'
    });
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

  // 4. Stuur verificatiemail via Supabase Auth
  try {
    console.log('Versturen verificatiemail naar:', email);
    
    // Gebruik de juiste methode voor verificatie
    const { error: emailError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        redirectTo: 'https://groeirichting-frontend.onrender.com/verify-email'
      }
    });
    
    if (emailError) {
      console.error('Fout bij genereren verificatielink:', emailError);
    } else {
      console.log('Verificatielink succesvol gegenereerd voor:', email);
    }
  } catch (emailError) {
    console.error('Fout bij verzenden verificatiemail:', emailError);
  }

  // 5. Stuur bevestigingsmail via Resend
  try {
    await resend.emails.send({
      from: 'GroeiRichting <noreply@groeirichting.nl>',
      to: email,
      subject: 'Welkom bij GroeiRichting - Verificeer je e-mailadres',
      html: `
        <p>Beste ${first_name},</p>
        <p>Bedankt voor je registratie bij GroeiRichting. Je account is succesvol aangemaakt.</p>
        <p><strong>Belangrijk:</strong> Je moet eerst je e-mailadres verifiëren voordat je kunt inloggen.</p>
        <p>Controleer je inbox voor een verificatiemail van Supabase.</p>
        <p>Na verificatie kun je inloggen via <a href="https://groeirichting-frontend.onrender.com/login">de login pagina</a>.</p>
        <p>Met vriendelijke groet,<br>Het GroeiRichting team</p>
      `
    });
    console.log('Bevestigingsmail succesvol verzonden naar:', email);
  } catch (mailError) {
    console.error('Fout bij verzenden bevestigingsmail:', mailError);
    // Geen harde fout, want registratie is verder geslaagd
  }

  return res.status(200).json({ success: true });
});

module.exports = router;  