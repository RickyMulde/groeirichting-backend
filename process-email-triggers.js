const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processEmailTriggers() {
  try {
    
    // 1. Account verificatie triggers
    await processAccountVerificatieTriggers();
    
    // 2. Actieve periode triggers
    await processActievePeriodeTriggers();
    
    // 3. Gesprek triggers
    await processGesprekTriggers();
    
    // 4. Andere triggers...
    
  } catch (error) {
    console.error('Error processing triggers:', error);
  }
}

async function processAccountVerificatieTriggers() {
  try {
    // Haal alle werkgevers op die recent zijn aangemaakt (laatste 24 uur)
    // We controleren later via Supabase Auth of ze geverifieerd zijn
    const { data: recentWerkgevers, error } = await supabase
      .from('users')
      .select('id, first_name, employer_id, email')
      .eq('role', 'employer')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    
    console.log(`Found ${recentWerkgevers?.length || 0} recently created employers`);
    
    for (const werkgever of recentWerkgevers || []) {
      // Controleer via Supabase Auth of de gebruiker geverifieerd is
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(werkgever.id);
      
      if (authError || !authUser?.user?.email_confirmed_at) {
        // Gebruiker is niet geverifieerd, sla over
        continue;
      }
      
      // Check of er al een welkomstmail is verstuurd (status = 'sent')
      const { data: existingEmails, error: checkError } = await supabase
        .from('email_queue')
        .select('id, status')
        .eq('ontvanger_email', werkgever.email)
        .eq('template_trigger', 'account_verificatie');
      
      // Als er een error is bij het checken, log en sla over (veiligheid)
      if (checkError) {
        console.error(`Error checking existing emails for ${werkgever.email}:`, checkError);
        continue;
      }
      
      // Als er al een email is met status 'sent', sla over (email is al verstuurd)
      const hasSentEmail = existingEmails?.some(email => email.status === 'sent');
      if (hasSentEmail) {
        continue;
      }
      
      // Als er een 'pending' email is, wacht tot die wordt verwerkt (voorkom dubbele emails)
      const hasPendingEmail = existingEmails?.some(email => email.status === 'pending' || email.status === 'sending');
      if (hasPendingEmail) {
        continue;
      }
      
      // Alleen toevoegen als er geen emails zijn (geen 'sent', 'pending', of 'sending')
      // Als er alleen 'failed' emails zijn, voegen we ook geen nieuwe toe (welkomstmail is eenmalig)
      // Haal welkomstmail template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id, naam, onderwerp')
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
          template_naam: template.naam,
          template_onderwerp: template.onderwerp,
          template_trigger: 'account_verificatie',
          ontvanger_email: werkgever.email,
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
    
    // Werknemers - check recent geregistreerde werknemers (laatste 24 uur)
    const { data: recentWerknemers, error: werknemerError } = await supabase
      .from('users')
      .select('id, first_name, employer_id, created_at, email')
      .eq('role', 'employee')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (werknemerError) throw werknemerError;
    
    console.log(`Found ${recentWerknemers?.length || 0} recently registered employees`);
    
    for (const werknemer of recentWerknemers || []) {
      // Controleer via Supabase Auth of de gebruiker geverifieerd is
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(werknemer.id);
      
      if (authError || !authUser?.user?.email_confirmed_at) {
        // Gebruiker is niet geverifieerd, sla over
        continue;
      }
      
      // Check of er al een welkomstmail is verstuurd (status = 'sent')
      const { data: existingEmails, error: checkError } = await supabase
        .from('email_queue')
        .select('id, status')
        .eq('ontvanger_email', werknemer.email)
        .eq('template_trigger', 'werknemer_registratie');
      
      // Als er een error is bij het checken, log en sla over (veiligheid)
      if (checkError) {
        console.error(`Error checking existing emails for ${werknemer.email}:`, checkError);
        continue;
      }
      
      // Als er al een email is met status 'sent', sla over (email is al verstuurd)
      const hasSentEmail = existingEmails?.some(email => email.status === 'sent');
      if (hasSentEmail) {
        continue;
      }
      
      // Als er een 'pending' email is, wacht tot die wordt verwerkt (voorkom dubbele emails)
      const hasPendingEmail = existingEmails?.some(email => email.status === 'pending' || email.status === 'sending');
      if (hasPendingEmail) {
        continue;
      }
      
      // Alleen toevoegen als er geen emails zijn (geen 'sent', 'pending', of 'sending')
      // Als er alleen 'failed' emails zijn, voegen we ook geen nieuwe toe (welkomstmail is eenmalig)
      // Haal welkomstmail template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id, naam, onderwerp')
        .eq('trigger_event', 'werknemer_registratie')
        .eq('doelgroep', 'werknemer')
        .eq('is_active', true)
        .single();
      
      if (templateError) {
        console.error('Template not found for werknemer_registratie:', templateError);
        continue;
      }
      
      // Voeg welkomstmail toe aan queue
      const { error: queueError } = await supabase
        .from('email_queue')
        .insert({
          template_id: template.id,
          template_naam: template.naam,
          template_onderwerp: template.onderwerp,
          template_trigger: 'werknemer_registratie',
          ontvanger_email: werknemer.email,
          organisatie_id: werknemer.employer_id,
          variabelen: {
            voornaam: werknemer.first_name || 'Er',
            login_url: `${process.env.FRONTEND_URL}/login`
          }
        });
      
      if (queueError) {
        console.error('Error adding welcome email to queue:', queueError);
      } else {
        console.log(`Welkomstmail toegevoegd voor werknemer: ${werknemer.email}`);
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
      
      // Check of vandaag 5 dagen voor start van actieve periode is
      const startDatum = new Date(huidigeJaar, huidigeMaand - 1, 1);
      const vijfDagenVoorStart = new Date(startDatum);
      vijfDagenVoorStart.setDate(vijfDagenVoorStart.getDate() - 5);
      
      if (actieveMaanden.includes(huidigeMaand) && 
          huidigeDatum.toDateString() === vijfDagenVoorStart.toDateString()) {
        await processActievePeriode5DagenVoor(config.werkgever_id, config.employers.company_name);
      }
      
      // Check of vandaag de eerste dag van een actieve periode is
      if (actieveMaanden.includes(huidigeMaand) && huidigeDatum.getDate() === 1) {
        await processActievePeriodeStart(config.werkgever_id, config.employers.company_name);
      }
      
      // Check of vandaag 10 dagen na start van actieve periode is
      const tienDagenNaStart = new Date(startDatum);
      tienDagenNaStart.setDate(tienDagenNaStart.getDate() + 10);
      
      if (actieveMaanden.includes(huidigeMaand) && 
          huidigeDatum.toDateString() === tienDagenNaStart.toDateString()) {
        await processActievePeriodeHerinnering(config.werkgever_id, config.employers.company_name);
      }
      
      // Check of vandaag 5 dagen voor einde van actieve periode is
      const laatsteDagVanMaand = new Date(huidigeJaar, huidigeMaand, 0);
      const vijfDagenVoorEinde = new Date(laatsteDagVanMaand);
      vijfDagenVoorEinde.setDate(vijfDagenVoorEinde.getDate() - 5);
      
      if (actieveMaanden.includes(huidigeMaand) && 
          huidigeDatum.toDateString() === vijfDagenVoorEinde.toDateString()) {
        await processActievePeriode5DagenEinde(config.werkgever_id, config.employers.company_name);
      }
      
      // Check of vandaag 1 dag na einde van actieve periode is (volgende maand, dag 1)
      const volgendeMaand = huidigeMaand === 12 ? 1 : huidigeMaand + 1;
      const volgendJaar = huidigeMaand === 12 ? huidigeJaar + 1 : huidigeJaar;
      
      if (actieveMaanden.includes(volgendeMaand) && 
          huidigeDatum.getMonth() + 1 === volgendeMaand && 
          huidigeDatum.getFullYear() === volgendJaar &&
          huidigeDatum.getDate() === 1) {
        await processResultatenBeschikbaar(config.werkgever_id, config.employers.company_name);
      }
      
      // Check of vandaag 14 dagen na resultaten is (volgende maand, dag 15)
      if (actieveMaanden.includes(volgendeMaand) && 
          huidigeDatum.getMonth() + 1 === volgendeMaand && 
          huidigeDatum.getFullYear() === volgendJaar &&
          huidigeDatum.getDate() === 15) {
        await processVerbeteradviezen(config.werkgever_id, config.employers.company_name);
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

async function processActievePeriode5DagenVoor(werkgeverId, bedrijfsnaam) {
  try {
    // Haal werkgever gegevens op
    const { data: werkgever, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('id', werkgeverId)
      .eq('role', 'employer')
      .single();
    
    if (error || !werkgever) return;
    
    // Check of er al een 5-dagen-voor mail is verstuurd
    const { data: existingEmail } = await supabase
      .from('email_queue')
      .select('id')
      .eq('ontvanger_email', werkgever.email)
      .eq('template_trigger', 'actieve_periode_5_dagen_voor')
      .gte('aangemaakt_op', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .single();
    
    if (!existingEmail) {
      // Haal template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('trigger_event', 'actieve_periode_5_dagen_voor')
        .eq('doelgroep', 'werkgever')
        .eq('is_active', true)
        .single();
      
      if (templateError) return;
      
      // Haal statistieken op
      const { data: teams } = await supabase
        .from('teams')
        .select('id')
        .eq('werkgever_id', werkgeverId);
      
      const { data: uitnodigingen } = await supabase
        .from('invitations')
        .select('id')
        .eq('employer_id', werkgeverId);
      
      const { data: werknemers } = await supabase
        .from('users')
        .select('id')
        .eq('employer_id', werkgeverId)
        .eq('role', 'employee');
      
      // Voeg email toe aan queue
      await supabase
        .from('email_queue')
        .insert({
          template_id: template.id,
          ontvanger_email: werkgever.email,
          organisatie_id: werkgeverId,
          variabelen: {
            voornaam: werkgever.first_name || 'Er',
            bedrijf_naam: bedrijfsnaam,
            teams_aantal: teams?.length || 0,
            uitgenodigd_aantal: uitnodigingen?.length || 0,
            geregistreerd_aantal: werknemers?.length || 0,
            login_url: `${process.env.FRONTEND_URL}/login`
          }
        });
      
      console.log(`5-dagen-voor mail toegevoegd voor: ${werkgever.email}`);
    }
  } catch (error) {
    console.error('Error processing 5-dagen-voor mail:', error);
  }
}

async function processActievePeriodeHerinnering(werkgeverId, bedrijfsnaam) {
  try {
    // Haal werkgever gegevens op
    const { data: werkgever, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('id', werkgeverId)
      .eq('role', 'employer')
      .single();
    
    if (error || !werkgever) return;
    
    // Check of er al een herinnering mail is verstuurd
    const { data: existingEmail } = await supabase
      .from('email_queue')
      .select('id')
      .eq('ontvanger_email', werkgever.email)
      .eq('template_trigger', 'actieve_periode_10_dagen_na')
      .gte('aangemaakt_op', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .single();
    
    if (!existingEmail) {
      // Haal template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('trigger_event', 'actieve_periode_10_dagen_na')
        .eq('doelgroep', 'werkgever')
        .eq('is_active', true)
        .single();
      
      if (templateError) return;
      
      // Haal statistieken op
      const { data: teams } = await supabase
        .from('teams')
        .select('id')
        .eq('werkgever_id', werkgeverId);
      
      const { data: werknemers } = await supabase
        .from('users')
        .select('id')
        .eq('employer_id', werkgeverId)
        .eq('role', 'employee');
      
      const { data: gesprekken } = await supabase
        .from('gesprek')
        .select('id')
        .in('werknemer_id', werknemers?.map(w => w.id) || [])
        .eq('status', 'Afgerond');
      
      // Bereken dagen te gaan (einde van de maand)
      const huidigeDatum = new Date();
      const laatsteDagVanMaand = new Date(huidigeDatum.getFullYear(), huidigeDatum.getMonth() + 1, 0);
      const dagenTeGaan = Math.ceil((laatsteDagVanMaand - huidigeDatum) / (1000 * 60 * 60 * 24));
      
      // Voeg email toe aan queue
      await supabase
        .from('email_queue')
        .insert({
          template_id: template.id,
          ontvanger_email: werkgever.email,
          organisatie_id: werkgeverId,
          variabelen: {
            voornaam: werkgever.first_name || 'Er',
            bedrijf_naam: bedrijfsnaam,
            teams_aantal: teams?.length || 0,
            actieve_werknemers: werknemers?.length || 0,
            afgeronde_gesprekken: gesprekken?.length || 0,
            dagen_te_gaan: dagenTeGaan,
            voortgang_url: `${process.env.FRONTEND_URL}/werkgever-dashboard`
          }
        });
      
      console.log(`10-dagen-na mail toegevoegd voor: ${werkgever.email}`);
    }
  } catch (error) {
    console.error('Error processing 10-dagen-na mail:', error);
  }
}

async function processActievePeriode5DagenEinde(werkgeverId, bedrijfsnaam) {
  try {
    // Haal werkgever gegevens op
    const { data: werkgever, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('id', werkgeverId)
      .eq('role', 'employer')
      .single();
    
    if (error || !werkgever) return;
    
    // Check of er al een 5-dagen-einde mail is verstuurd
    const { data: existingEmail } = await supabase
      .from('email_queue')
      .select('id')
      .eq('ontvanger_email', werkgever.email)
      .eq('template_trigger', 'actieve_periode_5_dagen_einde')
      .gte('aangemaakt_op', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .single();
    
    if (!existingEmail) {
      // Haal template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('trigger_event', 'actieve_periode_5_dagen_einde')
        .eq('doelgroep', 'werkgever')
        .eq('is_active', true)
        .single();
      
      if (templateError) return;
      
      // Haal statistieken op
      const { data: teams } = await supabase
        .from('teams')
        .select('id')
        .eq('werkgever_id', werkgeverId);
      
      const { data: werknemers } = await supabase
        .from('users')
        .select('id')
        .eq('employer_id', werkgeverId)
        .eq('role', 'employee');
      
      const { data: gesprekken } = await supabase
        .from('gesprek')
        .select('id')
        .in('werknemer_id', werknemers?.map(w => w.id) || [])
        .eq('status', 'Afgerond');
      
      // Bereken nog te doen (totaal mogelijke gesprekken - afgerond)
      const totaalMogelijkeGesprekken = (werknemers?.length || 0) * 3; // Aanname: 3 thema's per werknemer
      const nogTeDoen = Math.max(0, totaalMogelijkeGesprekken - (gesprekken?.length || 0));
      
      // Voeg email toe aan queue
      await supabase
        .from('email_queue')
        .insert({
          template_id: template.id,
          ontvanger_email: werkgever.email,
          organisatie_id: werkgeverId,
          variabelen: {
            voornaam: werkgever.first_name || 'Er',
            bedrijf_naam: bedrijfsnaam,
            teams_aantal: teams?.length || 0,
            actieve_werknemers: werknemers?.length || 0,
            afgeronde_gesprekken: gesprekken?.length || 0,
            nog_te_doen: nogTeDoen,
            voortgang_url: `${process.env.FRONTEND_URL}/werkgever-dashboard`
          }
        });
      
      console.log(`5-dagen-einde mail toegevoegd voor: ${werkgever.email}`);
    }
  } catch (error) {
    console.error('Error processing 5-dagen-einde mail:', error);
  }
}

async function processResultatenBeschikbaar(werkgeverId, bedrijfsnaam) {
  try {
    // Haal werkgever gegevens op
    const { data: werkgever, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('id', werkgeverId)
      .eq('role', 'employer')
      .single();
    
    if (error || !werkgever) return;
    
    // Check of er al een resultaten mail is verstuurd
    const { data: existingEmail } = await supabase
      .from('email_queue')
      .select('id')
      .eq('ontvanger_email', werkgever.email)
      .eq('template_trigger', 'resultaten_beschikbaar')
      .gte('aangemaakt_op', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .single();
    
    if (!existingEmail) {
      // Haal template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('trigger_event', 'resultaten_beschikbaar')
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
          organisatie_id: werkgeverId,
          variabelen: {
            voornaam: werkgever.first_name || 'Er',
            bedrijf_naam: bedrijfsnaam,
            resultaten_url: `${process.env.FRONTEND_URL}/werkgever-dashboard`
          }
        });
      
      console.log(`Resultaten beschikbaar mail toegevoegd voor: ${werkgever.email}`);
    }
  } catch (error) {
    console.error('Error processing resultaten beschikbaar mail:', error);
  }
}

async function processVerbeteradviezen(werkgeverId, bedrijfsnaam) {
  try {
    // Haal werkgever gegevens op
    const { data: werkgever, error } = await supabase
      .from('users')
      .select('id, first_name, email')
      .eq('id', werkgeverId)
      .eq('role', 'employer')
      .single();
    
    if (error || !werkgever) return;
    
    // Check of er al een verbeteradviezen mail is verstuurd
    const { data: existingEmail } = await supabase
      .from('email_queue')
      .select('id')
      .eq('ontvanger_email', werkgever.email)
      .eq('template_trigger', 'verbeteradviezen_14_dagen')
      .gte('aangemaakt_op', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      .single();
    
    if (!existingEmail) {
      // Haal template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('trigger_event', 'verbeteradviezen_14_dagen')
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
          organisatie_id: werkgeverId,
          variabelen: {
            voornaam: werkgever.first_name || 'Er',
            bedrijf_naam: bedrijfsnaam,
            verbeteradviezen_url: `${process.env.FRONTEND_URL}/werkgever-dashboard`
          }
        });
      
      console.log(`Verbeteradviezen mail toegevoegd voor: ${werkgever.email}`);
    }
  } catch (error) {
    console.error('Error processing verbeteradviezen mail:', error);
  }
}

async function processGesprekTriggers() {
  try {
    // 1. Gesprek gepland triggers
    await processGesprekGeplandTriggers();
    
    // 2. Gesprek herinnering triggers
    await processGesprekHerinneringTriggers();
    
    // 3. Gesprek afgerond triggers
    await processGesprekAfgerondTriggers();
    
  } catch (error) {
    console.error('Error processing gesprek triggers:', error);
  }
}

async function processGesprekGeplandTriggers() {
  try {
    // Haal gesprekken op die recent zijn ingepland (laatste 24 uur)
    const { data: recentGesprekken, error } = await supabase
      .from('gesprek')
      .select(`
        id,
        werknemer_id,
        theme_id,
        gestart_op,
        users!inner(
          id,
          first_name,
          email,
          employer_id
        ),
        themes!inner(
          id,
          titel
        )
      `)
      .eq('status', 'Gepland')
      .gte('gestart_op', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    
    console.log(`Found ${recentGesprekken?.length || 0} recently planned gesprekken`);
    
    for (const gesprek of recentGesprekken || []) {
      // Check of er al een gesprek gepland mail is verstuurd
      const { data: existingEmail } = await supabase
        .from('email_queue')
        .select('id')
        .eq('ontvanger_email', gesprek.users.email)
        .eq('template_trigger', 'gesprek_gepland')
        .eq('metadata->>gesprek_id', gesprek.id.toString())
        .single();
      
      if (!existingEmail) {
        // Haal template op
        const { data: template, error: templateError } = await supabase
          .from('email_templates')
          .select('id')
          .eq('trigger_event', 'gesprek_gepland')
          .eq('doelgroep', 'werknemer')
          .eq('is_active', true)
          .single();
        
        if (templateError) {
          console.error('Template not found for gesprek_gepland:', templateError);
          continue;
        }
        
        // Format datum
        const gesprekDatum = new Date(gesprek.gestart_op).toLocaleDateString('nl-NL', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        // Voeg email toe aan queue
        await supabase
          .from('email_queue')
          .insert({
            template_id: template.id,
            ontvanger_email: gesprek.users.email,
            organisatie_id: gesprek.users.employer_id,
            variabelen: {
              voornaam: gesprek.users.first_name || 'Er',
              thema_titel: gesprek.themes.titel,
              gesprek_datum: gesprekDatum,
              gesprek_link: `${process.env.FRONTEND_URL}/gesprek/${gesprek.id}`
            },
            metadata: {
              gesprek_id: gesprek.id
            }
          });
        
        console.log(`Gesprek gepland mail toegevoegd voor: ${gesprek.users.email}`);
      }
    }
  } catch (error) {
    console.error('Error processing gesprek gepland triggers:', error);
  }
}

async function processGesprekHerinneringTriggers() {
  try {
    // Haal gesprekken op die morgen plaatsvinden
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    morgen.setHours(0, 0, 0, 0);
    
    const morgenEinde = new Date(morgen);
    morgenEinde.setHours(23, 59, 59, 999);
    
    const { data: morgenGesprekken, error } = await supabase
      .from('gesprek')
      .select(`
        id,
        werknemer_id,
        theme_id,
        gestart_op,
        users!inner(
          id,
          first_name,
          email,
          employer_id
        ),
        themes!inner(
          id,
          titel
        )
      `)
      .eq('status', 'Gepland')
      .gte('gestart_op', morgen.toISOString())
      .lte('gestart_op', morgenEinde.toISOString());
    
    if (error) throw error;
    
    console.log(`Found ${morgenGesprekken?.length || 0} gesprekken tomorrow`);
    
    for (const gesprek of morgenGesprekken || []) {
      // Check of er al een herinnering is verstuurd
      const { data: existingEmail } = await supabase
        .from('email_queue')
        .select('id')
        .eq('ontvanger_email', gesprek.users.email)
        .eq('template_trigger', 'gesprek_herinnering')
        .eq('metadata->>gesprek_id', gesprek.id.toString())
        .single();
      
      if (!existingEmail) {
        // Haal template op
        const { data: template, error: templateError } = await supabase
          .from('email_templates')
          .select('id')
          .eq('trigger_event', 'gesprek_herinnering')
          .eq('doelgroep', 'werknemer')
          .eq('is_active', true)
          .single();
        
        if (templateError) {
          console.error('Template not found for gesprek_herinnering:', templateError);
          continue;
        }
        
        // Format datum
        const gesprekDatum = new Date(gesprek.gestart_op).toLocaleDateString('nl-NL', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        // Voeg email toe aan queue
        await supabase
          .from('email_queue')
          .insert({
            template_id: template.id,
            ontvanger_email: gesprek.users.email,
            organisatie_id: gesprek.users.employer_id,
            variabelen: {
              voornaam: gesprek.users.first_name || 'Er',
              thema_titel: gesprek.themes.titel,
              gesprek_datum: gesprekDatum,
              gesprek_link: `${process.env.FRONTEND_URL}/gesprek/${gesprek.id}`
            },
            metadata: {
              gesprek_id: gesprek.id
            }
          });
        
        console.log(`Gesprek herinnering mail toegevoegd voor: ${gesprek.users.email}`);
      }
    }
  } catch (error) {
    console.error('Error processing gesprek herinnering triggers:', error);
  }
}

async function processGesprekAfgerondTriggers() {
  try {
    // Haal gesprekken op die recent zijn afgerond (laatste 24 uur)
    const { data: recentGesprekken, error } = await supabase
      .from('gesprek')
      .select(`
        id,
        werknemer_id,
        theme_id,
        beeindigd_op,
        users!inner(
          id,
          first_name,
          email,
          employer_id
        ),
        themes!inner(
          id,
          titel
        )
      `)
      .eq('status', 'Afgerond')
      .gte('beeindigd_op', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    
    if (error) throw error;
    
    console.log(`Found ${recentGesprekken?.length || 0} recently completed gesprekken`);
    
    for (const gesprek of recentGesprekken || []) {
      // Check of er al een gesprek afgerond mail is verstuurd voor dit specifieke gesprek
      const { data: existingEmails, error: checkError } = await supabase
        .from('email_queue')
        .select('id, status')
        .eq('ontvanger_email', gesprek.users.email)
        .eq('template_trigger', 'gesprek_afgerond')
        .eq('metadata->>gesprek_id', gesprek.id.toString());
      
      // Als er een error is bij het checken, log en sla over (veiligheid)
      if (checkError) {
        console.error(`Error checking existing emails for gesprek ${gesprek.id}:`, checkError);
        continue;
      }
      
      // Als er al een email is met status 'sent' voor dit gesprek, sla over
      const hasSentEmail = existingEmails?.some(email => email.status === 'sent');
      if (hasSentEmail) {
        continue;
      }
      
      // Als er een 'pending' email is voor dit gesprek, wacht tot die wordt verwerkt
      const hasPendingEmail = existingEmails?.some(email => email.status === 'pending' || email.status === 'sending');
      if (hasPendingEmail) {
        continue;
      }
      
      // Alleen toevoegen als er geen emails zijn voor dit gesprek (geen 'sent', 'pending', of 'sending')
      // Haal template op
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('trigger_event', 'gesprek_afgerond')
        .eq('doelgroep', 'werknemer')
        .eq('is_active', true)
        .maybeSingle();
      
      // Als template niet bestaat, sla over zonder error te loggen (template is optioneel)
      if (templateError || !template) {
        continue;
      }
      
      // Voeg email toe aan queue
      await supabase
        .from('email_queue')
        .insert({
          template_id: template.id,
          ontvanger_email: gesprek.users.email,
          organisatie_id: gesprek.users.employer_id,
          variabelen: {
            voornaam: gesprek.users.first_name || 'Er',
            thema_titel: gesprek.themes.titel,
            dashboard_url: `${process.env.FRONTEND_URL}/werknemer-dashboard`
          },
          metadata: {
            gesprek_id: gesprek.id
          }
        });
      
      console.log(`Gesprek afgerond mail toegevoegd voor: ${gesprek.users.email}`);
    }
  } catch (error) {
    console.error('Error processing gesprek afgerond triggers:', error);
  }
}

module.exports = { processEmailTriggers };
