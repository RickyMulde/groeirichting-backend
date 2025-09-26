const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const azureClient = require('./utils/azureOpenAI')
const { authMiddleware } = require('./middleware/auth')

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

    // 2c. Haal werknemer context op voor functie-omschrijving en gender
    const { data: werknemerContext, error: contextError } = await supabase
      .from('users')
      .select('functie_omschrijving, gender, employer_id')
      .eq('id', werknemer_id)
      .eq('employer_id', employerId)  // Voeg org-scope toe
      .single()

    if (contextError) {
      if (contextError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Werknemer niet gevonden' })
      }
      console.warn('Kon werknemer context niet ophalen:', contextError)
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

    const prompt = `Je bent een HR-assistent die vervolgacties voorstelt voor een WERKNEMER.

Thema: ${thema.titel}
${thema.beschrijving_werknemer ? `Beschrijving: ${thema.beschrijving_werknemer}` : ''}${werkgeverConfig?.organisatie_omschrijving ? `\n\nOrganisatie context: ${werkgeverConfig.organisatie_omschrijving}` : ''}${werknemerContext?.functie_omschrijving ? `\n\nFunctie context: ${werknemerContext.functie_omschrijving}` : ''}${werknemerContext?.gender ? `\n\nGeslacht: ${werknemerContext.gender}` : ''}

Hoofdvraag: ${hoofdvraag}
Doel van het gesprek: ${doelantwoord}

Gespreksgeschiedenis:
${inputJSON}

Opdracht:
Genereer 3 concrete en uitvoerbare vervolgacties die direct aansluiten op de inhoud van het gesprek.

De acties moeten voldoen aan deze regels:
- Schrijf altijd in de tweede persoon ("jij/je/jouw")
- Gericht op jou als werknemer, nooit op de werkgever
- Acties die jij zelf kunt ondernemen en beïnvloeden
- Aansluiten bij het thema en jouw antwoorden
- Specifiek en praktisch, geen algemene adviezen
- Geen suggesties die primair bij de werkgever horen
- Als het gesprek positief en in balans is: formuleer acties die helpen om dit vast te houden of te versterken

Voorbeelden van passende vervolgacties:
- "Plan een gesprek met je leidinggevende over…"
- "Zoek een workshop of training over…"
- "Maak een concreet actieplan voor…"
- "Stel jezelf als doel om in de komende weken…"
- "Blijf de gezamenlijke takenlijst gebruiken om overzicht te behouden."
- "Blijf na werktijd bewust offline, dat zorgt voor een goede balans."

Antwoord in JSON-formaat:
{
  "vervolgacties": [
    "Concrete actie 1",
    "Concrete actie 2", 
    "Concrete actie 3"
  ],
  "vervolgacties_toelichting": "Korte uitleg waarom deze acties passend zijn voor de werknemer"
}`

    // ✅ 4. Stuur prompt naar Azure OpenAI
    const completion = await azureClient.createCompletion({
      model: 'gpt-4o', // Gebruik GPT-4.1 via gpt-4o deployment
      messages: [{ role: 'user', content: prompt }],
      temperature: 1,
      max_completion_tokens: 4000  // Minder tokens nodig voor alleen vervolgacties
    })

    if (!completion.success) {
      throw new Error(`Azure OpenAI fout: ${completion.error}`)
    }

    const gptResponse = completion.data.choices[0].message.content
    const parsed = JSON.parse(gptResponse)

    // ✅ 5. Haal werkgever op via werknemer
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemer_id)
      .single()

    if (werknemerError) throw werknemerError
    if (!werknemer) {
      return res.status(404).json({ error: 'Werknemer niet gevonden' })
    }

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
      vervolgacties: parsed.vervolgacties || [],
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
      vervolgacties: parsed.vervolgacties || [],
      vervolgacties_toelichting: parsed.vervolgacties_toelichting || ''
    })
  } catch (err) {
    console.error('Fout bij genereren vervolgacties:', err)
    return res.status(500).json({ error: 'Fout bij genereren vervolgacties' })
  }
})

module.exports = router
