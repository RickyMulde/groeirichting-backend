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

    // Genereer verificatielink (maakt user aan als die nog niet bestaat)
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: { 
        emailRedirectTo: redirectTo || `${process.env.FRONTEND_URL || 'https://groeirichting.nl'}/na-verificatie`
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

    console.log('Verificatielink gegenereerd, versturen via Resend...');

    // Verstuur via Resend
    await sendMail({
      to: email,
      subject: 'Bevestig je account bij GroeiRichting',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a73e8; margin-bottom: 10px;">Welkom bij GroeiRichting! 🎉</h1>
            <p style="color: #666; font-size: 16px;">Bevestig je e-mailadres om verder te gaan</p>
          </div>
          
          <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center;">
            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333;">
              Klik op de knop hieronder om je e-mailadres te verifiëren en je account te activeren.
            </p>
            
            <a href="${link}" 
               style="display: inline-block; background-color: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
              E-mailadres verifiëren
            </a>
          </div>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="color: #2e7d32; margin-top: 0;">✅ Na verificatie</h3>
            <p style="margin: 0; color: #333;">
              Zodra je e-mail is geverifieerd, kun je inloggen en toegang krijgen tot je portaal.
            </p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 14px; margin: 0;">
              Werkt de knop niet? Kopieer deze link in je browser:<br>
              <a href="${link}" style="color: #1a73e8; word-break: break-all;">${link}</a>
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; color: #666; font-size: 14px;">
            <p>Met vriendelijke groet,<br><strong>Het GroeiRichting team</strong></p>
          </div>
        </div>
      `
    });

    console.log('Verificatie-e-mail succesvol verzonden naar:', email);

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
