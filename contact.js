const express = require('express');
const router = express.Router();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/', async (req, res) => {
  const { naam, email, telefoon, vraag } = req.body;

  if (!naam || !email || !vraag) {
    return res.status(400).json({ error: 'Naam, e-mailadres en vraag zijn verplicht.' });
  }

  try {
    console.log('Contactformulier ontvangen van:', { naam, email, telefoon });
    console.log('CONTACTFORMULIER waarde:', process.env.CONTACTFORMULIER);
    console.log('Alle environment variabelen:', Object.keys(process.env).filter(key => key.includes('CONTACT')));

    const htmlBody = [
      `<h2>Nieuw contactformulier bericht</h2>`,
      `<p><strong>Naam:</strong> ${naam}</p>`,
      `<p><strong>E-mail:</strong> ${email}</p>`,
      telefoon ? `<p><strong>Telefoon:</strong> ${telefoon}</p>` : '',
      `<p><strong>Vraag:</strong></p>`,
      `<p>${vraag.replace(/\n/g, '<br>')}</p>`,
      `<hr>`,
      `<p><em>Dit bericht is verzonden via het contactformulier op groeirichting.nl</em></p>`
    ].filter(Boolean).join('');

    const textBody = [
      `Nieuw contactformulier bericht`,
      ``,
      `Naam: ${naam}`,
      `E-mail: ${email}`,
      telefoon ? `Telefoon: ${telefoon}` : '',
      ``,
      `Vraag:`,
      vraag,
      ``,
      `---`,
      `Dit bericht is verzonden via het contactformulier op groeirichting.nl`
    ].filter(Boolean).join('\n');

    // Stuur naar jezelf (vervang met je eigen email)
    const emailResponse = await resend.emails.send({
      from: 'GroeiRichting Contact <noreply@groeirichting.nl>',
      to: process.env.CONTACTFORMULIER || 'rick@groeirichting.nl', // Vervang met je eigen email
      subject: `Contactformulier: ${naam}`,
      html: htmlBody,
      text: textBody
    });

    console.log('Contact e-mail verzonden naar:', process.env.CONTACTFORMULIER || 'rick@groeirichting.nl', '| ID:', emailResponse.id);
    
    return res.status(200).json({ 
      success: true, 
      message: 'Je bericht is succesvol verzonden! We nemen zo snel mogelijk contact met je op.' 
    });

  } catch (error) {
    console.error('Fout bij verzenden contact e-mail:', error.message);
    return res.status(500).json({ 
      error: 'Er is iets misgegaan bij het versturen van je bericht. Probeer het later opnieuw.' 
    });
  }
});

module.exports = router;
