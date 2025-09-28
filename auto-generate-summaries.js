const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const cron = require('node-cron')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Functie om te controleren of het de laatste dag van de maand is
function isLastDayOfMonth(date) {
  const tomorrow = new Date(date)
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.getMonth() !== date.getMonth()
}

// Functie om te controleren of een maand een actieve maand is
function isActiveMonth(month) {
  const activeMonths = [3, 6, 9, 12] // Maart, Juni, September, December
  return activeMonths.includes(month)
}

// Functie om automatisch samenvattingen te genereren
async function autoGenerateSummaries() {
  console.log('🔄 Start automatische generatie van samenvattingen...')
  
  try {
    const today = new Date()
    const currentMonth = today.getMonth() + 1
    const currentYear = today.getFullYear()
    
    // Controleer of het een actieve maand is
    if (!isActiveMonth(currentMonth)) {
      console.log(`📅 ${currentMonth}/${currentYear} is geen actieve maand, skip generatie`)
      return
    }
    
    // Controleer of het de laatste dag van de maand is
    const isLastDay = isLastDayOfMonth(today)
    
    console.log(`📅 Huidige datum: ${today.toLocaleDateString('nl-NL')}`)
    console.log(`📅 Is laatste dag van maand: ${isLastDay}`)
    
    // Haal alle werkgevers op
    const { data: employers, error: employersError } = await supabase
      .from('employers')
      .select('id, contact_email')
    
    if (employersError) {
      console.error('❌ Fout bij ophalen werkgevers:', employersError)
      return
    }
    
    console.log(`👥 ${employers.length} werkgevers gevonden`)
    
    for (const employer of employers) {
      try {
        console.log(`\n🏢 Verwerk werkgever: ${employer.contact_email}`)
        
        // Haal teams op voor deze werkgever
        const { data: teams, error: teamsError } = await supabase
          .from('teams')
          .select('id, naam')
          .eq('werkgever_id', employer.id)
          .is('archived_at', null)
        
        if (teamsError) {
          console.error(`❌ Fout bij ophalen teams voor werkgever ${employer.id}:`, teamsError)
          continue
        }
        
        console.log(`👥 ${teams.length} teams gevonden voor werkgever ${employer.id}`)
        
        // Verwerk organisatie-brede thema's
        await processOrganizationThemes(employer, isLastDay)
        
        // Verwerk team-specifieke thema's
        for (const team of teams) {
          await processTeamThemes(employer, team, isLastDay)
        }
        
      } catch (employerError) {
        console.error(`❌ Fout bij verwerken werkgever ${employer.contact_email}:`, employerError)
      }
    }
  } catch (error) {
    console.error('❌ Fout bij automatische generatie:', error)
  }
}

// Functie om organisatie-brede thema's te verwerken
async function processOrganizationThemes(employer, isLastDay) {
  try {
    // Haal organisatie thema's op voor deze werkgever
    const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/organisation-themes/${employer.id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    })
    
    if (!response.ok) {
      console.error(`❌ Fout bij ophalen thema's voor werkgever ${employer.id}: ${response.status}`)
      return
    }
    
    const data = await response.json()
    const themes = data.thema_s || []
    
    if (themes.length === 0) {
      console.log(`📝 Geen thema's gevonden voor werkgever ${employer.id}`)
      return
    }
    
    console.log(`📝 ${themes.length} thema's gevonden voor werkgever ${employer.id}`)
    
    for (const theme of themes) {
      try {
        // Controleer of er al een samenvatting is
        if (theme.heeft_samenvatting) {
          console.log(`✅ Thema ${theme.titel} heeft al een samenvatting`)
          continue
        }
        
        // Controleer of er minimaal 4 medewerkers klaar zijn
        if (theme.voltooide_medewerkers < 4) {
          console.log(`⏳ Thema ${theme.titel}: nog maar ${theme.voltooide_medewerkers}/4 medewerkers klaar`)
          continue
        }
        
        // Controleer voorwaarden voor automatische generatie
        const shouldGenerate = isLastDay || theme.voltooide_medewerkers === theme.totaal_medewerkers
        
        if (!shouldGenerate) {
          console.log(`⏳ Thema ${theme.titel}: voorwaarden niet vervuld (laatste dag: ${isLastDay}, voortgang: ${theme.voltooide_medewerkers}/${theme.totaal_medewerkers})`)
          continue
        }
        
        console.log(`🚀 Genereer organisatie-brede samenvatting voor thema ${theme.titel} (reden: ${isLastDay ? 'laatste dag van maand' : '100% voortgang'})`)
        
        // Genereer organisatie-brede samenvatting
        await generateInsight(employer.id, theme.theme_id, null, theme.titel)
        
        // Wacht even tussen thema's om API rate limiting te voorkomen
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (themeError) {
        console.error(`❌ Fout bij verwerken thema ${theme.titel}:`, themeError)
      }
    }
  } catch (error) {
    console.error(`❌ Fout bij verwerken organisatie thema's voor ${employer.contact_email}:`, error)
  }
}

