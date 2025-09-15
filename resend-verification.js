const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { sendMail } = require('./services/mailer/mailer');

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

    // Genereer nieuwe verificatielink via Supabase Auth
    const { data, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email: email
    });
    
    if (linkError) {
      console.error('Fout bij genereren verificatielink:', linkError);
      return res.status(400).json({ 
        error: 'Fout bij genereren verificatielink: ' + linkError.message 
      });
    }

    const link = data?.properties?.action_link;
    if (!link) {
      console.error('Geen action_link ontvangen van Supabase');
      return res.status(500).json({ error: 'Geen verificatielink ontvangen' });
    }

    // Extraheer token_hash uit de link
    const url = new URL(link);
    const token_hash = url.searchParams.get('token_hash');
    
    if (!token_hash) {
      console.error('Geen token_hash gevonden in verificatielink');
      return res.status(500).json({ error: 'Token hash niet gevonden' });
    }

    // Bouw onze eigen verificatielink
    const frontendUrl = process.env.FRONTEND_URL || 'https://groeirichting-frontend.onrender.com';
    const finalLink = `${frontendUrl}/na-verificatie?token_hash=${token_hash}&type=email`;
    
    console.log('Eigen verificatielink gebouwd:', finalLink);

    // Verstuur via Resend
    try {
      await sendMail({
        to: email,
        subject: 'Bevestig je account bij GroeiRichting',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a73e8; margin-bottom: 10px;">Bevestig je account bij GroeiRichting</h1>
              <p style="color: #666; font-size: 16px;">Klik op de link hieronder om je e-mailadres te verifiëren</p>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; margin: 25px 0; text-align: center;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333;">
                Klik op de knop hieronder om je e-mailadres te verifiëren en je account te activeren.
              </p>
              
              <a href="${finalLink}" 
                 style="display: inline-block; background-color: #1a73e8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                E-mailadres verifiëren
              </a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #888; font-size: 14px; margin: 0;">
                Werkt de knop niet? Kopieer deze link in je browser:<br>
                <a href="${finalLink}" style="color: #1a73e8; word-break: break-all;">${finalLink}</a>
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 14px;">
              <p>Met vriendelijke groet,<br><strong>Het GroeiRichting team</strong></p>
            </div>
          </div>
        `
      });

      console.log('Verificatielink succesvol opnieuw verzonden naar:', email);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Verificatie-e-mail opnieuw verzonden! Controleer je inbox.' 
      });

    } catch (mailError) {
      console.error('Fout bij versturen via Resend:', mailError);
      return res.status(500).json({ 
        error: 'Fout bij versturen verificatiemail via Resend' 
      });
    }

  } catch (error) {
    console.error('Fout bij opnieuw versturen verificatiemail:', error);
    return res.status(500).json({ 
      error: 'Er is iets misgegaan bij het opnieuw versturen van de verificatiemail.' 
    });
  }
});

module.exports = router;
