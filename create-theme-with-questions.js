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

// ❌ Verwijderd: frontend stuurt vraag_1 t/m vraag_5 zelf al correct mee

  thema.vraag_1_verplicht = thema.vraag_1_verplicht ?? null;
  thema.vraag_1_type = thema.vraag_1_type ?? null;
  thema.vraag_2_verplicht = thema.vraag_2_verplicht ?? null;
  thema.vraag_2_type = thema.vraag_2_type ?? null;
  thema.vraag_3_verplicht = thema.vraag_3_verplicht ?? null;
  thema.vraag_3_type = thema.vraag_3_type ?? null;
  thema.vraag_4_verplicht = thema.vraag_4_verplicht ?? null;
  thema.vraag_4_type = thema.vraag_4_type ?? null;
  thema.vraag_5_verplicht = thema.vraag_5_verplicht ?? null;
  thema.vraag_5_type = thema.vraag_5_type ?? null;


  try {
    const { data: insertedThemes, error: themeError } = await supabase
      .from('themes')
      .insert([thema])
      .select();

    if (themeError || !insertedThemes || insertedThemes.length === 0) {
      console.error('Fout bij aanmaken thema:', themeError);
      return res.status(500).json({ error: 'Thema toevoegen mislukt.', details: themeError?.message });
    }

    const themeId = insertedThemes[0].id;

    
// Als vragen[] leeg is, maak dan vragen aan uit thema.vraag_1 t/m vraag_5
let ingevuldeVragen = vragen;
if ((!vragen || vragen.length === 0) && thema.vraag_1) {
  ingevuldeVragen = [];
  for (let i = 1; i <= 5; i++) {
    const tekst = thema[`vraag_${i}`];
    if (tekst && tekst.trim() !== '') {
      ingevuldeVragen.push({
        tekst: tekst.trim(),
        verplicht: thema[`vraag_${i}_verplicht`] ?? false,
        type: thema[`vraag_${i}_type`] ?? 'text',
        type_vraag: thema[`vraag_${i}_type`] ?? 'initieel',
        taalcode: thema.taalcode ?? 'nl',
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
      return res.status(500).json({ error: 'Vragen toevoegen mislukt.', details: vragenError?.message });
    }

    return res.status(200).json({ success: true, theme_id: themeId });
  } catch (e) {
    console.error('Onverwachte fout:', e);
    return res.status(500).json({ error: 'Interne serverfout.', message: e.message });
  }
});

module.exports = router;
