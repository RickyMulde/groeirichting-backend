// 📁 save-conversation.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { containsSensitiveInfo } = require('./utils/filterInput.js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/', async (req, res) => {
  const {
    werknemer_id,
    theme_id,
    gesprek_id,
    theme_question_id,
    antwoord,
    is_vaste_vraag,
    hoort_bij_question_id,
    vraag_tekst, // Nieuwe parameter voor vervolgvragen
    status, // optioneel
    gespreksgeschiedenis // Nieuwe parameter voor complete geschiedenis
  } = req.body;

  const now = new Date().toISOString();

  if (!werknemer_id || !theme_id) {
    return res.status(400).json({ error: 'werknemer_id en theme_id zijn verplicht.' });
  }

  try {
    // 1️⃣ Gesprek aanmaken
    if (!gesprek_id && !theme_question_id && status === 'Nog niet afgerond') {
      const { data, error } = await supabase
        .from('gesprek')
        .insert([{
          werknemer_id,
          theme_id,
          gestart_op: now,
          status: 'Nog niet afgerond',
          taalcode: 'nl',
          aangemaakt_op: now
        }])
        .select();

      if (error) {
        console.error('Fout bij aanmaken gesprek:', error);
        return res.status(500).json({ error: 'Gesprek aanmaken mislukt', detail: error.message });
      }

      return res.status(200).json({ gesprek_id: data[0].id });
    }

    // 2️⃣ Gesprek afsluiten
    if (gesprek_id && status === 'Afgerond') {
      const { afrondingsreden } = req.body;
      
      if (!afrondingsreden || !['MAX_ANTWOORDEN', 'VOLDENDE_DUIDELIJK'].includes(afrondingsreden)) {
        return res.status(400).json({ 
          error: 'Ongeldige afrondingsreden. Moet MAX_ANTWOORDEN of VOLDENDE_DUIDELIJK zijn.' 
        });
      }

      const { error } = await supabase
        .from('gesprek')
        .update({
          beeindigd_op: now,
          status: 'Afgerond',
          afrondingsreden
        })
        .eq('id', gesprek_id);

      if (error) {
        console.error('Fout bij afronden gesprek:', error);
        return res.status(500).json({ error: 'Gesprek afronden mislukt', detail: error.message });
      }

      // Update ook de gesprekken_compleet tabel
      const { error: updateError } = await supabase
        .from('gesprekken_compleet')
        .update({
          beeindigd_op: now,
          status: 'afgerond',
          metadata: supabase.sql`jsonb_set(metadata, '{gesprek_afgerond}', 'true')`
        })
        .eq('gesprek_id', gesprek_id);

      if (updateError) {
        console.error('Fout bij updaten gesprekken_compleet:', updateError);
      }

      return res.status(200).json({ success: true, message: 'Gesprek afgerond' });
    }

    // 3️⃣ Antwoord opslaan in nieuwe structuur
    if (gesprek_id && antwoord !== undefined) {
      const check = containsSensitiveInfo(antwoord);
      if (check.flagged) {
        return res.status(400).json({
          error: check.reason
        });
      }

      // Haal bestaande gespreksgeschiedenis op
      const { data: bestaandeData, error: fetchError } = await supabase
        .from('gesprekken_compleet')
        .select('gespreksgeschiedenis, metadata')
        .eq('gesprek_id', gesprek_id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = geen rijen gevonden
        console.error('Fout bij ophalen bestaande data:', fetchError);
        return res.status(500).json({ error: 'Fout bij ophalen bestaande data' });
      }

      // Bereid nieuwe gespreksgeschiedenis voor
      let nieuweGeschiedenis = bestaandeData?.gespreksgeschiedenis || [];
      let metadata = bestaandeData?.metadata || {};

      // Voeg nieuw vraag-antwoord toe
      const nieuwItem = {
        type: is_vaste_vraag ? 'vaste_vraag' : 'vervolgvraag',
        vraag_id: is_vaste_vraag ? theme_question_id : null,
        hoort_bij_vraag_id: is_vaste_vraag ? null : hoort_bij_question_id,
        vraag_tekst: vraag_tekst || (is_vaste_vraag ? 'Vaste vraag' : 'Vervolgvraag'),
        antwoord: antwoord,
        timestamp: now,
        volgorde: nieuweGeschiedenis.length + 1
      };

      nieuweGeschiedenis.push(nieuwItem);

      // Update metadata
      metadata.aantal_vaste_vragen = nieuweGeschiedenis.filter(item => item.type === 'vaste_vraag').length;
      metadata.aantal_vervolgvragen = nieuweGeschiedenis.filter(item => item.type === 'vervolgvraag').length;
      metadata.laatste_vraag_type = nieuwItem.type;
      metadata.laatste_update = now;

      // Sla op in gesprekken_compleet tabel
      const upsertData = {
        werknemer_id,
        theme_id,
        gesprek_id,
        gespreksgeschiedenis: nieuweGeschiedenis,
        metadata,
        gestart_op: bestaandeData?.gestart_op || now,
        status: 'actief',
        taalcode: 'nl'
      };

      const { error: upsertError } = await supabase
        .from('gesprekken_compleet')
        .upsert(upsertData, { 
          onConflict: 'gesprek_id',
          ignoreDuplicates: false
        });

      if (upsertError) {
        console.error('Fout bij opslaan in gesprekken_compleet:', upsertError);
        return res.status(500).json({ error: 'Opslaan mislukt', detail: upsertError.message });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Ongeldig verzoek. Verplichte velden ontbreken of incorrecte combinatie.' });

  } catch (e) {
    console.error('Onverwachte fout:', e);
    return res.status(500).json({ error: 'Interne serverfout', detail: e.message });
  }
});

module.exports = router;
