const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  const { gesprek_id } = req.body;

  if (!gesprek_id) {
    return res.status(400).json({ error: 'gesprek_id is verplicht' });
  }

  try {
    // Haal de gebruiker op vanuit Supabase Auth
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Geen authorization header gevonden' });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: userInfo, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userInfo?.user) {
      return res.status(401).json({ error: 'Gebruiker niet geverifieerd' });
    }

    const user_id = userInfo.user.id;

    // Verifieer of dit gesprek bij deze werknemer hoort
    const { data: gesprekData, error: gesprekError } = await supabase
      .from('gesprek')
      .select('id, werknemer_id')
      .eq('id', gesprek_id)
      .single();

    if (gesprekError || !gesprekData) {
      return res.status(404).json({ error: 'Gesprek niet gevonden' });
    }

    if (gesprekData.werknemer_id !== user_id) {
      return res.status(403).json({ error: 'Je hebt geen toegang tot dit gesprek' });
    }

    // Haal de antwoorden op
    const { data: antwoorden, error: antwoordError } = await supabase
      .from('antwoordpervraag')
      .select('theme_question_id, antwoord')
      .eq('gesprek_id', gesprek_id)
      .order('gestart_op');

    if (antwoordError) {
      return res.status(500).json({ error: 'Fout bij ophalen antwoorden', detail: antwoordError.message });
    }

    return res.status(200).json({ antwoorden });

  } catch (e) {
    console.error('Fout in get-conversation-answers:', e);
    return res.status(500).json({ error: 'Interne serverfout', detail: e.message });
  }
});

module.exports = router;
