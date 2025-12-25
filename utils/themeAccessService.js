// Service voor thema toegang en filtering op basis van werkgever en team
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Haalt alle theme_id's op die een werkgever/team mag zien
 * @param {string} employerId - UUID van de werkgever
 * @param {string|null} teamId - UUID van het team (optioneel, null = organisatie-breed)
 * @returns {Promise<string[]>} - Array van theme_id's die toegestaan zijn
 */
async function getAllowedThemeIds(employerId, teamId = null) {
  try {
    const allowedThemeIds = new Set();

    // 1. Haal alle generieke thema's op (standaard_zichtbaar = true, klaar_voor_gebruik = true)
    const { data: genericThemes, error: genericError } = await supabase
      .from('themes')
      .select('id')
      .eq('standaard_zichtbaar', true)
      .eq('klaar_voor_gebruik', true);

    if (genericError) {
      console.error('❌ Fout bij ophalen generieke thema\'s:', genericError);
      throw genericError;
    }

    // 2. Voor elk generiek thema, check of het niet expliciet is uitgeschakeld
    if (genericThemes && genericThemes.length > 0) {
      const genericThemeIds = genericThemes.map(t => t.id);
      const excludedThemeIds = new Set();

      // Als teamId is opgegeven, check zowel team-specifieke als organisatie-brede uitzettingen
      if (teamId) {
        // Check team-specifieke uitzettingen
        const { data: teamExclusions, error: teamExclError } = await supabase
          .from('employer_themes')
          .select('theme_id')
          .eq('employer_id', employerId)
          .eq('team_id', teamId)
          .eq('zichtbaar', false)
          .in('theme_id', genericThemeIds);

        if (!teamExclError && teamExclusions) {
          teamExclusions.forEach(excl => excludedThemeIds.add(excl.theme_id));
        }

        // Check organisatie-brede uitzettingen
        const { data: orgExclusions, error: orgExclError } = await supabase
          .from('employer_themes')
          .select('theme_id')
          .eq('employer_id', employerId)
          .is('team_id', null)
          .eq('zichtbaar', false)
          .in('theme_id', genericThemeIds);

        if (!orgExclError && orgExclusions) {
          orgExclusions.forEach(excl => excludedThemeIds.add(excl.theme_id));
        }
      } else {
        // Alleen organisatie-brede uitzettingen checken
        const { data: orgExclusions, error: orgExclError } = await supabase
          .from('employer_themes')
          .select('theme_id')
          .eq('employer_id', employerId)
          .is('team_id', null)
          .eq('zichtbaar', false)
          .in('theme_id', genericThemeIds);

        if (!orgExclError && orgExclusions) {
          orgExclusions.forEach(excl => excludedThemeIds.add(excl.theme_id));
        }
      }

      // Voeg generieke thema's toe die niet zijn uitgeschakeld
      genericThemeIds.forEach(themeId => {
        if (!excludedThemeIds.has(themeId)) {
          allowedThemeIds.add(themeId);
        }
      });
    }

    // 3. Haal alle exclusieve thema's op (standaard_zichtbaar = false)
    const { data: exclusiveThemes, error: exclusiveError } = await supabase
      .from('themes')
      .select('id')
      .eq('standaard_zichtbaar', false)
      .eq('klaar_voor_gebruik', true);

    if (exclusiveError) {
      console.error('❌ Fout bij ophalen exclusieve thema\'s:', exclusiveError);
      throw exclusiveError;
    }

    // 4. Check welke exclusieve thema's expliciet zijn gekoppeld
    if (exclusiveThemes && exclusiveThemes.length > 0) {
      const exclusiveThemeIds = exclusiveThemes.map(t => t.id);

      // Als teamId is opgegeven, check zowel team-specifieke als organisatie-brede koppelingen
      if (teamId) {
        // Check team-specifieke koppelingen
        const { data: teamAccess, error: teamAccessError } = await supabase
          .from('employer_themes')
          .select('theme_id')
          .eq('employer_id', employerId)
          .eq('team_id', teamId)
          .eq('zichtbaar', true)
          .in('theme_id', exclusiveThemeIds);

        if (!teamAccessError && teamAccess) {
          teamAccess.forEach(access => allowedThemeIds.add(access.theme_id));
        }

        // Check organisatie-brede koppelingen
        const { data: orgAccess, error: orgAccessError } = await supabase
          .from('employer_themes')
          .select('theme_id')
          .eq('employer_id', employerId)
          .is('team_id', null)
          .eq('zichtbaar', true)
          .in('theme_id', exclusiveThemeIds);

        if (!orgAccessError && orgAccess) {
          orgAccess.forEach(access => allowedThemeIds.add(access.theme_id));
        }
      } else {
        // Alleen organisatie-brede koppelingen checken
        const { data: orgAccess, error: orgAccessError } = await supabase
          .from('employer_themes')
          .select('theme_id')
          .eq('employer_id', employerId)
          .is('team_id', null)
          .eq('zichtbaar', true)
          .in('theme_id', exclusiveThemeIds);

        if (!orgAccessError && orgAccess) {
          orgAccess.forEach(access => allowedThemeIds.add(access.theme_id));
        }
      }
    }

    return Array.from(allowedThemeIds);
  } catch (error) {
    console.error('❌ Fout in getAllowedThemeIds:', error);
    throw error;
  }
}

/**
 * Checkt of een werkgever/team toegang heeft tot een specifiek thema
 * @param {string} employerId - UUID van de werkgever
 * @param {string} themeId - UUID van het thema
 * @param {string|null} teamId - UUID van het team (optioneel, null = organisatie-breed)
 * @returns {Promise<boolean>} - True als toegang is toegestaan, false anders
 */
