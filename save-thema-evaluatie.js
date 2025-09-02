const { createClient } = require('@supabase/supabase-js');
const { filterInput } = require('./utils/filterInput');

// Supabase configuratie
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase configuratie ontbreekt');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Alleen POST requests zijn toegestaan' });
  }

  try {
    const { werknemer_id, theme_id, gesprek_id, score } = req.body;

    // Validatie van input
    if (!werknemer_id || !theme_id || !gesprek_id || !score) {
      return res.status(400).json({ 
        error: 'Alle velden zijn verplicht: werknemer_id, theme_id, gesprek_id, score' 
      });
    }

    // Score moet tussen 1 en 10 zijn
    if (!Number.isInteger(score) || score < 1 || score > 10) {
      return res.status(400).json({ 
        error: 'Score moet een geheel getal tussen 1 en 10 zijn' 
      });
    }

    // Filter gevoelige data
    const filteredWerknemerId = filterInput(werknemer_id);
    const filteredThemeId = filterInput(theme_id);
    const filteredGesprekId = filterInput(gesprek_id);

    // Verifieer dat het gesprek bestaat en bij de werknemer hoort
    const { data: gesprekData, error: gesprekError } = await supabase
      .from('gesprek')
      .select('id, werknemer_id, theme_id, status')
      .eq('id', filteredGesprekId)
      .eq('werknemer_id', filteredWerknemerId)
      .eq('theme_id', filteredThemeId)
      .single();

    if (gesprekError || !gesprekData) {
      return res.status(404).json({ 
        error: 'Gesprek niet gevonden of geen toegang' 
      });
    }

    if (gesprekData.status !== 'Afgerond') {
      return res.status(400).json({ 
        error: 'Gesprek is nog niet afgerond' 
      });
    }

    // Controleer of er al een evaluatie bestaat voor dit gesprek
    const { data: bestaandeEvaluatie, error: checkError } = await supabase
      .from('thema_evaluaties')
      .select('id')
      .eq('gesprek_id', filteredGesprekId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = geen rijen gevonden
      console.error('Fout bij controleren bestaande evaluatie:', checkError);
      return res.status(500).json({ 
        error: 'Fout bij controleren bestaande evaluatie' 
      });
    }

    if (bestaandeEvaluatie) {
      return res.status(409).json({ 
        error: 'Er bestaat al een evaluatie voor dit gesprek' 
      });
    }

    // Sla de evaluatie op
    const { data: nieuweEvaluatie, error: insertError } = await supabase
      .from('thema_evaluaties')
      .insert({
        werknemer_id: filteredWerknemerId,
        theme_id: filteredThemeId,
        gesprek_id: filteredGesprekId,
        score: score,
        evaluatie_datum: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Fout bij opslaan evaluatie:', insertError);
      return res.status(500).json({ 
        error: 'Fout bij opslaan van de evaluatie' 
      });
    }

    console.log('Thema evaluatie opgeslagen:', nieuweEvaluatie);

    return res.status(200).json({
      success: true,
      evaluatie_id: nieuweEvaluatie.id,
      message: 'Evaluatie succesvol opgeslagen'
    });

  } catch (error) {
    console.error('Onverwachte fout bij opslaan thema evaluatie:', error);
    return res.status(500).json({ 
      error: 'Er is een onverwachte fout opgetreden' 
    });
  }
};
