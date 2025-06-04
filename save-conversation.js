// 📁 save-conversation.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { containsSensitiveInfo } = require('./utils/filterInput.js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  const { employee_id, theme_id, antwoorden } = req.body;

  if (!employee_id || !theme_id || !Array.isArray(antwoorden)) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  for (const { vraag_id, antwoord } of antwoorden) {
    const check = containsSensitiveInfo(antwoord);
    if (check.flagged) {
      return res.status(400).json({
        error: 'Antwoord bevat gevoelige gegevens en is niet opgeslagen.',
        reason: check.reason,
      });
    }

    const { error } = await supabase
      .from('gesprekken')
      .insert([{ employee_id, theme_id, vraag_id, antwoord }]);

    if (error) {
      return res.status(500).json({ error: 'Opslaan mislukt', detail: error.message });
    }
  }

  return res.status(200).json({ success: true });
});

module.exports = router;
