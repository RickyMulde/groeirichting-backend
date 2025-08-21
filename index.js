// 📁 Bestand: index.js
const express = require('express');
const dotenv = require('dotenv');
const { Resend } = require('resend');
const cors = require('cors');

const registerEmployee = require('./register-employee');
const registerEmployer = require('./register-employer');
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

console.log("🚀 Force redeploy: verbeterde HTML + fallback");

dotenv.config();
const app = express();

const allowedOrigins = ['https://groeirichting-frontend.onrender.com'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

app.use('/api/register-employer', registerEmployer);
app.use('/api/register-employee', registerEmployee);
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

const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/api/send-invite', async (req, res) => {
  const { to, name, employerId, token, functieOmschrijving } = req.body;

  console.log('Verzoek ontvangen voor:', { to, name, employerId, token, functieOmschrijving });

  if (!to || !name || !employerId || !token) {
    console.warn('Verzoek geweigerd: ontbrekende velden');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Update de invitation met de functie_omschrijving
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: updateError } = await supabase
      .from('invitations')
      .update({ functie_omschrijving: functieOmschrijving || null })
      .eq('token', token);

    if (updateError) {
      console.error('Fout bij updaten functie_omschrijving:', updateError);
    }
  } catch (error) {
    console.error('Fout bij database update:', error);
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://groeirichting.nl';
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
    const emailResponse = await resend.emails.send({
      from: 'GroeiRichting <noreply@groeirichting.nl>',
      to,
      subject: 'Je bent uitgenodigd voor GroeiRichting',
      html: htmlBody,
      text: textBody
    });

    console.log('E-mail verzonden naar:', to, '| ID:', emailResponse.id);
    res.status(200).json({ success: true, id: emailResponse.id });
  } catch (error) {
    console.error('Fout bij verzenden e-mail:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('API draait op http://localhost:3000'));
