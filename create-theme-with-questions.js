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
  console.log('Thema ID aanwezig:', !!thema.id);

  // Verwijder doel_vraag velden uit thema object
  delete thema.doel_vraag;
  for (let i = 1; i <= 5; i++) {
    delete thema[`vraag_${i}_doel`];
  }

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

  const parseableFields = ['ai_configuratie', 'versiebeheer', 'verwachte_signalen'];
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
  thema.gebruik_gpt_vragen = thema.gebruik_gpt_vragen ?? false;

  // Nieuwe velden altijd initialiseren (null als niet meegegeven)
  thema.thema_type = thema.thema_type ?? null;
  thema.prompt_style = thema.prompt_style ?? null;
  thema.ai_behavior = thema.ai_behavior ?? null;
  thema.gpt_doelstelling = thema.gpt_doelstelling ?? null;
  thema.gpt_beperkingen = thema.gpt_beperkingen ?? null;

  // score_instructies wordt nu gewoon meegenomen in het thema object en opgeslagen in Supabase.

  try {
    if (thema.id) {
      console.log('Start update proces voor thema ID:', thema.id);
      
      // Update bestaand thema
      const { error: updateError } = await supabase
        .from('themes')
        .update(thema)
        .eq('id', thema.id);

      if (updateError) {
        console.error('Fout bij updaten thema:', updateError);
        return res.status(500).json({ error: 'Thema bijwerken mislukt.', details: updateError.message });
      }
      console.log('Thema succesvol bijgewerkt');

      // Verwijder gekoppelde vragen
      console.log('Start verwijderen van bestaande vragen');
      const { error: deleteError } = await supabase
        .from('theme_questions')
        .delete()
        .eq('theme_id', thema.id);
      
      if (deleteError) {
        console.error('Fout bij verwijderen vragen:', deleteError);
        return res.status(500).json({ error: 'Verwijderen vragen mislukt.', details: deleteError.message });
      }
      console.log('Bestaande vragen succesvol verwijderd');

      // Opnieuw opbouwen van vragen
      const vragenMetKoppeling = vragen.map((vraag, index) => ({
        ...vraag,
        theme_id: thema.id,
        volgorde_index: index
      }));

      console.log('Start toevoegen nieuwe vragen');
      const { error: vragenError } = await supabase
        .from('theme_questions')
        .insert(vragenMetKoppeling);

      if (vragenError) {
        console.error('Fout bij vervangen vragen:', vragenError);
        return res.status(500).json({ error: 'Vragen bijwerken mislukt.', details: vragenError.message });
      }
      console.log('Nieuwe vragen succesvol toegevoegd');

      return res.status(200).json({ success: true, theme_id: thema.id });
    }

    // Nieuwe thema aanmaken
    const { data: insertedThemes, error: themeError } = await supabase
      .from('themes')
      .insert([thema])
      .select();

    if (themeError || !insertedThemes || insertedThemes.length === 0) {
      console.error('Fout bij aanmaken thema:', themeError);
      return res.status(500).json({ error: 'Thema toevoegen mislukt.', details: themeError?.message });
    }

    const themeId = insertedThemes[0].id;

    // Vragen toevoegen
    const vragenMetKoppeling = vragen.map((vraag, index) => ({
      ...vraag,
      theme_id: themeId,
      volgorde_index: index
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
