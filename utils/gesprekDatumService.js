// Service voor gesprek datum berekeningen en anonimisering
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Berekent de volgende gesprek datum op basis van actieve maanden
 * @param {number[]} actieveMaanden - Array van maanden (1-12)
 * @returns {Date} - Volgende gesprek datum (1e van de maand)
 */
const berekenVolgendeGesprekDatum = (actieveMaanden) => {
  const huidigeDatum = new Date();
  const huidigeMaand = huidigeDatum.getMonth() + 1; // 1-12
  const huidigeJaar = huidigeDatum.getFullYear();
  
  // Zoek de volgende maand in de actieve maanden
  const volgendeMaand = actieveMaanden.find(maand => maand > huidigeMaand);
  
  if (volgendeMaand) {
    // Volgende maand dit jaar
    return new Date(huidigeJaar, volgendeMaand - 1, 1);
  } else {
    // Volgende jaar, eerste maand in de lijst
    return new Date(huidigeJaar + 1, actieveMaanden[0] - 1, 1);
  }
};

/**
 * Checkt of er een gesprek verwacht wordt in de huidige maand
 * @param {number[]} actieveMaanden - Array van maanden (1-12)
 * @returns {boolean} - True als er een gesprek verwacht wordt
 */
const isGesprekVerwachtDezeMaand = (actieveMaanden) => {
  const huidigeMaand = new Date().getMonth() + 1; // 1-12
  return actieveMaanden.includes(huidigeMaand);
};

/**
 * Bepaalt of er een nieuw gesprek gestart kan worden voor een thema
 * @param {Array} gesprekken - Array van bestaande gesprekken
 * @param {Array} actieveMaanden - Array van actieve maanden van werkgever
 * @param {boolean} heeftOpenstaandGesprek - Of er een openstaand gesprek is
 * @param {string} userId - ID van de gebruiker (voor superadmin check)
 * @returns {boolean} - True als er een nieuw gesprek gestart kan worden
 */
const kanNieuwGesprekStarten = async (gesprekken, actieveMaanden, heeftOpenstaandGesprek, userId) => {
  // Als er een openstaand gesprek is, geen nieuw starten
  if (heeftOpenstaandGesprek) {
    return false;
  }
  
  // Check of gebruiker superadmin is of test account
  if (userId) {
    // Test account override
    if (userId === '5bbfffe3-ad87-4ac8-bba4-112729868489') {
      return true; // Test account kan altijd testen
    }
    
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
      
    if (user?.role === 'superadmin') {
      return true; // Superadmin kan altijd testen
    }
  }
  
  // Check of huidige maand actief is
  const huidigeMaand = new Date().getMonth() + 1;
  const isHuidigeMaandActief = actieveMaanden.includes(huidigeMaand);
  
  if (!isHuidigeMaandActief) {
    return false; // Alleen in actieve maanden
  }
  
  // Als er geen gesprekken zijn en het is een actieve maand, toestaan
  if (gesprekken.length === 0) {
    return true;
  }
  
  // Check of er al een gesprek is voor deze periode
  const huidigePeriode = `${new Date().getFullYear()}-${String(huidigeMaand).padStart(2, '0')}`;
  const heeftGesprekDezePeriode = gesprekken.some(g => {
    const gesprekPeriode = `${new Date(g.gestart_op).getFullYear()}-${String(new Date(g.gestart_op).getMonth() + 1).padStart(2, '0')}`;
    return gesprekPeriode === huidigePeriode;
  });
  
  return !heeftGesprekDezePeriode; // Maximaal 1 gesprek per periode
};

/**
 * Haalt de maandnaam op in het Nederlands
 * @param {number} maand - Maand nummer (1-12)
 * @returns {string} - Maandnaam
 */
const getMaandNaam = (maand) => {
  const maanden = [
    'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
    'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'
  ];
  return maanden[maand - 1] || 'Onbekend';
};

/**
 * Anonimiseert oude gesprekken voor een werkgever
 * @param {string} werkgeverId - UUID van de werkgever
 * @param {number} anonimiseerNaDagen - Aantal dagen na anonimisering
 */
