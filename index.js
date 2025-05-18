
const express = require('express');
const dotenv = require('dotenv');
const { Resend } = require('resend');

dotenv.config();
const app = express();
const cors = require('cors');
app.use(cors());
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);

app.post('/api/send-invite', async (req, res) => {
  const { to, name, employerId } = req.body;

  if (!to || !name || !employerId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const registerUrl = `https://groeirichting.nl/registreer-werknemer?email=${encodeURIComponent(to)}&employer=${employerId}`;

  try {
    const emailResponse = await resend.emails.send({
      from: 'GroeiRichting <noreply@groeirichting.nl>',
      to,
      subject: 'Je bent uitgenodigd voor GroeiRichting',
      html: `
        <p>Hallo ${name},</p>
        <p>Je werkgever heeft je uitgenodigd voor GroeiRichting.</p>
        <p><a href="${registerUrl}">Klik hier om je aan te melden</a></p>
      `,
    });

    res.status(200).json({ success: true, id: emailResponse.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log('API draait op http://localhost:3000'));
