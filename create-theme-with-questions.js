// 📁 Bestand: create-theme-with-questions.js
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post('/', async (req, res) => {
  const { thema, vragen } = req.body

  console.log('Ontvangen thema:', thema)
  console.log('Ontvangen vragen:', vragen)

  if (!thema || !vragen || !Array.isArray(vragen)) {
    return res.status(400).json({
      error: 'Verplichte velden ontbreken of verkeerd formaat.',
      ontvangen: { thema, vragen }
    })
  }

  // Extra defensieve sanitatie voor datumvelden
  ['zichtbaar_vanaf', 'zichtbaar_tot'].forEach((key) => {
    if (thema[key] === '') thema[key] = null
    if (Array.isArray(thema[key])) {
      console.warn(`⚠️ ${key} is per ongeluk een array:`, thema[key])
      thema[key] = thema[key][0] || null
    }
  })

  try {
    const { data: insertedThemes, error: themeError } = await supabase
      .from('themes')
      .insert([thema])
      .select()

    if (themeError || !insertedThemes || insertedThemes.length === 0) {
      console.error('Fout bij aanmaken thema:', themeError)
      return res.status(500).json({ error: 'Thema toevoegen mislukt.', details: themeError?.message })
    }

    const themeId = insertedThemes[0].id

    const vragenMetKoppeling = vragen.map((vraag, index) => ({
      ...vraag,
      theme_id: themeId,
      volgorde_index: vraag.volgorde_index ?? index
    }))

    const { error: vragenError } = await supabase
      .from('theme_questions')
      .insert(vragenMetKoppeling)

    if (vragenError) {
      console.error('Fout bij vragen toevoegen:', vragenError)
      return res.status(500).json({ error: 'Vragen toevoegen mislukt.', details: vragenError?.message })
    }

    return res.status(200).json({ success: true, theme_id: themeId })
  } catch (e) {
    console.error('Onverwachte fout:', e)
    return res.status(500).json({ error: 'Interne serverfout.', message: e.message })
  }
})

module.exports = router
