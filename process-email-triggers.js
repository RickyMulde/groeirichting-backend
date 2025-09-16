const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processEmailTriggers() {
  try {
    console.log('Processing email triggers...');
    
    // 1. Account verificatie triggers
    await processAccountVerificatieTriggers();
    
    // 2. Actieve periode triggers
    await processActievePeriodeTriggers();
    
    // 3. Andere triggers...
    
  } catch (error) {
    console.error('Error processing triggers:', error);
  }
}

async function processAccountVerificatieTriggers() {
  try {
    // Haal alle werkgevers op die recent geverifieerd zijn (laatste 24 uur)
    const { data: recentWerkgevers, error } = await supabase
      .from('users')
      .select('id, first_name, employer_id, email_confirmed_at, email')
      .eq('role', 'employer')
      .eq('email_confirmed', true)
      .gte('email_confirmed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    
    console.log(`Found ${recentWerkgevers?.length || 0} recently verified employers`);
    
    for (const werkgever of recentWerkgevers || []) {
      // Check of er al een welkomstmail is verstuurd
      const { data: existingEmail } = await supabase
        .from('email_queue')
        .select('id')
        .eq('ontvanger_email', werkgever.email)
        .eq('template_trigger', 'account_verificatie')
        .single();
      
      if (!existingEmail) {
        // Haal welkomstmail template op
        const { data: template, error: templateError } = await supabase
          .from('email_templates')
          .select('id')
          .eq('trigger_event', 'account_verificatie')
          .eq('doelgroep', 'werkgever')
          .eq('is_active', true)
          .single();
        
        if (templateError) {
          console.error('Template not found for account_verificatie:', templateError);
          continue;
        }
        
        // Voeg welkomstmail toe aan queue
        const { error: queueError } = await supabase
          .from('email_queue')
          .insert({
            template_id: template.id,
            ontvanger_email: werkgever.email,
            ontvanger_type: 'werkgever',
            organisatie_id: werkgever.employer_id,
            variabelen: {
              voornaam: werkgever.first_name || 'Er',
              login_url: `${process.env.FRONTEND_URL}/login`
            }
          });
        
        if (queueError) {
          console.error('Error adding welcome email to queue:', queueError);
        } else {
          console.log(`Welkomstmail toegevoegd voor werkgever: ${werkgever.email}`);
        }
      }
    }
  } catch (error) {
    console.error('Error processing account verificatie triggers:', error);
  }
}

async function processActievePeriodeTriggers() {
  try {
    // Haal alle werkgevers op met hun actieve maanden
    const { data: werkgevers, error } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select(`
        werkgever_id,
        actieve_maanden,
        employers!inner(
          id,
          company_name
        )
      `)
      .eq('actief', true);
    
    if (error) throw error;
    
    const huidigeDatum = new Date();
    const huidigeMaand = huidigeDatum.getMonth() + 1;
    const huidigeJaar = huidigeDatum.getFullYear();
    
    for (const config of werkgevers || []) {
      const actieveMaanden = config.actieve_maanden || [];
      
      // Check of vandaag de eerste dag van een actieve periode is
      if (actieveMaanden.includes(huidigeMaand) && huidigeDatum.getDate() === 1) {
        await processActievePeriodeStart(config.werkgever_id, config.employers.company_name);
      }
      
      // Check of vandaag 10 dagen na start van actieve periode is
      const startDatum = new Date(huidigeJaar, huidigeMaand - 1, 1);
      const tienDagenNaStart = new Date(startDatum);
      tienDagenNaStart.setDate(tienDagenNaStart.getDate() + 10);
      
      if (actieveMaanden.includes(huidigeMaand) && 
          huidigeDatum.toDateString() === tienDagenNaStart.toDateString()) {
        await processActievePeriodeHerinnering(config.werkgever_id, config.employers.company_name);
      }
    }
  } catch (error) {
    console.error('Error processing actieve periode triggers:', error);
  }
}

async function processActievePeriodeStart(werkgeverId, bedrijfsnaam) {
  try {
    // Haal werkgever gegevens op
    const { data: werkgever, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('id', werkgeverId)
      .eq('role', 'employer')
      .single();
    
    if (error || !werkgever) return;
    
    // Check of er al een start mail is verstuurd
    const { data: existingEmail } = await supabase
      .from('email_queue')
      .select('id')
      .eq('ontvanger_email', werkgever.email)
      .eq('template_trigger', 'actieve_periode_start')
      .gte('aangemaakt_op', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .single();
    
    if (!existingEmail) {
      // Haal template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('trigger_event', 'actieve_periode_start')
        .eq('doelgroep', 'werkgever')
        .eq('is_active', true)
        .single();
      
      if (templateError) return;
      
      // Voeg email toe aan queue
      await supabase
        .from('email_queue')
        .insert({
          template_id: template.id,
          ontvanger_email: werkgever.email,
          ontvanger_type: 'werkgever',
          organisatie_id: werkgeverId,
          variabelen: {
            voornaam: werkgever.first_name || 'Er',
            bedrijf_naam: bedrijfsnaam,
            login_url: `${process.env.FRONTEND_URL}/login`
          }
        });
      
      console.log(`Actieve periode start mail toegevoegd voor: ${werkgever.email}`);
    }
  } catch (error) {
    console.error('Error processing actieve periode start:', error);
  }
}

async function processActievePeriodeHerinnering(werkgeverId, bedrijfsnaam) {
  // Vergelijkbare logica voor herinnering
  console.log(`Processing herinnering for werkgever: ${werkgeverId}`);
}

module.exports = { processEmailTriggers };
