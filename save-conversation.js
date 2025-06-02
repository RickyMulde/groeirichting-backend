// 📁 Bestand: save-conversation.js
const express = require('express')
const router = express.Router()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post('/', async (req, res) => {
  const {
    werknemer_id,
    theme_id,
    antwoorden,
    taalcode = 'nl',
    status = 'verzonden'
  } = req.body

  if (!werknemer_id || !theme_id || !Array.isArray(antwoorden)) {
    return res.status(400).json({ error: 'Vereiste velden ontbreken of fout formaat.' })
  }

  const now = new Date().toISOString()

  const nieuwGesprek = {
    werknemer_id,
    theme_id,
    antwoorden,
    status,
    taalcode,
    gestart_op: now,
    beeindigd_op: now
  }

  try {
    const { error } = await supabase.from('conversations').insert([nieuwGesprek])
    if (error) {
      console.error('Fout bij opslaan gesprek:', error)
      return res.status(500).json({ error: 'Opslaan mislukt.', details: error.message })
    }
    return res.status(200).json({ success: true })
  } catch (e) {
    console.error('Serverfout:', e)
    return res.status(500).json({ error: 'Interne serverfout.', message: e.message })
  }
})

module.exports = router
