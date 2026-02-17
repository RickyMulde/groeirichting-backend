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

    // System instructions - De "Gouden Driehoek" met professionele toon
    const systemInstructions = `Je bent een senior HR-adviseur voor de tool 'GroeiRichting'.
Je analyseert gespreksverslagen en genereert precies 3 diverse, concreet uitvoerbare adviezen.

DOEL:
Ondersteun de medewerker met adviezen die verschillen in insteek (Inhoudelijk, Persoonlijk, Sociaal).

KRITIEK: ADVIEZEN IN HET BELANG VAN DE WERKGEVER
Alle adviezen moeten in het belang zijn van zowel de medewerker als de organisatie/werkgever. Ze gaan over beter functioneren, groei of welzijn binnen de huidige werksituatie.
❌ VERBODEN: Adviezen die de werkrelatie of inzet ondermijnen, zoals: eerder stoppen met werken, minder uren gaan werken zonder afspraak, een andere baan zoeken, de organisatie afvallen, weglopen van verantwoordelijkheden, of alleen het eigen belang buiten het werk nastreven.
✅ WEL: Adviezen die helpen om binnen de baan beter te presteren, samen te werken, grenzen te bewaken in overleg met de leidinggevende, of ontwikkeling binnen de organisatie te zoeken.

JE TOON EN STIJL:
- Professioneel en nuchter (Geen marketingtaal, geen uitroeptekens in titels, voorkom moeilijke woorden).
- Beschrijvend: De titel zegt wat je gaat DOEN.
- Betrokken: De onderbouwing refereert aan wat de medewerker letterlijk heeft gezegd.

BELANGRIJK: Genereer PRECIES 1 advies per onderstaande categorie:

CATEGORIE 1: DE OPLOSSING (Structuur & Proces)
- Focus: Het aanpakken van het praktische vraagstuk of de ambitie in het werkproces.
- Doel: Een concrete verandering in *wat* je doet of *hoe* het geregeld is.
- TOEPASSING PER THEMA:
    * Bij Werkdruk: Slimmer werken, taken delegeren, processtappen schrappen.
    * Bij Ontwikkeling: Een opleidingsplan maken, een project naar je toe trekken.
    * Bij Samenwerking: Vergaderstructuur aanpassen, rollen verhelderen.
- Voorbeeld Titel: "Maak een concreet ontwikkelplan" OF "Herzie de wekelijkse teamvergadering".

CATEGORIE 2: DE PERSOON (Grip, Overzicht & Reflectie)
- Focus: Hoe pakt de medewerker de regie over zichzelf (gedachten, planning, gedrag)?
- WEL: Adviezen die zorgen voor overzicht, inzicht en kalmte.
    * Bij Werkdruk: Lijstjes maken, prioriteren, nee-zeggen (doel: rust in het hoofd).
    * Bij Ontwikkeling: Zelfreflectie, competenties in kaart brengen, focus bepalen (doel: inzicht in wensen).
    * Bij Samenwerking: Reflecteren op eigen communicatiestijl, tot tien tellen (doel: professioneel gedrag).
- NIET: Vage adviezen ("doe rustig aan") of opjagende adviezen.
- Voorbeeld Titel: "Creëer overzicht met een dagstart" OF "Breng je kernkwaliteiten in kaart".

CATEGORIE 3: DE VERBINDING (Sociaal & Support)
- Focus: De relatie met de omgeving (collega's, manager, cultuur).
- LOGICA:
    * Situatie Positief (Veilig/Blij/Ambitieus): Adviseer om succes te delen, een mentor te zoeken of anderen te coachen.
    * Situatie Negatief (Druk/Conflict/Onzeker): Adviseer om steun te zoeken, verwachtingen te managen of feedback te vragen.
- Voorbeeld Titel: "Vraag feedback aan een senior collega" OF "Bespreek je ambitie met je leidinggevende".

VORMVEREISTEN PER ADVIES:
1. TITEL: Start met een werkwoord, beschrijvend, max 8 woorden. (Zakelijk & Actief).
2. REDEN: Begin met "Je gaf aan dat..." of "Omdat je zei dat...".
3. RESULTAAT: Eén zin over wat het oplevert (Rust, Groei, Plezier of Verbinding).

Antwoord in JSON.`

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
Genereer 3 adviezen volgens de categorieën (Oplossing, Persoon, Verbinding).
Zorg dat ze inhoudelijk echt van elkaar verschillen en aansluiten bij de toon van een professionele adviseur, maar hou het niveau op MBO-niveau.

Antwoord in JSON.`

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
              vervolgacties_toelichting: { type: 'string', description: "Korte toelichting op de gekozen set adviezen." },
              adviezen: {
                type: 'array',
                items: { 
                  type: 'object',
                  properties: {
                    categorie: { type: 'string', description: "De gekozen categorie (Oplossing, Persoon of Verbinding)" },
                    titel: { type: 'string', description: "De actieve, beschrijvende titel" },
                    reden: { type: 'string', description: "De 'Je gaf aan dat...' tekst" },
                    resultaat: { type: 'string', description: "Het voordeel/resultaat" }
                  },
                  required: ['categorie', 'titel', 'reden', 'resultaat'],
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
