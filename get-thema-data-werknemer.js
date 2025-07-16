const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { getThemaDataVoorWerknemer } = require('./utils/gesprekDatumService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/get-thema-data-werknemer/:werknemer_id
// Haal alle thema data op voor een werknemer inclusief werkgever configuratie
router.get('/:werknemer_id', async (req, res) => {
  const { werknemer_id } = req.params;

  if (!werknemer_id) {
    return res.status(400).json({ error: 'werknemer_id is verplicht' });
  }

  try {
    // Verifieer dat de gebruiker bestaat
    const { data: gebruiker, error: gebruikerError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', werknemer_id)
      .single();

    if (gebruikerError) {
      if (gebruikerError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Werknemer niet gevonden' });
      }
      throw gebruikerError;
    }

    if (gebruiker.role !== 'employee') {
      return res.status(403).json({ error: 'Alleen werknemers kunnen deze data ophalen' });
    }

    // Haal thema data op met werkgever configuratie
    const themaData = await getThemaDataVoorWerknemer(werknemer_id);

    res.json({
      success: true,
      thema_data: themaData
    });

  } catch (error) {
    console.error('Fout bij ophalen thema data voor werknemer:', error);
    res.status(500).json({ 
      error: 'Interne serverfout', 
      detail: error.message 
    });
  }
});

module.exports = router; 