// Functie om team-specifieke thema's te verwerken
async function processTeamThemes(employer, team, isLastDay) {
  try {
    // Haal team thema's op voor dit team
    const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/organisation-themes/${employer.id}?team_id=${team.id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    })
    
    if (!response.ok) {
      console.error(`❌ Fout bij ophalen team thema's voor team ${team.naam}: ${response.status}`)
      return
    }
    
    const data = await response.json()
    const themes = data.thema_s || []
    
    if (themes.length === 0) {
      console.log(`📝 Geen thema's gevonden voor team ${team.naam}`)
      return
    }
    
    console.log(`📝 ${themes.length} thema's gevonden voor team ${team.naam}`)
    
    for (const theme of themes) {
      try {
        // Controleer of er al een team-specifieke samenvatting is
        if (theme.heeft_samenvatting) {
          console.log(`✅ Team ${team.naam} - Thema ${theme.titel} heeft al een samenvatting`)
          continue
        }
        
        // Controleer of er minimaal 4 teamleden klaar zijn
        if (theme.voltooide_medewerkers < 4) {
          console.log(`⏳ Team ${team.naam} - Thema ${theme.titel}: nog maar ${theme.voltooide_medewerkers}/4 teamleden klaar`)
          continue
        }
        
        // Controleer voorwaarden voor automatische generatie
        const shouldGenerate = isLastDay || theme.voltooide_medewerkers === theme.totaal_medewerkers
        
        if (!shouldGenerate) {
          console.log(`⏳ Team ${team.naam} - Thema ${theme.titel}: voorwaarden niet vervuld (laatste dag: ${isLastDay}, voortgang: ${theme.voltooide_medewerkers}/${theme.totaal_medewerkers})`)
          continue
        }
        
        console.log(`🚀 Genereer team-specifieke samenvatting voor team ${team.naam} - thema ${theme.titel} (reden: ${isLastDay ? 'laatste dag van maand' : '100% voortgang'})`)
        
        // Genereer team-specifieke samenvatting
        await generateInsight(employer.id, theme.theme_id, team.id, `${team.naam} - ${theme.titel}`)
        
        // Wacht even tussen thema's om API rate limiting te voorkomen
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (themeError) {
        console.error(`❌ Fout bij verwerken team thema ${theme.titel} voor team ${team.naam}:`, themeError)
      }
    }
  } catch (error) {
    console.error(`❌ Fout bij verwerken team thema's voor team ${team.naam}:`, error)
  }
}

// Functie om insights te genereren
async function generateInsight(organisatie_id, theme_id, team_id, context) {
  try {
    const generateResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/generate-organisation-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        organisatie_id: organisatie_id,
        theme_id: theme_id,
        team_id: team_id
      })
    })
    
    if (generateResponse.ok) {
      const result = await generateResponse.json()
      console.log(`✅ Samenvatting gegenereerd voor ${context}:`, result.samenvatting ? 'Succes' : 'Geen samenvatting')
    } else {
      const errorData = await generateResponse.json().catch(() => ({}))
      console.error(`❌ Fout bij genereren samenvatting voor ${context}:`, errorData.error || `HTTP ${generateResponse.status}`)
    }
  } catch (error) {
    console.error(`❌ Fout bij genereren samenvatting voor ${context}:`, error)
  }
}

// Cron job: elke dag om 23:00 controleren of het de laatste dag van de maand is
cron.schedule('0 23 * * *', () => {
  console.log('🕐 Cron job gestart: controleer of samenvattingen gegenereerd moeten worden')
  autoGenerateSummaries()
})

// Handmatige trigger voor testing
router.post('/trigger', async (req, res) => {
  try {
    await autoGenerateSummaries()
    res.json({ success: true, message: 'Automatische generatie gestart' })
  } catch (error) {
    console.error('Fout bij handmatige trigger:', error)
    res.status(500).json({ error: 'Fout bij handmatige trigger' })
  }
})

module.exports = router