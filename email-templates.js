const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Email templates endpoint is working!',
    timestamp: new Date().toISOString(),
    supabaseUrl: process.env.SUPABASE_URL ? 'Set' : 'Not set',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set'
  });
});

// GET /api/email-templates - Alle templates ophalen
router.get('/', async (req, res) => {
  try {
    console.log('Fetching email templates...');
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('aangemaakt_op', { ascending: false });
    
    console.log('Supabase response:', { data, error });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/email-templates/:id - Specifieke template
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/email-templates/:id - Template bijwerken
router.put('/:id', async (req, res) => {
  try {
    const { is_active, omschrijving } = req.body;
    const { data, error } = await supabase
      .from('email_templates')
      .update({ 
        is_active, 
        omschrijving,
        bijgewerkt_op: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select();
    
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
