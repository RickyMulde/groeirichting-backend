const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'E-mailadres is verplicht.' });
  }

  try {
    console.log('Opnieuw versturen verificatiemail naar:', email);
    
    // Controleer eerst of gebruiker bestaat
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Fout bij ophalen gebruikers:', listError);
      return res.status(500).json({ error: 'Fout bij controleren gebruiker.' });
    }
    
    const existingUser = existingUsers.users.find(user => user.email === email);
    
    if (!existingUser) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    }

    if (existingUser.email_confirmed_at) {
      return res.status(400).json({ error: 'E-mailadres is al geverifieerd.' });
    }

    // Stuur nieuwe verificatielink via Supabase Auth
    const { error: emailError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${process.env.FRONTEND_URL || 'https://groeirichting.nl'}/verify-email?email=${encodeURIComponent(email)}`
      }
    });
    
    if (emailError) {
      console.error('Fout bij genereren verificatielink:', emailError);
      return res.status(400).json({ 
        error: 'Fout bij versturen verificatiemail: ' + emailError.message 
      });
    }

    console.log('Verificatielink succesvol opnieuw verzonden naar:', email);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Verificatie-e-mail opnieuw verzonden! Controleer je inbox.' 
    });

  } catch (error) {
    console.error('Fout bij opnieuw versturen verificatiemail:', error);
    return res.status(500).json({ 
      error: 'Er is iets misgegaan bij het opnieuw versturen van de verificatiemail.' 
    });
  }
});

module.exports = router;
