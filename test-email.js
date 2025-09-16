const express = require('express');
const router = express.Router();
const { sendEmail } = require('./services/mailer/mailer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// POST /api/test-email - Testmail versturen
router.post('/', async (req, res) => {
  try {
    const { template_id, test_data } = req.body;
    
    // Haal template op
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', template_id)
      .single();
    
    if (error) throw error;
    
    // Vervang variabelen in template
    let htmlContent = template.html_content;
    let textContent = template.text_content;
    
    if (test_data) {
      Object.keys(test_data).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        htmlContent = htmlContent.replace(regex, test_data[key]);
        textContent = textContent.replace(regex, test_data[key]);
      });
    }
    
    // Verstuur testmail
    const result = await sendEmail({
      to: 'info@groeirichting.nl',
      subject: `[TEST] ${template.onderwerp}`,
      html: htmlContent,
      text: textContent,
      tag: 'TEST_EMAIL',
      metadata: { template_id, test: true }
    });
    
    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