async function hasThemeAccess(employerId, themeId, teamId = null) {
  try {
    // 1. Check of thema bestaat en klaar_voor_gebruik = true
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('id, standaard_zichtbaar, klaar_voor_gebruik')
      .eq('id', themeId)
      .single();

    if (themeError || !theme) {
      return false;
    }

    if (!theme.klaar_voor_gebruik) {
      return false;
    }

    // 2. Als standaard_zichtbaar = true (generiek thema)
    if (theme.standaard_zichtbaar) {
      // Check of het expliciet is uitgeschakeld
      if (teamId) {
        // Check team-specifieke uitzetting
        const { data: teamExclusion, error: teamExclError } = await supabase
          .from('employer_themes')
          .select('id')
          .eq('employer_id', employerId)
          .eq('theme_id', themeId)
          .eq('team_id', teamId)
          .eq('zichtbaar', false)
          .single();

        if (!teamExclError && teamExclusion) {
          return false; // Team-specifiek uitgeschakeld
        }

        // Check organisatie-brede uitzetting
        const { data: orgExclusion, error: orgExclError } = await supabase
          .from('employer_themes')
          .select('id')
          .eq('employer_id', employerId)
          .eq('theme_id', themeId)
          .is('team_id', null)
          .eq('zichtbaar', false)
          .single();

        if (!orgExclError && orgExclusion) {
          return false; // Organisatie-breed uitgeschakeld
        }
      } else {
        // Check organisatie-brede uitzetting
        const { data: orgExclusion, error: orgExclError } = await supabase
          .from('employer_themes')
          .select('id')
          .eq('employer_id', employerId)
          .eq('theme_id', themeId)
          .is('team_id', null)
          .eq('zichtbaar', false)
          .single();

        if (!orgExclError && orgExclusion) {
          return false; // Organisatie-breed uitgeschakeld
        }
      }

      return true; // Generiek thema, niet uitgeschakeld
    }

    // 3. Als standaard_zichtbaar = false (exclusief thema)
    // Check of er expliciete koppeling bestaat
    if (teamId) {
      // Check team-specifieke koppeling
      const { data: teamAccess, error: teamAccessError } = await supabase
        .from('employer_themes')
        .select('id')
        .eq('employer_id', employerId)
        .eq('theme_id', themeId)
        .eq('team_id', teamId)
        .eq('zichtbaar', true)
        .single();

      if (!teamAccessError && teamAccess) {
        return true; // Team-specifiek gekoppeld
      }

      // Check organisatie-brede koppeling
      const { data: orgAccess, error: orgAccessError } = await supabase
        .from('employer_themes')
        .select('id')
        .eq('employer_id', employerId)
        .eq('theme_id', themeId)
        .is('team_id', null)
        .eq('zichtbaar', true)
        .single();

      if (!orgAccessError && orgAccess) {
        return true; // Organisatie-breed gekoppeld
      }
    } else {
      // Check organisatie-brede koppeling
      const { data: orgAccess, error: orgAccessError } = await supabase
        .from('employer_themes')
        .select('id')
        .eq('employer_id', employerId)
        .eq('theme_id', themeId)
        .is('team_id', null)
        .eq('zichtbaar', true)
        .single();

      if (!orgAccessError && orgAccess) {
        return true; // Organisatie-breed gekoppeld
      }
    }

    return false; // Exclusief thema, niet gekoppeld
  } catch (error) {
    console.error('❌ Fout in hasThemeAccess:', error);
    return false; // Bij fout, geen toegang
  }
}

/**
 * Zorgt ervoor dat een record bestaat in employer_themes (upsert)
 * @param {string} employerId - UUID van de werkgever
 * @param {string} themeId - UUID van het thema
 * @param {boolean} zichtbaar - Of het thema zichtbaar is (default true)
 * @param {string|null} teamId - UUID van het team (optioneel, null = organisatie-breed)
 * @returns {Promise<object>} - Het aangemaakte of bijgewerkte record
 */
async function ensureEmployerThemeRecord(employerId, themeId, zichtbaar = true, teamId = null) {
  try {
    // Check of record al bestaat
    let query = supabase
      .from('employer_themes')
      .select('*')
      .eq('employer_id', employerId)
      .eq('theme_id', themeId);

    if (teamId) {
      query = query.eq('team_id', teamId);
    } else {
      query = query.is('team_id', null);
    }

    const { data: existing, error: selectError } = await query.single();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows found, dat is ok
      console.error('❌ Fout bij checken employer_themes:', selectError);
      throw selectError;
    }

    const record = {
      employer_id: employerId,
      theme_id: themeId,
      team_id: teamId,
      zichtbaar: zichtbaar
    };

    if (existing) {
      // Update bestaand record
      const { data, error } = await supabase
        .from('employer_themes')
        .update({ zichtbaar: zichtbaar })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Fout bij updaten employer_themes:', error);
        throw error;
      }

      return data;
    } else {
      // Insert nieuw record
      const { data, error } = await supabase
        .from('employer_themes')
        .insert(record)
        .select()
        .single();

      if (error) {
        console.error('❌ Fout bij insert employer_themes:', error);
        throw error;
      }

      return data;
    }
  } catch (error) {
    console.error('❌ Fout in ensureEmployerThemeRecord:', error);
    throw error;
  }
}

module.exports = {
  getAllowedThemeIds,
  hasThemeAccess,
  ensureEmployerThemeRecord
};

