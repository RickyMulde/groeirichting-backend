const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { authMiddleware } = require('./middleware/auth');
const { getAllowedThemeIds } = require('./utils/themeAccessService');

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

// GET /api/werkgever-gesprek-instellingen/:werkgever_id/themas
// Haalt alle beschikbare thema's op voor een werkgever met hun zichtbaarheid status
router.get('/:werkgever_id/themas', async (req, res) => {
  const { werkgever_id } = req.params;
  const { team_id } = req.query; // Optionele team_id voor team-specifieke filtering
  const employerId = req.ctx.employerId;

  // Valideer dat werkgever_id overeenkomt met employerId uit context
  if (werkgever_id !== employerId) {
    return res.status(403).json({ error: 'Geen toegang tot deze organisatie' });
  }

  try {
    // Voor instellingen pagina: haal ALLE generieke thema's op (ook als uitgezet)
    // en alleen exclusieve thema's die gekoppeld zijn
    // Dit zorgt ervoor dat werkgevers generieke thema's weer aan kunnen zetten
    
    // 1. Haal alle generieke thema's op (standaard_zichtbaar = true)
    const { data: generiekeThemas, error: generiekeError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving_werknemer, beschrijving_werkgever, standaard_zichtbaar, klaar_voor_gebruik, volgorde_index')
      .eq('standaard_zichtbaar', true)
      .eq('klaar_voor_gebruik', true)
      .order('volgorde_index', { ascending: true });

    if (generiekeError) throw generiekeError;

    // 2. Haal alle exclusieve thema's op die gekoppeld zijn aan deze werkgever/team
    // We gebruiken employer_themes om te bepalen welke exclusieve thema's gekoppeld zijn
    let employerThemesQuery = supabase
      .from('employer_themes')
      .select('theme_id, zichtbaar, team_id')
      .eq('employer_id', employerId)
      .eq('zichtbaar', true); // Alleen actieve koppelingen

    // Als team_id is opgegeven, haal zowel team-specifieke als organisatie-brede koppelingen op
    if (team_id) {
      employerThemesQuery = employerThemesQuery.or(`team_id.eq.${team_id},team_id.is.null`);
    } else {
      employerThemesQuery = employerThemesQuery.is('team_id', null);
    }

    const { data: employerThemesKoppelingen, error: employerThemesError } = await employerThemesQuery;

    if (employerThemesError) {
      console.warn('Fout bij ophalen employer_themes koppelingen:', employerThemesError);
    }

    // 3. Haal exclusieve thema's op die gekoppeld zijn
    let exclusieveThemas = [];
    if (employerThemesKoppelingen && employerThemesKoppelingen.length > 0) {
      const gekoppeldeThemeIds = employerThemesKoppelingen.map(et => et.theme_id);
      
      // Haal details op van gekoppelde exclusieve thema's
      const { data: exclusieveData, error: exclusieveError } = await supabase
        .from('themes')
        .select('id, titel, beschrijving_werknemer, beschrijving_werkgever, standaard_zichtbaar, klaar_voor_gebruik, volgorde_index')
        .eq('standaard_zichtbaar', false)
        .eq('klaar_voor_gebruik', true)
        .in('id', gekoppeldeThemeIds)
        .order('volgorde_index', { ascending: true });

      if (exclusieveError) throw exclusieveError;
      exclusieveThemas = exclusieveData || [];
    }

    // 4. Combineer alle thema's
    const themaData = [...(generiekeThemas || []), ...exclusieveThemas];

    // 5. Haal alle employer_themes records op om zichtbaarheid status te bepalen
    // (zowel actieve als inactieve koppelingen voor volledige status)
    let employerThemesStatusQuery = supabase
      .from('employer_themes')
      .select('theme_id, zichtbaar, team_id')
      .eq('employer_id', employerId);

    // Als team_id is opgegeven, haal zowel team-specifieke als organisatie-brede instellingen op
    if (team_id) {
      employerThemesStatusQuery = employerThemesStatusQuery.or(`team_id.eq.${team_id},team_id.is.null`);
    } else {
      employerThemesStatusQuery = employerThemesStatusQuery.is('team_id', null);
    }

    const { data: employerThemes, error: employerThemesError2 } = await employerThemesStatusQuery;

    if (employerThemesError2) {
      console.warn('Fout bij ophalen employer_themes:', employerThemesError2);
    }

    // Combineer thema data met zichtbaarheid status
    const themasMetStatus = themaData.map(thema => {
      // Bepaal zichtbaarheid status
      let zichtbaar = true; // Standaard zichtbaar
      let isExplicietUitgezet = false;

      if (thema.standaard_zichtbaar) {
        // Generiek thema - check of het expliciet is uitgeschakeld
        const uitzetting = employerThemes?.find(
          et => et.theme_id === thema.id && et.zichtbaar === false
        );
        
        if (uitzetting) {
          // Check prioriteit: team-specifieke uitzetting overschrijft organisatie-brede
          if (team_id) {
            const teamUitzetting = employerThemes?.find(
              et => et.theme_id === thema.id && et.team_id === team_id && et.zichtbaar === false
            );
            if (teamUitzetting) {
              zichtbaar = false;
              isExplicietUitgezet = true;
            } else {
              const orgUitzetting = employerThemes?.find(
                et => et.theme_id === thema.id && et.team_id === null && et.zichtbaar === false
              );
              if (orgUitzetting) {
                zichtbaar = false;
                isExplicietUitgezet = true;
              }
            }
          } else {
            const orgUitzetting = employerThemes?.find(
              et => et.theme_id === thema.id && et.team_id === null && et.zichtbaar === false
            );
            if (orgUitzetting) {
              zichtbaar = false;
              isExplicietUitgezet = true;
            }
          }
        }
      } else {
        // Exclusief thema - check of het expliciet is gekoppeld
        const koppeling = employerThemes?.find(
          et => et.theme_id === thema.id && et.zichtbaar === true
        );
        
        if (koppeling) {
          // Check prioriteit: team-specifieke koppeling overschrijft organisatie-brede
          if (team_id) {
            const teamKoppeling = employerThemes?.find(
              et => et.theme_id === thema.id && et.team_id === team_id && et.zichtbaar === true
            );
            if (teamKoppeling) {
              zichtbaar = true;
            } else {
              const orgKoppeling = employerThemes?.find(
                et => et.theme_id === thema.id && et.team_id === null && et.zichtbaar === true
              );
              zichtbaar = !!orgKoppeling;
            }
          } else {
            const orgKoppeling = employerThemes?.find(
              et => et.theme_id === thema.id && et.team_id === null && et.zichtbaar === true
            );
            zichtbaar = !!orgKoppeling;
          }
        } else {
          zichtbaar = false; // Exclusief thema zonder koppeling
        }
      }

      return {
        ...thema,
        zichtbaar,
        is_expliciet_uitgezet: isExplicietUitgezet,
        is_generiek: thema.standaard_zichtbaar,
        is_exclusief: !thema.standaard_zichtbaar
      };
    });

    res.json({ 
      themas: themasMetStatus,
      team_filter: team_id || null
    });
  } catch (error) {
    console.error('Fout bij ophalen werkgever thema\'s:', error);
    res.status(500).json({ error: 'Interne serverfout', detail: error.message });
  }
});

module.exports = router; 