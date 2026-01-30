// 📁 Bestand: index.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { sendEmail } = require('./services/mailer/mailer');

// 🚨 BELANGRIJK: Laad omgevingsvariabelen VOORDAT je ze gebruikt!
if (!process.env.RENDER) {
  dotenv.config({ path: `.env.${process.env.APP_ENV || 'test'}` });
}

const registerEmployee = require('./register-employee');
const registerEmployer = require('./register-employer'); // Hergeactiveerd voor database-driven flow
const checkVerification = require('./check-verification');
const createThemeWithQuestions = require('./create-theme-with-questions');
const saveConversation = require('./save-conversation');
const getConversationAnswers = require('./get-conversation-answers');
const decideFollowup = require('./decide-followup'); // ✅ Nieuw toegevoegd
const genereerSamenvatting = require('./genereer-samenvatting'); // ✅ Nieuw toegevoegd
const genereerVervolgacties = require('./genereer-vervolgacties'); // ✅ Nieuw toegevoegd
const getSamenvatting = require('./get-samenvatting'); // ✅ Nieuw toegevoegd
const getOrganisationThemes = require('./get-organisation-themes'); // ✅ Nieuw toegevoegd
const getOrganisationSummary = require('./get-organisation-summary'); // ✅ Nieuw toegevoegd
const generateOrganisationSummary = require('./generate-organisation-summary'); // ✅ Nieuw toegevoegd
const werkgeverGesprekInstellingen = require('./werkgever-gesprek-instellingen'); // ✅ Nieuw toegevoegd
const employerThemes = require('./employer-themes'); // ✅ Nieuw toegevoegd
const getThemaDataWerknemer = require('./get-thema-data-werknemer'); // ✅ Nieuw toegevoegd
const verwijderOudeGesprekken = require('./verwijder-oude-gesprekken'); // ✅ Nieuw toegevoegd
const getGespreksresultatenBulk = require('./get-gespreksresultaten-bulk'); // ✅ Nieuw toegevoegd
const autoGenerateSummaries = require('./auto-generate-summaries'); // ✅ Nieuw toegevoegd
const { router: generateTopActionsRouter } = require('./generate-top-actions'); // ✅ Nieuw toegevoegd
const saveThemaEvaluatie = require('./save-thema-evaluatie'); // ✅ Nieuw toegevoegd
const checkThemaEvaluatie = require('./check-thema-evaluatie'); // ✅ Nieuw toegevoegd
const contact = require('./contact'); // ✅ Nieuw toegevoegd
const brochureRequest = require('./brochure-request'); // ✅ Nieuw toegevoegd voor brochure downloads
const teams = require('./teams'); // ✅ Nieuw toegevoegd voor team management
const emailTemplates = require('./email-templates'); // ✅ Nieuw toegevoegd voor email templates
const emailQueue = require('./email-queue'); // ✅ Nieuw toegevoegd voor email queue
const testEmail = require('./test-email'); // ✅ Nieuw toegevoegd voor test emails
const adminUsers = require('./admin-users'); // ✅ Nieuw toegevoegd voor admin gebruikersbeheer
const effectiveGptDoelstelling = require('./effective-gpt-doelstelling');
const { processEmailQueue, processEmailTriggers } = require('./cron-jobs'); // ✅ Nieuw toegevoegd voor queue processing
// const auth = require('./auth'); // Uitgeschakeld - frontend gebruikt direct Supabase Auth

// Server starting...

