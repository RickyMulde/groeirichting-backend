const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { authMiddleware } = require('./middleware/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Gebruik auth middleware voor alle routes
router.use(authMiddleware);

// POST /api/werkgever-gesprek-instellingen
// Maak nieuwe configuratie aan of update bestaande
router.post('/', async (req, res) => {
  const {
    actieve_maanden,
    verplicht,
    actief,
    anonimiseer_na_dagen,
    organisatie_omschrijving
  } = req.body;
  const werkgever_id = req.ctx.employerId;

  // werkgever_id komt nu uit context, dus altijd aanwezig

  if (!actieve_maanden || !Array.isArray(actieve_maanden) || actieve_maanden.length === 0) {
    return res.status(400).json({ error: 'actieve_maanden moet een niet-lege array zijn' });
  }

  // Valideer maanden (1-12)
  const geldigeMaanden = actieve_maanden.every(maand => 
    Number.isInteger(maand) && maand >= 1 && maand <= 12
  );
  if (!geldigeMaanden) {
    return res.status(400).json({ error: 'actieve_maanden moet maanden 1-12 bevatten' });
  }

  try {
    // Check of er al een configuratie bestaat
    const { data: bestaandeConfig, error: checkError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('id')
      .eq('werkgever_id', werkgever_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    let result;
    if (bestaandeConfig) {
      // Update bestaande configuratie
      const { data, error } = await supabase
        .from('werkgever_gesprek_instellingen')
        .update({
          actieve_maanden,
          verplicht: verplicht ?? true,
          actief: actief ?? true,
          anonimiseer_na_dagen: anonimiseer_na_dagen ?? 60,
          organisatie_omschrijving: organisatie_omschrijving ?? null,
          bijgewerkt_op: new Date().toISOString()
        })
        .eq('werkgever_id', werkgever_id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Maak nieuwe configuratie aan
      const { data, error } = await supabase
        .from('werkgever_gesprek_instellingen')
        .insert({
          werkgever_id,
          actieve_maanden,
          verplicht: verplicht ?? true,
          actief: actief ?? true,
          anonimiseer_na_dagen: anonimiseer_na_dagen ?? 60,
          organisatie_omschrijving: organisatie_omschrijving ?? null
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    res.json(result);
  } catch (error) {
    console.error('Fout bij opslaan werkgever gesprek instellingen:', error);
    res.status(500).json({ error: 'Interne serverfout', detail: error.message });
  }
});

// GET /api/werkgever-gesprek-instellingen/:werkgever_id
// Haal configuratie op voor een werkgever
router.get('/:werkgever_id', async (req, res) => {
  const { werkgever_id } = req.params;
  const employerId = req.ctx.employerId;

  // Valideer dat werkgever_id overeenkomt met employerId uit context
  if (werkgever_id !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' });
  }

  try {
    const { data, error } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('*')
      .eq('werkgever_id', werkgever_id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Geen configuratie gevonden, retourneer standaard waarden
        return res.json({
          werkgever_id,
          actieve_maanden: [3, 6, 9],
          verplicht: true,
          actief: true,
          anonimiseer_na_dagen: 60,
          organisatie_omschrijving: null
        });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Fout bij ophalen werkgever gesprek instellingen:', error);
    res.status(500).json({ error: 'Interne serverfout', detail: error.message });
  }
});

// PUT /api/werkgever-gesprek-instellingen/:id
// Update specifieke configuratie
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    actieve_maanden,
    verplicht,
    actief,
    anonimiseer_na_dagen,
    organisatie_omschrijving
  } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'id is verplicht' });
  }

  try {
    const updateData = {};
    
    if (actieve_maanden !== undefined) {
      if (!Array.isArray(actieve_maanden) || actieve_maanden.length === 0) {
        return res.status(400).json({ error: 'actieve_maanden moet een niet-lege array zijn' });
      }
      updateData.actieve_maanden = actieve_maanden;
    }

    if (verplicht !== undefined) updateData.verplicht = verplicht;
    if (actief !== undefined) updateData.actief = actief;
    if (anonimiseer_na_dagen !== undefined) updateData.anonimiseer_na_dagen = anonimiseer_na_dagen;
    if (organisatie_omschrijving !== undefined) updateData.organisatie_omschrijving = organisatie_omschrijving;

    updateData.bijgewerkt_op = new Date().toISOString();

    const { data, error } = await supabase
      .from('werkgever_gesprek_instellingen')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Configuratie niet gevonden' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Fout bij updaten werkgever gesprek instellingen:', error);
    res.status(500).json({ error: 'Interne serverfout', detail: error.message });
  }
});

// GET /api/werkgever-gesprek-instellingen/:werkgever_id/taken-status
// Haal taken status op voor een werkgever
router.get('/:werkgever_id/taken-status', async (req, res) => {
  const { werkgever_id } = req.params;
  const employerId = req.ctx.employerId;

  // Valideer dat werkgever_id overeenkomt met employerId uit context
  if (werkgever_id !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' });
  }

  try {
    // Haal configuratie op
    const { data: config, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('organisatie_omschrijving, actieve_maanden, takenlijst_verborgen')
      .eq('werkgever_id', werkgever_id)
      .single();

    // Check uitnodigingen
    const { data: invitations, error: invitationsError } = await supabase
      .from('invitations')
      .select('id')
      .eq('employer_id', werkgever_id)
      .limit(1);

    if (invitationsError) {
      console.error('Fout bij ophalen uitnodigingen:', invitationsError);
    }

    // Bepaal taken status
    const taken = [
      {
        id: 'organisatie_omschrijving',
        titel: 'Vul een omschrijving van de werkzaamheden van je bedrijf/team in',
        beschrijving: 'We kunnen dan gerichtere vragen stellen en beter signaleren',
        icon: '🏢',
        voltooid: !!(config?.organisatie_omschrijving && config.organisatie_omschrijving.trim() !== ''),
        link: '/instellingen'
      },
      {
        id: 'actieve_maanden',
        titel: 'Stel in, in welke maand de gesprekken moeten plaatsvinden',
        beschrijving: 'Kies wanneer de eerste en volgende gespreksrondes plaats moeten vinden',
        icon: '📅',
        voltooid: !!(config?.actieve_maanden && Array.isArray(config.actieve_maanden) && config.actieve_maanden.length > 0),
        link: '/instellingen'
      },
      {
        id: 'uitnodigingen_versturen',
        titel: 'Nodig werknemers uit en/of maak teams aan',
        beschrijving: 'Jouw werknemers ontvangen vervolgens een uitnodiging om deel te nemen aan de gespreksrondes',
        icon: '👥',
        voltooid: !!(invitations && invitations.length > 0),
        link: '/beheer-teams-werknemers'
      }
    ];

    res.json({ 
      taken, 
      verborgen: config?.takenlijst_verborgen || false 
    });
  } catch (error) {
    console.error('Fout bij ophalen taken status:', error);
    res.status(500).json({ error: 'Interne serverfout', detail: error.message });
  }
});

// PUT /api/werkgever-gesprek-instellingen/:werkgever_id/verberg-takenlijst
// Verberg de takenlijst voor een werkgever
router.put('/:werkgever_id/verberg-takenlijst', async (req, res) => {
  const { werkgever_id } = req.params;
  const employerId = req.ctx.employerId;

  // Valideer dat werkgever_id overeenkomt met employerId uit context
  if (werkgever_id !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' });
  }

  try {
    // Check of er al een configuratie bestaat
    const { data: bestaandeConfig, error: checkError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('id')
      .eq('werkgever_id', werkgever_id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    let result;
    if (bestaandeConfig) {
      // Update bestaande configuratie
      const { data, error } = await supabase
        .from('werkgever_gesprek_instellingen')
        .update({
          takenlijst_verborgen: true,
          bijgewerkt_op: new Date().toISOString()
        })
        .eq('werkgever_id', werkgever_id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Maak nieuwe configuratie aan met verborgen takenlijst
      const { data, error } = await supabase
        .from('werkgever_gesprek_instellingen')
        .insert({
          werkgever_id,
          actieve_maanden: [3, 6, 9], // Standaard waarden
          verplicht: true,
          actief: true,
          anonimiseer_na_dagen: 60,
          organisatie_omschrijving: null,
          takenlijst_verborgen: true
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    res.json({ success: true, verborgen: true });
  } catch (error) {
    console.error('Fout bij verbergen takenlijst:', error);
    res.status(500).json({ error: 'Interne serverfout', detail: error.message });
  }
});

module.exports = router; 