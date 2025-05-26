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

  if (!thema || !vragen || !Array.isArray(vragen)) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken of verkeerd formaat.' })
  }

  try {
    // 1. Voeg thema toe
    const { data: insertedThemes, error: themeError } = await supabase
      .from('themes')
      .insert([thema])
      .select()

    if (themeError || !insertedThemes || insertedThemes.length === 0) {
      console.error('Fout bij aanmaken thema:', themeError)
      return res.status(500).json({ error: 'Thema toevoegen mislukt.' })
    }

    const themeId = insertedThemes[0].id

    // 2. Voeg vragen toe met juiste theme_id
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
      return res.status(500).json({ error: 'Vragen toevoegen mislukt.' })
    }

    return res.status(200).json({ success: true, theme_id: themeId })
  } catch (e) {
    console.error('Onverwachte fout:', e)
    return res.status(500).json({ error: 'Interne serverfout.' })
  }
})

module.exports = router
