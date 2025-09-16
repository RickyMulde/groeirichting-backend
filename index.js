// 📁 Bestand: index.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { sendEmail } = require('./services/mailer/mailer');

// 🚨 BELANGRIJK: Laad omgevingsvariabelen VOORDAT je ze gebruikt!
if (!process.env.RENDER) {
  dotenv.config({ path: `.env.${process.env.APP_ENV || 'test'}` });
}

const registerEmployee = require('./register-employee');
// const registerEmployer = require('./register-employer'); // Uitgeschakeld - registratie nu volledig via Supabase Auth
const checkVerification = require('./check-verification');
const createThemeWithQuestions = require('./create-theme-with-questions');
const saveConversation = require('./save-conversation');
const getConversationAnswers = require('./get-conversation-answers');
const decideFollowup = require('./decide-followup'); // ✅ Nieuw toegevoegd
const genereerSamenvatting = require('./genereer-samenvatting'); // ✅ Nieuw toegevoegd
const getSamenvatting = require('./get-samenvatting'); // ✅ Nieuw toegevoegd
const getOrganisationThemes = require('./get-organisation-themes'); // ✅ Nieuw toegevoegd
const getOrganisationSummary = require('./get-organisation-summary'); // ✅ Nieuw toegevoegd
const generateOrganisationSummary = require('./generate-organisation-summary'); // ✅ Nieuw toegevoegd
const werkgeverGesprekInstellingen = require('./werkgever-gesprek-instellingen'); // ✅ Nieuw toegevoegd
const getThemaDataWerknemer = require('./get-thema-data-werknemer'); // ✅ Nieuw toegevoegd
const verwijderOudeGesprekken = require('./verwijder-oude-gesprekken'); // ✅ Nieuw toegevoegd
const getGespreksresultatenBulk = require('./get-gespreksresultaten-bulk'); // ✅ Nieuw toegevoegd
const autoGenerateSummaries = require('./auto-generate-summaries'); // ✅ Nieuw toegevoegd
const generateTopActions = require('./generate-top-actions'); // ✅ Nieuw toegevoegd
const saveThemaEvaluatie = require('./save-thema-evaluatie'); // ✅ Nieuw toegevoegd
const checkThemaEvaluatie = require('./check-thema-evaluatie'); // ✅ Nieuw toegevoegd
const contact = require('./contact'); // ✅ Nieuw toegevoegd
const teams = require('./teams'); // ✅ Nieuw toegevoegd voor team management
const emailTemplates = require('./email-templates'); // ✅ Nieuw toegevoegd voor email templates
const emailQueue = require('./email-queue'); // ✅ Nieuw toegevoegd voor email queue
const testEmail = require('./test-email'); // ✅ Nieuw toegevoegd voor test emails
const { processEmailQueue } = require('./cron-jobs'); // ✅ Nieuw toegevoegd voor queue processing
// const auth = require('./auth'); // Uitgeschakeld - frontend gebruikt direct Supabase Auth

console.log("🚀 Force redeploy: verbeterde HTML + fallback");

