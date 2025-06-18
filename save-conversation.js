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
  const {
    werknemer_id,
    theme_id,
    gesprek_id,
    theme_question_id,
    antwoord,
    is_vaste_vraag,
    hoort_bij_question_id,
    status // optioneel
  } = req.body;

  const now = new Date().toISOString();

  if (!werknemer_id || !theme_id) {
    return res.status(400).json({ error: 'werknemer_id en theme_id zijn verplicht.' });
  }

  try {
    // 1️⃣ Gesprek aanmaken
    if (!gesprek_id && !theme_question_id && status === 'Nog niet afgerond') {
      const { data, error } = await supabase
        .from('gesprek')
        .insert([{
          werknemer_id,
          theme_id,
          gestart_op: now,
          status: 'Nog niet afgerond',
          taalcode: 'nl',
          aangemaakt_op: now
        }])
        .select();

      if (error) {
        console.error('Fout bij aanmaken gesprek:', error);
        return res.status(500).json({ error: 'Gesprek aanmaken mislukt', detail: error.message });
      }

      return res.status(200).json({ gesprek_id: data[0].id });
    }

    // 2️⃣ Gesprek afsluiten
    if (gesprek_id && status === 'Afgerond') {
      const { afrondingsreden } = req.body;
      
      if (!afrondingsreden || !['MAX_ANTWOORDEN', 'VOLDENDE_DUIDELIJK'].includes(afrondingsreden)) {
        return res.status(400).json({ 
          error: 'Ongeldige afrondingsreden. Moet MAX_ANTWOORDEN of VOLDENDE_DUIDELIJK zijn.' 
        });
      }

      const { error } = await supabase
        .from('gesprek')
        .update({
          beeindigd_op: now,
          status: 'Afgerond',
          afrondingsreden
        })
        .eq('id', gesprek_id);

      if (error) {
        console.error('Fout bij afronden gesprek:', error);
        return res.status(500).json({ error: 'Gesprek afronden mislukt', detail: error.message });
      }

      return res.status(200).json({ success: true, message: 'Gesprek afgerond' });
    }

    // 3️⃣ Antwoord opslaan
    if (gesprek_id && antwoord !== undefined) {
      const check = containsSensitiveInfo(antwoord);
      if (check.flagged) {
        return res.status(400).json({
          error: check.reason
        });
      }

      // Bepaal theme_question_id en hoort_bij_question_id op basis van is_vaste_vraag
      const antwoordData = {
        werknemer_id,
        theme_id,
        antwoord,
        gestart_op: now,
        beeindigd_op: now,
        taalcode: 'nl',
        status: 'verzonden',
        gesprek_id,
        is_vaste_vraag,
        theme_question_id: is_vaste_vraag ? theme_question_id : null,
        hoort_bij_question_id: is_vaste_vraag ? null : hoort_bij_question_id
      };

      const { error } = await supabase
        .from('antwoordpervraag')
        .insert([antwoordData]);

      if (error) {
        console.error('Fout bij opslaan antwoord:', error);
        return res.status(500).json({ error: 'Opslaan mislukt', detail: error.message });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Ongeldig verzoek. Verplichte velden ontbreken of incorrecte combinatie.' });

  } catch (e) {
    console.error('Onverwachte fout:', e);
    return res.status(500).json({ error: 'Interne serverfout', detail: e.message });
  }
});

module.exports = router;
