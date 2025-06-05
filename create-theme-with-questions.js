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
  if (thema.id) {
    const { error: updateError } = await supabase
      .from('themes')
      .update(thema)
      .eq('id', thema.id);

    if (updateError) {
      console.error('Fout bij updaten thema:', updateError);
      return res.status(500).json({ error: 'Thema bijwerken mislukt.', details: updateError.message });
    }

    await supabase.from('theme_questions').delete().eq('theme_id', thema.id);

    let ingevuldeVragen = vragen;
    if ((!vragen || vragen.length === 0) && thema.vraag_1) {
      ingevuldeVragen = [];
      for (let i = 1; i <= 5; i++) {
        const tekst = thema[`vraag_${i}`];
        if (typeof tekst === 'string' && tekst.trim() !== '') {
          ingevuldeVragen.push({
            tekst: tekst.trim(),
            verplicht: thema[`vraag_${i}_verplicht`] ?? false,
            type_vraag: thema[`vraag_${i}_type`] ?? 'initieel',
            type: thema[`vraag_${i}_type`] ?? 'initieel',
            taalcode: thema.taalcode ?? 'nl'
          });
        }
      }
    }

    const vragenMetKoppeling = ingevuldeVragen.map((vraag, index) => ({
      ...vraag,
      theme_id: thema.id,
      volgorde_index: vraag.volgorde_index ?? index
    }));

    const { error: vragenError } = await supabase
      .from('theme_questions')
      .insert(vragenMetKoppeling);

    if (vragenError) {
      console.error('Fout bij vervangen vragen:', vragenError);
      return res.status(500).json({ error: 'Vragen bijwerken mislukt.', details: vragenError.message });
    }

    return res.status(200).json({ success: true, theme_id: thema.id });
  }

  // Insert nieuw thema
  const { data: insertedThemes, error: themeError } = await supabase
    .from('themes')
    .insert([thema])
    .select();

  if (themeError || !insertedThemes || insertedThemes.length === 0) {
    console.error('Fout bij aanmaken thema:', themeError);
    return res.status(500).json({ error: 'Thema toevoegen mislukt.', details: themeError?.message });
  }

  const themeId = insertedThemes[0].id;

  let ingevuldeVragen = vragen;
  if ((!vragen || vragen.length === 0) && thema.vraag_1) {
    ingevuldeVragen = [];
    for (let i = 1; i <= 5; i++) {
      const tekst = thema[`vraag_${i}`];
      if (typeof tekst === 'string' && tekst.trim() !== '') {
        ingevuldeVragen.push({
          tekst: tekst.trim(),
          verplicht: thema[`vraag_${i}_verplicht`] ?? false,
          type_vraag: thema[`vraag_${i}_type`] ?? 'initieel',
          type: thema[`vraag_${i}_type`] ?? 'initieel',
          taalcode: thema.taalcode ?? 'nl'
        });
      }
    }
  }

  const vragenMetKoppeling = ingevuldeVragen.map((vraag, index) => ({
    ...vraag,
    theme_id: themeId,
    volgorde_index: vraag.volgorde_index ?? index
  }));

  const { error: vragenError } = await supabase
    .from('theme_questions')
    .insert(vragenMetKoppeling);

  if (vragenError) {
    console.error('Fout bij vragen toevoegen:', vragenError);
    return res.status(500).json({ error: 'Vragen toevoegen mislukt.', details: vragenError.message });
  }

  return res.status(200).json({ success: true, theme_id: themeId });
} catch (e) {
  console.error('Onverwachte fout:', e);
  return res.status(500).json({ error: 'Interne serverfout.', message: e.message });
}

module.exports = router;