// 🛡️ PRODUCTIE BEVEILIGING - Controleer of je bewust in productie werkt
if (process.env.CONFIRM_PRODUCTION === 'YES') {
  console.log('⚠️  ⚠️  ⚠️  PRODUCTIE OMGEVING GEDETECTEERD ⚠️  ⚠️  ⚠️');
  console.log('🚨 Je draait nu in de PRODUCTIE omgeving!');
  console.log('🔒 Zorg ervoor dat dit bewust is en dat alle configuratie correct is.');
  console.log('📊 Database:', process.env.SUPABASE_URL || 'Niet ingesteld');
  console.log('🌐 Frontend URL:', process.env.FRONTEND_URL || 'Niet ingesteld');
  console.log('');
  
  // Optioneel: wacht 3 seconden om bewustzijn te creëren
  console.log('⏳ Wacht 3 seconden voordat de server start...');
  setTimeout(() => {
    console.log('✅ Server start nu in productieomgeving');
    console.log('');
  }, 3000);
} else {
  console.log('🧪 Testomgeving gedetecteerd - Veilig om te ontwikkelen');
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
    console.log('=== CORS DEBUG ===');
    console.log('Request origin:', origin);
    console.log('Allowed origins:', allowedOrigins);
    console.log('FRONTEND_URL env var:', process.env.FRONTEND_URL);
    console.log('==================');
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('No origin provided, allowing request');
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('Origin allowed:', origin);
      callback(null, true);
    } else {
      console.log('CORS BLOCKED origin:', origin);
      console.log('This origin is not in allowed list:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// app.use('/api/register-employer', registerEmployer); // Uitgeschakeld - registratie nu volledig via Supabase Auth
// app.use('/api/auth', auth); // Uitgeschakeld - frontend gebruikt direct Supabase Auth
app.use('/api/register-employee', registerEmployee);
app.use('/api/check-verification', checkVerification);
app.use('/api/create-theme-with-questions', createThemeWithQuestions);
app.use('/api/save-conversation', saveConversation);
app.use('/api/get-conversation-answers', getConversationAnswers);
app.use('/api/decide-followup', decideFollowup); // ✅ Nieuwe route toegevoegd
app.use('/api/genereer-samenvatting', genereerSamenvatting); // ✅ Nieuwe route toegevoegd
app.use('/api/get-samenvatting', getSamenvatting);
app.use('/api/get-gespreksresultaten-bulk', getGespreksresultatenBulk); // ✅ Nieuwe route toegevoegd
app.use('/api/organisation-themes', getOrganisationThemes); // ✅ Nieuwe route toegevoegd
app.use('/api/organisation-summary', getOrganisationSummary); // ✅ Nieuwe route toegevoegd
app.use('/api/generate-organisation-summary', generateOrganisationSummary); // ✅ Nieuwe route toegevoegd
app.use('/api/werkgever-gesprek-instellingen', werkgeverGesprekInstellingen); // ✅ Nieuwe route toegevoegd
app.use('/api/get-thema-data-werknemer', getThemaDataWerknemer); // ✅ Nieuwe route toegevoegd
app.use('/api/verwijder-oude-gesprekken', verwijderOudeGesprekken); // ✅ Nieuwe route toegevoegd
app.use('/api/auto-generate-summaries', autoGenerateSummaries); // ✅ Nieuwe route toegevoegd
app.use('/api/generate-top-actions', generateTopActions); // ✅ Nieuwe route toegevoegd
app.use('/api/save-thema-evaluatie', saveThemaEvaluatie); // ✅ Nieuwe route toegevoegd
app.use('/api/check-thema-evaluatie', checkThemaEvaluatie); // ✅ Nieuwe route toegevoegd
app.use('/api/contact', contact); // ✅ Nieuwe route toegevoegd
app.use('/api/teams', teams); // ✅ Nieuwe route toegevoegd voor team management
app.use('/api/email-templates', emailTemplates); // ✅ Nieuwe route toegevoegd voor email templates
app.use('/api/email-queue', emailQueue); // ✅ Nieuwe route toegevoegd voor email queue
app.use('/api/test-email', testEmail); // ✅ Nieuwe route toegevoegd voor test emails

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
    const { company_name, contact_phone, first_name, middle_name, last_name } = req.body;

    if (!company_name || !first_name || !last_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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
      console.log('User already provisioned:', { userId, employerId: existingUser.employer_id });
      return res.status(200).json({ success: true, employerId: existingUser.employer_id, alreadyProvisioned: true });
    }

    // Check if employer already exists for this email
    const { data: existingEmployer } = await supabase
      .from('employers')
      .select('id')
      .eq('contact_email', userData.user.email)
      .single();

    let employerId;
    if (existingEmployer) {
      employerId = existingEmployer.id;
      console.log('Using existing employer:', employerId);
    } else {
      // Create new employer
      const { data: emp, error: empErr } = await supabase
        .from('employers')
        .insert({
          company_name,
          contact_email: userData.user.email,
          contact_phone: contact_phone || null,
          kvk_number: null
        })
        .select('id')
        .single();
        
      if (empErr) {
        console.error('Employer insert failed:', empErr);
        return res.status(400).json({ error: 'Employer insert failed', detail: empErr.message });
      }
      employerId = emp.id;
    }

    // Insert or update user profile
    const { error: userInsErr } = await supabase.from('users').upsert({
      id: userId,
      email: userData.user.email,
      role: 'employer',
      employer_id: employerId,
      first_name,
      middle_name: middle_name || null,
      last_name
    });
    
    if (userInsErr) {
      console.error('User insert failed:', userInsErr);
      return res.status(400).json({ error: 'User insert failed', detail: userInsErr.message });
    }

    console.log('Employer provisioned successfully:', { userId, employerId });
    return res.status(200).json({ success: true, employerId });
    
  } catch (e) {
    console.error('Provisioning failed:', e);
    return res.status(500).json({ error: 'Provisioning failed' });
  }
});

