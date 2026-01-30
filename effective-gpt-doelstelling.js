// GET /api/effective-gpt-doelstelling?theme_id=...
// Retourneert de effectieve gpt_doelstelling voor de werkgever van de ingelogde gebruiker + thema.
// Voor werknemers/werkgevers: gebruikt employer_id uit context.
const express = require('express');
const { authMiddleware } = require('./middleware/auth');
const { getEffectiveGptDoelstelling } = require('./utils/themeAccessService');

const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const employerId = req.ctx.employerId;
    const themeId = req.query.theme_id;

    if (!themeId) {
      return res.status(400).json({ error: 'theme_id is verplicht' });
    }
    if (!employerId) {
      return res.status(403).json({ error: 'Geen werkgever gekoppeld aan deze gebruiker' });
    }

    const gpt_doelstelling = await getEffectiveGptDoelstelling(employerId, themeId);
    res.json({ gpt_doelstelling });
  } catch (err) {
    console.error('❌ [effective-gpt-doelstelling] Error:', err);
    res.status(500).json({ error: 'Fout bij ophalen doelstelling', details: err.message });
  }
});

module.exports = router;
