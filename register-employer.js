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
    email_confirm_redirect_to: `${process.env.FRONTEND_URL}/werkgever-portaal`
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

  // 3. Voeg bedrijf toe
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

  // 4. Voeg gebruiker toe aan users-tabel
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

  // 5. Stuur verificatie-e-mail via Supabase Auth
  try {
    console.log('Versturen Supabase verificatie-e-mail naar:', email);
    
    // Trigger Supabase om verificatie-e-mail te versturen met juiste redirect
    const { data: resendData, error: emailError } = await supabase.auth.resend({
      type: 'signup',
      email: email
    });
    
    if (emailError) {
      console.error('Fout bij versturen verificatie-e-mail:', emailError);
      console.log('Resend data:', resendData);
    } else {
      console.log('Supabase verificatie-e-mail succesvol getriggerd voor:', email);
      console.log('Resend data:', resendData);
    }
  } catch (emailError) {
    console.error('Fout bij triggeren Supabase verificatie-e-mail:', emailError);
  }

  // 6. Stuur welkomstmail via Resend
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

  // 7. Registratie voltooid
  console.log('Registratie voltooid. Supabase verificatie-e-mail getriggerd en welkomstmail verzonden.');

  return res.status(200).json({ 
    success: true, 
    message: 'Account succesvol aangemaakt! Controleer je e-mailadres voor de verificatie-e-mail.',
    email: email,
    redirectUrl: `${process.env.FRONTEND_URL}/verify-email?email=${encodeURIComponent(email)}`
  });
});

module.exports = router;  