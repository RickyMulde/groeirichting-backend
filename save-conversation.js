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
  const { employee_id, theme_id, antwoorden, is_afgerond } = req.body;

  console.log('Ontvangen gesprek data:', {
    employee_id,
    theme_id,
    aantal_antwoorden: antwoorden?.length,
    is_afgerond
  });
  console.log('Antwoorden:', antwoorden);

  if (!employee_id || !theme_id || !Array.isArray(antwoorden)) {
    console.error('Verplichte velden ontbreken:', { employee_id, theme_id, antwoorden });
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  try {
    // Eerst een gesprek record aanmaken
    const now = new Date().toISOString();
    const { data: gesprekData, error: gesprekError } = await supabase
      .from('gesprek')
      .insert([{
        werknemer_id: employee_id,
        theme_id,
        gestart_op: now,
        beeindigd_op: now,
        status: is_afgerond ? 'Afgerond' : 'Nog niet afgerond',
        taalcode: 'nl'
      }])
      .select();

    if (gesprekError) {
      console.error('Fout bij aanmaken gesprek:', gesprekError);
      return res.status(500).json({ 
        error: 'Gesprek aanmaken mislukt', 
        detail: gesprekError.message 
      });
    }

    const gesprekId = gesprekData[0].id;

    // Dan de antwoorden opslaan
    for (const { vraag, antwoord } of antwoorden) {
      console.log('Verwerken antwoord:', { vraag, antwoord });

      const check = containsSensitiveInfo(antwoord);
      if (check.flagged) {
        console.error('Gevoelige informatie gedetecteerd:', check.reason);
        return res.status(400).json({
          error: 'Antwoord bevat gevoelige gegevens en is niet opgeslagen.',
          reason: check.reason,
        });
      }

      console.log('Opslaan in database:', { 
        werknemer_id: employee_id, 
        theme_id, 
        vraag,
        antwoord,
        gestart_op: now,
        beeindigd_op: now,
        taalcode: 'nl',
        gesprek_id: gesprekId
      });

      const { data, error } = await supabase
        .from('antwoordpervraag')
        .insert([{ 
          werknemer_id: employee_id, 
          theme_id, 
          vraag,
          antwoord,
          gestart_op: now,
          beeindigd_op: now,
          taalcode: 'nl',
          gesprek_id: gesprekId
        }])
        .select();

      if (error) {
        console.error('Fout bij opslaan antwoord:', error);
        return res.status(500).json({ 
          error: 'Opslaan mislukt', 
          detail: error.message,
          code: error.code,
          hint: error.hint
        });
      }
      console.log('Antwoord succesvol opgeslagen:', data);
    }

    console.log('Alle antwoorden succesvol opgeslagen');
    return res.status(200).json({ success: true, gesprek_id: gesprekId });
  } catch (e) {
    console.error('Onverwachte fout bij opslaan gesprek:', e);
    return res.status(500).json({ 
      error: 'Interne serverfout', 
      detail: e.message,
      stack: e.stack
    });
  }
});

module.exports = router;
