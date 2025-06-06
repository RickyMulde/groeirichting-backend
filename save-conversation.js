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

  console.log('Ontvangen gesprek data:', {
    employee_id,
    theme_id,
    aantal_antwoorden: antwoorden?.length
  });
  console.log('Antwoorden:', antwoorden);

  if (!employee_id || !theme_id || !Array.isArray(antwoorden)) {
    console.error('Verplichte velden ontbreken:', { employee_id, theme_id, antwoorden });
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  for (const { vraag_id, antwoord } of antwoorden) {
    console.log('Verwerken antwoord:', { vraag_id, antwoord });

    const check = containsSensitiveInfo(antwoord);
    if (check.flagged) {
      console.error('Gevoelige informatie gedetecteerd:', check.reason);
      return res.status(400).json({
        error: 'Antwoord bevat gevoelige gegevens en is niet opgeslagen.',
        reason: check.reason,
      });
    }

    console.log('Opslaan in database:', { employee_id, theme_id, vraag_id, antwoord });
    const { error } = await supabase
      .from('gesprekken')
      .insert([{ employee_id, theme_id, vraag_id, antwoord }]);

    if (error) {
      console.error('Fout bij opslaan antwoord:', error);
      return res.status(500).json({ error: 'Opslaan mislukt', detail: error.message });
    }
    console.log('Antwoord succesvol opgeslagen');
  }

  console.log('Alle antwoorden succesvol opgeslagen');
  return res.status(200).json({ success: true });
});

module.exports = router;