// 🏥 Healthcheck endpoint voor Render
app.get('/health', (req, res) => {
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
app.get('/api/debug', (req, res) => {
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

// Resend is nu vervangen door de mailer service

app.post('/api/send-invite', async (req, res) => {
  const { to, name, employerId, token, functieOmschrijving, teamId } = req.body;

  console.log('Verzoek ontvangen voor:', { to, name, employerId, token, functieOmschrijving, teamId });
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  if (!to || !name || !employerId || !token) {
    console.warn('Verzoek geweigerd: ontbrekende velden', { to: !!to, name: !!name, employerId: !!employerId, token: !!token });
    return res.status(400).json({ error: 'Verzoek geweigerd: ontbrekende velden' });
  }

  if (!teamId) {
    console.warn('Verzoek geweigerd: teamId is verplicht', { teamId });
    return res.status(400).json({ error: 'teamId is verplicht' });
  }

  // Valideer dat team bij werkgever hoort en niet gearchiveerd is
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
    console.error('Fout bij valideren team:', error);
    return res.status(500).json({ error: 'Fout bij valideren team' });
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

    const { error: insertError } = await supabase
      .from('invitations')
      .insert({
        email: to,
        token: token,
        employer_id: employerId,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        functie_omschrijving: functieOmschrijving || null,
        team_id: teamId,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('Fout bij aanmaken uitnodiging:', insertError);
      return res.status(500).json({ error: 'Fout bij aanmaken uitnodiging' });
    }
  } catch (error) {
    console.error('Fout bij database insert:', error);
    return res.status(500).json({ error: 'Fout bij aanmaken uitnodiging' });
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://groeirichting-frontend.onrender.com';
  const registerUrl = `${frontendUrl}/registreer-werknemer?token=${token}`;

  const htmlBody = [
    `<p>Hallo ${name},</p>`,
    `<p>Je werkgever heeft je uitgenodigd voor GroeiRichting.</p>`,
    `<p><a href="${registerUrl}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:underline;">Klik hier om je aan te melden</a></p>`,
    `<p style="font-size: 12px; color: #888;">Of plak deze link in je browser:<br><span style="color:#000;">${registerUrl}</span></p>`
  ].join('');

  const textBody = `Hallo ${name},

Je werkgever heeft je uitgenodigd voor GroeiRichting.
Klik op deze link om je aan te melden:
${registerUrl}`;

  try { 
    const emailResponse = await sendEmail({
      to,
      subject: 'Je bent uitgenodigd voor GroeiRichting',
      html: htmlBody,
      text: textBody,
      tag: 'INVITE_EMPLOYEE',
      metadata: { 
        employerId,
        teamId,
        functieOmschrijving,
        employeeName: name
      }
    });

    console.log('E-mail verzonden naar:', to, '| ID:', emailResponse.messageId);
    res.status(200).json({ success: true, id: emailResponse.messageId });
  } catch (error) {
    console.error('Fout bij verzenden e-mail:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('API draait op http://localhost:3000'));
