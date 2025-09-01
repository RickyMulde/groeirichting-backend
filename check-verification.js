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
    console.log('Controleren verificatiestatus voor:', email);
    
    // Controleer of gebruiker bestaat en geverifieerd is
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Fout bij ophalen gebruikers:', listError);
      return res.status(500).json({ error: 'Fout bij controleren gebruiker.' });
    }
    
    const existingUser = existingUsers.users.find(user => user.email === email);
    
    if (!existingUser) {
      return res.status(404).json({ error: 'Gebruiker niet gevonden.' });
    }

    console.log('User found:', {
      id: existingUser.id,
      email: existingUser.email,
      email_confirmed_at: existingUser.email_confirmed_at,
      created_at: existingUser.created_at
    });

    if (existingUser.email_confirmed_at) {
      // Gebruiker is geverifieerd, haal rol op
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', existingUser.id)
        .single();
      
      if (profileError) {
        console.error('Profile error:', profileError);
        return res.status(500).json({ error: 'Fout bij ophalen gebruikersrol.' });
      }

      return res.status(200).json({ 
        verified: true,
        role: profile.role,
        message: 'E-mail is geverifieerd.',
        redirectUrl: profile.role === 'employer' ? '/werkgever-portaal' : '/werknemer-portaal'
      });
    } else {
      return res.status(200).json({ 
        verified: false,
        message: 'E-mail is nog niet geverifieerd.' 
      });
    }

  } catch (error) {
    console.error('Fout bij controleren verificatie:', error);
    return res.status(500).json({ 
      error: 'Er is iets misgegaan bij het controleren van de verificatie.' 
    });
  }
});

module.exports = router;
