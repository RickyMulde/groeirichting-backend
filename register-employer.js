const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./services/mailer/mailer');

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
  console.log('Testing Auth health endpoint:', url);
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await globalThis.fetch(url, { 
      signal: ctrl.signal,
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });
    console.log('Auth health response:', r.status, r.statusText);
    console.log('Response headers:', Object.fromEntries(r.headers.entries()));
    
    if (!r.ok) {
      const text = await r.text();
      console.log('Error response body:', text);
    }
    
    return r.ok;
  } catch (e) {
    console.error('Auth health ping faalde:', e?.name || e);
    console.error('Error details:', e.message);
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

  // 4. Voeg eerst bedrijf toe (employers tabel)
  console.log('Bedrijf aanmaken...');
  const { data: employer, error: employerError } = await supabaseAnon
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

  // 5. Voeg gebruiker toe aan users-tabel (met employer_id)
  console.log('Gebruiker toevoegen aan database...');
  const { error: userError } = await supabaseAnon.from('users').insert({
    id: userId,
    email,
    role: 'employer',
    employer_id: employer.id, // Direct de employer_id toewijzen
    first_name,
    middle_name,
    last_name
  });

  if (userError) {
    console.error('Fout bij aanmaken gebruiker:', userError);
    return res.status(500).json({ error: userError.message });
  }

  // 6. Supabase verstuurt automatisch verificatie-e-mail bij email_confirm: true

  // 7. Registratie voltooid - return direct success
  console.log('Registratie voltooid. Supabase verstuurt automatisch verificatie-e-mail.');

  // Welkomstmail wordt nu automatisch verstuurd via email triggers na verificatie

  return res.status(200).json({ 
    success: true, 
    message: 'Account succesvol aangemaakt! Je ontvangt automatisch een verificatie-e-mail.',
    email: email,
    redirectUrl: `${process.env.FRONTEND_URL}/verify-email?email=${encodeURIComponent(email)}`
  });
});

module.exports = router;  