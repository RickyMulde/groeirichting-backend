const express = require('express')
const { createClient } = require('@supabase/supabase-js')

const router = express.Router()
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// GET /api/get-gespreksresultaten-bulk
// Haalt alle gespreksresultaten op voor een werknemer in een specifieke periode
router.get('/', async (req, res) => {
  const { werknemer_id, periode } = req.query

  if (!werknemer_id || !periode) {
    return res.status(400).json({ error: 'werknemer_id en periode zijn verplicht' })
  }

  try {
    // Haal werkgever op via werknemer
    const { data: werknemer, error: werknemerError } = await supabase
      .from('users')
      .select('employer_id')
      .eq('id', werknemer_id)
      .single()

    if (werknemerError) throw werknemerError
    if (!werknemer) {
      return res.status(404).json({ error: 'Werknemer niet gevonden' })
    }

    // Haal werkgever configuratie op voor actieve maanden
    const werkgeverResponse = await fetch(`https://groeirichting-backend.onrender.com/api/werkgever-gesprek-instellingen/${werknemer.employer_id}`)
    let actieveMaanden = [3, 6, 9] // Default fallback
    if (werkgeverResponse.ok) {
      const configData = await werkgeverResponse.json()
      actieveMaanden = configData.actieve_maanden || actieveMaanden
    }

    // Haal alle actieve thema's op
    const { data: themaData, error: themaError } = await supabase
      .from('themes')
      .select('id, titel, beschrijving')
      .eq('klaar_voor_gebruik', true)
      .eq('standaard_zichtbaar', true)
      .order('volgorde_index')

    if (themaError) throw themaError

    // Haal alle gespreksresultaten op voor deze periode
    const { data: resultaten, error: resultatenError } = await supabase
      .from('gesprekresultaten')
      .select('theme_id, samenvatting, score, gespreksronde, periode, gegenereerd_op, vervolgacties, vervolgacties_toelichting')
      .eq('werknemer_id', werknemer_id)
      .eq('periode', periode)

    if (resultatenError) throw resultatenError

    // Combineer thema's met resultaten
    const resultatenMetThemas = themaData.map(thema => {
      const resultaat = resultaten?.find(r => r.theme_id === thema.id)
      return {
        id: `${thema.id}-${periode}`,
        themes: {
          titel: thema.titel,
          beschrijving: thema.beschrijving
        },
        samenvatting: resultaat?.samenvatting || null,
        score: resultaat?.score || null,
        gespreksronde: resultaat?.gespreksronde || null,
        periode: periode,
        gegenereerd_op: resultaat?.gegenereerd_op || null,
        vervolgacties: resultaat?.vervolgacties || null,
        vervolgacties_toelichting: resultaat?.vervolgacties_toelichting || null,
        heeft_resultaat: !!resultaat
      }
    })

    res.json({
      periode: periode,
      actieve_maanden: actieveMaanden,
      resultaten: resultatenMetThemas,
      totaal_themas: themaData.length,
      themas_met_resultaat: resultaten?.length || 0
    })

  } catch (err) {
    console.error('Fout bij ophalen gespreksresultaten bulk:', err)
    return res.status(500).json({ error: 'Interne serverfout' })
  }
})

module.exports = router 