const anonimiseerOudeGesprekken = async (werkgeverId, anonimiseerNaDagen = 60) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - anonimiseerNaDagen);
    
    // Haal alle werknemers van deze werkgever op
    const { data: werknemers, error: werknemersError } = await supabase
      .from('users')
      .select('id')
      .eq('employer_id', werkgeverId)
      .eq('role', 'employee');
    
    if (werknemersError) throw werknemersError;
    
    if (!werknemers || werknemers.length === 0) {
      return { anonimiseerd: 0, fout: null };
    }
    
    const werknemerIds = werknemers.map(w => w.id);
    
    // Anonimiseer oude gesprekken
    const { data, error } = await supabase
      .from('gesprek')
      .update({ 
        geanonimiseerd_op: new Date().toISOString()
      })
      .in('werknemer_id', werknemerIds)
      .lt('beeindigd_op', cutoffDate.toISOString())
      .is('geanonimiseerd_op', null);
    
    if (error) throw error;
    
    return { anonimiseerd: data?.length || 0, fout: null };
  } catch (error) {
    console.error('Fout bij anonimiseren gesprekken:', error);
    return { anonimiseerd: 0, fout: error.message };
  }
};

/**
 * Haalt werkgever configuratie op met fallback naar standaard waarden
 * @param {string} werkgeverId - UUID van de werkgever
 * @returns {Object} - Configuratie object
 */
const getWerkgeverConfiguratie = async (werkgeverId) => {
  try {
    const { data, error } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('*')
      .eq('werkgever_id', werkgeverId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Geen configuratie gevonden, retourneer standaard waarden
        return {
          werkgever_id: werkgeverId,
          actieve_maanden: [3, 6, 9],
          verplicht: true,
          actief: true,
          anonimiseer_na_dagen: 60
        };
      }
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Fout bij ophalen werkgever configuratie:', error);
    throw error;
  }
};

/**
 * Berekent alle thema data voor een werknemer inclusief werkgever configuratie
 * @param {string} werknemerId - UUID van de werknemer
 * @returns {Array} - Array van thema objecten met configuratie
 */
const getThemaDataVoorWerknemer = async (werknemerId) => {
  try {
    // Haal werknemer en werkgever op
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemerId)
      .single();
    
    if (werknemerError) throw werknemerError;
    if (!werknemer) throw new Error('Werknemer niet gevonden');
    
    // Haal werkgever configuratie op
    const werkgeverConfig = await getWerkgeverConfiguratie(werknemer.employer_id);
    
    // Haal alle actieve thema's op
    const { data: themaData, error: themaError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving')
      .eq('klaar_voor_gebruik', true)
      .eq('standaard_zichtbaar', true)
      .order('volgorde_index');
    
    if (themaError) throw themaError;
    
    // Haal gesprekken van deze werknemer op
    const { data: gesprekData, error: gesprekError } = await supabase
      .from('gesprek')
      .select('id, theme_id, status, gestart_op, beeindigd_op')
      .eq('werknemer_id', werknemerId)
      .is('geanonimiseerd_op', null) // Alleen niet-geanonimiseerde gesprekken
      .order('gestart_op', { ascending: false });
    
    if (gesprekError) throw gesprekError;
    
    // Combineer data per thema
    const gecombineerdeData = await Promise.all(themaData.map(async thema => {
      const gesprekken = gesprekData?.filter(g => g.theme_id === thema.id) || [];
      const isVerwachtDezeMaand = isGesprekVerwachtDezeMaand(werkgeverConfig.actieve_maanden);
      const volgendeGesprekDatum = berekenVolgendeGesprekDatum(werkgeverConfig.actieve_maanden);
      const heeftOpenstaandGesprek = gesprekken.some(g => g.status === 'Nog niet afgerond');
      const kanNieuwStarten = await kanNieuwGesprekStarten(gesprekken, werkgeverConfig.actieve_maanden, heeftOpenstaandGesprek, werknemerId);
      
      return {
        ...thema,
        gesprekken,
        configuratie: werkgeverConfig,
        is_gesprek_verwacht_deze_maand: isVerwachtDezeMaand,
        volgende_gesprek_datum: volgendeGesprekDatum,
        heeft_openstaand_gesprek: heeftOpenstaandGesprek,
        kan_nieuw_gesprek_starten: kanNieuwStarten
      };
    }));
    
    return gecombineerdeData;
  } catch (error) {
    console.error('Fout bij ophalen thema data voor werknemer:', error);
    throw error;
  }
};

module.exports = {
  berekenVolgendeGesprekDatum,
  isGesprekVerwachtDezeMaand,
  kanNieuwGesprekStarten,
  getMaandNaam,
  anonimiseerOudeGesprekken,
  getWerkgeverConfiguratie,
  getThemaDataVoorWerknemer
}; 