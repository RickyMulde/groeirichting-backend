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
        
        // Haal organisatie thema's op voor deze werkgever
        const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/organisation-themes/${employer.id}`)
        
        if (!response.ok) {
          console.error(`❌ Fout bij ophalen thema's voor werkgever ${employer.id}: ${response.status}`)
          continue
        }
        
        const data = await response.json()
        const themes = data.thema_s || []
        
        if (themes.length === 0) {
          console.log(`📝 Geen thema's gevonden voor werkgever ${employer.id}`)
          continue
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
            
            console.log(`🚀 Genereer samenvatting voor thema ${theme.titel} (reden: ${isLastDay ? 'laatste dag van maand' : '100% voortgang'})`)
            
            // Genereer samenvatting via bestaande endpoint
            const generateResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/generate-organisation-summary`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                organisatie_id: employer.id,
                theme_id: theme.theme_id
              })
            })
            
            if (generateResponse.ok) {
              const result = await generateResponse.json()
              console.log(`✅ Samenvatting gegenereerd voor thema ${theme.titel}:`, result.samenvatting ? 'Succes' : 'Geen samenvatting')
            } else {
              const errorData = await generateResponse.json().catch(() => ({}))
              console.error(`❌ Fout bij genereren samenvatting voor thema ${theme.titel}:`, errorData.error || `HTTP ${generateResponse.status}`)
            }
            
            // Wacht even tussen thema's om API rate limiting te voorkomen
            await new Promise(resolve => setTimeout(resolve, 1000))
            
          } catch (themeError) {
            console.error(`❌ Fout bij verwerken thema ${theme.titel}:`, themeError)
            continue
          }
        }
        
      } catch (employerError) {
        console.error(`❌ Fout bij verwerken werkgever ${employer.id}:`, employerError)
        continue
      }
    }
    
    console.log('✅ Automatische generatie van samenvattingen voltooid')
    
  } catch (error) {
    console.error('❌ Fout bij automatische generatie van samenvattingen:', error)
  }
}

// Start dagelijkse cron job om 02:00 's nachts (laagste belasting)
cron.schedule('0 2 * * *', () => {
  console.log('⏰ Start dagelijkse cron job voor automatische samenvattingen')
  autoGenerateSummaries()
}, {
  scheduled: true,
  timezone: "Europe/Amsterdam"
})

// Endpoint om handmatig de automatische generatie te starten (voor testing)
router.post('/trigger', async (req, res) => {
  try {
    console.log('🔧 Handmatige trigger van automatische generatie')
    await autoGenerateSummaries()
    res.json({ success: true, message: 'Automatische generatie gestart' })
  } catch (error) {
    console.error('❌ Fout bij handmatige trigger:', error)
    res.status(500).json({ error: 'Fout bij starten automatische generatie' })
  }
})

// Endpoint om status van de cron job op te halen
router.get('/status', (req, res) => {
  res.json({ 
    status: 'actief',
    schedule: 'dagelijks om 02:00 (Europe/Amsterdam)',
    nextRun: 'Berekend door node-cron',
    description: 'Genereert automatisch samenvattingen wanneer: laatste dag van actieve maand OF 100% voortgang'
  })
})

module.exports = router
