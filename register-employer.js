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

  // 5. Stuur notificatie naar admin over nieuwe werkgever registratie
  try {
    // Haal email template op
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('id, naam, onderwerp, html_content, text_content')
      .eq('trigger_event', 'nieuw_account')
      .eq('is_active', true)
      .single();

    if (!templateError && template) {
      // Vervang variabelen in template
      const variabelen = {
        bedrijfsnaam: company_name,
        voornaam: first_name,
        tussenvoegsel: middle_name || '',
        achternaam: last_name,
        volledige_naam: `${first_name}${middle_name ? ' ' + middle_name : ''} ${last_name}`,
        email: email,
        telefoon: contact_phone || 'Niet opgegeven',
        datum: new Date().toLocaleDateString('nl-NL', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };

      let htmlContent = template.html_content;
      let textContent = template.text_content;

      // Vervang alle variabelen
      Object.keys(variabelen).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        htmlContent = htmlContent.replace(regex, variabelen[key]);
        textContent = textContent.replace(regex, variabelen[key]);
      });

      // Verstuur email naar admin
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'info@groeirichting.nl',
        subject: template.onderwerp,
        html: htmlContent,
        text: textContent,
        tag: 'NEW_EMPLOYER_REGISTRATION',
        metadata: {
          template_id: template.id,
          company_name,
          email,
          pending_employer_id: pendingEmployer.id
        }
      });

      console.log(`Admin notificatie verzonden voor nieuwe werkgever: ${company_name} (${email})`);
    } else {
      console.warn('Email template "nieuw_account" niet gevonden of niet actief. Admin notificatie niet verstuurd.');
    }
  } catch (emailError) {
    // Log fout maar blokkeer registratie niet
    console.error('Fout bij versturen admin notificatie:', emailError.message);
  }

  // 6. Supabase verstuurt automatisch verificatie-e-mail bij email_confirm: true

  // 7. Registratie voltooid - return direct success
  // Welkomstmail wordt nu automatisch verstuurd via email triggers na verificatie

  return res.status(200).json({ 
    success: true, 
    message: 'Account succesvol aangemaakt! Je ontvangt automatisch een verificatie-e-mail.',
    email: email,
    redirectUrl: `${process.env.FRONTEND_URL}/verify-email?email=${encodeURIComponent(email)}`
  });
});

// POST /api/register-employer/invitation
// Registreert een werkgever via uitnodiging (token-based)
router.post('/invitation', async (req, res) => {
  const {
    token,
    first_name,
    middle_name,
    last_name,
    password
  } = req.body;

  if (!token || !first_name || !last_name || !password) {
    return res.status(400).json({ error: 'Niet alle verplichte velden zijn ingevuld.' });
  }

  // 1. Token controleren en gegevens ophalen
  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .select('email, employer_id, status, invite_role')
    .eq('token', token)
    .single();

  if (invitationError || !invitation || invitation.status !== 'pending') {
    return res.status(400).json({ error: 'Ongeldige of verlopen uitnodiging.' });
  }

  // Controleer dat dit een werkgever uitnodiging is
  if (invitation.invite_role !== 'employer') {
    return res.status(400).json({ error: 'Deze uitnodiging is niet voor een werkgever.' });
  }

  // 2. Controleer of employer bestaat
  const { data: employer, error: employerError } = await supabase
    .from('employers')
    .select('id, company_name')
    .eq('id', invitation.employer_id)
    .single();

  if (employerError || !employer) {
    return res.status(400).json({ error: 'Werkgever niet gevonden voor deze uitnodiging.' });
  }

  // 3. Controleer of gebruiker al bestaat
  const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    return res.status(500).json({ error: 'Fout bij controleren bestaande gebruikers.' });
  }
  
  const existingUser = existingUsers.users.find(user => user.email === invitation.email);
  
  if (existingUser) {
    // Verwijder bestaande gebruiker uit Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
    
    if (deleteError) {
      return res.status(400).json({ 
        error: 'Gebruiker bestaat al. Probeer het over een paar minuten opnieuw, of neem contact op met support.' 
      });
    }
  }

  // 4. Maak nieuwe Supabase Auth gebruiker aan via signUp (vereist email verificatie)
  const { data: authUser, error: authError } = await supabaseAnon.auth.signUp({
    email: invitation.email,
    password,
    options: {
      emailRedirectTo: `${process.env.FRONTEND_URL}/na-verificatie`
    }
  });

  if (authError || !authUser?.user?.id) {
    return res.status(400).json({ 
      error: 'Account aanmaken mislukt: ' + (authError?.message || 'Onbekende fout') 
    });
  }

  const userId = authUser.user.id;

  // 5. Sla pending employer data op (wordt gebruikt door provisioning na verificatie)
  const { data: pendingEmployer, error: pendingError } = await supabase
    .from('pending_employers')
    .insert({
      user_id: userId,
      company_name: employer.company_name, // Gebruik company_name van bestaande employer
      contact_phone: null,
      first_name,
      middle_name: middle_name || null,
      last_name,
      status: 'pending_verification',
      employer_id: invitation.employer_id // Sla employer_id op voor provisioning
    })
    .select()
    .single();

  if (pendingError) {
    console.error('❌ Error creating pending employer:', pendingError);
    return res.status(500).json({ error: pendingError.message || 'Opslaan in database mislukt.' });
  }

  // 6. Uitnodiging bijwerken naar 'accepted' (maar user moet nog verifiëren)
  await supabase
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('token', token);

  return res.status(200).json({ 
    success: true,
    message: 'Account succesvol aangemaakt! Je ontvangt automatisch een verificatie-e-mail.',
    email: invitation.email,
    redirectUrl: `${process.env.FRONTEND_URL}/verify-email?email=${encodeURIComponent(invitation.email)}`
  });
});

module.exports = router;  