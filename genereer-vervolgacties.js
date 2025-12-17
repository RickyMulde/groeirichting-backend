const express = require('express')
const { createClient } = require('@supabase/supabase-js')
// 🔄 MIGRATIE: Nu met Responses API voor GPT-5.2
const openaiClient = require('./utils/openaiClient')
const { authMiddleware } = require('./middleware/auth')
const { hasThemeAccess } = require('./utils/themeAccessService')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gebruik auth middleware voor alle routes
router.use(authMiddleware)

router.post('/', async (req, res) => {
  const { theme_id, werknemer_id, gesprek_id } = req.body
  const employerId = req.ctx.employerId
  
  if (!theme_id || !werknemer_id) {
    return res.status(400).json({ error: 'theme_id en werknemer_id zijn verplicht' })
  }

  try {
    // ✅ VALIDATIE: Haal werknemer op om team_id te krijgen en check toegang tot thema
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id, team_id')
      .eq('id', werknemer_id)
      .eq('employer_id', employerId)
      .single()

    if (werknemerError) {
      if (werknemerError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Werknemer niet gevonden' })
      }
      throw werknemerError
    }

    if (!werknemer || werknemer.employer_id !== employerId) {
      return res.status(403).json({ error: 'Geen toegang tot deze werknemer' })
    }

    // Check toegang tot thema
    const hasAccess = await hasThemeAccess(employerId, theme_id, werknemer.team_id || null)
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'Dit thema is niet beschikbaar voor jouw organisatie of team' 
      })
    }

    // 0️⃣ Haal het thema op uit de themes-tabel
    const { data: thema, error: themaError } = await supabase
      .from('themes')
      .select('*')
      .eq('id', theme_id)
      .single()

    if (themaError) throw themaError
    if (!thema) {
      return res.status(404).json({ error: 'Thema niet gevonden' })
    }

    // Controleer of samenvatting gewenst is (vervolgacties zijn onderdeel van samenvatting)
    if (thema.geeft_samenvatting === false) {
      return res.status(200).json({
        vervolgacties: [],
        vervolgacties_toelichting: '',
        melding: 'Voor dit thema hoeven geen vervolgacties te worden gegenereerd.'
      })
    }

    // ✅ 1. Haal de complete gespreksgeschiedenis op uit de nieuwe tabel
    const { data: gesprekData, error: gesprekError } = await supabase
      .from('gesprekken_compleet')
      .select('gespreksgeschiedenis, metadata')
      .eq('werknemer_id', werknemer_id)
      .eq('theme_id', theme_id)
      .eq('gesprek_id', gesprek_id)
      .single()

    if (gesprekError) {
      if (gesprekError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Gesprek niet gevonden' })
      }
      throw gesprekError
    }

    if (!gesprekData || !gesprekData.gespreksgeschiedenis || gesprekData.gespreksgeschiedenis.length === 0) {
      return res.status(404).json({ error: 'Geen gespreksgeschiedenis gevonden' })
    }

    const gespreksgeschiedenis = gesprekData.gespreksgeschiedenis

    // ✅ 2. Vind hoofdvraag en doelvraag (alleen van vaste vragen)
    const vasteVragen = gespreksgeschiedenis.filter(item => item.type === 'vaste_vraag')
    
    // Haal de vaste vragen op uit theme_questions om type en doel_vraag te krijgen
    const vasteVraagIds = vasteVragen.map(item => item.vraag_id).filter(Boolean)
    
    let vasteVragenData = []
    if (vasteVraagIds.length > 0) {
      const { data: themeQuestions, error: themeError } = await supabase
        .from('theme_questions')
        .select('id, tekst, type, doel_vraag')
        .in('id', vasteVraagIds)
      
      if (!themeError && themeQuestions) {
        vasteVragenData = themeQuestions
      }
    }

    // 2b. Haal werkgever configuratie op voor organisatie-omschrijving
    const { data: werkgeverConfig, error: configError } = await supabase
      .from('werkgever_gesprek_instellingen')
      .select('organisatie_omschrijving')
      .eq('werkgever_id', (await supabase.from('users').select('employer_id').eq('id', werknemer_id).single()).data?.employer_id)
      .single()

    if (configError && configError.code !== 'PGRST116') {
      console.warn('Kon werkgever configuratie niet ophalen:', configError)
    }

    // 2c. Haal werknemer context op voor functie-omschrijving en gender (werknemer is al opgehaald, gebruik die data)
    const werknemerContext = {
      functie_omschrijving: werknemer.functie_omschrijving,
      gender: werknemer.gender,
      employer_id: werknemer.employer_id
    }
    
    // Haal extra velden op die we nog nodig hebben
    const { data: werknemerExtra, error: contextError } = await supabase
      .from('users')
      .select('functie_omschrijving, gender')
      .eq('id', werknemer_id)
      .single()

    if (!contextError && werknemerExtra) {
      werknemerContext.functie_omschrijving = werknemerExtra.functie_omschrijving
      werknemerContext.gender = werknemerExtra.gender
    }

    const hoofdvraag = vasteVragenData.find(v => v.type === 'hoofd')?.tekst || ''
    const doelvraag = vasteVragenData.find(v => v.type === 'doel')?.tekst || ''
    const doelantwoord = gespreksgeschiedenis.find(item => 
      vasteVragenData.find(v => v.id === item.vraag_id)?.type === 'doel'
    )?.antwoord || ''

    // ✅ 3. Bouw prompt met alle vragen (vaste + vervolg)
    const inputJSON = gespreksgeschiedenis.map(item => 
      `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}`
    ).join('\n\n')

    // System instructions - Focus: Helder, nuchter, oplossingsgericht (Geen marketing)
    const systemInstructions = `Je bent een professionele, inhoudelijke HR-adviseur voor 'GroeiRichting'.
Je analyseert gespreksverslagen en formuleert 3 concrete vervolgstappen.

Jouw toon is:
- Nuchter en helder (geen marketing-kreten of uitroeptekens).
- Oplossingsgericht (de titel beschrijft de oplossing).
- Persoonlijk (je refereert aan wat er gezegd is).

Richtlijnen voor de 3 adviezen:

1. DE TITEL (De Oplossing):
   - Beschrijf concreet wat de werknemer gaat doen of bereiken.
   - Begin met een werkwoord.
   - Wees specifiek.
   - NIET: "Tem de piekdrukte!"
   - WEL: "Organiseer extra ondersteuning tijdens piekmomenten"
   - NIET: "Pak je kans!"
   - WEL: "Bespreek jouw ambities voor een rol als teamleider"

2. DE REDEN (De Context):
   - Begin met: "Je gaf aan dat..." of "Omdat je aangaf dat..."
   - Vat kort samen waarom dit advies relevant is op basis van het gesprek.

3. HET RESULTAAT (De Belofte):
   - Eén zin die uitlegt wat het oplevert als de werknemer dit doet.
   - Bijv: "Dit zorgt voor meer rust en overzicht in je dagelijkse werk."`

    // User input
    const userInput = `Thema: ${thema.titel}
${thema.beschrijving_werknemer ? `Beschrijving thema: ${thema.beschrijving_werknemer}` : ''}
${werkgeverConfig?.organisatie_omschrijving ? `Organisatie context: ${werkgeverConfig.organisatie_omschrijving}` : ''}
${werknemerContext?.functie_omschrijving ? `Functie context: ${werknemerContext.functie_omschrijving}` : ''}

Context van het gesprek:
Hoofdvraag: ${hoofdvraag}
Doel van het gesprek: ${doelantwoord}

Volledige Gespreksgeschiedenis:
${inputJSON}

OPDRACHT:
Genereer 3 unieke, inhoudelijke vervolgacties op basis van dit gesprek.

Zorg dat de adviezen aansluiten bij de input:
- Als de werknemer zelf een oplossing aandraagt (bijv. hulp van andere afdelingen), maak dat dan één van de adviezen.
- Als de werknemer passief is, maak een advies om regie te pakken of het gesprek aan te gaan.
- Als de werknemer tevreden is, maak een advies om dit succes te borgen of te delen.

Antwoord in JSON-formaat.`

    // ✅ 4. Stuur prompt naar OpenAI Responses API
    const response = await openaiClient.createResponse({
      model: 'gpt-5.2', 
      instructions: systemInstructions,
      input: [{ role: 'user', content: userInput }],
      max_output_tokens: 3000,
      service_tier: 'default',
      text: {
        format: {
          type: 'json_schema',
          name: 'vervolgacties_output',
          schema: {
            type: 'object',
            properties: {
              vervolgacties_toelichting: { type: 'string', description: "Korte samenvatting voor HR manager" },
              adviezen: {
                type: 'array',
                items: { 
                  type: 'object',
                  properties: {
                    titel: { type: 'string', description: "Concrete, beschrijvende titel (bijv: 'Maak afspraken over bereikbaarheid')" },
                    reden: { type: 'string', description: "Korte context: 'Je gaf aan dat...'" },
                    resultaat: { type: 'string', description: "Wat levert het op? (bijv: 'Dit voorkomt dat je werk zich opstapelt.')" }
                  },
                  required: ['titel', 'reden', 'resultaat'],
                  additionalProperties: false
                },
                minItems: 3,
                maxItems: 3
              }
            },
            required: ['adviezen', 'vervolgacties_toelichting'],
            additionalProperties: false
          },
          strict: true
        }
      }
    })

    if (!response.success) {
      throw new Error(`OpenAI Responses API fout: ${response.error}`)
    }

    const gptResponse = response.data.output_text
    
    // Verwijder markdown code blocks als die er zijn
    let cleanResponse = gptResponse
    if (cleanResponse.includes('```json')) {
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    }
    
    let parsed
    try {
      parsed = JSON.parse(cleanResponse)
    } catch (parseError) {
      console.error('Fout bij parsen van GPT-respons:', parseError)
      console.error('Raw response:', gptResponse)
      console.error('Cleaned response:', cleanResponse)
      throw new Error('Fout bij parsen van GPT response')
    }

    // ✅ 5. Werkgever is al opgehaald bij validatie (werknemer.employer_id)

    // ✅ 6. Bepaal gespreksronde en periode
    let gespreksronde = 1
    let periode = null
    
    if (gesprek_id) {
      // Haal gesprek op om startdatum te krijgen
      const { data: gesprek, error: gesprekError } = await supabase
        .from('gesprek')
        .select('gestart_op')
        .eq('id', gesprek_id)
        .single()
      
      if (!gesprekError && gesprek && gesprek.gestart_op) {
        // Bepaal periode op basis van startdatum (YYYY-MM formaat)
        const startDatum = new Date(gesprek.gestart_op)
        const jaar = startDatum.getFullYear()
        const maand = String(startDatum.getMonth() + 1).padStart(2, '0')
        periode = `${jaar}-${maand}`
      }
      
      // Tel hoeveel gesprekken er al zijn voor dit thema en deze werknemer
      const { data: bestaandeGesprekken, error: rondeError } = await supabase
        .from('gesprek')
        .select('id')
        .eq('theme_id', theme_id)
        .eq('werknemer_id', werknemer_id)
        .order('gestart_op', { ascending: true })

      if (!rondeError && bestaandeGesprekken) {
        const huidigeIndex = bestaandeGesprekken.findIndex(g => g.id === gesprek_id)
        gespreksronde = huidigeIndex !== -1 ? huidigeIndex + 1 : bestaandeGesprekken.length
      }
    }

    // ✅ 7. Update gesprekresultaten met vervolgacties (met retry logica)
    const updateData = {
      vervolgacties: parsed.adviezen || [],
      vervolgacties_toelichting: parsed.vervolgacties_toelichting || '',
      vervolgacties_generatie_datum: new Date().toISOString()
    }

    // Retry logica voor race conditions
    let success = false
    let attempts = 0
    const maxAttempts = 3

    while (!success && attempts < maxAttempts) {
      attempts++
      
      try {
        // Probeer eerst een update op gesprek_id
        const { data: updateResult, error: updateError } = await supabase
          .from('gesprekresultaten')
          .update(updateData)
          .eq('gesprek_id', gesprek_id)
          .select()
        
        if (updateError) {
          throw updateError
        }
        
        if (updateResult && updateResult.length > 0) {
          // Update succesvol
          success = true
        } else {
          // Geen bestaande rij, probeer insert
          const resultaatData = {
            werkgever_id: werknemer.employer_id,
            werknemer_id,
            theme_id,
            gesprek_id: gesprek_id,
            samenvatting: null, // Wordt later ingevuld door samenvatting endpoint
            score: null, // Wordt later ingevuld door samenvatting endpoint
            samenvatting_type: 'initieel',
            gespreksronde,
            periode: periode,
            gegenereerd_op: new Date().toISOString(),
            ...updateData
          }
          
          const { error: insertError } = await supabase
            .from('gesprekresultaten')
            .insert(resultaatData)
          
          if (insertError) {
            // Mogelijk race condition - wacht en probeer opnieuw
            if (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
              continue
            }
            throw insertError
          }
          
          success = true
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          console.error('Fout bij opslaan vervolgacties na', maxAttempts, 'pogingen:', error)
          throw error
        }
        // Wacht en probeer opnieuw
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
      }
    }

    return res.json({
      adviezen: parsed.adviezen || [],
      vervolgacties_toelichting: parsed.vervolgacties_toelichting || ''
    })
  } catch (err) {
    console.error('Fout bij genereren vervolgacties:', err)
    return res.status(500).json({ error: 'Fout bij genereren vervolgacties' })
  }
})

module.exports = router
