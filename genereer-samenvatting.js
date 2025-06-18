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
  const { theme_id, werknemer_id } = req.body
  if (!theme_id || !werknemer_id) {
    return res.status(400).json({ error: 'theme_id en werknemer_id zijn verplicht' })
  }

  try {
    // ✅ 1. Haal alle antwoorden op
    const { data: antwoorden, error: antwoordError } = await supabase
      .from('antwoordpervraag')
      .select('vraag, antwoord')
      .eq('theme_id', theme_id)
      .eq('werknemer_id', werknemer_id)

    if (antwoordError) throw antwoordError
    if (!antwoorden || antwoorden.length === 0) {
      return res.status(404).json({ error: 'Geen antwoorden gevonden' })
    }

    // ✅ 2. Haal hoofdvraag en doel op
    const { data: vragen } = await supabase
      .from('theme_questions')
      .select('type, tekst')
      .eq('theme_id', theme_id)

    const hoofdvraag = vragen.find(v => v.type === 'hoofd')?.tekst || ''
    const doelvraag = vragen.find(v => v.type === 'doel')?.tekst || ''
    const doelantwoord = antwoorden.find(a => a.vraag === doelvraag)?.antwoord || ''

    // ✅ 3. Bouw prompt
    const inputJSON = antwoorden.map(a => `Vraag: ${a.vraag}\nAntwoord: ${a.antwoord}`).join('\n\n')
    const prompt = `Je bent een HR-assistent. Vat het volgende gesprek samen in maximaal 6 zinnen.\n\nHoofdvraag: ${hoofdvraag}\nDoel van het gesprek: ${doelantwoord}\n\n${inputJSON}\n\nGeef ook een score tussen 1 en 10 voor hoe positief de medewerker zich voelt over dit thema.\n\nAntwoord in JSON-formaat:\n{\n  \"samenvatting\": \"...\",\n  \"score\": 7\n}`

    // ✅ 4. Stuur prompt naar GPT
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })

    const gptResponse = completion.choices[0].message.content
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

    // ✅ 6. Opslaan in gesprekresultaten
    await supabase.from('gesprekresultaten').upsert({
      werkgever_id: werknemer.employer_id,
      werknemer_id,
      theme_id,
      samenvatting: parsed.samenvatting,
      score: parsed.score,
      samenvatting_type: 'initieel',
      gespreksronde: 1
    }, { onConflict: 'werknemer_id,theme_id' })

    return res.json(parsed)
  } catch (err) {
    console.error('Fout bij genereren samenvatting:', err)
    return res.status(500).json({ error: 'Fout bij genereren samenvatting' })
  }
})

module.exports = router
