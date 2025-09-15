const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { sendMail } = require('./services/mailer/mailer');

const router = express.Router();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role!
);

router.post('/signup-init', async (req, res) => {
  try {
    const { email, password, redirectTo } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mailadres en wachtwoord zijn verplicht' });
    }

    console.log('Nieuwe registratie initiëren voor:', email);
    console.log('Ontvangen redirectTo:', redirectTo);
    console.log('FRONTEND_URL env var:', process.env.FRONTEND_URL);

    // Genereer verificatielink via Supabase (laat Supabase de email versturen)
    const finalRedirectTo = redirectTo || `${process.env.FRONTEND_URL || 'https://groeirichting-frontend.onrender.com'}/na-verificatie`;
    console.log('Final redirectTo voor Supabase:', finalRedirectTo);
    
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: { 
        emailRedirectTo: finalRedirectTo
      }
    });
    
    if (error) {
      console.error('Fout bij genereren verificatielink:', error);
      return res.status(400).json({ error: error.message });
    }

    const link = data?.properties?.action_link;
    if (!link) {
      console.error('Geen action_link ontvangen van Supabase');
      return res.status(500).json({ error: 'Geen verificatielink ontvangen' });
    }

    console.log('Verificatielink gegenereerd door Supabase:', link);
    console.log('Supabase verstuurt automatisch verificatie-e-mail...');

    // Supabase verstuurt de email automatisch, we hoeven niets meer te doen
    console.log('Verificatie-e-mail wordt verstuurd door Supabase naar:', email);

    return res.json({ 
      success: true, 
      message: 'Verificatie-e-mail verzonden! Controleer je inbox.' 
    });

  } catch (e) {
    console.error('Fout in signup-init:', e);
    return res.status(500).json({ error: 'Interne serverfout' });
  }
});

module.exports = router;
