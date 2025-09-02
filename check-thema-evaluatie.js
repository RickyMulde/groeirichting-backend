const { createClient } = require('@supabase/supabase-js');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Alleen GET requests zijn toegestaan' });
  }

  try {
    const { gesprek_id } = req.query;

    // Validatie van input
    if (!gesprek_id) {
      return res.status(400).json({ 
        error: 'gesprek_id parameter is verplicht' 
      });
    }

    // Gebruik de input direct (zoals andere endpoints)
    const filteredGesprekId = gesprek_id;

    // Controleer of er al een evaluatie bestaat voor dit gesprek
    const { data: evaluatie, error: checkError } = await supabase
      .from('thema_evaluaties')
      .select('id, score, evaluatie_datum')
      .eq('gesprek_id', filteredGesprekId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = geen rijen gevonden
      console.error('Fout bij controleren evaluatie:', checkError);
      return res.status(500).json({ 
        error: 'Fout bij controleren evaluatie' 
      });
    }

    // Als er geen evaluatie is, return false
    if (!evaluatie) {
      return res.status(200).json({
        heeft_evaluatie: false,
        evaluatie: null
      });
    }

    // Als er wel een evaluatie is, return de data
    return res.status(200).json({
      heeft_evaluatie: true,
      evaluatie: {
        id: evaluatie.id,
        score: evaluatie.score,
        evaluatie_datum: evaluatie.evaluatie_datum
      }
    });

  } catch (error) {
    console.error('Onverwachte fout bij controleren thema evaluatie:', error);
    return res.status(500).json({ 
      error: 'Er is een onverwachte fout opgetreden' 
    });
  }
};