// 🛡️ PRODUCTIE BEVEILIGING - Controleer of je bewust in productie werkt
if (process.env.CONFIRM_PRODUCTION === 'YES') {
  // Productieomgeving gedetecteerd - extra voorzichtigheid vereist
  // Optioneel: wacht 3 seconden om bewustzijn te creëren
  setTimeout(() => {
    // Server start nu in productieomgeving
  }, 3000);
}

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://groeirichting-frontend.onrender.com',
  'https://groeirichting.nl',
  'http://localhost:5173', // Voor lokale ontwikkeling
  'http://localhost:3000'  // Voor lokale ontwikkeling
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// 🛡️ Rate Limiting Middleware
// Algemene rate limiter voor alle requests
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuten
  max: 1000, // 1000 requests per 15 minuten per IP (verhoogd voor testen met meerdere werknemers)
  message: {
    error: 'Te veel requests van dit IP-adres, probeer het over 15 minuten opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strenge limiter voor registratie endpoints
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 uur
  max: 20, // 20 registraties per uur per IP
  message: {
    error: 'Te veel registratiepogingen, probeer het over een uur opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Matige limiter voor verificatie en uitnodigingen
const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 uur
  max: 20, // 20 requests per uur per IP
  message: {
    error: 'Te veel verificatiepogingen, probeer het over een uur opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Lichte limiter voor health checks en debug
const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuut
  max: 30, // 30 requests per minuut per IP
  message: {
    error: 'Te veel health check requests, probeer het over een minuut opnieuw.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Pas algemene rate limiting toe op alle routes
app.use(generalLimiter);

// 📊 Request Logging Middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

app.use('/api/register-employer', registrationLimiter, registerEmployer); // Hergeactiveerd voor database-driven flow
// app.use('/api/auth', auth); // Uitgeschakeld - frontend gebruikt direct Supabase Auth
app.use('/api/register-employee', registrationLimiter, registerEmployee);
app.use('/api/check-verification', verificationLimiter, checkVerification);
app.use('/api/create-theme-with-questions', createThemeWithQuestions);
app.use('/api/save-conversation', saveConversation);
app.use('/api/get-conversation-answers', getConversationAnswers);
app.use('/api/decide-followup', decideFollowup); // ✅ Nieuwe route toegevoegd
app.use('/api/genereer-samenvatting', genereerSamenvatting); // ✅ Nieuwe route toegevoegd
app.use('/api/genereer-vervolgacties', genereerVervolgacties); // ✅ Nieuwe route toegevoegd
app.use('/api/get-samenvatting', getSamenvatting);
app.use('/api/get-gespreksresultaten-bulk', getGespreksresultatenBulk); // ✅ Nieuwe route toegevoegd
app.use('/api/organisation-themes', getOrganisationThemes); // ✅ Nieuwe route toegevoegd
app.use('/api/organisation-summary', getOrganisationSummary); // ✅ Nieuwe route toegevoegd
app.use('/api/generate-organisation-summary', generateOrganisationSummary); // ✅ Nieuwe route toegevoegd
app.use('/api/werkgever-gesprek-instellingen', werkgeverGesprekInstellingen); // ✅ Nieuwe route toegevoegd
app.use('/api/employer-themes', employerThemes); // ✅ Nieuwe route toegevoegd
app.use('/api/get-thema-data-werknemer', getThemaDataWerknemer); // ✅ Nieuwe route toegevoegd
app.use('/api/verwijder-oude-gesprekken', verwijderOudeGesprekken); // ✅ Nieuwe route toegevoegd
app.use('/api/auto-generate-summaries', autoGenerateSummaries); // ✅ Nieuwe route toegevoegd
app.use('/api/generate-top-actions', generateTopActionsRouter); // ✅ Nieuwe route toegevoegd
app.use('/api/save-thema-evaluatie', saveThemaEvaluatie); // ✅ Nieuwe route toegevoegd
app.use('/api/check-thema-evaluatie', checkThemaEvaluatie); // ✅ Nieuwe route toegevoegd
app.use('/api/contact', contact); // ✅ Nieuwe route toegevoegd
app.use('/api/brochure-request', brochureRequest); // ✅ Nieuwe route toegevoegd voor brochure downloads
app.use('/api/teams', teams); // ✅ Nieuwe route toegevoegd voor team management
app.use('/api/email-templates', emailTemplates); // ✅ Nieuwe route toegevoegd voor email templates
app.use('/api/email-queue', emailQueue); // ✅ Nieuwe route toegevoegd voor email queue
app.use('/api/test-email', testEmail); // ✅ Nieuwe route toegevoegd voor test emails
app.use('/api/admin', adminUsers); // ✅ Nieuwe route toegevoegd voor admin gebruikersbeheer
app.use('/api/effective-gpt-doelstelling', effectiveGptDoelstelling);

// 🔧 Provision employer endpoint - wordt aangeroepen na email verificatie
app.post('/api/provision-employer', async (req, res) => {
  try {
    const authz = req.headers.authorization || '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verifieer token en haal user op (met anon client)
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAnon = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
    
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = userData.user.id;

    // Insert employer via service role
    const supabase = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // Check if user already exists and is provisioned
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, employer_id, role')
      .eq('id', userId)
      .single();

    if (existingUser?.employer_id && existingUser?.role === 'employer') {
      return res.status(200).json({ success: true, employerId: existingUser.employer_id, alreadyProvisioned: true });
    }

    // Haal pending employer data op uit database
    const { data: pendingEmployer, error: pendingError } = await supabase
      .from('pending_employers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending_verification')
      .single();

    if (pendingError || !pendingEmployer) {
      return res.status(400).json({ 
        error: 'Geen pending employer data gevonden. Probeer opnieuw te registreren.' 
      });
    }

    // Check of dit een manager via uitnodiging is (check invitations tabel)
    const { data: invitation, error: invitationError } = await supabase
      .from('invitations')
      .select('employer_id, invite_role')
      .eq('email', userData.user.email)
      .eq('status', 'accepted')
      .eq('invite_role', 'employer')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let employerId;
    
    // Als er een invitation is met employer_id (manager via uitnodiging)
    if (!invitationError && invitation && invitation.employer_id) {
      // Verifieer dat de employer bestaat
      const { data: existingEmployer, error: empCheckError } = await supabase
        .from('employers')
        .select('id')
        .eq('id', invitation.employer_id)
        .single();
      
      if (empCheckError || !existingEmployer) {
        return res.status(400).json({ error: 'Werkgever niet gevonden voor deze uitnodiging.' });
      }
      
      employerId = invitation.employer_id;
    } else {
      // Normale werkgever registratie: check of employer al bestaat of maak nieuwe aan
      const { data: existingEmployer } = await supabase
        .from('employers')
        .select('id')
        .eq('contact_email', userData.user.email)
        .single();

      if (existingEmployer) {
        employerId = existingEmployer.id;
      } else {
        // Create new employer
        const { data: emp, error: empErr } = await supabase
          .from('employers')
          .insert({
            company_name: pendingEmployer.company_name,
            contact_email: userData.user.email,
            contact_phone: pendingEmployer.contact_phone || null,
            kvk_number: null
          })
          .select('id')
          .single();
          
        if (empErr) {
          return res.status(400).json({ error: 'Employer insert failed', detail: empErr.message });
        }
        employerId = emp.id;
      }
    }

    // Insert or update user profile
    const { error: userInsErr } = await supabase.from('users').upsert({
      id: userId,
      email: userData.user.email,
      role: 'employer',
      employer_id: employerId,
      first_name: pendingEmployer.first_name,
      middle_name: pendingEmployer.middle_name || null,
      last_name: pendingEmployer.last_name
    });
    
    if (userInsErr) {
      return res.status(400).json({ error: 'User insert failed', detail: userInsErr.message });
    }

    // Mark pending employer as completed
    const { error: updateError } = await supabase
      .from('pending_employers')
      .update({ status: 'completed' })
      .eq('id', pendingEmployer.id);

    if (updateError) {
      console.error('Failed to update pending employer status:', updateError);
      // Don't fail the request, just log the error
    }

    return res.status(200).json({ success: true, employerId });
    
  } catch (e) {
    return res.status(500).json({ error: 'Provisioning failed' });
  }
});

// 🏥 Healthcheck endpoint voor Render
app.get('/health', healthLimiter, (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    app_env: process.env.APP_ENV || 'test',
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// 🔍 Debug endpoint voor CORS
app.get('/api/debug', healthLimiter, (req, res) => {
  res.json({
    message: 'Backend is bereikbaar!',
    timestamp: new Date().toISOString(),
    origin: req.get('Origin'),
    userAgent: req.get('User-Agent'),
    allowedOrigins: allowedOrigins,
    frontendUrl: process.env.FRONTEND_URL,
    corsEnabled: true
  });
});

// Debug endpoint voor triggers
app.post('/api/debug/process-triggers', healthLimiter, async (req, res) => {
  try {
    await processEmailTriggers();
    res.json({ success: true, message: 'Triggers processed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resend is nu vervangen door de mailer service

app.post('/api/send-invite', verificationLimiter, async (req, res) => {
  const { to, name, employerId, token, functieOmschrijving, teamId, inviteRole, isTeamleider } = req.body;

  if (!to || !name || !employerId || !token) {
    return res.status(400).json({ error: 'Verzoek geweigerd: ontbrekende velden' });
  }

  // Bepaal de rol (default: employee)
  const role = inviteRole || 'employee';

  // Voor werknemers (inclusief teamleiders) is teamId verplicht
  if (role === 'employee' && !teamId) {
    return res.status(400).json({ error: 'teamId is verplicht voor werknemer uitnodigingen' });
  }

  // Voor teamleiders: valideer dat team bestaat en controleer of er al een teamleider is
  if (role === 'employee' && isTeamleider) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // Check of er al een teamleider is voor dit team
      const { data: existingTeamleider, error: teamleiderError } = await supabase
        .from('users')
        .select('id')
        .eq('teamleider_van_team_id', teamId)
        .eq('is_teamleider', true)
        .single();

      if (teamleiderError && teamleiderError.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Fout bij controleren bestaande teamleider' });
      }

      if (existingTeamleider) {
        return res.status(409).json({ error: 'Dit team heeft al een teamleider' });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Fout bij valideren teamleider' });
    }
  }

  // Valideer dat team bij werkgever hoort en niet gearchiveerd is (voor werknemers)
  if (role === 'employee' && teamId) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('id, werkgever_id, archived_at')
        .eq('id', teamId)
        .eq('werkgever_id', employerId)
        .single();

      if (teamError || !team) {
        return res.status(403).json({ error: 'Team niet gevonden of behoort niet tot deze organisatie' });
      }

      if (team.archived_at) {
        return res.status(403).json({ error: 'Team is gearchiveerd' });
      }
    } catch (error) {
      return res.status(500).json({ error: 'Fout bij valideren team' });
    }
  }

  // Maak nieuwe uitnodiging aan
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Bereken vervaldatum (30 dagen vanaf nu)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const invitationData = {
      email: to,
      token: token,
      employer_id: employerId,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
      invite_role: role,
      is_teamleider: role === 'employee' ? (isTeamleider || false) : false
    };

    // Voeg optionele velden toe
    if (functieOmschrijving) {
      invitationData.functie_omschrijving = functieOmschrijving;
    }
    if (teamId) {
      invitationData.team_id = teamId;
    }

    const { error: insertError } = await supabase
      .from('invitations')
      .insert(invitationData);

    if (insertError) {
      return res.status(500).json({ error: 'Fout bij aanmaken uitnodiging', details: insertError.message });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Fout bij aanmaken uitnodiging' });
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://groeirichting-frontend.onrender.com';
  
  // Bepaal registratie URL op basis van rol
  let registerUrl;
  let emailSubject;
  let emailTag;
  let emailMessage;

  if (role === 'employer') {
    registerUrl = `${frontendUrl}/registreer-werkgever?token=${token}`;
    emailSubject = 'Je bent uitgenodigd als werkgever/manager voor GroeiRichting';
    emailTag = 'INVITE_EMPLOYER';
    emailMessage = 'Je bent uitgenodigd als werkgever/manager voor GroeiRichting.';
  } else {
    registerUrl = `${frontendUrl}/registreer-werknemer?token=${token}`;
    emailSubject = 'Je bent uitgenodigd voor GroeiRichting';
    emailTag = 'INVITE_EMPLOYEE';
    emailMessage = 'Je werkgever heeft je uitgenodigd voor GroeiRichting.';
  }

  const htmlBody = [
    `<p>Hallo ${name},</p>`,
    `<p>${emailMessage}</p>`,
    `<p><a href="${registerUrl}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:underline;">Klik hier om je aan te melden</a></p>`,
    `<p style="font-size: 12px; color: #888;">Of plak deze link in je browser:<br><span style="color:#000;">${registerUrl}</span></p>`
  ].join('');

  const textBody = `Hallo ${name},

${emailMessage}
Klik op deze link om je aan te melden:
${registerUrl}`;

  try { 
    const emailResponse = await sendEmail({
      to,
      subject: emailSubject,
      html: htmlBody,
      text: textBody,
      tag: emailTag,
      metadata: { 
        employerId,
        teamId: teamId || null,
        functieOmschrijving,
        employeeName: name,
        inviteRole: role,
        isTeamleider: isTeamleider || false
      }
    });

    res.status(200).json({ success: true, id: emailResponse.messageId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🛡️ Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('API Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(500).json({
    error: 'Interne serverfout',
    ...(process.env.NODE_ENV === 'development' && { 
      details: err.message 
    })
  });
});

// Check if user exists by email (authenticated endpoint)
app.post('/api/check-user-exists', async (req, res) => {
  // Authenticatie check
  const authz = req.headers.authorization || '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const { email } = req.body;
  
  // Input validatie
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  // Email format validatie
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    // Verifieer token en haal user op
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAnon = createClient(
      process.env.SUPABASE_URL, 
      process.env.SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
    
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Alleen werkgevers mogen deze endpoint gebruiken
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, employer_id')
      .eq('id', userData.user.id)
      .single();

    if (!currentUser || currentUser.role !== 'employer') {
      return res.status(403).json({ error: 'Access denied. Only employers can check user existence.' });
    }

    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Database error checking user existence:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    // Log de actie voor audit trail
    console.log(`User existence check by employer ${currentUser.employer_id} for email: ${email}`);

    return res.status(200).json({ 
      exists: !!user
      // Geen user object teruggeven voor privacy
    });
  } catch (error) {
    console.error('Error in check-user-exists:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler - catch all routes
app.use((req, res) => {
  console.warn('404 - Endpoint niet gevonden:', {
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  res.status(404).json({
    error: 'Endpoint niet gevonden',
    path: req.originalUrl
  });
});

app.listen(3000, () => {
  console.log('🚀 API Server gestart op poort 3000');
  console.log('🌐 CORS geconfigureerd');
  console.log('📊 Logging geactiveerd');
});
