const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/verwijder-oude-gesprekken
// Automatisch verwijderen van oude gesprekken voor alle werkgevers
router.post('/', async (req, res) => {
  try {
    console.log('🗑️ Start automatische verwijdering van oude gesprekken...');
    
    // Haal alle werkgever configuraties op
    const { data: werkgeverConfigs, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('werkgever_id, anonimiseer_na_dagen as verwijder_na_dagen')
      .eq('actief', true);
    
    if (configError) {
      console.error('Fout bij ophalen werkgever configuraties:', configError);
      return res.status(500).json({ error: 'Fout bij ophalen configuraties' });
    }
    
    let totaalVerwijderd = 0;
    const resultaten = [];
    
    // Verwerk elke werkgever configuratie
    for (const config of werkgeverConfigs) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - config.verwijder_na_dagen);
        
        // Haal alle werknemers van deze werkgever op
        const { data: werknemers, error: werknemersError } = await supabase
          .from('users')
          .select('id')
          .eq('employer_id', config.werkgever_id)
          .eq('role', 'employee');
        
        if (werknemersError) {
          console.error(`Fout bij ophalen werknemers voor werkgever ${config.werkgever_id}:`, werknemersError);
          continue;
        }
        
        if (!werknemers || werknemers.length === 0) {
          continue;
        }
        
        const werknemerIds = werknemers.map(w => w.id);
        
        // Verwijder oude gesprekken voor deze werkgever
        const { data: verwijderdeGesprekken, error: verwijderError } = await supabase
          .from('gesprek')
          .delete()
          .in('werknemer_id', werknemerIds)
          .lt('beeindigd_op', cutoffDate.toISOString())
          .select('id');
        
        if (verwijderError) {
          console.error(`Fout bij verwijderen voor werkgever ${config.werkgever_id}:`, verwijderError);
          continue;
        }
        
        const aantalVerwijderd = verwijderdeGesprekken?.length || 0;
        totaalVerwijderd += aantalVerwijderd;
        
        resultaten.push({
          werkgever_id: config.werkgever_id,
          verwijder_na_dagen: config.verwijder_na_dagen,
          aantal_verwijderd: aantalVerwijderd
        });
        
        console.log(`✅ Werkgever ${config.werkgever_id}: ${aantalVerwijderd} gesprekken verwijderd`);
        
      } catch (error) {
        console.error(`Fout bij verwerken werkgever ${config.werkgever_id}:`, error);
        resultaten.push({
          werkgever_id: config.werkgever_id,
          fout: error.message
        });
      }
    }
    
    console.log(`✅ Automatische verwijdering voltooid: ${totaalVerwijderd} gesprekken verwijderd`);
    
    res.json({
      success: true,
      totaal_verwijderd: totaalVerwijderd,
      resultaten: resultaten,
      uitgevoerd_op: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Fout bij automatische verwijdering:', error);
    res.status(500).json({ 
      error: 'Interne serverfout', 
      detail: error.message 
    });
  }
});

module.exports = router; 