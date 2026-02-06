const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('./services/mailer/mailer');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// BCC email adres (kan via env var, anders default)
const BCC_EMAIL = process.env.BROCHURE_BCC_EMAIL || 'rick@groeirichting.nl';

router.post('/', async (req, res) => {
  const { naam, email } = req.body;

  // Validatie
  if (!naam || !email) {
    return res.status(400).json({ 
      error: 'Naam en e-mailadres zijn verplicht.' 
    });
  }

  // Email validatie
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      error: 'Ongeldig e-mailadres.' 
    });
  }

  let lead = null;

  try {
    // 1. Sla lead op in database
    const { data: leadData, error: dbError } = await supabase
      .from('brochure_leads')
      .insert({
        naam: naam.trim(),
        email: email.trim().toLowerCase(),
        email_status: 'pending'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Ga door met email verzenden, ook als database insert faalt
    } else {
      lead = leadData;
    }

    // 2. Lees brochure PDF van schijf
    const brochurePath = path.join(__dirname, 'brochures', 'groeiRichting-infodocu.pdf');
    
    if (!fs.existsSync(brochurePath)) {
      console.error('Brochure bestand niet gevonden:', brochurePath);
      return res.status(500).json({ 
        error: 'Brochure bestand niet gevonden. Neem contact op met de beheerder.' 
      });
    }

    const pdfBuffer = fs.readFileSync(brochurePath);

    // 3. Email template
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9fafb; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .button { display: inline-block; padding: 12px 24px; background-color: #1e40af; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Bedankt voor je interesse!</h1>
          </div>
          <div class="content">
            <p>Beste ${naam},</p>
            <p>Bedankt voor je interesse in GroeiRichting!</p>
            <p>In de bijlage vind je onze informatiebrochure met meer details over hoe we organisaties helpen om medewerkerstevredenheid te verbeteren en een cultuur van groei te creëren.</p>
            <p>Heb je vragen of wil je een vrijblijvend gesprek inplannen? Neem gerust contact met ons op.</p>
            <div style="text-align: center;">
              <a href="https://groeirichting.nl/contact" class="button">Plan een gesprek</a>
            </div>
          </div>
          <div class="footer">
            <p>Met vriendelijke groet,<br>Het GroeiRichting team</p>
            <p>GroeiRichting B.V.<br>Schutstraat 145, 7906 AG Hoogeveen</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Beste ${naam},

Bedankt voor je interesse in GroeiRichting!

In de bijlage vind je onze informatiebrochure met meer details over hoe we organisaties helpen om medewerkerstevredenheid te verbeteren en een cultuur van groei te creëren.

Heb je vragen of wil je een vrijblijvend gesprek inplannen? Neem gerust contact met ons op via https://groeirichting.nl/contact

Met vriendelijke groet,
Het GroeiRichting team

GroeiRichting B.V.
Schutstraat 145, 7906 AG Hoogeveen
    `.trim();

    // 4. Verstuur brochure naar lead (zonder BCC – Resend levert BCC niet betrouwbaar)
    const emailResult = await sendEmail({
      to: email.trim().toLowerCase(),
      subject: 'Je GroeiRichting informatiebrochure',
      html: htmlContent,
      text: textContent,
      attachments: [{
        content: pdfBuffer,
        filename: 'groeiRichting-infodocu.pdf',
        contentType: 'application/pdf'
      }],
      tag: 'BROCHURE_REQUEST',
      metadata: {
        source: 'brochure_download',
        lead_id: lead?.id || null
      }
    });

    // 4b. Aparte meldingsmail naar jou (zonder bijlage) – BCC bij Resend komt vaak niet aan
    const notifHtml = `
      <p>Er is een nieuwe brochure-aanvraag:</p>
      <ul>
        <li><strong>Naam:</strong> ${naam}</li>
        <li><strong>E-mail:</strong> ${email.trim().toLowerCase()}</li>
      </ul>
      <p>De brochure is naar de lead gestuurd.</p>
    `;
    try {
      await sendEmail({
        to: BCC_EMAIL,
        subject: '[GroeiRichting] Nieuwe brochure-aanvraag: ' + naam,
        html: notifHtml,
        text: `Nieuwe brochure-aanvraag: ${naam} (${email.trim().toLowerCase()}). De brochure is naar de lead gestuurd.`,
        tag: 'BROCHURE_NOTIFY',
        metadata: { source: 'brochure_download', lead_id: lead?.id || null }
      });
    } catch (notifErr) {
      console.error('Brochure-meldingsmail naar jou mislukt (lead kreeg wel brochure):', notifErr.message);
    }

    // 5. Update lead status in database
    if (lead?.id) {
      await supabase
        .from('brochure_leads')
        .update({
          email_status: 'sent',
          email_verzonden_op: new Date().toISOString(),
          message_id: emailResult.messageId
        })
        .eq('id', lead.id);
    }

    console.log(`Brochure email verzonden naar: ${email} | Message ID: ${emailResult.messageId}`);

    return res.status(200).json({ 
      success: true, 
      message: 'Brochure is verzonden naar je email. Check je inbox!' 
    });

  } catch (error) {
    console.error('Fout bij verzenden brochure email:', error);

    // Update lead status naar failed als lead bestaat
    if (lead?.id) {
      await supabase
        .from('brochure_leads')
        .update({
          email_status: 'failed'
        })
        .eq('id', lead.id);
    }

    return res.status(500).json({ 
      error: 'Er is iets misgegaan bij het versturen van de brochure. Probeer het later opnieuw.' 
    });
  }
});

module.exports = router;

