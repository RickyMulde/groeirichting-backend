// 📁 Bestand: create-theme-with-questions.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  const { thema, vragen } = req.body;

  console.log('Ontvangen thema:', thema);
  console.log('Ontvangen vragen:', vragen);

  if (!thema || !vragen || !Array.isArray(vragen)) {
    return res.status(400).json({
      error: 'Verplichte velden ontbreken of verkeerd formaat.',
      ontvangen: { thema, vragen }
    });
  }

  if (vragen.length > 5) {
    return res.status(400).json({
      error: 'Er mogen maximaal 5 vragen per thema worden toegevoegd.'
    });
  }

  ['zichtbaar_vanaf', 'zichtbaar_tot'].forEach((key) => {
    if (thema[key] === '') thema[key] = null;
    if (Array.isArray(thema[key])) {
      console.warn(`⚠️ ${key} is per ongeluk een array:`, thema[key]);
      thema[key] = thema[key][0] || null;
    }
  });

  const parseableFields = ['vragenlijst', 'vervolgvragen', 'ai_configuratie', 'versiebeheer', 'verwachte_signalen'];
  parseableFields.forEach((key) => {
    try {
      if (typeof thema[key] === 'string') {
        const parsed = JSON.parse(thema[key]);
        thema[key] = parsed && typeof parsed === 'object' ? parsed : null;
      }
    } catch {
      console.warn(`⚠️ ${key} kon niet worden geparsed, veld genegeerd.`);
      thema[key] = null;
    }
  });

// Voeg de eerste 5 vragen als losse velden toe aan het thema
  const vragenVoorVelden = vragen.slice(0, 5).map((v) => v.tekst?.trim() || null);
  while (vragenVoorVelden.length < 5) vragenVoorVelden.push(null);

  thema.vraag_1 = vragenVoorVelden[0];
  thema.vraag_2 = vragenVoorVelden[1];
  thema.vraag_3 = vragenVoorVelden[2];
  thema.vraag_4 = vragenVoorVelden[3];
  thema.vraag_5 = vragenVoorVelden[4];

  try {
    
  // Als er een ID is, dan gaan we updaten in plaats van nieuw toevoegen
  if (thema.id) {
    const themeId = thema.id;

    const vragenVoorVelden = vragen.slice(0, 5).map((v) => v.tekst?.trim() || null);
    while (vragenVoorVelden.length < 5) vragenVoorVelden.push(null);

    const updatePayload = {
      ...thema,
      vraag_1: vragenVoorVelden[0],
      vraag_2: vragenVoorVelden[1],
      vraag_3: vragenVoorVelden[2],
      vraag_4: vragenVoorVelden[3],
      vraag_5: vragenVoorVelden[4],
    };

    const { error: updateError } = await supabase
      .from('themes')
      .update(updatePayload)
      .eq('id', themeId);

    if (updateError) {
      console.error('Fout bij updaten thema:', updateError);
      return res.status(500).json({ error: 'Thema bijwerken mislukt.', details: updateError?.message });
    }

    // Oude vragen verwijderen
    await supabase.from('theme_questions').delete().eq('theme_id', themeId);

    // Nieuwe vragen invoegen
    const vragenMetKoppeling = vragen.map((vraag, index) => ({
      ...vraag,
      theme_id: themeId,
      volgorde_index: vraag.volgorde_index ?? index
    }));

    const { error: vragenError } = await supabase
      .from('theme_questions')
      .insert(vragenMetKoppeling);

    if (vragenError) {
      console.error('Fout bij vervangen vragen:', vragenError);
      return res.status(500).json({ error: 'Vragen vervangen mislukt.', details: vragenError?.message });
    }

    return res.status(200).json({ success: true, theme_id: themeId });
  }


    const { data: insertedThemes, error: themeError } = await supabase
      .from('themes')
      .insert([thema])
      .select();

    if (themeError || !insertedThemes || insertedThemes.length === 0) {
      console.error('Fout bij aanmaken thema:', themeError);
      return res.status(500).json({ error: 'Thema toevoegen mislukt.', details: themeError?.message });
    }

    const themeId = insertedThemes[0].id;

    const vragenMetKoppeling = vragen.map((vraag, index) => ({
      ...vraag,
      theme_id: themeId,
      volgorde_index: vraag.volgorde_index ?? index
    }));

    const { error: vragenError } = await supabase
      .from('theme_questions')
      .insert(vragenMetKoppeling);

    if (vragenError) {
      console.error('Fout bij vragen toevoegen:', vragenError);
      return res.status(500).json({ error: 'Vragen toevoegen mislukt.', details: vragenError?.message });
    }

    return res.status(200).json({ success: true, theme_id: themeId });
  } catch (e) {
    console.error('Onverwachte fout:', e);
    return res.status(500).json({ error: 'Interne serverfout.', message: e.message });
  }
});

module.exports = router;
