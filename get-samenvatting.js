const express = require('express')
const { createClient } = require('@supabase/supabase-js')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.get('/', async (req, res) => {
  const { theme_id, werknemer_id } = req.query

  if (!theme_id || !werknemer_id) {
    return res.status(400).json({ error: 'theme_id en werknemer_id zijn verplicht' })
  }

  try {
    const { data, error } = await supabase
      .from('gesprekresultaten')
      .select('samenvatting, score, mag_werkgever_inzien')
      .eq('theme_id', theme_id)
      .eq('werknemer_id', werknemer_id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return res.status(404).json({ error: 'Geen samenvatting gevonden' })
    }

    return res.json(data)
  } catch (err) {
    console.error('Fout bij ophalen samenvatting:', err)
    return res.status(500).json({ error: 'Interne serverfout' })
  }
})

module.exports = router
