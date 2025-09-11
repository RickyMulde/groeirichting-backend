const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./services/mailer/mailer');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Anonieme client voor signup (heeft anon key nodig)
const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Resend is nu vervangen door de mailer service

// Health check functie voor Supabase Auth
async function pingAuth() {
  const url = `${process.env.SUPABASE_URL}/auth/v1/health`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    console.log('Auth health:', r.status, url);
    return r.ok;
  } catch (e) {
    console.error('Auth health ping faalde:', e?.name || e);
    return false;
  } finally {
    clearTimeout(t);
  }
}

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

  // 2. Test Supabase Auth verbinding
  console.log('Testing Supabase Auth connection...');
  if (!(await pingAuth())) {
    console.error('Supabase Auth health check failed');
    return res.status(503).json({ 
      error: 'Backend heeft geen verbinding met Supabase Auth (health failed).' 
    });
  }

  // 3. Maak nieuwe Supabase Auth gebruiker aan via normale signup flow
  console.log('Nieuwe gebruiker aanmaken in Auth...');
  const { data: authUser, error: authError } = await supabaseAnon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.FRONTEND_URL}/werkgever-portaal`
    }
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

  // 4. Voeg gebruiker toe aan users-tabel (zonder employer_id eerst)
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    email,
    role: 'employer',
    employer_id: null, // Eerst null, wordt later geupdate
    first_name,
    middle_name,
    last_name
  });

  if (userError) {
    console.error('Fout bij aanmaken gebruiker:', userError);
    return res.status(500).json({ error: userError.message });
  }

  // 5. Voeg bedrijf toe
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
    console.error('Fout bij aanmaken bedrijf:', employerError);
    return res.status(500).json({ error: employerError.message });
  }

  // 6. Update gebruiker met employer_id
  const { error: updateError } = await supabase
    .from('users')
    .update({ employer_id: employer.id })
    .eq('id', userId);

  if (updateError) {
    console.error('Fout bij updaten gebruiker met employer_id:', updateError);
    return res.status(500).json({ error: updateError.message });
  }

  // 7. Supabase verstuurt automatisch verificatie-e-mail bij email_confirm: true

  // 8. Stuur welkomstmail via Resend
  try {
    console.log('Versturen welkomstmail naar:', email);
    
    await sendEmail({
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
            <p>Je ontvangt automatisch een verificatie-e-mail van Supabase.</p>
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
      `,
      tag: 'WELCOME_EMPLOYER',
      metadata: { 
        type: 'welcome',
        companyName: company_name,
        firstName: first_name
      }
    });
    
    console.log('Welkomstmail succesvol verzonden naar:', email);
    
  } catch (mailError) {
    console.error('Fout bij verzenden welkomstmail:', mailError);
  }

  // 9. Registratie voltooid
  console.log('Registratie voltooid. Supabase verstuurt automatisch verificatie-e-mail en welkomstmail verzonden.');

  return res.status(200).json({ 
    success: true, 
    message: 'Account succesvol aangemaakt! Je ontvangt automatisch een verificatie-e-mail.',
    email: email,
    redirectUrl: `${process.env.FRONTEND_URL}/verify-email?email=${encodeURIComponent(email)}`
  });
});

module.exports = router;  