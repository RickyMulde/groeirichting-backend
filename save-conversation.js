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
    gespreksgeschiedenis, // Nieuwe parameter voor complete geschiedenis
    toelichting_type, // Nieuwe parameter voor toelichtingen/reacties
    toelichting_inhoud, // Nieuwe parameter voor toelichting inhoud
    vraag_id // Nieuwe parameter voor vraag_id bij toelichtingen
  } = req.body;

  const now = new Date().toISOString();

  if (!werknemer_id || !theme_id) {
    return res.status(400).json({ error: 'werknemer_id en theme_id zijn verplicht.' });
  }

  try {
    // 1️⃣ Gesprek aanmaken
    if (!gesprek_id && !theme_question_id && status === 'Nog niet afgerond') {
      // Check periode restricties (behalve voor superadmin)
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('role, employer_id')
        .eq('id', werknemer_id)
        .single();
      
      if (!userError && user && user.role !== 'superadmin' && user.id !== '5bbfffe3-ad87-4ac8-bba4-112729868489') {
        // Haal werkgever configuratie op
        const { data: werkgeverConfig, error: configError } = await supabase
          .from('werkgever_gesprek_instellingen')
          .select('actieve_maanden')
          .eq('werkgever_id', user.employer_id)
          .single();
        
        if (!configError && werkgeverConfig) {
          // Check of huidige maand actief is
          const huidigeMaand = new Date().getMonth() + 1;
          const isHuidigeMaandActief = werkgeverConfig.actieve_maanden.includes(huidigeMaand);
          
          if (!isHuidigeMaandActief) {
            return res.status(403).json({ 
              error: 'Gesprek kan alleen gestart worden in actieve maanden volgens werkgever instellingen' 
            });
          }
          
          // Check of er al een gesprek is voor deze periode
          const huidigePeriode = `${new Date().getFullYear()}-${String(huidigeMaand).padStart(2, '0')}`;
          const { data: bestaandeGesprekken, error: gesprekError } = await supabase
            .from('gesprek')
            .select('gestart_op')
            .eq('werknemer_id', werknemer_id)
            .eq('theme_id', theme_id)
            .is('geanonimiseerd_op', null);
          
          if (!gesprekError && bestaandeGesprekken) {
            const heeftGesprekDezePeriode = bestaandeGesprekken.some(g => {
              const gesprekPeriode = `${new Date(g.gestart_op).getFullYear()}-${String(new Date(g.gestart_op).getMonth() + 1).padStart(2, '0')}`;
              return gesprekPeriode === huidigePeriode;
            });
            
            if (heeftGesprekDezePeriode) {
              return res.status(403).json({ 
                error: 'Er is al een gesprek gestart voor dit thema in de huidige periode' 
              });
            }
          }
        }
      }
      
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
      try {
        // Haal eerst de huidige metadata op
        const { data: bestaandeData, error: fetchError } = await supabase
          .from('gesprekken_compleet')
          .select('metadata')
          .eq('gesprek_id', gesprek_id)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Fout bij ophalen bestaande metadata:', fetchError);
        } else {
          // Update metadata met gesprek_afgerond = true
          const huidigeMetadata = bestaandeData?.metadata || {};
          const nieuweMetadata = {
            ...huidigeMetadata,
            gesprek_afgerond: true
          };

          const { error: updateError } = await supabase
            .from('gesprekken_compleet')
            .update({
              beeindigd_op: now,
              status: 'afgerond',
              metadata: nieuweMetadata
            })
            .eq('gesprek_id', gesprek_id);

          if (updateError) {
            console.error('Fout bij updaten gesprekken_compleet:', updateError);
          } else {
            console.log(`Gesprekken_compleet tabel bijgewerkt voor gesprek_id: ${gesprek_id}`);
          }
        }
      } catch (error) {
        console.error('Onverwachte fout bij updaten gesprekken_compleet:', error);
      }

      return res.status(200).json({ success: true, message: 'Gesprek afgerond' });
    }

    // 3️⃣ Toelichting/Reactie opslaan
    if (gesprek_id && toelichting_type && toelichting_inhoud) {
      // Haal bestaande gespreksgeschiedenis op
      const { data: bestaandeData, error: fetchError } = await supabase
        .from('gesprekken_compleet')
        .select('gespreksgeschiedenis, metadata')
        .eq('gesprek_id', gesprek_id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Fout bij ophalen bestaande data:', fetchError);
        return res.status(500).json({ error: 'Fout bij ophalen bestaande data' });
      }

      // Bereid nieuwe gespreksgeschiedenis voor
      let nieuweGeschiedenis = bestaandeData?.gespreksgeschiedenis || [];
      let metadata = bestaandeData?.metadata || {};

      // Voeg toelichting/reactie toe
      const nieuwItem = {
        type: toelichting_type, // 'toelichting' of 'reactie'
        vraag_id: vraag_id,
        inhoud: toelichting_inhoud,
        timestamp: now,
        volgorde: nieuweGeschiedenis.length + 1
      };

      nieuweGeschiedenis.push(nieuwItem);

      // Update metadata
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

      let upsertError;
      if (bestaandeData) {
        // Update bestaande rij
        const { error } = await supabase
          .from('gesprekken_compleet')
          .update({
            gespreksgeschiedenis: nieuweGeschiedenis,
            metadata,
            status: 'actief'
          })
          .eq('gesprek_id', gesprek_id);
        upsertError = error;
      } else {
        // Voeg nieuwe rij toe
        const { error } = await supabase
          .from('gesprekken_compleet')
          .insert(upsertData);
        upsertError = error;
      }

      if (upsertError) {
        console.error('Fout bij opslaan toelichting:', upsertError);
        return res.status(500).json({ error: 'Opslaan toelichting mislukt', detail: upsertError.message });
      }

      return res.status(200).json({ success: true });
    }

    // 4️⃣ Antwoord opslaan in nieuwe structuur
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

      let upsertError;
      if (bestaandeData) {
        // Update bestaande rij
        const { error } = await supabase
          .from('gesprekken_compleet')
          .update({
            gespreksgeschiedenis: nieuweGeschiedenis,
            metadata,
            status: 'actief'
          })
          .eq('gesprek_id', gesprek_id);
        upsertError = error;
      } else {
        // Voeg nieuwe rij toe
        const { error } = await supabase
          .from('gesprekken_compleet')
          .insert(upsertData);
        upsertError = error;
      }

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
