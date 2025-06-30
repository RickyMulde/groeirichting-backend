const express = require('express')
const { createClient } = require('@supabase/supabase-js')
const OpenAI = require('openai')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

router.post('/', async (req, res) => {
  const { theme_id, werknemer_id, gesprek_id } = req.body
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

    // Controleer of samenvatting gewenst is
    if (thema.geeft_samenvatting === false) {
      return res.status(200).json({
        samenvatting: null,
        score: null,
        melding: 'Voor dit thema hoeft geen samenvatting te worden gegenereerd.'
      })
    }

    // ✅ 1. Haal alle antwoorden op (zowel vaste vragen als vervolgvragen)
    let antwoordenQuery = supabase
      .from('antwoordpervraag')
      .select(`
        antwoord,
        is_vaste_vraag,
        theme_questions!inner(
          tekst,
          type,
          doel_vraag
        )
      `)
      .eq('theme_id', theme_id)
      .eq('werknemer_id', werknemer_id)

    // Als er een gesprek_id is opgegeven, filter daarop
    if (gesprek_id) {
      antwoordenQuery = antwoordenQuery.eq('gesprek_id', gesprek_id)
    }

    const { data: antwoorden, error: antwoordError } = await antwoordenQuery

    if (antwoordError) throw antwoordError
    if (!antwoorden || antwoorden.length === 0) {
      return res.status(404).json({ error: 'Geen antwoorden gevonden' })
    }

    // ✅ 2. Verwerk de data naar het juiste formaat
    const verwerkteAntwoorden = antwoorden.map(a => ({
      vraag: a.theme_questions.tekst,
      antwoord: a.antwoord,
      type: a.theme_questions.type,
      doel_vraag: a.theme_questions.doel_vraag,
      is_vaste_vraag: a.is_vaste_vraag
    }))

    // ✅ 3. Vind hoofdvraag en doelvraag (alleen van vaste vragen)
    const vasteVragen = verwerkteAntwoorden.filter(a => a.is_vaste_vraag)
    const hoofdvraag = vasteVragen.find(v => v.type === 'hoofd')?.vraag || ''
    const doelvraag = vasteVragen.find(v => v.type === 'doel')?.vraag || ''
    const doelantwoord = verwerkteAntwoorden.find(a => a.vraag === doelvraag)?.antwoord || ''

    // ✅ 4. Bouw prompt met alle vragen (vaste + vervolg)
    const inputJSON = verwerkteAntwoorden.map(a => `Vraag: ${a.vraag}\nAntwoord: ${a.antwoord}`).join('\n\n')
    const prompt = `Je bent een HR-assistent. Vat het volgende gesprek samen in maximaal 6 zinnen.\n\nHoofdvraag: ${hoofdvraag}\nDoel van het gesprek: ${doelantwoord}\n\n${inputJSON}\n\nGeef ook een score tussen 1 en 10 voor hoe positief de medewerker zich voelt over dit thema.\n\nAntwoord in JSON-formaat:\n{\n  \"samenvatting\": \"...\",\n  \"score\": 7\n}`

    // ✅ 5. Stuur prompt naar GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })

    const gptResponse = completion.choices[0].message.content
    const parsed = JSON.parse(gptResponse)

    // ✅ 6. Haal werkgever op via werknemer
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemer_id)
      .single()

    if (werknemerError) throw werknemerError
    if (!werknemer) {
      return res.status(404).json({ error: 'Werknemer niet gevonden' })
    }

    // ✅ 7. Bepaal gespreksronde
    let gespreksronde = 1
    if (gesprek_id) {
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

    // ✅ 8. Opslaan in gesprekresultaten
    const resultaatData = {
      werkgever_id: werknemer.employer_id,
      werknemer_id,
      theme_id,
      samenvatting: parsed.samenvatting,
      score: parsed.score,
      samenvatting_type: 'initieel',
      gespreksronde,
      gegenereerd_op: new Date().toISOString()
    }

    // Als er een gesprek_id is, voeg die toe
    if (gesprek_id) {
      resultaatData.gesprek_id = gesprek_id
    }

    await supabase.from('gesprekresultaten').upsert(resultaatData, { 
      onConflict: gesprek_id ? 'gesprek_id' : 'werknemer_id,theme_id' 
    })

    return res.json(parsed)
  } catch (err) {
    console.error('Fout bij genereren samenvatting:', err)
    return res.status(500).json({ error: 'Fout bij genereren samenvatting' })
  }
})

module.exports = router
