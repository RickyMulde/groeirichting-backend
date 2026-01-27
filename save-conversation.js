// 📁 save-conversation.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { containsSensitiveInfo } = require('./utils/filterInput.js');
const { validatePII } = require('./utils/piiValidation');
const { authMiddleware } = require('./middleware/auth');
const { generateTopActions } = require('./generate-top-actions'); // Importeer functie voor direct gebruik
const { hasThemeAccess } = require('./utils/themeAccessService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Gebruik auth middleware voor alle routes
router.use(authMiddleware);

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
  const employerId = req.ctx.employerId;

  const now = new Date().toISOString();

  if (!werknemer_id || !theme_id) {
    return res.status(400).json({ error: 'werknemer_id en theme_id zijn verplicht.' });
  }

  try {
    // 1️⃣ Gesprek aanmaken
    if (!gesprek_id && !theme_question_id && status === 'Nog niet afgerond') {
      // Check periode restricties (behalve voor superuser)
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('role, employer_id, team_id')
        .eq('id', werknemer_id)
        .eq('employer_id', employerId)  // Voeg org-scope toe
        .single();
      
      if (userError) {
        if (userError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Werknemer niet gevonden' })
        }
        throw userError
      }

      // ✅ VALIDATIE: Check of werkgever/team toegang heeft tot dit thema
      const hasAccess = await hasThemeAccess(employerId, theme_id, user.team_id || null);
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
        });
      }
      
      if (user && user.role !== 'superuser' && user.id !== '5bbfffe3-ad87-4ac8-bba4-112729868489') {
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

      // ✅ VALIDATIE: Check of gesprek bij juiste werkgever hoort en toegang tot thema
      const { data: gesprekData, error: gesprekError } = await supabase
        .from('gesprek')
        .select('theme_id, werknemer_id')
        .eq('id', gesprek_id)
        .single();

      if (gesprekError || !gesprekData) {
        return res.status(404).json({ error: 'Gesprek niet gevonden' });
      }

      // Haal werknemer op om team_id te krijgen
      const { data: werknemer, error: werknemerError } = await supabase
        .from('users')
        .select('employer_id, team_id')
        .eq('id', gesprekData.werknemer_id)
        .eq('employer_id', employerId)
        .single();

      if (werknemerError || !werknemer || werknemer.employer_id !== employerId) {
        return res.status(403).json({ error: 'Geen toegang tot dit gesprek' });
      }

      // Check toegang tot thema
      const hasAccess = await hasThemeAccess(employerId, gesprekData.theme_id, werknemer.team_id || null);
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
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

      // Check of alle thema's zijn afgerond voor deze werknemer
      try {
        console.log(`🔍 [DEBUG] Start check alle thema's afgerond voor gesprek_id: ${gesprek_id}`);
        
        // Haal eerst werknemer_id op
        const { data: gesprekVoorWerknemer, error: gesprekWerknemerError } = await supabase
          .from('gesprek')
          .select('werknemer_id')
          .eq('id', gesprek_id)
          .single();
        
        if (gesprekWerknemerError || !gesprekVoorWerknemer) {
          console.error(`❌ [DEBUG] Kon gesprek niet vinden:`, gesprekWerknemerError);
          throw gesprekWerknemerError || new Error('Gesprek niet gevonden');
        }
        
        const werknemerId = gesprekVoorWerknemer.werknemer_id;
        console.log(`👤 [DEBUG] Werknemer ID: ${werknemerId}`);
        
        const { data: alleGesprekken, error: gesprekError } = await supabase
          .from('gesprek')
          .select('id, theme_id, status, gestart_op')
          .eq('werknemer_id', werknemerId)
          .eq('status', 'Afgerond');

        if (gesprekError) {
          console.error(`❌ [DEBUG] Fout bij ophalen alle gesprekken:`, gesprekError);
          throw gesprekError;
        }
        
        if (!alleGesprekken || alleGesprekken.length === 0) {
          console.log(`ℹ️ [DEBUG] Geen afgeronde gesprekken gevonden voor werknemer ${werknemerId}`);
        } else {
          console.log(`📋 [DEBUG] ${alleGesprekken.length} afgeronde gesprekken gevonden voor werknemer ${werknemerId}`);
        }

        if (!gesprekError && alleGesprekken) {
          // Haal werkgever op (gebruik werknemerId die we al hebben)
          const { data: werkgever, error: werkgeverError } = await supabase
            .from('users')
            .select('employer_id')
            .eq('id', werknemerId)
            .single();

          if (werkgeverError) {
            console.error(`❌ [DEBUG] Fout bij ophalen werkgever:`, werkgeverError);
          }

          if (!werkgeverError && werkgever) {
            console.log(`🏢 [DEBUG] Werkgever ID: ${werkgever.employer_id}`);
            
            // Haal toegestane thema's op voor deze werkgever (gebruik nieuwe filtering)
            const { getAllowedThemeIds } = require('./utils/themeAccessService');
            const toegestaneThemeIds = await getAllowedThemeIds(werkgever.employer_id, null);
            
            if (!toegestaneThemeIds || toegestaneThemeIds.length === 0) {
              console.log(`ℹ️ [DEBUG] Geen toegestane thema's gevonden voor werkgever ${werkgever.employer_id}`);
            } else {
              console.log(`📚 [DEBUG] ${toegestaneThemeIds.length} toegestane thema's gevonden voor werkgever ${werkgever.employer_id}`);
            }

            const alleThemas = toegestaneThemeIds.map(id => ({ id }));

            if (themaError) {
              console.error(`❌ [DEBUG] Fout bij ophalen thema's:`, themaError);
            } else if (!alleThemas || alleThemas.length === 0) {
              console.log(`ℹ️ [DEBUG] Geen thema's gevonden voor werkgever ${werkgever.employer_id}`);
            } else {
              console.log(`📚 [DEBUG] ${alleThemas.length} thema's gevonden voor werkgever ${werkgever.employer_id}`);
            }

            if (!themaError && alleThemas) {
              // Bepaal periode van het afgeronde gesprek
              const { data: gesprekData, error: gesprekDataError } = await supabase
                .from('gesprek')
                .select('gestart_op')
                .eq('id', gesprek_id)
                .single();

              if (gesprekDataError) {
                console.error(`❌ [DEBUG] Fout bij ophalen gesprek data:`, gesprekDataError);
              }

              if (!gesprekDataError && gesprekData) {
                const startDatum = new Date(gesprekData.gestart_op);
                const periode = `${startDatum.getFullYear()}-${String(startDatum.getMonth() + 1).padStart(2, '0')}`;
                console.log(`📅 [DEBUG] Periode bepaald: ${periode} (van gestart_op: ${gesprekData.gestart_op})`);

                // Check of alle thema's zijn afgerond in deze specifieke periode
                const gesprekkenInPeriode = alleGesprekken.filter(g => {
                  if (!g.gestart_op) {
                    console.warn(`⚠️ [DEBUG] Gesprek ${g.id} heeft geen gestart_op`);
                    return false;
                  }
                  const gesprekDatum = new Date(g.gestart_op);
                  const gesprekPeriode = `${gesprekDatum.getFullYear()}-${String(gesprekDatum.getMonth() + 1).padStart(2, '0')}`;
                  return gesprekPeriode === periode;
                });
                
                console.log(`📊 [DEBUG] ${gesprekkenInPeriode.length} gesprekken gevonden in periode ${periode} (van ${alleGesprekken.length} totaal)`);
                
                const uniekeThemasInPeriode = [...new Set(gesprekkenInPeriode.map(g => g.theme_id))];
                const alleThemasAfgerondInPeriode = uniekeThemasInPeriode.length === alleThemas.length;

                console.log(`📊 [DEBUG] Periode ${periode}: ${uniekeThemasInPeriode.length}/${alleThemas.length} thema's afgerond`);
                console.log(`🎯 [DEBUG] Afgeronde thema IDs:`, uniekeThemasInPeriode);
                console.log(`📚 [DEBUG] Alle thema IDs:`, alleThemas.map(t => t.id));

                if (alleThemasAfgerondInPeriode) {
                  console.log(`🎯 [DEBUG] ✅ Alle thema's afgerond voor werknemer ${werknemerId}, periode ${periode}. Genereer top 3 acties...`);
                  
                  // Valideer dat employer_id aanwezig is voordat we genereren
                  if (!werkgever.employer_id) {
                    console.error('❌ [DEBUG] Werkgever heeft geen employer_id, kan top 3 acties niet genereren');
                  } else {
                    // Genereer top 3 acties via directe functie aanroep (geen HTTP, geen auth nodig)
                    try {
                      console.log(`🔧 [DEBUG] Roep generateTopActions functie direct aan`);
                      console.log(`📤 [DEBUG] Parameters:`, { werknemer_id: werknemerId, periode, employer_id: werkgever.employer_id });
                      
                      const result = await generateTopActions(werknemerId, periode, werkgever.employer_id);
                      console.log('✅ [DEBUG] Top 3 acties succesvol gegenereerd:', result);
                    } catch (topActieError) {
                      console.error('❌ [DEBUG] Fout bij genereren top 3 acties:', {
                        message: topActieError.message,
                        stack: topActieError.stack,
                        name: topActieError.name
                      });
                    }
                  }
                } else {
                  console.log(`⏳ [DEBUG] Nog niet alle thema's afgerond: ${uniekeThemasInPeriode.length}/${alleThemas.length}`);
                }
              }
            }
          }
        }
      } catch (checkError) {
        console.error('❌ [DEBUG] Fout bij controleren of alle thema\'s zijn afgerond:', {
          message: checkError.message,
          stack: checkError.stack,
          name: checkError.name,
          error: checkError
        });
      }

      return res.status(200).json({ success: true, message: 'Gesprek afgerond' });
    }

    // 3️⃣ Toelichting/Reactie opslaan
    if (gesprek_id && toelichting_type && toelichting_inhoud) {
      // ✅ VALIDATIE: Check of gesprek bij juiste werkgever hoort en toegang tot thema
      const { data: gesprekData, error: gesprekError } = await supabase
        .from('gesprek')
        .select('theme_id, werknemer_id')
        .eq('id', gesprek_id)
        .single();

      if (gesprekError || !gesprekData) {
        return res.status(404).json({ error: 'Gesprek niet gevonden' });
      }

      // Haal werknemer op om team_id te krijgen
      const { data: werknemer, error: werknemerError } = await supabase
        .from('users')
        .select('employer_id, team_id')
        .eq('id', gesprekData.werknemer_id)
        .eq('employer_id', employerId)
        .single();

      if (werknemerError || !werknemer || werknemer.employer_id !== employerId) {
        return res.status(403).json({ error: 'Geen toegang tot dit gesprek' });
      }

      // Check toegang tot thema
      const hasAccess = await hasThemeAccess(employerId, gesprekData.theme_id, werknemer.team_id || null);
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
        });
      }

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
      // 🔒 EXTERNE PII VALIDATIE - controleer via AVG validatie API
      console.log('[save-conversation] 🔒 Start externe PII validatie voor antwoord');
      const piiValidation = await validatePII(antwoord);
      console.log('[save-conversation] 🔒 PII validatie resultaat:', piiValidation.isValid ? '✅ VALIDE' : '❌ GEBLOKKEERD');
      
      if (!piiValidation.isValid) {
        // PII gedetecteerd door externe API - blokkeer opslaan
        const labels = piiValidation.labels || [];
        const reason = piiValidation.reason || 'Gevoelige persoonsgegevens gedetecteerd';
        const articles = piiValidation.articles || [];
        
        console.log('[save-conversation] ⚠️  PII gedetecteerd door externe API - antwoord wordt NIET opgeslagen');
        console.log('[save-conversation] 🏷️  Labels:', labels);
        console.log('[save-conversation] 📝 Reden:', reason);
        
        return res.status(400).json({
          error: 'PII_DETECTED',
          message: piiValidation.message,
          labels: labels,
          reason: reason,
          articles: articles,
          details: 'Je antwoord bevat gevoelige persoonsgegevens. Pas je antwoord aan en probeer het opnieuw.'
        });
      }
      
      // 🔄 FALLBACK: Als externe API niet beschikbaar was, gebruik lokale check als backup
      if (piiValidation.message && piiValidation.message.includes('niet beschikbaar')) {
        console.log('[save-conversation] ⚠️  Externe API niet beschikbaar - gebruik lokale check als fallback');
        const check = containsSensitiveInfo(antwoord);
        if (check.flagged) {
          console.log('[save-conversation] ⚠️  Lokale fallback check heeft gevoelige data gedetecteerd:', check.reason);
          return res.status(400).json({
            error: 'PII_DETECTED',
            message: check.reason,
            details: 'Je antwoord bevat gevoelige persoonsgegevens. Pas je antwoord aan en probeer het opnieuw.',
            fallback: true
          });
        }
        console.log('[save-conversation] ✅ Lokale fallback check geslaagd');
      }
      
      console.log('[save-conversation] ✅ PII validatie geslaagd - antwoord wordt opgeslagen');

      // ✅ VALIDATIE: Check of gesprek bij juiste werkgever hoort en toegang tot thema
      const { data: gesprekData, error: gesprekError } = await supabase
        .from('gesprek')
        .select('theme_id, werknemer_id')
        .eq('id', gesprek_id)
        .single();

      if (gesprekError || !gesprekData) {
        return res.status(404).json({ error: 'Gesprek niet gevonden' });
      }

      // Haal werknemer op om team_id te krijgen
      const { data: werknemer, error: werknemerError } = await supabase
        .from('users')
        .select('employer_id, team_id')
        .eq('id', gesprekData.werknemer_id)
        .eq('employer_id', employerId)
        .single();

      if (werknemerError || !werknemer || werknemer.employer_id !== employerId) {
        return res.status(403).json({ error: 'Geen toegang tot dit gesprek' });
      }

      // Check toegang tot thema
      const hasAccess = await hasThemeAccess(employerId, gesprekData.theme_id, werknemer.team_id || null);
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
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
