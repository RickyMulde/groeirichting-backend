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

    const hoofdvraag = vasteVragenData.find(v => v.type === 'hoofd')?.tekst || ''
    const doelvraag = vasteVragenData.find(v => v.type === 'doel')?.tekst || ''
    const doelantwoord = gespreksgeschiedenis.find(item => 
      vasteVragenData.find(v => v.id === item.vraag_id)?.type === 'doel'
    )?.antwoord || ''

    // ✅ 3. Bouw prompt met alle vragen (vaste + vervolg)
    const inputJSON = gespreksgeschiedenis.map(item => 
      `Vraag: ${item.vraag_tekst}\nAntwoord: ${item.antwoord}`
    ).join('\n\n')
    
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

    // ✅ 6. Bepaal gespreksronde
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

    // ✅ 7. Opslaan in gesprekresultaten
    const resultaatData = {
      werkgever_id: werknemer.employer_id,
      werknemer_id,
      theme_id,
      gesprek_id: gesprek_id, // Voeg gesprek_id toe
      samenvatting: parsed.samenvatting,
      score: parsed.score,
      samenvatting_type: 'initieel',
      gespreksronde,
      gegenereerd_op: new Date().toISOString()
    }

    // Probeer eerst een update, anders een insert
    const { data: updateData, error: updateError } = await supabase
      .from('gesprekresultaten')
      .update(resultaatData)
      .eq('gesprek_id', gesprek_id)
      .select(); // zodat je weet of er iets is aangepast
    
    if (updateError) {
      console.error('Fout bij updaten gesprekresultaat:', updateError);
      throw updateError;
    }
    if (!updateData || updateData.length === 0) {
      // Geen bestaande rij, dus insert
      const { error: insertError } = await supabase
        .from('gesprekresultaten')
        .insert(resultaatData);
      if (insertError) {
        console.error('Fout bij invoegen gesprekresultaat:', insertError);
        throw insertError;
      }
    }

    return res.json(parsed)
  } catch (err) {
    console.error('Fout bij genereren samenvatting:', err)
    return res.status(500).json({ error: 'Fout bij genereren samenvatting' })
  }
})

module.exports = router
