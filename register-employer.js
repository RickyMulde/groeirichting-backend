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
    last_name,
    user_id // Nieuw: Supabase user ID van frontend
  } = req.body;

  if (!email || !company_name || !first_name || !last_name || !user_id) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken.' });
  }

  // 1. Controleer of gebruiker bestaat in Supabase Auth
  console.log('Controleren of gebruiker bestaat in Auth...');
  const { data: existingUser, error: userError } = await supabase.auth.admin.getUserById(user_id);
  
  if (userError || !existingUser?.user) {
    console.error('Fout bij ophalen gebruiker:', userError);
    return res.status(400).json({ error: 'Gebruiker niet gevonden in Auth.' });
  }

  if (existingUser.user.email !== email) {
    return res.status(400).json({ error: 'E-mailadres komt niet overeen met gebruiker.' });
  }

  console.log('Gebruiker gevonden in Auth:', existingUser.user.email);

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
  const { error: userInsertError } = await supabase.from('users').insert({
    id: user_id, // Gebruik het bestaande Supabase user ID
    email,
    role: 'employer',
    employer_id: employer.id,
    first_name,
    middle_name,
    last_name
  });

  if (userInsertError) {
    return res.status(500).json({ error: userInsertError.message });
  }

  // 4. Stuur welkomstmail via Resend
  try {
    console.log('Versturen welkomstmail naar:', email);
    
    await resend.emails.send({
      from: 'GroeiRichting <noreply@groeirichting.nl>',
      to: email,
      subject: 'Welkom bij GroeiRichting - Verificeer je e-mailadres',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Welkom bij GroeiRichting! 🎉</h2>
          
          <p>Beste ${first_name},</p>
          
          <p>Bedankt voor je registratie bij GroeiRichting. Je account is succesvol aangemaakt!</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #d32f2f; margin-top: 0;">📧 E-mailverificatie vereist</h3>
            <p><strong>Je moet eerst je e-mailadres verifiëren voordat je kunt inloggen.</strong></p>
            <p>Controleer je inbox voor een verificatie-e-mail van Supabase.</p>
          </div>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2e7d32; margin-top: 0;">✅ Na verificatie</h3>
            <p>Zodra je e-mail is geverifieerd, kun je:</p>
            <ul>
              <li>Inloggen via de <a href="${process.env.FRONTEND_URL}/login" style="color: #1a73e8;">login pagina</a></li>
              <li>Toegang krijgen tot je werkgever portaal</li>
              <li>Beginnen met het beheren van je team</li>
            </ul>
          </div>
          
          <p>Met vriendelijke groet,<br>
          <strong>Het GroeiRichting team</strong></p>
        </div>
      `
    });
    
    console.log('Welkomstmail succesvol verzonden naar:', email);
    
  } catch (mailError) {
    console.error('Fout bij verzenden welkomstmail:', mailError);
  }

  // 5. Registratie voltooid
  console.log('Registratie voltooid. Welkomstmail verzonden.');

  return res.status(200).json({ 
    success: true, 
    message: 'Account succesvol aangemaakt! Controleer je e-mailadres voor de verificatie-e-mail.',
    email: email
  });
});

module.exports = router;  