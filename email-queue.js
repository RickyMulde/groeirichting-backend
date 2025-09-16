const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/email-queue - Email toevoegen aan queue
router.post('/', async (req, res) => {
  try {
    const { template_id, ontvanger_email, ontvanger_type, organisatie_id, variabelen } = req.body;
    
    // Haal template op voor snapshot
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('naam, onderwerp, trigger_event')
      .eq('id', template_id)
      .single();
    
    if (templateError) throw templateError;
    
    const { data, error } = await supabase
      .from('email_queue')
      .insert({
        template_id,
        template_naam: template.naam,
        template_onderwerp: template.onderwerp,
        template_trigger: template.trigger_event,
        ontvanger_email,
        ontvanger_type,
        organisatie_id,
        variabelen: variabelen || {}
      })
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/email-queue - Queue status ophalen
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('email_queue')
      .select('*')
      .order('aangemaakt_op', { ascending: false });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
