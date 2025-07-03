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
    // Haal gespreksgeschiedenis op uit nieuwe tabel
    const { data, error } = await supabase
      .from('gesprekken_compleet')
      .select('gespreksgeschiedenis')
      .eq('gesprek_id', gesprek_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Gesprek niet gevonden' });
      }
      throw error;
    }

    if (!data || !data.gespreksgeschiedenis) {
      // Geen gespreksgeschiedenis gevonden, retourneer lege array
      console.log(`Geen gespreksgeschiedenis gevonden voor gesprek_id: ${gesprek_id}`);
      return res.json({ antwoorden: [] });
    }

    // Converteer naar het verwachte formaat voor backward compatibility
    const antwoorden = data.gespreksgeschiedenis.map(item => ({
      vraag: item.vraag_tekst,
      antwoord: item.antwoord,
      type: item.type,
      vraag_id: item.vraag_id,
      hoort_bij_vraag_id: item.hoort_bij_vraag_id,
      timestamp: item.timestamp,
      volgorde: item.volgorde
    }));

    console.log(`Gespreksgeschiedenis opgehaald voor gesprek_id: ${gesprek_id}, ${antwoorden.length} antwoorden`);
    return res.json({ antwoorden });
  } catch (err) {
    console.error('Fout bij ophalen gespreksgeschiedenis:', err);
    return res.status(500).json({ error: 'Interne serverfout' });
  }
});

module.exports = router;
