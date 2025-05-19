
const express = require('express');
const dotenv = require('dotenv');
const { Resend } = require('resend');
const cors = require('cors');
const registerEmployee = require('./routes/register-employee'); // ✅ Toegevoegd

console.log("🚀 Force redeploy: verbeterde HTML + fallback");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// ✅ Route toegevoegd
app.use('/api/register-employee', registerEmployee);

const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/api/send-invite', async (req, res) => {
  const { to, name, employerId, token } = req.body;

  console.log('Verzoek ontvangen voor:', { to, name, employerId, token });

  if (!to || !name || !employerId || !token) {
    console.warn('Verzoek geweigerd: ontbrekende velden');
    return res.status(400).json({ error: 'Missing required fields' });
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
