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
    
    if (!r.ok) {
      const text = await r.text();
    }
    
    return r.ok;
  } catch (e) {
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
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    return res.status(500).json({ error: 'Fout bij controleren bestaande gebruikers.' });
  }
  
  const existingUser = existingUsers.users.find(user => user.email === email);
  
  if (existingUser) {
    
    // Verwijder bestaande gebruiker uit Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
    
    if (deleteError) {
      return res.status(400).json({ 
        error: 'Gebruiker bestaat al. Probeer het over een paar minuten opnieuw, of neem contact op met support.' 
      });
    }
    
  }

  // 2. Test Supabase Auth verbinding
  if (!(await pingAuth())) {
    return res.status(503).json({ 
      error: 'Backend heeft geen verbinding met Supabase Auth (health failed).' 
    });
  }

  // 3. Maak nieuwe Supabase Auth gebruiker aan via normale signup flow
  const { data: authUser, error: authError } = await supabaseAnon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.FRONTEND_URL}/na-verificatie`
    }
  });

  if (authError || !authUser?.user?.id) {
    return res.status(400).json({ 
      error: authError?.message || 'Aanmaken gebruiker mislukt.',
      details: authError || 'Geen gebruiker ID ontvangen'
    });
  }

  const userId = authUser.user.id;

  // 4. Sla pending employer data op in database (niet in localStorage)
  const { data: pendingEmployer, error: pendingError } = await supabase
    .from('pending_employers')
    .insert({
      user_id: userId,
      company_name,
      contact_phone,
      first_name,
      middle_name,
      last_name,
      status: 'pending_verification'
    })
    .select()
    .single();

  if (pendingError) {
    return res.status(500).json({ error: pendingError.message });
  }

  // 5. Supabase verstuurt automatisch verificatie-e-mail bij email_confirm: true

  // 6. Registratie voltooid - return direct success
  // Welkomstmail wordt nu automatisch verstuurd via email triggers na verificatie

  return res.status(200).json({ 
    success: true, 
    message: 'Account succesvol aangemaakt! Je ontvangt automatisch een verificatie-e-mail.',
    email: email,
    redirectUrl: `${process.env.FRONTEND_URL}/verify-email?email=${encodeURIComponent(email)}`
  });
});

module.exports = router;  